---
level: 基础
tags: [Tool, ToolCallback, MethodToolCallbackProvider, 结构化输出, entity, 工具描述, Spring AI]
summary: 讲清如何把普通 Java 方法变成模型可用的工具、工具描述为什么是「写给模型看的文档」，以及为什么结构化输出应该直接映射成 Java 对象而不是解析字符串。
---

# 工具调用与结构化输出

> [!ABSTRACT] 一句话版本
> - **`@Tool` 把普通 Java 方法声明成工具**，通过 `MethodToolCallbackProvider` 之类的方式注册后，模型才能看见它。
> - 模型只发出调用请求，**真正执行的是你的 JVM 代码**：鉴权、参数校验、幂等控制都写在工具方法内部。
> - **description 是给模型看的 API 文档**，比方法名重要得多；写含糊就会乱调工具或编错参数。
> - **结构化输出用 `.entity(...)` 直接拿 Java 对象**，不要「请返回 JSON」再手工切字符串。

## 一、把方法变成工具

```java
// 概念示意：注解名、参数注解与注册方式以所用版本官方文档为准
class OrderTools {
    @Tool(description = "根据订单号查询订单当前状态；只用于订单状态查询")
    String queryOrderStatus(
            @ToolParam(description = "订单号，形如 A-1001") String orderId) {
        // 真正的执行在这里：鉴权、校验、调用业务服务
        return orderService.status(orderId);
    }
}
```

注册思路有两种：

| 方式 | 怎么做 | 适合 |
| --- | --- | --- |
| **注解式** | 在方法上加 `@Tool`，把对象交给 `MethodToolCallbackProvider` 生成回调并注册进 `ChatClient` | 业务里已有的 Service 方法 |
| **编程式** | 直接构造 `ToolCallback` / `ToolCallbackProvider` | 工具需要动态组装、或来自外部 MCP Server |

无论哪种，最终都是把工具清单交给 `ChatClient`（Builder 设默认，或 `.tools(...)` / `.toolCallbacks(...)` 设本次请求）。

<figure class="fig">
<svg viewBox="0 0 760 200" class="dg" role="img" aria-label="Spring AI 工具调用链路：ChatClient 携带工具清单请求模型，模型返回调用请求，框架反射执行 Java 方法并回填结果">
<rect class="b1" x="20" y="40" width="130" height="46" rx="9"/><text class="tb" x="85" y="63" text-anchor="middle" dominant-baseline="middle">ChatClient</text>
<rect class="b2" x="190" y="40" width="130" height="46" rx="9"/><text class="tb" x="255" y="63" text-anchor="middle" dominant-baseline="middle">模型</text>
<rect class="b3" x="360" y="40" width="160" height="46" rx="9"/><text class="tb" x="440" y="63" text-anchor="middle" dominant-baseline="middle">ToolCallback</text>
<rect class="b5" x="560" y="40" width="180" height="46" rx="9"/><text class="tb" x="650" y="63" text-anchor="middle" dominant-baseline="middle">你的 @Tool 方法</text>
<line class="l" x1="150" y1="52" x2="190" y2="52" marker-end="url(#arr)"/>
<text class="ts" x="170" y="36" text-anchor="middle">工具清单</text>
<line class="la" x1="190" y1="74" x2="150" y2="74" marker-end="url(#arr-a)"/>
<text class="ts" x="170" y="96" text-anchor="middle">调用请求</text>
<line class="l" x1="320" y1="63" x2="360" y2="63" marker-end="url(#arr)"/>
<line class="l" x1="520" y1="63" x2="560" y2="63" marker-end="url(#arr)"/>
<rect class="bg" x="20" y="120" width="720" height="54" rx="10"/>
<text class="t" x="380" y="140" text-anchor="middle" dominant-baseline="middle">执行结果 → 作为 tool 消息回填上下文 → 再次请求模型 → 生成最终回答</text>
<text class="ts" x="380" y="162" text-anchor="middle">鉴权 · 参数校验 · 幂等 · 审计，全部落在 @Tool 方法内部</text>
</svg>
<figcaption>图 1：工具清单给模型，执行始终发生在你的 JVM 里</figcaption>
</figure>

