---
level: 深入
tags: [持久化, 事件溯源, 检查点, 写前日志, 恢复语义, 乐观锁, 幂等, effectively-once]
summary: 对比消息日志、检查点快照与事件溯源三种持久化模型，讲清 at-most/at-least/effectively-once 投递语义、写前日志与恢复算法、乐观锁并发控制，以及审批中断的持久化形态。
---

# 状态持久化与恢复语义

> [!ABSTRACT] 一句话版本
> - 三种模型：**消息日志**（只记发生了什么）、**检查点快照**（定期存完整状态）、**事件溯源**（状态由事件序列重放得出）。生产常用「事件日志 + 周期快照」组合。
> - 投递语义只有两种真实存在：**at-most-once**（可能丢）与 **at-least-once**（可能重）；所谓「恰好一次」是 **at-least-once + 幂等 + 去重** 组合出来的效果。
> - 恢复的正确姿势是**写前日志**：先落事件 / 检查点，再推进副作用；顺序反了，崩溃后会漏掉已发生的动作。
> - 并发推进同一个 run 必须靠**乐观锁（版本号 / CAS）**，否则两个 worker 会互相覆盖状态。

## 一、三种持久化模型

| 模型 | 存什么 | 恢复方式 | 优点 | 代价 |
| --- | --- | --- | --- | --- |
| **消息日志** | 每轮的请求 / 响应 / 工具结果 | 重放消息即可重建上下文 | 简单、天然可审计 | 无法表达审批、预算等控制状态 |
| **检查点快照** | 每个状态转移后的完整 RunState | 直接加载最近快照 | 恢复快、实现直观 | 快照大；两次快照间崩溃会丢进度 |
| **事件溯源** | `ModelRequested` / `ToolExecuted` / `Approved` 等事件序列 | 按顺序重放事件重建状态 | 完整可回放、便于时间旅行调试 | 重放逻辑与事件版本管理复杂 |

