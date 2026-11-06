---
level: 深入
tags: [状态机, 循环, 并发模型, 取消传播, 幂等重入, 预算状态, 事件驱动]
summary: 把 Agent 循环形式化为状态机：状态字段与转移表、事件驱动的实现方式、单 run 内的工具并行与跨 run 并发、取消与超时的传播语义，以及重入与幂等设计。
---

# Agent 循环的状态机本质与并发模型

> [!ABSTRACT] 一句话版本
> - 那个「while 循环」本质是一个**状态机**：`S = (messages, tools, step, budget, status, pending_calls)`，每次事件驱动一次状态转移。
> - 把循环写成状态机，才能回答工程上的关键问题：**能不能暂停、能不能恢复、能不能取消、崩溃后从哪继续、并行调用怎么聚合**。
> - 并发分三层：**单 run 内并行工具**、**多 run 并发**、**取消 / 超时传播**；三层各自需要独立的隔离与聚合规则。
> - 重入安全的前提是**状态可序列化 + 工具幂等**，否则「恢复」等于「重复执行副作用」。

## 一、状态定义

```text
RunState = {
  run_id, tenant_id, user_id,
  status: INIT | WAITING_MODEL | WAITING_TOOL | WAITING_APPROVAL
        | WAITING_RETRY | DONE | FAILED | CANCELLED,
  step: int,                       # 已完成的轮次
  messages: [Message],             # 完整上下文（或可重建的事件日志）
  tools: [ToolSpec],               # 本次 run 生效的工具清单（快照！）
  pending_calls: [ToolCall],       # 本轮待执行 / 待回填的调用
  budget: { max_steps, max_tokens, max_cost, deadline },
  usage: { tokens, cost, tool_calls },
  approval: { needed, tool_call_id, state },
  checkpoint_id, prompt_version, model_version
}
```

