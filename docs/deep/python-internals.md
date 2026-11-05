---
level: 深入
tags: [LangGraph, StateGraph, reducer, superstep, checkpointer, interrupt, 持久化执行, Temporal]
summary: 深入 Python 编排层：Agent 循环内部的消息规范化与并行工具调用、StateGraph 的 reducer 与 superstep、检查点与中断恢复、以及外部持久化执行引擎各自拥有哪一份状态。
---

# Python 编排深入：运行时与持久化执行

> [!ABSTRACT] 一句话版本
> - 框架替你做的四件事：**规范化消息**、**生成工具 schema**、**分发（可能并行的）工具调用**、**回填并判断终止**；剩下的业务判断仍是你的。
> - LangGraph 的运行时核心是 **State + reducer + superstep**：节点产出状态更新，reducer 决定如何合并，检查点在每个 superstep 保存快照。
> - **检查点 ≠ 持久化执行引擎**：前者保存图的状态，后者（Temporal / DBOS / Restate / Prefect 一类）保证整个工作流在进程崩溃后能续跑。**谁拥有状态，谁负责恢复**。
> - `interrupt` 把「等人批准」变成可序列化的暂停点，而不是把提示词写成「请谨慎」。

> [!NOTE] 版本边界
> LangChain / LangGraph 1.x 时代分工已稳定：LangGraph 是底层运行时，高层 `create_agent` 构建在其上；各库的持久化执行集成仍在演进。核对时间 2026-11，具体 API 以官方文档为准。

## 一、循环内部到底做了什么

