---
level: 基础
tags: [学习路线, 大纲, 入门, Agent, Spring AI, Python]
summary: 先给出整份笔记的完整大纲与四阶段学习路线，说明每章解决什么问题、按什么顺序读，以及初学者最该先建立的五个基本判断。
---

# 学习大纲与路线

> [!ABSTRACT] 一句话版本
> - **一条主线 + 两条栈**：先用不依赖语言的原理建立地图，再分别看 Spring AI（Java）与 Python 生态，最后横向对照。
> - **先大纲，再详细**：本页是地图；每一页详细笔记都按「它解决什么问题 → 核心概念 → 最小必要用法 → 常见坑 → 自测题」展开。
> - 最该先记住的是：**模型只负责决定下一步，代码才负责执行**；框架的差别只是这条循环被谁包装、状态存在哪里。
> - 学习顺序：原理 → 选一条栈 → 对照落地 → 动手时查官方文档。不要一上来就挑框架。

## 一、为什么先要一张地图

初学 Agent 最容易卡住的，不是某个 API 不会写，而是**不知道自己卡在哪一层**：模型没调工具，是工具描述没写好？是没注册？是框架版本变了？还是循环压根没跑起来？

先把系统拆成几层，遇到问题就能定位。整份笔记按这个顺序组织：

<figure class="fig">
<svg viewBox="0 0 760 190" class="dg" role="img" aria-label="四阶段学习路线：原理、通用基础、单栈深入、对照落地">
<rect class="b1" x="20" y="46" width="160" height="66" rx="10"/>
<text class="tb" x="100" y="70" text-anchor="middle" dominant-baseline="middle">① 看懂原理</text>
<text class="ts" x="100" y="94" text-anchor="middle">四要素 + 循环</text>
<rect class="b2" x="205" y="46" width="160" height="66" rx="10"/>
<text class="tb" x="285" y="70" text-anchor="middle" dominant-baseline="middle">② 通用基础</text>
<text class="ts" x="285" y="94" text-anchor="middle">上下文 · RAG · MCP</text>
<rect class="b3" x="390" y="46" width="160" height="66" rx="10"/>
<text class="tb" x="470" y="70" text-anchor="middle" dominant-baseline="middle">③ 挑一条栈</text>
<text class="ts" x="470" y="94" text-anchor="middle">Spring AI 或 Python</text>
<rect class="b5" x="575" y="46" width="160" height="66" rx="10"/>
<text class="tb" x="655" y="70" text-anchor="middle" dominant-baseline="middle">④ 对照落地</text>
<text class="ts" x="655" y="94" text-anchor="middle">映射 · 选型 · 清单</text>
<line class="l" x1="180" y1="79" x2="205" y2="79" marker-end="url(#arr)"/>
<line class="l" x1="365" y1="79" x2="390" y2="79" marker-end="url(#arr)"/>
<line class="l" x1="550" y1="79" x2="575" y2="79" marker-end="url(#arr)"/>
<text class="ts" x="380" y="146" text-anchor="middle">先建立「不依赖语言」的判断力，再学具体 API；两边最终会在同一套原理上汇合</text>
</svg>
<figcaption>图 1：四阶段学习路线，先地图后细节</figcaption>
</figure>

## 二、完整大纲

### 0 · 从这里开始

