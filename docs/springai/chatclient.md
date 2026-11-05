---
level: 基础
tags: [ChatClient, Advisor, Fluent API, 流式, 结构化输出, 拦截链, Spring AI]
summary: 讲清最常用的 ChatClient 链式调用由哪几类方法组成，并把 Advisor 理解为 AOP 环绕增强，说明默认配置与单次配置、call 与 stream 的区别。
---

# ChatClient 与 Advisor

> [!ABSTRACT] 一句话版本
> - **`ChatClient` 是日常最常用的一层**：把提示词、工具、Advisor、模型参数组装成一次请求，再选择同步或流式取结果。
> - **Advisor ≈ AOP 环绕增强 / Servlet Filter 链**：在模型调用前后自动插入记忆、检索、日志等逻辑，避免把这些复制进每个业务方法。
> - **默认 vs 单次要分清**：Builder 上设的是全局默认，`.prompt().advisors(...)` 设的是本次请求，调试时先确认到底生效了哪一批。
> - `.call()` 拿全量、`.stream()` 拿逐段；`.content()` 取纯文本、`.entity(...)` 取 Java 对象。

## 一、最短路径

```java
// 概念示意：ChatClient 由 Spring Boot 自动配置好 Builder，注入即可
String answer = chatClient.prompt()
        .system("你是订单助手，只回答与订单有关的问题")
        .user("订单 A-1001 到哪了？")
        .call()
        .content();
```

建议先把这一条最短路径跑通，再逐项往上加。链式方法大致分五类：