<figure class="fig">
<svg viewBox="0 0 760 250" class="dg" role="img" aria-label="Python Agent 循环内部：消息规范化、schema 生成、模型请求、并行工具分发、结果聚合回填与终止判断">
<rect class="b1" x="20" y="30" width="150" height="46" rx="9"/><text class="tb" x="95" y="53" text-anchor="middle" dominant-baseline="middle">消息规范化</text>
<rect class="b1" x="190" y="30" width="150" height="46" rx="9"/><text class="tb" x="265" y="53" text-anchor="middle" dominant-baseline="middle">工具 schema 生成</text>
<rect class="b2" x="360" y="30" width="150" height="46" rx="9"/><text class="tb" x="435" y="53" text-anchor="middle" dominant-baseline="middle">模型请求</text>
<rect class="b3" x="530" y="30" width="210" height="46" rx="9"/><text class="tb" x="635" y="53" text-anchor="middle" dominant-baseline="middle">并行工具分发</text>
<rect class="bg" x="20" y="110" width="720" height="54" rx="10"/>
<text class="t" x="380" y="130" text-anchor="middle" dominant-baseline="middle">结果聚合：按 tool_call_id 对齐 → 追加 tool 消息 → 更新状态</text>
<text class="ts" x="380" y="152" text-anchor="middle">失败需显式标记；不可恢复错误不要盲目重试</text>
<rect class="b5" x="270" y="190" width="220" height="46" rx="10"/>
<text class="tb" x="380" y="213" text-anchor="middle" dominant-baseline="middle">终止判断：无工具调用 / 超限</text>
<line class="l" x1="170" y1="53" x2="190" y2="53" marker-end="url(#arr)"/>
<line class="l" x1="340" y1="53" x2="360" y2="53" marker-end="url(#arr)"/>
<line class="l" x1="510" y1="53" x2="530" y2="53" marker-end="url(#arr)"/>
<line class="l" x1="635" y1="76" x2="635" y2="110" marker-end="url(#arr)"/>
<line class="l" x1="380" y1="164" x2="380" y2="190" marker-end="url(#arr)"/>
<line class="la" x1="270" y1="213" x2="95" y2="213" marker-end="url(#arr-a)"/>
<line class="la" x1="95" y1="213" x2="95" y2="76" marker-end="url(#arr-a)"/>
<text class="ts" x="180" y="205" text-anchor="middle">继续下一轮</text>
</svg>
<figcaption>图 1：[最小 Agent 循环](#/python/minimal-loop) 被框架展开后的内部动作</figcaption>
</figure>

| 内部动作 | 为什么要做 | 出错时的表现 |
| --- | --- | --- |
| 消息规范化 | 不同角色（system / user / assistant / tool）要符合模型协议 | 角色顺序非法、历史丢失 |
| schema 生成 | 从函数签名 / 装饰器 / Pydantic 模型生成参数说明 | 参数幻觉、类型不匹配 |
| 并行分发 | 一轮可能返回多个工具调用 | `tool_call_id` 错位导致结果串台 |
| 结果聚合 | 把多个结果按 ID 回填 | 模型以为某个工具没执行 |
| 终止判断 | 无工具调用或达到上限 | 无限循环、费用失控 |

> [!TIP] 并行工具调用的两个前提
> 工具之间**无依赖**且**无顺序副作用**。写操作并行尤其危险：要么串行化，要么保证幂等，见 [可靠性、成本与评测门禁](#/deep/reliability-eval)。

## 二、StateGraph 运行时：reducer 与 superstep

| 概念 | 运行时语义 | 设计要点 |
| --- | --- | --- |
| **State schema** | 定义状态里有哪些字段、字段如何合并 | 字段少、含义明确；避免把整段原始报文塞进去 |
| **reducer** | 同一字段被多次更新时的合并函数（覆盖 / 追加 / 求和） | 消息列表通常用「追加」，计数器用「求和」，别默认覆盖 |
| **superstep** | 一轮里就绪的节点并行执行，全部完成后统一提交状态更新 | 同一 superstep 内节点不应互相依赖中间结果 |
| **条件边** | 依据状态决定下一个节点，可成环 | 环必须有退出条件与最大轮次 |
| **checkpointer** | 每个 superstep 结束保存状态快照（内存 / SQLite / Postgres 等） | 生产要持久化，且按运行 ID 索引 |
| **interrupt** | 在节点前暂停，状态可序列化，批准后 resume | 必须设计「拒绝」与「超时」两条路径 |

```python
# 概念示意：reducer 决定「更新是覆盖还是累加」
from typing import Annotated
import operator

class State(TypedDict):
    messages: Annotated[list, operator.add]   # 追加，而非覆盖
    retries: int                             # 覆盖
```

**时间旅行调试**的来源就是检查点：能读取任意 superstep 的 State，回放「当时模型到底看到了什么」，这比翻日志猜要可靠得多。

## 三、检查点 vs 持久化执行引擎

<figure class="fig">
<svg viewBox="0 0 760 210" class="dg" role="img" aria-label="两种持久化方案对比：图自带检查点保存状态，外部工作流引擎托管整个运行的重试与恢复">
<rect class="b1" x="20" y="36" width="340" height="140" rx="12"/>
<text class="th" x="190" y="62" text-anchor="middle">方案 A：图自带 checkpointer</text>
<text class="ts" x="190" y="92" text-anchor="middle">运行时自己保存每步 State</text>
<text class="ts" x="190" y="116" text-anchor="middle">恢复 / 回放 / 人工审批由框架负责</text>
<text class="ts" x="190" y="140" text-anchor="middle">代价：自己运维存储与运行时</text>
<rect class="b5" x="400" y="36" width="340" height="140" rx="12"/>
<text class="th" x="570" y="62" text-anchor="middle">方案 B：外部持久化执行引擎</text>
<text class="ts" x="570" y="92" text-anchor="middle">把一次 Agent 运行包成工作流</text>
<text class="ts" x="570" y="116" text-anchor="middle">引擎负责重试、超时、崩溃续跑</text>
<text class="ts" x="570" y="140" text-anchor="middle">代价：多一层基础设施与编程模型</text>
<text class="ts" x="380" y="198" text-anchor="middle">判断标准：谁拥有状态，谁就负责恢复；两者可以组合，但要明确边界</text>
</svg>
<figcaption>图 2：选型的本质是「状态归谁管」</figcaption>
</figure>

| 维度 | 图自带检查点 | 外部工作流引擎 | 供应商 SDK 的会话 |
| --- | --- | --- | --- |
| 状态存哪 | 框架指定的 checkpointer 后端 | 引擎自己的存储 | 会话 / 可序列化运行态 |
| 恢复能力 | 从检查点续跑 | 工作流级自动恢复与重试 | 依赖具体 SDK 集成 |
| 适合 | 有状态图、需要审批与回放 | 超长任务、强可靠要求、已有引擎 | 轻量任务、快速原型 |
| 代价 | 运维存储与运行时 | 引入新基础设施 | 可移植性较弱 |

> [!WARNING] 别把两套状态机制叠在一起却不划边界
> 图里有 State、引擎里有工作流状态、SDK 里还有 session。三者各存一份时，「以谁为准」必须在设计里写清楚，否则恢复后会读到互相矛盾的状态。

## 四、人工审批的可靠形态

`interrupt` / `needs_approval` 一类能力的价值在于：把运行**序列化成可存储的状态**，等人批准后再恢复。这解决了三个问题：进程重启不丢审批、审批人能看到完整上下文、拒绝路径可显式建模。对应安全边界见 [评测、可观测与安全边界](#/basic/eval-safety)。

```text
运行 → 敏感工具调用前暂停 → 保存状态（含工具名与参数）
     → 通知人工 → 批准 / 修改参数 / 拒绝 → resume → 继续或走失败分支
```

## 五、关键参数

| 参数 | 作用 | 建议 |
| --- | --- | --- |
| `recursion_limit` / 最大步数 | 防止图里成环后无限跑 | 与业务最大轮次一致，超限要留日志 |
| checkpointer 后端 | 状态持久化位置 | 生产用持久化实现，按运行 ID 索引 |
| 工具并发数 | 一轮并行调用上限 | 写操作串行化或幂等 |
| 中断超时 | 等人审批的最长时间 | 超时要有明确去向（拒绝 / 转人工队列） |
| 状态大小上限 | 快照读写成本 | 状态只放必要字段，大对象外置 |

## 常见坑

1. **reducer 写成默认覆盖**：多节点更新同一字段时，消息历史莫名丢失。
2. **同一 superstep 内节点互相依赖**：读到的还是本轮开始时的状态。
3. **检查点用内存实现上生产**：进程重启即丢，长任务无法恢复。
4. **interrupt 只实现「批准」路径**：拒绝 / 超时没有分支，流程卡死。
5. **并行写工具**：重复扣款、重复发送，必须串行化或幂等。
6. **多套状态并存**：恢复时以哪份为准没定义。

## 深入追问

> [!QUESTION] reducer 为什么是 StateGraph 的核心而不是实现细节？
> 它定义了「多次更新如何合并」，直接决定多节点、多轮、并行执行时状态的正确性。消息列表用追加、计数器用累加，选错就会静默丢数据。

> [!QUESTION] 检查点与持久化执行引擎的分界线是什么？
> 检查点保存图的状态，提供恢复与回放；引擎托管整次运行的重试、超时与崩溃续跑。前者是框架内能力，后者是基础设施层能力，可以组合但要明确状态归属。

> [!QUESTION] 为什么说 interrupt 比提示词约束更可靠？
> 它是代码级暂停：状态被保存、必须显式批准才继续，且拒绝与超时都有确定分支；提示词只是建议，可能被忽略或被注入内容覆盖。

> [!QUESTION] 一轮返回多个工具调用时最容易出什么错？
> `tool_call_id` 对齐错误或把有依赖 / 有副作用的工具并行执行，导致结果串台、重复写入；应按 ID 聚合，并对写操作串行化或保证幂等。