**为什么工具清单要快照**：若每次请求动态取当前注册的工具，恢复旧 run 时工具集可能已变，行为就不可复现。把 `tools`、`prompt_version`、`model_version` 一起持久化，才能做可靠的回放与回归，见 [交付与运维](#/engineering/delivery-ops)。

## 二、状态转移表

| 当前状态 | 事件 | 动作 | 下一状态 |
| --- | --- | --- | --- |
| INIT | `submit` | 装配上下文、检查预算 | WAITING_MODEL |
| WAITING_MODEL | `model_text` | 输出校验、写审计 | DONE |
| WAITING_MODEL | `model_tool_calls` | 校验参数、生成 pending_calls | WAITING_TOOL（或 WAITING_APPROVAL） |
| WAITING_MODEL | `model_error(retryable)` | 退避、usage 累加 | WAITING_RETRY |
| WAITING_TOOL | `tool_result_all` | 按 `tool_call_id` 回填 messages | WAITING_MODEL |
| WAITING_TOOL | `tool_error` | 结构化错误回填、重试判定 | WAITING_MODEL / WAITING_RETRY |
| WAITING_APPROVAL | `approved` | 执行工具 | WAITING_TOOL |
| WAITING_APPROVAL | `rejected` | 回填拒绝结果 | WAITING_MODEL / DONE |
| 任意 | `budget_exceeded` / `deadline` / `cancel` | 落检查点、告警 | FAILED / CANCELLED |

<figure class="fig">
<svg viewBox="0 0 760 280" class="dg" role="img" aria-label="Agent 运行状态机：初始化、等待模型、等待工具、等待审批、重试、完成与失败取消之间的转移">
<rect class="b1" x="20" y="30" width="110" height="40" rx="9"/><text class="ts" x="75" y="50" text-anchor="middle" dominant-baseline="middle">INIT</text>
<rect class="b2" x="170" y="30" width="130" height="40" rx="9"/><text class="ts" x="235" y="50" text-anchor="middle" dominant-baseline="middle">WAITING_MODEL</text>
<rect class="b3" x="340" y="30" width="130" height="40" rx="9"/><text class="ts" x="405" y="50" text-anchor="middle" dominant-baseline="middle">WAITING_TOOL</text>
<rect class="b5" x="510" y="30" width="110" height="40" rx="9"/><text class="ts" x="565" y="50" text-anchor="middle" dominant-baseline="middle">DONE</text>
<rect class="b4" x="340" y="130" width="130" height="40" rx="9"/><text class="ts" x="405" y="150" text-anchor="middle" dominant-baseline="middle">WAITING_APPROVAL</text>
<rect class="b4" x="170" y="130" width="130" height="40" rx="9"/><text class="ts" x="235" y="150" text-anchor="middle" dominant-baseline="middle">WAITING_RETRY</text>
<rect class="b4" x="496" y="130" width="124" height="40" rx="9"/><text class="ts" x="558" y="150" text-anchor="middle" dominant-baseline="middle">FAILED / CANCEL</text>
<line class="l" x1="130" y1="50" x2="170" y2="50" marker-end="url(#arr)"/>
<line class="l" x1="300" y1="44" x2="340" y2="44" marker-end="url(#arr)"/>
<text class="ts" x="320" y="34" text-anchor="middle">tool_calls</text>
<line class="l" x1="470" y1="50" x2="510" y2="50" marker-end="url(#arr)"/>
<text class="ts" x="490" y="34" text-anchor="middle">text</text>
<line class="la" x1="340" y1="60" x2="300" y2="60" marker-end="url(#arr-a)"/>
<text class="ts" x="320" y="76" text-anchor="middle">结果回填</text>
<line class="l" x1="405" y1="70" x2="405" y2="130" marker-end="url(#arr)"/>
<text class="ts" x="425" y="104" text-anchor="middle">敏感动作</text>
<line class="l" x1="340" y1="150" x2="300" y2="150" marker-end="url(#arr)"/>
<line class="l" x1="235" y1="130" x2="235" y2="70" marker-end="url(#arr)"/>
<line class="l" x1="470" y1="150" x2="510" y2="150" marker-end="url(#arr)"/>
<text class="ts" x="380" y="210" text-anchor="middle">每次转移后写检查点（含 usage / step / status / pending_calls）</text>
<text class="ts" x="380" y="238" text-anchor="middle">budget_exceeded / deadline / cancel 可从任意状态进入 FAILED 或 CANCELLED</text>
</svg>
<figcaption>图 1：状态机化之后，暂停、恢复、取消与审计才有明确的落点</figcaption>
</figure>

> [!TIP] 事件驱动优于「一个阻塞 while」
> 把「等模型」「等工具」「等审批」都做成**等待外部事件**，run 就能被持久化、被迁移、被恢复；阻塞式 while 一旦进程崩溃，所有中间状态丢失。这也是长任务需要队列 / 工作流引擎的根本原因，见 [状态持久化与恢复语义](#/internals/durability)。

## 三、三层并发

| 层 | 场景 | 规则 |
| --- | --- | --- |
| **单 run 内并行工具** | 一轮返回 3 个独立查询 | 只并行无依赖、无写副作用；按 `tool_call_id` 聚合；任一失败也要等其他结果或整体标记 partial |
| **多 run 并发** | 多用户 / 批量任务 | 按 `run_id` 隔离状态与预算；共享限流器按租户配额；禁止跨 run 复用可变上下文对象 |
| **取消 / 超时传播** | 用户关页面、网关超时 | 取消信号要传到在途的模型请求与工具执行；已执行的写操作靠幂等键保证不重复 |

```text
超时分层（不能只靠 HTTP 超时）：
  模型调用超时  < 单步超时  < 整个 run 的 deadline
  工具执行超时  < 单步超时  < 整个 run 的 deadline
  审批等待超时  单独配置（分钟～小时），超时走「拒绝 / 转人工队列」分支
```

> [!WARNING] 取消 ≠ 回滚
> 取消只能阻止**后续**步骤，已经发出的写操作不会自动撤销。要么工具天然幂等且可补偿，要么在审批点之前不产生副作用，见 [工具运行时深入](#/internals/tool-runtime)。

## 四、重入与幂等

| 问题 | 机制 |
| --- | --- |
| 恢复后重复调用模型 | 每步记录 `step + request_hash`，恢复时先查是否已有响应 |
| 恢复后重复执行工具 | 工具层按 `run_id + step + tool_call_id + idempotency_key` 去重，返回首次结果 |
| 重复追加消息 | 用 `message_id` / `tool_call_id` 做追加幂等，而非无条件 append |
| 状态被两个 worker 同时推进 | 检查点写入用乐观锁（版本号 / CAS） |
| 回放时工具集变了 | 使用状态里快照的 tools 与提示词版本 |

**恰好一次（effectively once）是组合出来的**：至少一次投递 + 幂等执行 + 去重追加，而不是靠某个框架开关，见 [状态持久化与恢复语义](#/internals/durability)。

## 五、关键参数

| 参数 | 作用 | 建议 |
| --- | --- | --- |
| `max_steps` | 防止成环 | 与业务复杂度匹配，超限明确 FAILED |
| `max_tokens` / `max_cost` | 预算硬闸 | 每步累加，超限立即停止 |
| `deadline` | 整个 run 的绝对截止时间 | 长任务按分钟～小时设，不用 HTTP 超时兜底 |
| `tool_parallelism` | 单轮并行上限 | 写操作强制为 1 或串行化 |
| `checkpoint_every` | 每次转移 / 每 N 步 | 长任务建议每次转移 |
| `approval_timeout` | 审批等待上限 | 必须有超时分支 |

## 常见坑

1. **把循环写成阻塞 while**：无法暂停、恢复、取消。
2. **工具清单不快照**：恢复后行为不可复现，评测失去意义。
3. **并行写工具**：重复副作用，应串行化或幂等。
4. **取消信号只到入口层**：在途工具继续执行完，用户以为已取消。
5. **无条件 append 消息**：恢复后上下文出现重复 tool 结果。
6. **没有乐观锁**：两个 worker 推进同一个 run，状态互相覆盖。

## 自测题

> [!QUESTION] 为什么把循环建模成状态机比写一个 while 更适合生产？
> 因为「等模型 / 等工具 / 等审批」都是等待外部事件；状态机可被持久化、迁移、恢复与取消，而阻塞 while 崩溃后中间状态全部丢失。

> [!QUESTION] 单 run 内并行工具的前提是什么？
> 工具之间无依赖、无写副作用，且能按 tool_call_id 正确聚合；写操作必须串行化或保证幂等，并处理 partial 结果。

> [!QUESTION] 取消一个 run 时已执行的写操作怎么办？
> 取消只阻止后续步骤，不回滚已发生的副作用；因此需要幂等键、补偿动作，或把写操作放到审批点之后。

> [!QUESTION] 「恰好一次」是怎么实现的？
> 至少一次投递 + 工具按幂等键去重 + 消息追加按 ID 去重 + 检查点乐观锁，组合出等效的恰好一次，而不是依赖框架开关。
