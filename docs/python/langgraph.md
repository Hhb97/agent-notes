---
level: 基础
tags: [LangGraph, StateGraph, 节点, 条件边, checkpointer, interrupt, 人工确认, Python]
summary: 把 LangGraph 的四个核心词（State、Node、Edge、Checkpointer）讲清，说明它与单个 while 循环的分工，以及中断与人工确认为什么适合敏感动作。
---

# LangGraph：状态图与检查点

> [!ABSTRACT] 一句话版本
> - 当流程不再是「一个循环」，而是「先检索 → 判断 → 要么答、要么再查 → 敏感操作等人确认 → 写库」，就该用**显式状态**。
> - 四个核心词：**State**（在节点间传递的数据）、**Node**（读状态干活的函数）、**Edge**（下一步去哪，可带条件、可成环）、**Checkpointer**（每步存状态）。
> - 检查点带来**恢复、回放、时间旅行调试**；`interrupt` 带来**人工确认**。
> - 图里的一个「环」，本质上就是 [最小 Agent 循环](#/python/minimal-loop) 被显式画了出来。

> [!NOTE] 版本背景
> LangGraph 已进入 1.x 时代，是 LangChain 高层 Agent 封装之下的编排运行时。核对时间 2026-11；节点 API、检查点实现等细节以官方文档为准。

## 一、为什么需要图

单个 while 循环里，「下一步做什么」完全由模型决定。但真实业务常有硬性规则：**必须先鉴权、金额超阈值必须人工审批、失败重试最多两次**。把这些规则塞进提示词并不可靠，写进代码又会让循环里堆满 `if`。

图的价值是：**把控制流从模型手里拿回来一部分，变成可检查、可测试、可恢复的显式结构。**

<figure class="fig">
<svg viewBox="0 0 760 250" class="dg" role="img" aria-label="LangGraph 状态图示例：检索节点、判断节点条件分支到回答或再检索，敏感动作前有中断等待人工确认">
<rect class="b1" x="20" y="90" width="120" height="48" rx="10"/>
<text class="tb" x="80" y="114" text-anchor="middle" dominant-baseline="middle">检索资料</text>
<rect class="b3" x="180" y="90" width="120" height="48" rx="10"/>
<text class="tb" x="240" y="114" text-anchor="middle" dominant-baseline="middle">判断充分？</text>
<rect class="b2" x="340" y="40" width="130" height="48" rx="10"/>
<text class="tb" x="405" y="64" text-anchor="middle" dominant-baseline="middle">生成回答</text>
<rect class="b2" x="340" y="150" width="130" height="48" rx="10"/>
<text class="tb" x="405" y="174" text-anchor="middle" dominant-baseline="middle">改写再检索</text>
<rect class="b5" x="510" y="90" width="120" height="48" rx="10"/>
<text class="tb" x="570" y="114" text-anchor="middle" dominant-baseline="middle">中断审批</text>
<rect class="b1" x="650" y="90" width="90" height="48" rx="10"/>
<text class="tb" x="695" y="114" text-anchor="middle" dominant-baseline="middle">执行动作</text>
<line class="l" x1="140" y1="114" x2="180" y2="114" marker-end="url(#arr)"/>
<line class="l" x1="300" y1="104" x2="340" y2="70" marker-end="url(#arr)"/>
<text class="ts" x="320" y="76" text-anchor="middle">充分</text>
<line class="l" x1="300" y1="126" x2="340" y2="168" marker-end="url(#arr)"/>
<text class="ts" x="320" y="158" text-anchor="middle">不足</text>
<line class="l" x1="405" y1="150" x2="240" y2="138" marker-end="url(#arr)"/>
<text class="ts" x="322" y="200" text-anchor="middle">成环：回到判断节点</text>
<line class="l" x1="470" y1="64" x2="570" y2="90" marker-end="url(#arr)"/>
<line class="l" x1="630" y1="114" x2="650" y2="114" marker-end="url(#arr)"/>
<rect class="bg" x="20" y="216" width="720" height="26" rx="7"/>
<text class="ts" x="380" y="229" text-anchor="middle" dominant-baseline="middle">每走一步都由 checkpointer 保存状态：崩溃可恢复、可回放、可查看任意时刻的 State</text>
</svg>
<figcaption>图 1：条件边决定分支，环表达循环，中断插入人类决策</figcaption>
</figure>

## 二、四个核心词

| 概念 | 是什么 | 初学者类比 |
| --- | --- | --- |
| **State 状态** | 在节点之间传递的数据对象（消息列表、检索结果、重试计数） | 流水线上的工单，每站都往上写 |
| **Node 节点** | 一个函数：读 State → 干活 → 返回 State 的更新 | 流水线上的一站 |
| **Edge 边** | 下一步去哪；**条件边**按 State 决定分支，也允许成环 | 工单的流转规则 |
| **Checkpointer 检查点** | 每步把 State 存下来（内存 / SQLite / Postgres 等） | 每站都拍一张存档 |

> [!TIP] 理解「成环」就理解了 Agent 与工作流的关系
> 工作流是 DAG（不回头），Agent 循环是「根据结果回到上一步」。LangGraph 允许条件边连回前面的节点，所以同一个图既能表达固定流程，也能表达 ReAct 循环。

## 三、检查点与中断

**检查点解决的问题**：一个跑两小时的任务在第 90 分钟挂了，是从头来还是接着跑？每步存状态后，可以按运行 ID 恢复；还能回看「当时 State 里到底是什么」，这就是所谓时间旅行调试。

**中断（interrupt）解决的问题**：删除、付款、发邮件这类动作，希望在工具调用前**暂停**，把 State 存下来，等人批准或改写后再继续。这比在提示词里写「请谨慎」可靠得多，见 [安全边界](#/basic/eval-safety)。

| 能力 | 单个 while 循环 | 状态图 + 检查点 |
| --- | --- | --- |
| 分支规则 | 靠提示词或一堆 `if` | 显式条件边，可单测 |
| 崩溃恢复 | 基本从头来 | 从检查点续跑 |
| 人工审批 | 自己实现暂停与持久化 | 内建中断机制 |
| 过程回放 | 靠日志猜 | 查看任意时刻 State |
| 学习成本 | 低 | 较高（节点、reducer、状态模式） |

## 四、什么时候不该用

- 一问一答、只调一两个工具 → [最小循环](#/python/minimal-loop) 更直接。
- 流程完全线性、无需暂停恢复 → 普通函数顺序调用即可。
- 团队还没吃透循环原理 → 先补原理，否则图里的每个概念都会显得抽象。

> [!WARNING] 别把「用图」当成目标
> 节点、边、reducer、检查点都是真实概念，简单任务上图往往只增加代码量与理解成本。**当且仅当你需要显式状态、恢复或人工审批时，它才划算。**

## 常见坑

1. **State 设计得太大**：什么都往里塞，检查点读写变重、调试也更难。
2. **忘记 reducer 语义**：多个节点更新同一字段时，要清楚是覆盖还是累加。
3. **环没有退出条件**：和 while 循环一样会无限打转，必须设最大轮次。
4. **检查点只放内存**：进程重启就丢，生产要选持久化实现。
5. **中断后没处理拒绝路径**：人类点了「拒绝」，流程也要有明确去向。
6. **把图当万能编排**：模型仍可能调错工具，评测与护栏一样不能少。

## 自测题

> [!QUESTION] StateGraph 里的「成环」对应 Agent 的什么？
> 对应「根据上一步结果回到前面再试一次」的循环，也就是 ReAct 骨架；循环本身没变，只是被显式画成了边。

> [!QUESTION] 检查点带来哪三个实用能力？
> 崩溃后从存档恢复、回放任意时刻的状态做调试、以及支持长时间运行与人工审批时的暂停续跑。

> [!QUESTION] 为什么敏感动作适合用 interrupt 而不是提示词约束？
> 中断是代码级暂停：状态被保存、必须等人批准才继续；提示词只是建议，可能被忽略或被注入内容覆盖。

> [!QUESTION] 什么情况下 LangGraph 反而是负担？
> 一问一答、线性流程、团队尚未理解循环原理时；图的抽象成本收益不明显，先用最小循环更合适。
