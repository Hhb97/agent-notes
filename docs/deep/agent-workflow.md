---
level: 深入
tags: [工作流编排, ReAct, Plan-and-Execute, 状态图, 路由分类, 混合模式, 自主度]
summary: 把五种 Agent 编排模式放在「自主度 vs 可控度」的谱系上比较，给出选型决策表，并说明生产中最常见的混合结构：外层确定性状态图 + 内层 ReAct 循环 + 前置路由分类。
---

# Agent 工作流编排模式

> [!ABSTRACT] 一句话版本
> - 编排模式是一条谱系：**自主度越高，越难预测、越难测试、越贵**；可控度越高，越需要人先把流程想清楚。
> - 五种模式：单次调用、ReAct 循环、Plan-and-Execute、显式状态图、多智能体委派；**没有最好，只有与任务形态匹配**。
> - 生产里最常见的是**混合结构**：外层用状态图固定关键节点与审批，内层在需要探索的节点里放一个 ReAct 循环，入口再加一层路由分类。
> - 判断信号只有两个：**下一步能否预先枚举？失败后要不要可恢复与可回放？**

## 一、模式谱系

<figure class="fig">
<svg viewBox="0 0 760 260" class="dg" role="img" aria-label="五种编排模式在自主度与可控度谱系上的位置：单次调用、状态图、Plan-and-Execute、ReAct 循环、多智能体">
<line class="l" x1="60" y1="200" x2="720" y2="200" marker-end="url(#arr)"/>
<text class="ts" x="390" y="226" text-anchor="middle">自主度（模型决定多少）→</text>
<line class="l" x1="60" y1="200" x2="60" y2="30" marker-end="url(#arr)"/>
<text class="ts" x="52" y="24" text-anchor="end">可控度 ↑</text>
<rect class="b1" x="80" y="160" width="110" height="34" rx="7"/><text class="ts" x="135" y="177" text-anchor="middle" dominant-baseline="middle">单次调用</text>
<rect class="b2" x="210" y="128" width="110" height="34" rx="7"/><text class="ts" x="265" y="145" text-anchor="middle" dominant-baseline="middle">状态图</text>
<rect class="b3" x="340" y="100" width="140" height="34" rx="7"/><text class="ts" x="410" y="117" text-anchor="middle" dominant-baseline="middle">Plan-and-Execute</text>
<rect class="b4" x="500" y="72" width="110" height="34" rx="7"/><text class="ts" x="555" y="89" text-anchor="middle" dominant-baseline="middle">ReAct 循环</text>
<rect class="b5" x="625" y="44" width="110" height="34" rx="7"/><text class="ts" x="680" y="61" text-anchor="middle" dominant-baseline="middle">多智能体</text>
<text class="ts" x="390" y="248" text-anchor="middle">越往右上：越灵活，也越难预测成本与行为；生产常用中间的混合结构</text>
</svg>
<figcaption>图 1：选模式本质是选「把多少决定权交给模型」</figcaption>
</figure>

| 模式 | 谁决定下一步 | 可测试性 | 成本可预测性 | 典型适用 |
| --- | --- | --- | --- | --- |
| **单次调用** | 开发者（固定流程） | 最高 | 最高 | 分类、抽取、改写、结构化输出 |
| **显式状态图** | 开发者定义节点/边，模型在节点内决策 | 高 | 高 | 有审批、有分支、要恢复的业务流程 |
| **Plan-and-Execute** | 模型先列计划，再逐步执行 | 中 | 中 | 步骤多但相对可分解的研究型任务 |
| **ReAct 循环** | 模型每轮决定 | 低 | 低 | 步骤无法预先枚举的探索任务 |
| **多智能体委派** | 主 Agent 决定分派给谁 | 最低 | 最低 | 需要上下文/权限隔离的并行子任务 |

## 二、选型决策

