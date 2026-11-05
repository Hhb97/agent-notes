---
level: 深入
tags: [Spring AI, Advisor 链, ToolCallback, BeanOutputConverter, ChatMemory, Micrometer, 请求生命周期]
summary: 沿一次请求的生命周期深入 Spring AI：Advisor 环绕链的执行顺序、@Tool 到 ToolCallback 的转换与工具执行循环、结构化输出的 schema 注入与校验、记忆与 MCP 在链路中的位置，以及观测与关键参数。
---

# Spring AI 机制深入：Advisor 与工具执行链

> [!ABSTRACT] 一句话版本
> - `ChatClient` 不是直接调模型，而是把请求交给一条 **Advisor 环绕链**：链上每个 Advisor 都能改写请求、观察响应，顺序决定最终提示词长什么样。
> - 工具调用的关键链路是 **`@Tool` → `ToolCallback`（含 JSON schema）→ 模型返回 tool call → 框架分发执行 → 结果作为 tool 消息回填 → 再次请求模型**；循环由框架代跑还是由业务代跑，取决于所用版本与配置。
> - 结构化输出不是「让模型返回 JSON」，而是**把目标类型的 schema 注入提示词**，拿到文本后再转换并校验成 Java 对象。
> - `ChatMemory` / `VectorStore` / MCP 工具都通过 Advisor 或 ToolCallbackProvider 接入同一条链路，所以排查问题时先画这张链路图。

> [!NOTE] 版本边界
> 1.0 GA 之后 Advisor、记忆、工具与 MCP 相关 API 有过多轮调整，1.1 起还在扩展 Agents 能力。本页描述**机制与职责**，具体类名、包名、配置键请以所用版本的官方文档为准（核对时间 2026-11）。

## 一、一次请求的完整生命周期

<figure class="fig">
<svg viewBox="0 0 760 320" class="dg" role="img" aria-label="Spring AI 请求生命周期时序：业务代码、ChatClient、Advisor 链、ChatModel、工具回调之间按顺序往返">
<rect class="b" x="20" y="20" width="110" height="36" rx="8"/><text class="tb" x="75" y="38" text-anchor="middle" dominant-baseline="middle">业务代码</text>
<rect class="b1" x="150" y="20" width="110" height="36" rx="8"/><text class="tb" x="205" y="38" text-anchor="middle" dominant-baseline="middle">ChatClient</text>
<rect class="b2" x="280" y="20" width="120" height="36" rx="8"/><text class="tb" x="340" y="38" text-anchor="middle" dominant-baseline="middle">Advisor 链</text>
<rect class="b3" x="420" y="20" width="110" height="36" rx="8"/><text class="tb" x="475" y="38" text-anchor="middle" dominant-baseline="middle">ChatModel</text>
<rect class="b5" x="550" y="20" width="190" height="36" rx="8"/><text class="tb" x="645" y="38" text-anchor="middle" dominant-baseline="middle">ToolCallback / 外部服务</text>
<line class="ld" x1="75" y1="56" x2="75" y2="290"/><line class="ld" x1="205" y1="56" x2="205" y2="290"/><line class="ld" x1="340" y1="56" x2="340" y2="290"/><line class="ld" x1="475" y1="56" x2="475" y2="290"/><line class="ld" x1="645" y1="56" x2="645" y2="290"/>
<text class="ts" x="140" y="80" text-anchor="middle">① prompt().user(...).call()</text>
<line class="l" x1="75" y1="90" x2="205" y2="90" marker-end="url(#arr)"/>
<text class="ts" x="272" y="116" text-anchor="middle">② 构造请求上下文</text>
<line class="l" x1="205" y1="126" x2="340" y2="126" marker-end="url(#arr)"/>
<text class="ts" x="408" y="152" text-anchor="middle">③ 逐个 Advisor 改写（记忆 / 检索 / 日志）</text>
<line class="l" x1="340" y1="162" x2="475" y2="162" marker-end="url(#arr)"/>
<text class="ts" x="560" y="188" text-anchor="middle">④ 模型返回 tool call</text>
<line class="la" x1="475" y1="198" x2="645" y2="198" marker-end="url(#arr-a)"/>
<text class="ts" x="560" y="224" text-anchor="middle">⑤ 执行工具，结果回填消息</text>
<line class="la" x1="645" y1="234" x2="475" y2="234" marker-end="url(#arr-a)"/>
<text class="ts" x="408" y="260" text-anchor="middle">⑥ 再次请求，直到无工具调用</text>
<line class="l" x1="475" y1="270" x2="340" y2="270" marker-end="url(#arr)"/>
<text class="ts" x="272" y="296" text-anchor="middle">⑦ 响应逆序回传 → content() / entity()</text>
<line class="la" x1="340" y1="306" x2="75" y2="306" marker-end="url(#arr-a)"/>
</svg>
<figcaption>图 1：把报错定位到链路上的某一段，比反复改提示词有效得多</figcaption>
</figure>

