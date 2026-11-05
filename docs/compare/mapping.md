---
level: 基础
tags: [概念映射, Spring AI, Python, ChatClient, LangGraph, 迁移, 对照表]
summary: 把 Spring AI 与 Python 生态里同一件事的不同叫法排成一张表，说明两边心智模型的差异，以及从一边迁到另一边时最容易带错的三个习惯。
---

# Spring AI ↔ Python 概念映射

> [!ABSTRACT] 一句话版本
> - 两边解决的是**同一套问题**：调模型、给工具、带记忆、查资料、管流程、看链路。差别是包装方式与命名。
> - Spring AI 的心智模型是 **Bean + 自动配置 + 注解 + 接口抽象**；Python 侧是 **函数 + 显式循环 + 装饰器 / 类型模型**。
> - 最核心的对应：`ChatClient` ↔ 模型 SDK / Agent 对象；`Advisor` ↔ 中间件 / 回调钩子；`@Tool` ↔ 工具 schema；`VectorStore` ↔ retriever / 索引。
> - 迁移时最容易带错的习惯：以为框架会自动管循环、以为提示词能替代权限控制、以为换栈等于换原理。

## 一、同一套原理，两套名字

<figure class="fig">
<svg viewBox="0 0 760 240" class="dg" role="img" aria-label="Spring AI 与 Python 生态的概念分别映射到同一套 Agent 通用原理">
<rect class="b2" x="20" y="40" width="210" height="150" rx="12"/>
<text class="th" x="125" y="66" text-anchor="middle">Spring AI（Java）</text>
<text class="ts" x="125" y="94" text-anchor="middle">ChatClient · Advisor</text>
<text class="ts" x="125" y="118" text-anchor="middle">@Tool · ChatMemory</text>
<text class="ts" x="125" y="142" text-anchor="middle">VectorStore · MCP starter</text>
<text class="ts" x="125" y="166" text-anchor="middle">Micrometer 观测</text>
<rect class="b5" x="530" y="40" width="210" height="150" rx="12"/>
<text class="th" x="635" y="66" text-anchor="middle">Python 生态</text>
<text class="ts" x="635" y="94" text-anchor="middle">SDK / Agent 对象 · 钩子</text>
<text class="ts" x="635" y="118" text-anchor="middle">装饰器 / schema · messages</text>
<text class="ts" x="635" y="142" text-anchor="middle">loader / retriever · MCP client</text>
<text class="ts" x="635" y="166" text-anchor="middle">tracing · OpenTelemetry</text>
<rect class="bg" x="270" y="70" width="220" height="90" rx="12"/>
<text class="th" x="380" y="96" text-anchor="middle">通用原理</text>
<text class="ts" x="380" y="120" text-anchor="middle">模型 · 工具 · 循环 · 状态</text>
<text class="ts" x="380" y="142" text-anchor="middle">上下文 · 检索 · 评测 · 护栏</text>
<line class="l" x1="230" y1="115" x2="270" y2="115" marker-end="url(#arr)"/>
<line class="la" x1="530" y1="115" x2="490" y2="115" marker-end="url(#arr-a)"/>
<text class="ts" x="380" y="216" text-anchor="middle">先掌握中间这层，两边的名字只是标签</text>
</svg>
<figcaption>图 1：换栈时不变的是中间那套原理</figcaption>
</figure>

## 二、概念映射表