| 判断 | 结论 |
| --- | --- |
| 步骤能预先写死？ | **能** → 单次调用或普通代码，别用 Agent，见 [选型清单](#/compare/checklist) |
| 步骤不定，但整体 3～5 步能收敛？ | ReAct 循环 + 严格停止条件，见 [核心循环与工具调用](#/basic/loop) |
| 有硬性顺序 / 审批 / 失败补偿？ | 外层状态图，见 [LangGraph](#/python/langgraph) |
| 任务很长、中间结果多？ | Plan-and-Execute + 状态外置，见 [上下文工程深入](#/deep/context-engineering) |
| 需要隔离上下文或权限？ | 才考虑多智能体，见 [多智能体架构与隔离](#/deep/multi-agent) |

> [!WARNING] 别把「自主」当目标
> 每多交出一点决定权，就多一点不可预测的轮次、成本与失败路径。**能写死的流程一定要写死**，把模型用在真正需要判断的那一两个节点上。

## 三、生产里最常见的混合结构

<figure class="fig">
<svg viewBox="0 0 760 270" class="dg" role="img" aria-label="混合编排结构：入口路由分类，外层状态图固定关键节点与审批，探索节点内嵌 ReAct 循环，结果统一校验后返回">
<rect class="b1" x="20" y="100" width="110" height="48" rx="9"/><text class="tb" x="75" y="124" text-anchor="middle" dominant-baseline="middle">路由分类</text>
<rect class="bg" x="160" y="40" width="430" height="180" rx="12"/>
<text class="th" x="375" y="62" text-anchor="middle">外层：确定性状态图</text>
<rect class="b2" x="180" y="80" width="110" height="44" rx="8"/><text class="ts" x="235" y="102" text-anchor="middle" dominant-baseline="middle">鉴权 / 取数</text>
<rect class="b3" x="310" y="80" width="130" height="44" rx="8"/><text class="ts" x="375" y="102" text-anchor="middle" dominant-baseline="middle">探索节点</text>
<rect class="b2" x="460" y="80" width="110" height="44" rx="8"/><text class="ts" x="515" y="102" text-anchor="middle" dominant-baseline="middle">人工审批</text>
<rect class="b4" x="180" y="150" width="390" height="46" rx="8"/>
<text class="t" x="375" y="173" text-anchor="middle" dominant-baseline="middle">探索节点内部：ReAct 小循环（限轮次、预算、可退回状态图）</text>
<rect class="b5" x="620" y="100" width="120" height="48" rx="9"/><text class="tb" x="680" y="124" text-anchor="middle" dominant-baseline="middle">结果校验</text>
<line class="l" x1="130" y1="124" x2="160" y2="124" marker-end="url(#arr)"/>
<line class="l" x1="290" y1="102" x2="310" y2="102" marker-end="url(#arr)"/>
<line class="l" x1="440" y1="102" x2="460" y2="102" marker-end="url(#arr)"/>
<line class="l" x1="590" y1="124" x2="620" y2="124" marker-end="url(#arr)"/>
<line class="ld" x1="375" y1="124" x2="375" y2="150"/>
<text class="ts" x="375" y="230" text-anchor="middle">外层保证可控与可恢复，内层只在必要处交给模型自由探索</text>
</svg>
<figcaption>图 2：外层定规则、内层给自由，是生产系统最常见的折中</figcaption>
</figure>

三层各司其职：

1. **入口路由**：用小模型或规则判断任务类型，决定走哪条流程、是否直接拒答、用哪个预算档位。便宜且可控。
2. **外层状态图**：固定鉴权、取数、审批、落库等硬节点，提供检查点与恢复。
3. **内层 ReAct**：只在「探索 / 检索 / 诊断」这类无法枚举步骤的节点里放循环，并单独设轮次与预算上限。

> [!TIP] 为什么要路由前置
> 大量请求其实不需要 Agent（闲聊、简单查询、越权请求）。在入口把它们分流掉，能显著降低成本与风险，也是 [生产级架构](#/deep/agent-architecture) 里接入层的职责之一。

## 四、失败与恢复按模式不同

| 模式 | 失败后怎么恢复 | 主要风险 |
| --- | --- | --- |
| 单次调用 | 重发请求即可（注意幂等） | 几乎无状态风险 |
| 状态图 | 从检查点续跑 | reducer 写错导致状态不一致 |
| Plan-and-Execute | 重跑未完成步骤 | 计划与实际情况脱节 |
| ReAct | 通常只能整轮重来 | 重复执行写操作、成本不可控 |
| 多智能体 | 定位到具体子 Agent 重跑 | 失败传播、循环委派 |

**结论**：越自主的模式，越需要在工具层做幂等，在编排层做预算上限，见 [可靠性、成本与评测门禁](#/deep/reliability-eval)。

## 常见坑

1. **对所有请求一视同仁上 Agent**：入口没有分流，成本与风险都被放大。
2. **图里每个节点都塞一个 ReAct 循环**：外层可控性被架空，等于回到纯循环。
3. **内外两层都设停止条件却不一致**：内层还在跑，外层已判定超时。
4. **Plan-and-Execute 的计划不落库**：进程重启后无法续跑。
5. **模式混用时评测只覆盖主路径**：分支、审批拒绝、超预算路径没被测到。

## 自测题

> [!QUESTION] 为什么生产系统常用「外层状态图 + 内层 ReAct」而不是纯 ReAct？
> 硬性的鉴权、审批、落库需要确定性、可测试、可恢复；只有探索类步骤真正需要模型自主。混合结构把自主性限制在局部，同时保住全局可控。

> [!QUESTION] 入口路由分类为什么值得单独做？
> 它能把大量不需要 Agent 的请求（闲聊、简单查询、越权请求）在低成本层分流掉，同时决定预算档位与流程分支，是成本与风险的第一道控制点。

> [!QUESTION] 什么时候 Plan-and-Execute 比 ReAct 更合适？
> 任务步骤多、耗时长、中间结果需要保存时；先产出可检查的计划并落库，便于逐步执行、恢复与审计，而不是每轮临时决定。

> [!QUESTION] 越自主的模式为什么越依赖幂等？
> 因为恢复与重试更容易重复执行同一动作（尤其是写操作）。没有幂等键，重跑就会产生重复下单、重复发送等副作用。