链路上的每一段都可能出问题：工具没注册（②）、Advisor 顺序错（③）、工具结果没回填（⑤）、循环没有终止（⑥）、输出转换失败（⑦）。

## 二、Advisor 链的环绕语义

Advisor 是**围绕模型调用的拦截器**：请求方向自外向内改写，响应方向自内向外返回。理解成 AOP 的 `@Around` 或 Servlet Filter 链即可。

| 类型 | 请求方向改写 | 响应方向处理 | 依赖 |
| --- | --- | --- | --- |
| 记忆类 | 把会话历史附加进消息列表 | 把本轮问答写回记忆 | `ChatMemory` + 会话 ID |
| 检索 / 问答类 | 检索片段拼进用户消息或模板 | 通常不改写 | `VectorStore` + `EmbeddingModel` |
| 日志类 | 记录最终发出的提示词与工具清单 | 记录响应与耗时 | 日志 / 观测后端 |
| 自定义 | 内容过滤、租户注入、缓存查表 | 结果后处理、指标埋点 | 业务组件 |

```java
// 概念示意：Advisor 本质是「拿请求上下文 → 交给下一个 → 观察响应」
public interface AdvisorLike {
    ChatClientResponse around(ChatClientRequest request, Chain chain);
}
```

**顺序是设计的一部分**：记忆 Advisor 先附加历史，检索 Advisor 才能基于完整上下文改写查询；日志 Advisor 放在最外层才能记录「最终发出去的那份」还是「原始请求」，取决于它挂在哪一环。同步 `.call()` 与流式 `.stream()` 下，Advisor 对响应的处理方式不同，流式场景常有专门的聚合逻辑。