| 页面 | 解决什么问题 |
| --- | --- |
| [学习大纲与路线](#/start/outline)（本页） | 全局地图、章节顺序、总纲 |
| [术语速查与准备](#/start/glossary) | 名词太多，先把 token / 上下文 / embedding / MCP 等一次性对齐 |

### 1 · Agent 基础（语言无关，最重要）

| 页面 | 解决什么问题 | 关键结论 |
| --- | --- | --- |
| [Agent 是什么](#/basic/what-is-agent) | 一次问答和 Agent 到底差在哪 | 差别是「自主循环」，不是模型更聪明 |
| [核心循环与工具调用](#/basic/loop) | 循环怎么跑、工具调用的真实数据流 | 模型发请求，代码执行，结果回填上下文 |
| [上下文、记忆与 RAG](#/basic/context-rag) | 模型不知道我司资料、聊久了会失忆 | 上下文是硬约束，RAG 是提问前先查资料 |
| [MCP 与工具生态](#/basic/mcp) | 为什么工具要标准化 | MCP ≈ AI 工具界的 USB-C |
| [评测、可观测与安全边界](#/basic/eval-safety) | 怎么知道它有没有跑偏 | 要有停止条件、预算上限、评测集和人工确认 |

### 2 · Spring AI（Java 栈）

| 页面 | 解决什么问题 |
| --- | --- |
| [Spring AI 全景与分层抽象](#/springai/overview) | 定位、适合谁、`ChatModel` → `ChatClient` → `Advisor` 分层 |
| [ChatClient 与 Advisor](#/springai/chatclient) | 最常用的链式调用；Advisor ≈ AOP 环绕增强 |
| [工具调用与结构化输出](#/springai/tools) | `@Tool` / `ToolCallback`、`entity()` 直接映射 Java 对象 |
| [记忆、RAG 与 MCP 落地](#/springai/rag-memory) | `ChatMemory`、`VectorStore` 与文档 ETL、MCP Client/Server |

### 3 · Python 生态

| 页面 | 解决什么问题 |
| --- | --- |
| [生态地图与选型](#/python/overview) | 框架一大堆，各自管哪一层、从哪个开始 |
| [不用框架的最小 Agent 循环](#/python/minimal-loop) | 亲手读懂那条 while 循环，破除「框架魔法」 |
| [LangGraph：状态图与检查点](#/python/langgraph) | 流程复杂、需要暂停恢复与人工审批时怎么办 |
| [轻量框架：Pydantic AI 与 OpenAI Agents SDK](#/python/frameworks) | 类型安全、handoff、guardrail 等轻量选择 |
| [结构化输出、检索与评测](#/python/output-rag-eval) | 输出校验、RAG 落地、观测与评测 |

### 4 · 对照与落地

| 页面 | 解决什么问题 |
| --- | --- |
| [Spring AI ↔ Python 概念映射](#/compare/mapping) | 同一个概念在两边叫什么，方便互相迁移 |
| [选型与上线检查清单](#/compare/checklist) | 按团队与场景选型；上线前逐条检查 |

## 三、总纲：先记住这五句

1. **Agent = 大模型 + 工具 + 循环 + 状态**。模型负责「想」，工具负责「做」，循环负责「接着做」，状态负责「记得做过什么」。
2. **大模型本身不执行任何操作**。它输出「我想调用某工具、参数是这些」，真正执行的是你的程序。想通这点，Agent 就不神秘了。
3. **Spring AI** 把这套东西做成 Spring 风格的抽象：`ChatClient` 调模型、`Advisor` 做拦截增强、`@Tool` 暴露工具、`VectorStore` 做检索、`MCP` 复用外部工具。
4. **Python 侧**从「裸 SDK + 一个 while 循环」起步最不容易迷路，等循环变复杂了再引入 LangGraph / Pydantic AI / OpenAI Agents SDK。
5. **框架只是编排方式**。真正决定效果的是：工具设计、上下文喂了什么、怎么评测、哪些动作必须让人类确认。

## 四、每页的固定结构

> 它解决什么问题 → 核心概念（配类比 + 图解）→ 最小必要用法（概念示意）→ 常见坑 → 自测题

刻意不堆 API 清单：框架版本迭代很快，**记住概念比记住方法名更保值**。文中代码片段仅用于说明「这个 API 长什么样」，不是可运行项目。

## 五、版本与心态

- 笔记核对时间 **2026-11**。Spring AI 以 1.x（1.0 GA 之后）的抽象为基准；Python 侧以 LangChain / LangGraph 1.x 时代的分工为基准。
- 遇到「照着写却报错」，十有八九是版本差异：先确认版本，再看对应版本的官方文档。
- **不要在挑框架上花一周**。能用一个循环解决的任务，就先用一个循环。

## 常见坑

> [!WARNING] 学习路径上最常见的三个坑
> - **跳过原理直接看框架**：报错时无法判断是模型层、工具层还是编排层的问题。
> - **同时学两条栈**：概念还没稳就横向对比，容易把两边名字记混。先吃透一条，再对照。
> - **把笔记当文档抄**：笔记负责建立地图，准确的参数与类名永远以官方文档为准。

> [!TIP] 一个有效的自测方法
> 读完任意一页，试着给完全没接触过 Agent 的人讲一遍「模型做了什么、我的代码做了什么」。讲得清楚，说明真的理解了。

## 自测题

> [!QUESTION] 为什么建议先学语言无关的原理，而不是直接学 Spring AI 或 LangGraph？
> 因为所有框架都在包装同一条「问模型 → 调工具 → 回填结果 → 再问模型」的循环。先掌握循环，才知道框架替你省了什么，报错时也能定位到具体层。

> [!QUESTION] 一份 Agent 笔记里，为什么反复强调「模型不执行代码」？
> 这是理解工具调用、权限边界和安全的关键：模型只发出调用请求，鉴权、校验、幂等控制都必须写在你的代码里。

> [!QUESTION] 什么时候才需要引入编排框架？
> 当流程不再是单个循环：需要显式分支与状态、需要暂停等待人工确认、需要崩溃后从检查点恢复、或需要回放调试时。

> [!QUESTION] 版本对不上时应该怎么办？
> 先确认自己使用的框架版本，再查该版本的官方文档；笔记里的类名与方法名只作概念示意，不作为准确依据。