## 二、工具描述怎么写

| | 差 | 好 |
| --- | --- | --- |
| 方法名 | `handle(x)` | `queryOrderStatus(orderId)` |
| 描述 | 空着 / 复制方法名 | 「根据订单号查询订单当前状态；只用于订单状态查询」 |
| 参数说明 | 无 | 「订单号，形如 A-1001」 |
| 返回值 | 原始大 JSON | 精简、结构化、只含模型需要的信息 |
| 副作用 | 混在读工具里 | 写操作单独标记，配合人工确认 |

> [!TIP] 模型调错工具时的排查顺序
> ① 打印本次请求实际发出的工具清单，确认工具**已注册**；② 检查描述是否说清「什么时候用我」；③ 检查参数类型与说明是否容易误解；④ 最后才怀疑模型能力。

## 三、结构化输出

让模型「返回 JSON」再用字符串截取，是初学者最典型的脆弱写法：模型多说一句「好的，这是结果：」就可能解析失败。Spring AI 提供把输出直接映射成 Java 类型的能力：

```java
// 概念示意：把结果直接映射为对象，字段类型可做校验
OrderSummary summary = chatClient.prompt()
        .user("总结订单 A-1001，给出状态与预计送达日")
        .call()
        .entity(OrderSummary.class);
```

| 做法 | 问题 |
| --- | --- |
| 「请返回 JSON」+ `substring` / 正则 | 多一句解释就崩，字段缺失难发现 |
| 让模型输出 Markdown 表格再解析 | 格式漂移，下游代码脆弱 |
| `.entity(OrderSummary.class)` | 有类型、有校验、IDE 可补全 |

> [!NOTE] 设计建议
> 输出类型尽量简单：字段少、含义明确、避免深层嵌套与大量可选字段。复杂结构更容易出现字段缺失，拿到对象后仍要做业务校验。

## 四、和原理章节对应

- 工具调用的真实数据流 → [核心循环与工具调用](#/basic/loop)
- 工具作为权限边界、提示注入 → [评测、可观测与安全边界](#/basic/eval-safety)
- 外部 MCP Server 提供的工具如何接入 → [记忆、RAG 与 MCP 落地](#/springai/rag-memory)

## 常见坑

1. **`@Tool` 方法写了却没注册**：模型看不到工具，表现为「它老实说自己查不了」。
2. **描述空着或太抽象**：模型选错工具、编造参数，比代码 bug 更常见。
3. **把鉴权交给模型传来的 user_id**：应使用当前登录会话身份重新校验。
4. **工具返回整张表 / 整份报文**：上下文被噪声占满，还增加注入风险。
5. **写操作没有幂等或确认**：一次误判可能造成重复下单、重复发送。
6. **忽略版本差异**：注解包名、Provider 类名、`.entity(...)` 的行为在不同版本间可能调整。

## 自测题

> [!QUESTION] `@Tool` 的 description 是写给谁看的？
> 写给模型看的。模型只看得到工具名、描述和参数 schema，看不到实现；描述决定了它能否在正确时机选对工具并给出合法参数。

> [!QUESTION] 工具方法里应该放哪些逻辑？
> 鉴权（基于当前会话身份）、参数白名单校验、幂等控制、审计日志、业务服务调用；这些不能依赖提示词约束。

> [!QUESTION] 为什么不要手工解析模型返回的 JSON？
> 输出格式容易漂移（多一句解释、字段缺失、类型变化）；用结构化输出直接映射成对象可得到类型与校验保障。

> [!QUESTION] 注解式和编程式工具分别适合什么？
> 注解式适合已有 Service 方法、静态工具集；编程式适合工具需要动态组装、按租户变化，或来自外部 MCP Server 的场景。