| 要做的事 | Spring AI | Python 生态 | 对应原理页 |
| --- | --- | --- | --- |
| 调一次模型 | `ChatModel` / `ChatClient` | 厂商 SDK / Agent 对象 | [Agent 是什么](#/basic/what-is-agent) |
| 组装提示词 | `.system()` `.user()` `.prompt()` | `messages` 列表 / 提示模板 | [术语速查](#/start/glossary) |
| 调用前后加逻辑 | `Advisor` 链 | 中间件 / 回调钩子 / 包装函数 | [ChatClient 与 Advisor](#/springai/chatclient) |
| 暴露工具 | `@Tool` + `MethodToolCallbackProvider` | 装饰器 / 字典 schema / Pydantic 模型 | [工具调用与结构化输出](#/springai/tools) |
| 外部工具复用 | MCP client / server starter | MCP client 库 | [MCP 与工具生态](#/basic/mcp) |
| 结构化输出 | `.entity(OrderSummary.class)` | `output_type` + Pydantic 模型 | [结构化输出、检索与评测](#/python/output-rag-eval) |
| 会话历史 | `ChatMemory` + 记忆 Advisor | `messages` / session / 状态 | [上下文、记忆与 RAG](#/basic/context-rag) |
| 文档检索 | 文档 ETL + `VectorStore` + 问答 Advisor | loader → embedding → 索引 → retriever | [上下文、记忆与 RAG](#/basic/context-rag) |
| 显式流程编排 | 业务代码里组织循环 / 高层 Agent 抽象 | LangGraph `StateGraph` + checkpointer | [LangGraph](#/python/langgraph) |
| 暂停等人确认 | 业务代码实现中断点 | LangGraph `interrupt` / `needs_approval` | [评测、可观测与安全边界](#/basic/eval-safety) |
| 依赖与配置 | BOM + starter + `application.yml` | 虚拟环境 + 依赖文件 + 环境变量 | [Spring AI 全景](#/springai/overview) |
| 可观测 | Micrometer / Observation | tracing / OpenTelemetry | [评测、可观测与安全边界](#/basic/eval-safety) |
| 流式输出 | `.stream()` | 流式响应 / 异步迭代 | [ChatClient 与 Advisor](#/springai/chatclient) |

> [!NOTE] 不要强求一一对应
> 有些能力在一边是框架内建、另一边要自己写（例如检查点在 Spring AI 侧通常落到业务层）。这张表用于**建立直觉**，不是严格的 API 对照手册。

## 三、心智模型的三个差异

| 维度 | Spring AI | Python 生态 |
| --- | --- | --- |
| 组装方式 | 依赖注入：Bean 由容器创建、自动配置生效 | 显式构造：对象与循环由你写 |
| 扩展点 | 接口 + 注解 + Advisor 链 | 函数 + 装饰器 + 回调 / 中间件 |
| 类型保障 | 编译期 Java 类型 + `.entity(...)` | Pydantic 运行时校验 + 类型标注 |
| 出问题先查 | 自动配置有没有生效、Advisor 顺序、Bean 是否注册 | 实际发出去的 `messages` 与工具 schema |
| 学习入口 | 「哪个 starter、哪个 Bean」 | 「这条循环长什么样」 |

> [!TIP] 一个通用的调试起手式
> 不管哪边，第一步都是**把实际发给模型的请求打印出来**：系统提示、历史、工具清单、检索片段。两边的大量「模型不听话」，根因都是它压根没收到那段内容。

## 四、迁移时容易带错的习惯

1. **以为框架自动管循环与停止条件**：两边都要你决定何时停、超限怎么办，见 [核心循环与工具调用](#/basic/loop)。
2. **把提示词约束当权限控制**：`请谨慎` 不是鉴权，两边都必须把校验写进工具内部。
3. **把「换栈」当成「换原理」**：RAG 仍是先检索再拼提示词，MCP 仍是工具协议，评测仍要固定用例。
4. **照抄另一边的抽象层级**：把 Spring 的 Advisor 概念硬套到一个十行 Python 脚本上，只会增加复杂度。

## 常见坑

- **按名字猜能力**：名字相似不代表行为一致（例如两边「记忆」的默认存储与隔离方式不同）。
- **忽略版本**：两边框架都在快速迭代，映射表只描述角色，不保证具体类名。
- **横向对比过早**：还没吃透一条栈就对照，容易把两边名字记混；建议顺序见 [学习大纲与路线](#/start/outline)。

## 自测题

> [!QUESTION] `Advisor` 在 Python 侧大致对应什么？
> 对应中间件 / 回调钩子 / 包装函数这类「在模型调用前后统一插入逻辑」的机制，而不是某个固定类。

> [!QUESTION] 两边调试的第一步为什么相同？
> 因为无论框架怎么包装，模型收到的都是系统提示 + 历史 + 工具清单 + 检索片段 + 用户问题；先打印实际请求，才能区分「没收到」和「没听懂」。

> [!QUESTION] 从 Python 迁到 Spring AI，最需要改变的心智模型是什么？
> 从「显式构造对象与循环」转为「Bean 由容器创建、靠 starter 自动配置与注解注册」，排查重点变成配置是否生效、Bean 是否注册、Advisor 顺序是否正确。

> [!QUESTION] 换技术栈时，哪些东西是不变的？
> 工具调用的真实数据流、循环的停止条件、上下文窗口约束、RAG 的离在线两段、提示注入与鉴权边界、以及需要固定用例的评测。
