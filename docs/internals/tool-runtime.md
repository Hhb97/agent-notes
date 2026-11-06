---
level: 深入
tags: [工具运行时, schema 生成, 类型映射, 分发, tool_call_id, 幂等键, 退避重试, 超时传播]
summary: 深入工具调用的运行时：从注解/类型生成 schema、参数反序列化与校验、并行分发与结果聚合、幂等去重表、错误分类与退避重试、超时与取消传播的完整机制。
---

# 工具运行时深入：schema、分发、幂等与重试

> [!ABSTRACT] 一句话版本
> - 一次工具调用要走八个阶段：**声明 → schema 生成 → 注册 → 请求携带 → 分发 → 参数校验 → 执行 → 结果回填**；每一段都能单独埋点。
> - schema 生成的本质是**类型映射**：Java 类型 / Python 类型标注 → JSON schema；复杂泛型、枚举、日期是最常见的失真点。
> - **幂等不是工具属性，而是运行时能力**：由 `run_id + step + tool_call_id + idempotency_key` 组成的去重表实现，与工具实现解耦。
> - 重试前必须做错误分类；**超时和取消要沿调用链传播**，否则取消后工具仍在执行。

## 一、八阶段生命周期

<figure class="fig">
<svg viewBox="0 0 760 250" class="dg" role="img" aria-label="工具运行时八阶段：声明、schema 生成、注册、请求携带、分发、参数校验、执行、结果回填，并标注埋点位置">
<rect class="b1" x="20" y="40" width="165" height="44" rx="8"/><text class="ts" x="102" y="62" text-anchor="middle" dominant-baseline="middle">① 声明 → ② schema 生成</text>
<rect class="b2" x="205" y="40" width="165" height="44" rx="8"/><text class="ts" x="287" y="62" text-anchor="middle" dominant-baseline="middle">③ 注册 → ④ 请求携带</text>
<rect class="b3" x="390" y="40" width="165" height="44" rx="8"/><text class="ts" x="472" y="62" text-anchor="middle" dominant-baseline="middle">⑤ 分发 → ⑥ 参数校验</text>
<rect class="b4" x="575" y="40" width="165" height="44" rx="8"/><text class="ts" x="657" y="62" text-anchor="middle" dominant-baseline="middle">⑦ 执行 → ⑧ 结果回填</text>
<line class="l" x1="185" y1="62" x2="205" y2="62" marker-end="url(#arr)"/>
<line class="l" x1="370" y1="62" x2="390" y2="62" marker-end="url(#arr)"/>
<line class="l" x1="555" y1="62" x2="575" y2="62" marker-end="url(#arr)"/>
<rect class="bg" x="20" y="108" width="720" height="56" rx="10"/>
<text class="tb" x="36" y="128">运行期（每次调用）</text>
<text class="ts" x="36" y="150">身份鉴权 · 白名单校验 · 幂等查表 · 并发控制 · 超时 / 取消令牌 · 审计写日志</text>
<rect class="bg" x="20" y="178" width="720" height="56" rx="10"/>
<text class="tb" x="36" y="198">埋点字段</text>
<text class="ts" x="36" y="220">run_id · step · tool_call_id · 工具名 · 参数摘要 · 状态 · 耗时 · 重试次数 · 错误类型</text>
</svg>
<figcaption>图 1：把八阶段拆开，工具相关问题才能定位到具体一环</figcaption>
</figure>