**生产常见组合**：每次转移追加一条事件（写前日志）+ 每 N 步打一份快照。恢复时「加载最近快照 → 重放其后的事件」，兼顾恢复速度与完整性，见 [Python 编排深入](#/deep/python-internals) 里的 checkpointer 思路。

<figure class="fig">
<svg viewBox="0 0 760 240" class="dg" role="img" aria-label="持久化时间线：事件日志逐条追加，周期性打快照，崩溃后从最近快照重放后续事件恢复">
<line class="l" x1="40" y1="90" x2="720" y2="90" marker-end="url(#arr)"/>
<rect class="b1" x="60" y="70" width="70" height="36" rx="7"/><text class="ts" x="95" y="88" text-anchor="middle" dominant-baseline="middle">e1</text>
<rect class="b1" x="150" y="70" width="70" height="36" rx="7"/><text class="ts" x="185" y="88" text-anchor="middle" dominant-baseline="middle">e2</text>
<rect class="b2" x="240" y="60" width="90" height="56" rx="9"/><text class="tb" x="285" y="80" text-anchor="middle" dominant-baseline="middle">SNAP-1</text><text class="ts" x="285" y="100" text-anchor="middle">e1~e2</text>
<rect class="b1" x="350" y="70" width="70" height="36" rx="7"/><text class="ts" x="385" y="88" text-anchor="middle" dominant-baseline="middle">e3</text>
<rect class="b1" x="440" y="70" width="70" height="36" rx="7"/><text class="ts" x="475" y="88" text-anchor="middle" dominant-baseline="middle">e4</text>
<rect class="b4" x="530" y="60" width="90" height="56" rx="9"/><text class="tb" x="575" y="80" text-anchor="middle" dominant-baseline="middle">CRASH</text><text class="ts" x="575" y="100" text-anchor="middle">e4 后</text>
<rect class="b5" x="640" y="60" width="90" height="56" rx="9"/><text class="tb" x="685" y="80" text-anchor="middle" dominant-baseline="middle">RESUME</text><text class="ts" x="685" y="100" text-anchor="middle">重放 e3,e4</text>
<line class="la" x1="575" y1="116" x2="575" y2="150" marker-end="url(#arr-a)"/>
<line class="la" x1="575" y1="150" x2="685" y2="150" marker-end="url(#arr-a)"/>
<text class="ts" x="380" y="172" text-anchor="middle">恢复 = 加载 SNAP-1（含 e1,e2 的状态）→ 重放 e3、e4 → 得到崩溃前状态</text>
<rect class="bg" x="40" y="192" width="690" height="36" rx="9"/>
<text class="t" x="385" y="210" text-anchor="middle" dominant-baseline="middle">写前日志：先持久化事件 / 快照，再推进副作用；顺序反了会漏记已执行动作</text>
</svg>
<figcaption>图 1：快照负责恢复速度，事件日志负责不丢进度</figcaption>
</figure>

## 二、投递语义

| 语义 | 崩溃时 | 适用 |
| --- | --- | --- |
| **at-most-once** | 可能丢步骤 | 只做只读查询、允许重跑的任务 |
| **at-least-once** | 可能重复执行 | 通用默认，配合幂等使用 |
| **effectively-once** | 不丢且副作用不重复 | **工程组合结果**：at-least-once + 幂等去重 + 乐观锁 |

```text
recovery(run_id):
  snap = load_latest_snapshot(run_id)          # ① 最近快照
  events = read_events_after(snap.event_seq)   # ② 其后的事件
  state = apply(snap.state, events)            # ③ 重放
  assert state.version == expected_version     # ④ 乐观锁
  for call in state.pending_calls:
      if idempotency.exists(call.key):        # ⑤ 已执行过的不再执行
          reuse_result(call)
      else:
          schedule_execution(call)
  return state
```

> [!CAUTION] 先写日志，再执行副作用
> 若顺序反过来（先执行工具、后落事件），进程在两步之间崩溃，恢复时会认为工具没执行过而**再执行一次**。写前日志是持久化设计的第一原则，见 [工具运行时深入](#/internals/tool-runtime)。

## 三、数据模型

```text
Run(run_id PK, tenant_id, user_id, status, version, prompt_version,
    model_version, tools_hash, budget_json, usage_json, created_at, deadline)

Event(event_seq PK, run_id, step, type, payload_json, created_at)
  -- type: SUBMITTED | MODEL_REQUESTED | MODEL_RESPONDED
  --     | TOOL_REQUESTED | TOOL_EXECUTED | APPROVAL_REQUIRED
  --     | APPROVED | REJECTED | BUDGET_EXCEEDED | DONE | FAILED

Checkpoint(checkpoint_id PK, run_id, event_seq, state_json, version, created_at)

Idempotency(key PK, run_id, step, tool_call_id, params_hash,
            status, result_ref, created_at, expires_at)
```

| 表 | 关键索引 |
| --- | --- |
| `Event` | `(run_id, event_seq)` 用于顺序重放 |
| `Checkpoint` | `(run_id, event_seq DESC)` 取最近快照 |
| `Run` | `(tenant_id, status, created_at)` 用于运维查询与配额统计 |
| `Idempotency` | `key` 唯一索引是去重的核心 |

**状态写入用乐观锁**：`UPDATE Run SET state=?, version=version+1 WHERE run_id=? AND version=?`，影响行数为 0 说明被别的 worker 抢先推进，当前 worker 应重读而不是覆盖。

## 四、审批中断的持久化

人工审批是长任务里最典型的「暂停很久」场景，必须做成可序列化状态：

| 字段 | 用途 |
| --- | --- |
| `approval.tool_call_id` / 参数快照 | 恢复后知道要执行什么 |
| `approval.state` | PENDING / APPROVED / REJECTED / EXPIRED |
| `approval.deadline` | 超时自动走拒绝 / 转人工队列 |
| `checkpoint_id` | 审批前的完整状态，批准后从此处 resume |
| 审计记录 | 谁在何时批准 / 修改 / 拒绝 |

> [!TIP] 拒绝和超时都要有分支
> 只实现「批准 → 继续」，流程会在被拒绝或超时后永久卡住。三条路径都要写进状态机与测试，见 [循环的状态机本质](#/internals/loop-state-machine)。

## 五、一致性边界

| 边界 | 说明 |
| --- | --- |
| 检查点存储 vs 业务数据库 | 跨库无法原子提交 → 用幂等键 + 补偿，别指望分布式事务 |
| 事件日志 vs 外部副作用 | 靠写前日志 + 去重表收敛到最终一致 |
| 多 worker 推进同一 run | 乐观锁 + 租约（lease）防止双写 |
| 事件 schema 演进 | 事件带 version，重放器兼容旧版本；旧事件不可改写 |

## 常见坑

1. **先执行工具后落事件**：崩溃后重复执行副作用。
2. **只存消息日志**：审批、预算、取消等控制状态丢失，恢复后行为不一致。
3. **快照过大 / 过频**：恢复快了但写入成为瓶颈，应按步数或时间间隔折中。
4. **没有乐观锁**：双 worker 覆盖状态，出现「幽灵步骤」。
5. **事件 schema 随意改**：旧 run 无法重放。
6. **审批只实现批准路径**：拒绝 / 超时让任务永久挂起。

## 深入追问

> [!QUESTION] 为什么「恰好一次」是组合出来的？
> 分布式下只能做到 at-most-once 或 at-least-once；用至少一次投递 + 幂等去重 + 乐观锁，才能让外部观察到的效果等同于恰好一次。

> [!QUESTION] 写前日志为什么必须先于副作用？
> 若先执行工具再落事件，崩溃发生在两步之间时恢复会认为工具未执行而重复执行；先落日志可用幂等表识别已完成动作。

> [!QUESTION] 为什么生产常用「事件日志 + 周期快照」？
> 纯事件溯源重放慢，纯快照在两次快照间崩溃会丢进度；组合方案用快照加速恢复、用事件补齐增量。

> [!QUESTION] 检查点与业务库跨库时怎么保证一致？
> 通常无法原子提交，应放弃分布式事务幻想，改用幂等键 + 补偿动作 + 对账任务收敛到最终一致。
