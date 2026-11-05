---
level: 深入
tags: [多智能体, supervisor, handoff, 子 Agent, 上下文隔离, 权限隔离, 成本放大, 失败传播]
summary: 深入多智能体架构：何时真的需要拆、四种常见拓扑、上下文与状态如何传递、权限与预算隔离怎么做，以及成本放大、循环委派与失败传播这些生产中的真实问题。
---

# 多智能体架构与隔离

> [!ABSTRACT] 一句话版本
> - 拆多智能体的正当理由只有三类：**上下文隔离、权限隔离、可并行的独立子任务**。「任务看起来复杂」不是理由。
> - 常见拓扑：supervisor 调度、handoff 转交、pipeline 流水线、子 Agent 作为工具；它们对状态传递与失败处理的要求完全不同。
> - 每个额外 Agent 都会**放大成本与失败面**：N 个 Agent 的对话轮次、工具调用与调试复杂度都不是线性增长。
> - 生产里必须显式设计：**工具集白名单、预算配额、委派深度上限、循环检测、统一的 run_id 链路**。

> [!WARNING] 先证伪
> 在拆之前，先问：一个工具设计良好的单 Agent 加 [上下文外置](#/deep/context-engineering) 能不能解决？多数情况下答案是能，见 [Agent 工作流编排模式](#/deep/agent-workflow)。

## 一、什么时候真的需要

| 信号 | 为什么单 Agent 不够 |
| --- | --- |
| 高噪声探索会污染主上下文 | 网页抓取、日志分析会产生大量文本，需要独立上下文，只回传结论 |
| 工具权限必须分级 | 查询 Agent 只读、执行 Agent 才能写；混在一个 Agent 里等于放大权限 |
| 子任务可并行且互不依赖 | 同时查多个数据源，缩短总耗时 |
| 需要不同人设 / 模型档位 | 便宜模型做分类、贵模型做推理，各自有独立指令 |

## 二、四种拓扑

<figure class="fig">
<svg viewBox="0 0 760 280" class="dg" role="img" aria-label="四种多智能体拓扑：supervisor 调度、handoff 转交、pipeline 流水线、子 Agent 作为工具">
<text class="th" x="20" y="24">① supervisor 调度</text>
<rect class="b1" x="20" y="40" width="130" height="40" rx="8"/><text class="ts" x="85" y="60" text-anchor="middle" dominant-baseline="middle">Supervisor</text>
<rect class="b2" x="20" y="92" width="60" height="32" rx="7"/><text class="ts" x="50" y="108" text-anchor="middle" dominant-baseline="middle">A</text>
<rect class="b2" x="90" y="92" width="60" height="32" rx="7"/><text class="ts" x="120" y="108" text-anchor="middle" dominant-baseline="middle">B</text>
<line class="l" x1="85" y1="80" x2="50" y2="92" marker-end="url(#arr)"/>
<line class="l" x1="85" y1="80" x2="120" y2="92" marker-end="url(#arr)"/>
<text class="th" x="210" y="24">② handoff 转交</text>
<rect class="b1" x="210" y="40" width="110" height="40" rx="8"/><text class="ts" x="265" y="60" text-anchor="middle" dominant-baseline="middle">接待 Agent</text>
<rect class="b3" x="210" y="92" width="110" height="32" rx="7"/><text class="ts" x="265" y="108" text-anchor="middle" dominant-baseline="middle">专家 Agent</text>
<line class="la" x1="265" y1="80" x2="265" y2="92" marker-end="url(#arr-a)"/>
<text class="ts" x="265" y="142" text-anchor="middle">控制权完全转移</text>
<text class="th" x="400" y="24">③ pipeline 流水线</text>
<rect class="b1" x="400" y="40" width="90" height="40" rx="8"/><text class="ts" x="445" y="60" text-anchor="middle" dominant-baseline="middle">检索</text>
<rect class="b2" x="510" y="40" width="90" height="40" rx="8"/><text class="ts" x="555" y="60" text-anchor="middle" dominant-baseline="middle">分析</text>
<rect class="b3" x="620" y="40" width="90" height="40" rx="8"/><text class="ts" x="665" y="60" text-anchor="middle" dominant-baseline="middle">撰写</text>
<line class="l" x1="490" y1="60" x2="510" y2="60" marker-end="url(#arr)"/>
<line class="l" x1="600" y1="60" x2="620" y2="60" marker-end="url(#arr)"/>
<text class="ts" x="555" y="100" text-anchor="middle">固定顺序，可用状态图表达</text>
<text class="th" x="400" y="160">④ 子 Agent 作为工具</text>
<rect class="b5" x="400" y="178" width="140" height="44" rx="8"/><text class="ts" x="470" y="200" text-anchor="middle" dominant-baseline="middle">主 Agent</text>
<rect class="b4" x="580" y="178" width="140" height="44" rx="8"/><text class="ts" x="650" y="200" text-anchor="middle" dominant-baseline="middle">子 Agent（工具）</text>
<line class="la" x1="540" y1="200" x2="580" y2="200" marker-end="url(#arr-a)"/>
<text class="ts" x="575" y="242" text-anchor="middle">独立上下文，只回传结论，主链路最干净</text>
</svg>
<figcaption>图 1：拓扑决定了状态怎么传、失败怎么算、成本怎么记</figcaption>
</figure>

| 拓扑 | 状态传递 | 优点 | 风险 |
| --- | --- | --- | --- |
| **supervisor** | 调度者汇总各子结果 | 集中控制、易加预算与审计 | 调度者成为瓶颈，汇总时上下文膨胀 |
| **handoff** | 控制权与会话整体转移 | 实现简单、适合客服分流 | 责任链不清，容易反复转交 |
| **pipeline** | 上一节点输出即下一节点输入 | 可测试、可恢复，天然适合状态图 | 灵活性低，前段出错整条受影响 |
| **子 Agent 作为工具** | 只回传结构化结论 | **上下文隔离最彻底** | 结论丢失细节，需设计返回契约 |

> [!TIP] 优先选「子 Agent 作为工具」
> 对主链路来说它就是一个普通工具调用，最容易接入现有循环、预算与观测体系；独立上下文带来的噪声隔离收益也最直接，见 [MCP 与工具生态](#/basic/mcp) 里「工具边界」的思路。

## 三、上下文与状态契约

多智能体最容易出错的不是模型，而是**传什么**：

- **传结论，不传全过程**：子 Agent 返回结构化摘要 + 引用 + 置信度，不回传整段对话。
- **定义返回契约**：字段名、缺失时怎么表示、失败时怎么表示，避免主 Agent 猜测。
- **共享事实外置**：用户身份、任务状态、检索结果放共享存储，按 run_id 取，不在消息里层层复制。
- **统一 run_id**：所有子 Agent 的链路挂到同一个运行 ID 上，否则排障时无法拼回全貌。

```json
{
  "run_id": "run-1024",
  "sub_agent": "log-analyzer",
  "status": "partial",
  "summary": "发现 3 处超时，集中在订单服务",
  "evidence": ["trace/abc", "trace/def"],
  "confidence": "medium"
}
```

## 四、隔离与预算

| 隔离维度 | 做法 |
| --- | --- |
| **工具集** | 每个子 Agent 只能看到自己需要的工具白名单，写操作单独授权 |
| **权限** | 基于当前会话身份派生最小权限，不继承主 Agent 的全部权限 |
| **沙箱** | 代码执行、文件访问放在受限环境，见 [生产级架构](#/deep/agent-architecture) 的工具执行层 |
| **预算** | 每个子 Agent 有独立的轮次 / token / 时间配额，总任务再设总上限 |
| **委派深度** | 限制最大层级，禁止子 Agent 再无限派生子 Agent |
| **循环检测** | 记录「谁把任务转给谁」，出现环路即熔断并告警 |

> [!CAUTION] 成本是乘法不是加法
> 多智能体里，子 Agent 各自有循环、各自带工具定义与历史，还要把结论汇总给主 Agent。一次请求的总 token 往往是单 Agent 的数倍。**没有独立配额与总预算上限时，先不要上多智能体。**

## 五、失败传播

| 失败 | 处理 |
| --- | --- |
| 子 Agent 超时 | 返回 `partial` / `timeout`，主 Agent 决定降级或重试一次 |
| 子 Agent 结论不可信 | 依据返回契约里的置信度与证据，要求复核或转人工 |
| 反复转交（handoff 环） | 转交次数上限 + 环路检测，超限直接结束 |
| 汇总阶段上下文超限 | 只汇总结构化摘要，不拼接原始对话，见 [上下文工程深入](#/deep/context-engineering) |
| 某个子任务写操作失败 | 幂等键 + 补偿动作，避免部分成功造成不一致 |

## 常见坑

1. **为了「看起来高级」而拆**：成本和故障面翻倍，效果未必更好。
2. **子 Agent 继承全部工具与权限**：隔离形同虚设。
3. **回传整段对话**：主上下文迅速被噪声填满。
4. **没有委派深度与循环检测**：两个 Agent 互相转交直到预算耗尽。
5. **各子 Agent 各自记日志却没有统一 run_id**：无法还原一次任务。
6. **返回契约靠自然语言约定**：字段漂移导致主 Agent 误判。

## 深入追问

> [!QUESTION] 拆多智能体的三个正当理由是什么？
> 上下文隔离（高噪声子任务不污染主链路）、权限隔离（不同 Agent 持有不同工具集与数据权限）、以及子任务可并行且互不依赖。

> [!QUESTION] 为什么「子 Agent 作为工具」通常是首选拓扑？
> 对主链路而言它只是一次工具调用，独立上下文、只回传结构化结论，最容易复用现有的循环、预算、观测与审计机制。

> [!QUESTION] 多智能体的成本为什么会成倍增长？
> 每个子 Agent 都有自己的工具定义、历史与循环，还要把结论汇总给主 Agent；轮次与 token 是相乘关系，因此必须有独立配额与总预算上限。

> [!QUESTION] handoff 拓扑最需要防什么？
> 反复转交形成环路：需要转交次数上限、委派链记录与环路熔断，同时明确「谁对最终结果负责」。