| 阶段 | 失败表现 | 排查 |
| --- | --- | --- |
| ① 声明 | Bean 未托管、注解包名错 | 检查组件扫描 |
| ② schema 生成 | 参数类型不支持、描述为空 | 打印生成的 schema |
| ③ 注册 | 模型「说自己查不了」 | 打印本次请求实际工具清单，见 [本地开发与调试](#/engineering/local-dev-debug) |
| ④ 请求携带 | 工具太多、上下文膨胀 | 按场景裁剪工具子集 |
| ⑤ 分发 | 找不到工具名、并行调用串台 | 校验名字与 `tool_call_id` 映射 |
| ⑥ 参数校验 | 类型不符、越界值 | 白名单 + 值域校验，结构化返回 |
| ⑦ 执行 | 超时、下游故障、权限拒绝 | 错误分类与重试策略 |
| ⑧ 结果回填 | 结果没进上下文、重复追加 | 按 ID 幂等追加，见 [循环的状态机本质](#/internals/loop-state-machine) |

## 二、schema 生成与类型映射

| 源类型 | JSON schema | 易失真点 |
| --- | --- | --- |
| `String` / `str` | `string` | 需补 format / 示例（订单号、日期串） |
| `int` / `long` / `float` | `number` / `integer` | 边界与是否可空 |
| `boolean` | `boolean` | 语义含糊的 `flag` |
| `enum` | `string + enum` | 枚举值含义要写进描述 |
| `List<T>` / 数组 | `array + items` | 元素类型与最大长度 |
| POJO / Pydantic 模型 | `object + properties + required` | 嵌套过深、可选字段太多 |
| `LocalDate` / `datetime` | `string + format` | 时区与格式串必须明确 |
| `Map<String,Object>` | `object`（无约束） | **尽量避免**，模型会随意编字段 |

> [!TIP] 描述比类型更影响成功率
> 类型只保证「能反序列化」，描述才决定「模型会不会传对值」。参数说明、取值范围、示例三件套缺一不可，见 [工具设计原则](#/tools/tool-design)。

## 三、分发、并行与聚合

```text
一轮返回 N 个 tool_calls：
  1. 为每个 call 生成 (run_id, step, tool_call_id) 作为执行键
  2. 判定依赖与副作用：写操作 → 串行；只读且无依赖 → 可并行（受 tool_parallelism 限制）
  3. 每个执行带独立超时与取消令牌
  4. 聚合：按 tool_call_id 对齐结果，缺结果标 TIMEOUT / CANCELLED
  5. 一次性追加 N 条 tool 消息（顺序与请求一致），再请求模型
```

**顺序要与请求一致**：模型对多个工具调用的返回顺序有隐含预期，乱序回填会造成结果串台。`tool_call_id` 是唯一可靠锚点，见 [Python 编排深入](#/deep/python-internals)。

## 四、幂等去重表

```text
IdempotencyRecord {
  key:  run_id + step + tool_call_id + idempotency_key,
  tool, params_hash, status: RUNNING | DONE | FAILED,
  result_ref, created_at, expires_at
}
```

| 场景 | 行为 |
| --- | --- |
| 首次执行 | 插入 RUNNING（唯一索引），执行完写 DONE 与结果引用 |
| 重复请求且 DONE | **直接返回首次结果**，不再执行 |
| 重复请求且 RUNNING | 等待或返回 `IN_PROGRESS`，不并发执行第二次 |
| 首次执行失败且可恢复 | 删除 / 过期记录后允许重试 |
| 权限拒绝 | 不写幂等成功记录，直接 FAILED |

> [!CAUTION] 幂等键不能只由模型参数生成
> 模型可能在两轮里给出相同参数但表达不同意图。键必须绑定 `run_id + step + tool_call_id`，否则正常的跨轮重复调用会被误去重。

## 五、错误分类与重试

| 错误 | 分类 | 重试 | 回填给模型 |
| --- | --- | --- | --- |
| 网络抖动 / 429 / 5xx | 可恢复 | 指数退避 + 抖动，≤ 2 次 | `UPSTREAM_ERROR`（精简） |
| 参数非法 / 类型不符 | 可修正 | 有限次自纠正 1～2 次 | `INVALID_PARAM` + 期望格式 |
| 工具超时 | 视幂等性 | 仅幂等工具可重试 | `TIMEOUT` |
| 权限拒绝 / 白名单拦截 | 不可恢复 | **否** | `FORBIDDEN` + 告警 |
| 结果为空 | 业务语义 | 否 | `NOT_FOUND`（不是错误） |
| 连续失败达上限 | 终止 | 否 | 转人工 / 明确失败 |

退避要点：指数增长 + 随机抖动避免惊群；每次重试累加 usage 与预算；重试只针对**幂等或只读**操作，见 [可靠性、成本与评测门禁](#/deep/reliability-eval)。

## 六、超时与取消传播

```text
gateway deadline
  └─ run deadline
       └─ step timeout
            ├─ model call timeout
            └─ tool call timeout（每个并行调用独立）
                 └─ 下游 HTTP / DB 超时 + 取消令牌
```

取消令牌必须一路传到下游请求；下游不支持取消时，至少要**不再等待其结果**、不回填、并靠幂等键防止二次执行。审批等待是独立的时间轴，超时走「拒绝 / 转人工队列」分支。

## 常见坑

1. **schema 用 `Map<String,Object>` 兜底**：模型随意编字段，校验形同虚设。
2. **并行写工具**：重复副作用，见 [多智能体架构与隔离](#/deep/multi-agent)。
3. **无条件 append 结果**：恢复后上下文出现重复 tool 消息。
4. **所有错误都重试**：权限拒绝被反复触发，成本与风险双升。
5. **幂等键只 hash 参数**：跨轮正常重复调用被误去重。
6. **取消只到入口层**：在途工具跑完，用户以为已取消。

## 自测题

> [!QUESTION] schema 生成中最容易造成参数幻觉的是什么？
> 描述缺失、值域不明、以及用无约束的 Map/Object 类型；类型只保证能反序列化，描述才决定模型能否传对值。

> [!QUESTION] 幂等键为什么要绑定 run_id 与 step？
> 只用参数 hash 会把不同轮次里参数相同但意图不同的正常调用误判为重复；绑定执行上下文才能区分「重放」与「新调用」。

> [!QUESTION] 一轮多个工具调用，为什么回填顺序要与请求一致？
> 模型对多个调用有隐含的顺序预期，乱序或 ID 错位会造成结果串台；`tool_call_id` 是唯一可靠的对齐锚点。

> [!QUESTION] 取消令牌为什么必须传到下游？
> 只在上层取消，在途的模型请求与工具仍会继续执行，可能完成写副作用；下游不支持取消时至少不等待结果并靠幂等兜底。