> [!WARNING] 默认链与单次链
> Builder 上的 `defaultAdvisors(...)` 与 `.prompt().advisors(...)` 在不同版本里可能是**追加**或**覆盖**关系。出现「记忆像没配」时，先打印本次请求最终生效的 Advisor 列表，见 [ChatClient 与 Advisor](#/springai/chatclient)。

## 三、工具执行链

| 阶段 | 发生了什么 | 常见故障 |
| --- | --- | --- |
| ① 声明 | `@Tool` 方法（或编程式 `FunctionToolCallback`）被收集 | 注解包名写错、Bean 未托管 |
| ② 解析 | 反射方法签名 + 描述 + 参数注解，生成 JSON schema | 描述为空、参数类型不被支持 |
| ③ 注册 | `MethodToolCallbackProvider` / `ToolCallbackProvider` 交给 `ChatClient` | 忘记注册 → 模型看不到工具 |
| ④ 请求 | 工具 schema 随请求发给模型 | 工具太多，上下文膨胀、选择变差 |
| ⑤ 分发 | 模型返回 tool call（名字 + 参数），框架按名字找到回调并反序列化参数 | 参数幻觉、类型不匹配 |
| ⑥ 回填 | 执行结果作为 tool 消息追加，再次请求模型 | 结果过大、异常被吞、无终止判断 |
| ⑦ 终止 | 模型不再请求工具，返回最终文本；或达到轮次上限 | 无上限 → 循环打转 |

> [!NOTE] 循环由谁跑
> 多数模型适配会在一次 `ChatClient` 调用内部完成「工具调用 → 回填 → 再请求」的迭代；也有版本/配置支持把工具执行交给调用方自行循环。**必须确认所用版本的行为**，再决定要不要在业务层再写一层 while，否则会出现双重循环。业务侧的停止条件与预算控制仍然不可省，见 [核心循环与工具调用](#/basic/loop)。

**MCP 也落到这条链上**：MCP Client starter 启动连接、发现远端工具，把它们包装成 `ToolCallbackProvider`；对 `ChatClient` 来说，本地 `@Tool` 和远端 MCP 工具没有区别。差异只在传输与生命周期，见 [MCP 与工具生态](#/basic/mcp)。

## 四、结构化输出的内部动作

`.entity(OrderSummary.class)` 大致做三件事：

1. **生成 schema**：由目标 Java 类型推导出字段与类型说明（这类组件常称 output converter / bean converter）；
2. **注入提示词**：把格式要求追加到请求中，约束模型输出；
3. **转换与校验**：把返回文本解析成对象，失败时按配置重试或抛错。

| 失败现象 | 常见根因 |
| --- | --- |
| 解析异常 | 模型多输出了说明文字、返回了 Markdown 代码块 |
| 字段缺失 | 目标类型过于复杂、可选字段太多 |
| 类型不符 | 枚举 / 日期 / 嵌套泛型没有明确格式约定 |

> [!TIP] 稳定性优先于表达力
> 输出类型字段少、含义明确；复杂结构拆成多次调用。类型校验保证的是**格式**，不是事实正确，业务校验仍要做，见 [工具调用与结构化输出](#/springai/tools)。

## 五、关键参数与观测

| 参数 / 配置 | 作用 | 建议 |
| --- | --- | --- |
| `temperature` | 输出随机性 | 工具调用、抽取类任务调低 |
| `max-tokens` | 单次输出上限 | 与预算、超时一起设 |
| 超时 / 重试 | 网络与限流容错 | 只对可恢复错误重试，配退避 |
| 记忆窗口 / 会话 ID | 历史保留量与隔离 | 按用户 + 会话隔离，见 [记忆、RAG 与 MCP 落地](#/springai/rag-memory) |
| 向量维度 / 相似度阈值 | 检索行为 | 维度必须与 embedding 模型一致 |
| MCP 连接超时、传输类型 | stdio / HTTP 生命周期 | 远程连接要鉴权与审计 |

观测方面，Micrometer Observation 可把一次调用串成链路（模型、检索、工具各段耗时与 token）。学习期最有效的仍是**打印最终提示词与工具清单**；生产期再接指标、链路与告警，见 [可靠性、成本与评测门禁](#/deep/reliability-eval)。

## 常见坑

1. **双重循环**：框架已代跑工具迭代，业务层又写了一遍 while。
2. **Advisor 顺序 / 覆盖关系误判**：记忆或检索「看起来没生效」。
3. **工具描述由注解自动推断但为空**：模型乱选工具，排查时应打印 schema。
4. **把工具异常直接抛给上层**：模型收不到失败信息，也无法自我纠正；应回填明确的失败消息。
5. **流式 + 结构化输出混用**：逐段返回与完整对象解析的语义不同。
6. **照抄旧版本类名**：1.0 前后注解包、Provider、记忆 API 都调整过。

## 深入追问

> [!QUESTION] 为什么 Advisor 要设计成「环绕」而不是「前置」？
> 因为既要改写请求（加历史、加检索片段、注入租户），也要观察响应（写回记忆、记录耗时与 token、做后处理）。环绕语义让同一组件覆盖请求与响应两个方向，还能用顺序表达依赖。

> [!QUESTION] 模型返回工具调用后，如果框架没有自动再请求一次模型，会发生什么？
> 调用方会拿到一个「未完成的」工具调用响应而不是最终答案。此时必须在业务层实现回填与循环；反之若框架已经代跑，业务层再写循环就会重复执行工具。

> [!QUESTION] 结构化输出为什么仍可能失败？
> schema 只是约束，模型仍可能多输出说明文字或漏字段；目标类型越复杂越易漂移。应设计简单类型、保留失败重试，并对结果做业务校验。

> [!QUESTION] 一次「模型答非所问」，如何按链路快速定位？
> 依次检查：最终提示词（Advisor 是否生效）→ 工具 schema（是否注册、描述是否清楚）→ 工具结果是否回填 → 是否达到轮次上限 → 输出转换是否吞掉异常。