| 类别 | 典型方法 | 作用 |
| --- | --- | --- |
| 组装消息 | `.prompt()` `.user()` `.system()` | 构造系统指令与用户消息 |
| 覆盖参数 | `.options(...)` | 临时指定模型、温度等 |
| 提供工具 | `.tools(...)` `.toolCallbacks(...)` | 本次请求可用哪些工具，见 [工具调用与结构化输出](#/springai/tools) |
| 挂载增强 | `.advisors(...)` | 本次请求经过哪些 Advisor |
| 取结果 | `.call()` / `.stream()`，`.content()` / `.entity(...)` | 同步或流式、文本或对象 |

> [!NOTE] 版本差异
> 方法名与返回类型在不同版本间可能微调（尤其是记忆与 Advisor 相关 API）。遇到编译错误，先查所用版本的官方文档，不要照抄旧教程。

## 二、Advisor：把它当拦截器

如果每个请求都要「带上历史对话」「先检索文档」「记一条日志」，把这些复制进每个业务方法显然很糟。Advisor 就是**围绕一次模型调用的可插拔拦截链**：

<figure class="fig">
<svg viewBox="0 0 760 210" class="dg" role="img" aria-label="Advisor 拦截链：请求依次经过记忆、检索、日志 Advisor 到达模型，响应按相反顺序返回">
<rect class="b1" x="20" y="60" width="110" height="48" rx="9"/><text class="tb" x="75" y="84" text-anchor="middle" dominant-baseline="middle">请求</text>
<rect class="b2" x="160" y="60" width="120" height="48" rx="9"/><text class="tb" x="220" y="76" text-anchor="middle" dominant-baseline="middle">记忆 Advisor</text><text class="ts" x="220" y="96" text-anchor="middle">附加历史</text>
<rect class="b3" x="310" y="60" width="120" height="48" rx="9"/><text class="tb" x="370" y="76" text-anchor="middle" dominant-baseline="middle">检索 Advisor</text><text class="ts" x="370" y="96" text-anchor="middle">拼入片段</text>
<rect class="b2" x="460" y="60" width="120" height="48" rx="9"/><text class="tb" x="520" y="76" text-anchor="middle" dominant-baseline="middle">日志 Advisor</text><text class="ts" x="520" y="96" text-anchor="middle">记录报文</text>
<rect class="b5" x="610" y="60" width="130" height="48" rx="9"/><text class="tb" x="675" y="84" text-anchor="middle" dominant-baseline="middle">模型调用</text>
<line class="l" x1="130" y1="72" x2="160" y2="72" marker-end="url(#arr)"/>
<line class="l" x1="280" y1="72" x2="310" y2="72" marker-end="url(#arr)"/>
<line class="l" x1="430" y1="72" x2="460" y2="72" marker-end="url(#arr)"/>
<line class="l" x1="580" y1="72" x2="610" y2="72" marker-end="url(#arr)"/>
<line class="la" x1="610" y1="100" x2="580" y2="100" marker-end="url(#arr-a)"/>
<line class="la" x1="460" y1="100" x2="430" y2="100" marker-end="url(#arr-a)"/>
<line class="la" x1="310" y1="100" x2="280" y2="100" marker-end="url(#arr-a)"/>
<line class="la" x1="160" y1="100" x2="130" y2="100" marker-end="url(#arr-a)"/>
<text class="ts" x="380" y="150" text-anchor="middle">请求自左向右逐层改写，响应自右向左返回；顺序不同，结果可能不同</text>
<text class="ts" x="380" y="176" text-anchor="middle">学习期先开日志 Advisor，能直观看到模型「实际收到了什么」</text>
</svg>
<figcaption>图 1：Advisor 链与 Filter 链同构，前后顺序都有意义</figcaption>
</figure>

常见类型（名称随版本变化，按官方文档核对）：

| 类型 | 做什么 | 对应原理 |
| --- | --- | --- |
| 对话记忆类 | 自动把历史消息带进请求、把本轮问答存下来 | [短期记忆](#/basic/context-rag) |
| 问答 / RAG 类 | 先查 `VectorStore`，把相关片段拼进提示词 | [RAG 在线部分](#/basic/context-rag) |
| 日志类 | 打印请求与响应 | [可观测性](#/basic/eval-safety) |

> [!TIP] 为什么学习期先开日志 Advisor
> 大量「模型不听话」其实是**它根本没收到那段指令**。打印实际请求，比反复改提示词猜原因快得多。

## 三、同步、流式与结果转换

| 需求 | 用什么 | 注意 |
| --- | --- | --- |
| 一次性拿到完整答案 | `.call().content()` | 简单、易调试，先从这个开始 |
| 逐段显示给前端 | `.stream()` | 返回的是流，类型与 `.call()` 不同，别混写 |
| 映射到 Java 对象 | `.entity(OrderSummary.class)` | 见 [结构化输出](#/springai/tools) |

```java
// 概念示意：Builder 上设默认，单次请求可临时追加
ChatClient client = builder
        .defaultSystem("回答简洁，使用中文；不确定时说明不知道。")
        .build();

String out = client.prompt()
        .user(question)
        .advisors(loggerAdvisor)     // 仅本次请求生效
        .call()
        .content();
```

## 四、配置的作用域

| 设置位置 | 生效范围 | 典型用途 |
| --- | --- | --- |
| `ChatClient.Builder.defaultXxx(...)` | 该 client 的所有请求 | 系统人设、默认工具、默认 Advisor |
| `.prompt().advisors(...)` / `.options(...)` | 本次请求 | 临时覆盖、A/B 对比评测 |

> [!WARNING] 一个隐蔽的坑
> 单次请求里的 Advisor 列表如果**覆盖**而不是追加默认列表，会出现「明明配了记忆却像没配」的现象。调试第一步：打印本次请求最终生效的 Advisor 顺序。

## 常见坑

1. **`.call()` 与 `.stream()` 混用**：返回类型不同，编译或运行时行为都不一样。
2. **Advisor 顺序写反**：前一个改写的内容会被后一个看到，顺序影响最终提示词。
3. **默认与单次配置混淆**：以为加了记忆，其实被本次请求的空列表覆盖。
4. **系统提示写得太长太玄**：应明确、可执行、带边界，例如「资料不足时说明不知道」。
5. **流式场景忘记处理超时与断连**：AI 响应比普通 HTTP 慢，线程池与超时要单独考虑。

## 自测题

> [!QUESTION] 为什么说 Advisor 像 AOP 环绕增强？
> 它在模型调用前后插入可插拔逻辑（请求改写、结果处理），多个 Advisor 组成一条有顺序的链，与 Filter / 环绕通知同构。

> [!QUESTION] `.call()` 与 `.stream()` 该怎么选？
> 需要一次性拿完整结果做后续处理用 `.call()`；需要逐段展示给前端用 `.stream()`，并处理流类型、超时与断连。

> [!QUESTION] 发现「对话没有记忆」，第一步查什么？
> 打印本次请求最终生效的 Advisor 列表与顺序，确认记忆 Advisor 是否被单次要盖掉，以及会话 ID 是否一致。

> [!QUESTION] 为什么 `.entity(...)` 优于「请返回 JSON」再解析？
> 框架按目标类型约束并校验输出，直接得到 Java 对象；字符串解析会被模型多说的一句客套话、格式的细微偏差打破。
