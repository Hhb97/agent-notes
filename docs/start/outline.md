---
level: 基础
tags: [学习路线, 大纲, 入门, Agent, Spring AI, Python, 架构]
summary: 整份笔记的完整大纲与阅读路线：五层结构、12 个分类、56 篇笔记各自解决什么问题，以及初学者最该先建立的五个基本判断。
---

# 学习大纲与路线

> [!ABSTRACT] 一句话版本
> - **一条主线 + 两条栈 + 三层加练**：先用不依赖语言的原理建立地图，再补通用能力，然后深入 Spring AI 或 Python，最后进入工程化、机制与架构。
> - **先大纲，再详细**：本页是地图；每一篇详细笔记都按「它解决什么问题 → 核心概念 → 最小必要用法 → 常见坑 → 自测题」展开。
> - 最该先记住的是：**模型只负责决定下一步，代码才负责执行**；框架的差别只是这条循环被谁包装、状态存在哪里。
> - 遇到不懂的层，回到这张表定位，而不是随机翻页。

## 一、为什么先要一张地图

初学 Agent 最容易卡住的，不是某个 API 不会写，而是**不知道自己卡在哪一层**：模型没调工具，是工具描述没写好？是没注册？是版本变了？还是循环压根没跑起来？

先把系统拆成几层，遇到问题就能定位。整份笔记按这个顺序组织：

<figure class="fig">
<svg viewBox="0 0 760 200" class="dg" role="img" aria-label="五层阅读顺序：入门与原理、知识与工具、技术栈、工程与机制、架构与落地">
<rect class="b1" x="20" y="46" width="136" height="66" rx="10"/>
<text class="tb" x="88" y="70" text-anchor="middle" dominant-baseline="middle">① 入门与原理</text>
<text class="ts" x="88" y="94" text-anchor="middle">循环 · 工具 · 模型</text>
<rect class="b2" x="168" y="46" width="136" height="66" rx="10"/>
<text class="tb" x="236" y="70" text-anchor="middle" dominant-baseline="middle">② 知识与工具</text>
<text class="ts" x="236" y="94" text-anchor="middle">检索 · 记忆 · MCP</text>
<rect class="b3" x="316" y="46" width="136" height="66" rx="10"/>
<text class="tb" x="384" y="70" text-anchor="middle" dominant-baseline="middle">③ 技术栈</text>
<text class="ts" x="384" y="94" text-anchor="middle">Spring AI / Python</text>
<rect class="b5" x="464" y="46" width="136" height="66" rx="10"/>
<text class="tb" x="532" y="70" text-anchor="middle" dominant-baseline="middle">④ 工程与机制</text>
<text class="ts" x="532" y="94" text-anchor="middle">测试 · 观测 · 运行时</text>
<rect class="b1" x="612" y="46" width="128" height="66" rx="10"/>
<text class="tb" x="676" y="70" text-anchor="middle" dominant-baseline="middle">⑤ 架构与落地</text>
<text class="ts" x="676" y="94" text-anchor="middle">全景 · 蓝图 · 案例</text>
<line class="l" x1="156" y1="79" x2="166" y2="79" marker-end="url(#arr)"/>
<line class="l" x1="304" y1="79" x2="314" y2="79" marker-end="url(#arr)"/>
<line class="l" x1="452" y1="79" x2="462" y2="79" marker-end="url(#arr)"/>
<line class="l" x1="600" y1="79" x2="610" y2="79" marker-end="url(#arr)"/>
<text class="ts" x="380" y="152" text-anchor="middle">先建立「不依赖语言」的判断力，再学具体 API；两条栈最终会在同一套原理上汇合</text>
</svg>
<figcaption>图 1：五层阅读顺序，先地图后细节</figcaption>
</figure>

## 二、完整大纲

下表就是全站结构：**12 个分类、56 篇**。标 ★ 的适合作为入口。

### 0 · 从这里开始（2 篇）

| 页面 | 解决什么问题 |
| --- | --- |
| [学习大纲与路线](#/start/outline)（本页）★ | 全局地图、章节顺序、总纲五句 |
| [术语速查与准备](#/start/glossary) | 名词太多，先把 token / 上下文 / embedding / MCP 一次性对齐 |

### 1 · Agent 基础（5 篇）

| 页面 | 关键结论 |
| --- | --- |
| [Agent 是什么：从一次问答到自主循环](#/basic/what-is-agent) ★ | 差别是「自主循环」，不是模型更聪明 |
| [核心循环与工具调用](#/basic/loop) ★ | 模型发请求，代码执行，结果回填上下文 |
| [上下文、记忆与 RAG](#/basic/context-rag) | 上下文是硬约束，RAG 是提问前先查资料 |
| [MCP 与工具生态](#/basic/mcp) | MCP ≈ AI 工具界的 USB-C |
| [评测、可观测与安全边界](#/basic/eval-safety) | 要有停止条件、预算上限、评测集与人工确认 |

### 2 · 模型与提示词（4 篇）

| 页面 | 解决什么问题 |
| --- | --- |
| [大模型怎么工作：token、预测与幻觉](#/llm/how-llm-works) | 为什么它会编、会忘、不会执行代码 |
| [提示词工程：从一句话到可复用的指令](#/llm/prompt-engineering) | 把提示词当规格说明写，而不是许愿 |
| [模型选型与关键参数](#/llm/model-selection) | 六个维度选型；温度等参数到底影响什么 |
| [结构化输出与护栏](#/llm/structured-output-guardrails) | 让输出可校验，失败时有兜底路径 |

### 3 · 上下文与知识（4 篇）

| 页面 | 解决什么问题 |
| --- | --- |
| [文档解析与切分策略](#/knowledge/document-pipeline) | 入库第一步错了，后面检索全废 |
| [embedding 与向量库](#/knowledge/embedding-vectorstore) | 相似度、索引、过滤与模型更换 |
| [检索优化：改写、混合检索与重排](#/knowledge/retrieval-advanced) | 检索不准时按链路逐段定位 |
| [记忆系统：短期、长期与遗忘](#/knowledge/memory-systems) | 该记什么、何时写、怎么删 |

### 4 · 工具与协议（3 篇）

| 页面 | 解决什么问题 |
| --- | --- |
| [工具设计原则：粒度、参数与错误语义](#/tools/tool-design) | 工具是给模型看的 API |
| [MCP 协议深入：能力与传输](#/tools/mcp-deep) | tools / resources / prompts 与鉴权 |
| [工具执行、沙箱与外部集成](#/tools/sandbox-integration) | 唯一权限边界上要做的六件事 |

### 5 · Spring AI（4 篇）

| 页面 | 解决什么问题 |
| --- | --- |
| [Spring AI 全景与分层抽象](#/springai/overview) ★ | 近似 Spring Data 之于数据库的定位 |
| [ChatClient 与 Advisor](#/springai/chatclient) | 链式调用；Advisor ≈ AOP 环绕增强 |
| [工具调用与结构化输出](#/springai/tools) | `@Tool` 与 `entity()` 的直接映射 |
| [记忆、RAG 与 MCP 落地](#/springai/rag-memory) | `ChatMemory`、`VectorStore`、MCP starter |

### 6 · Python 生态（5 篇）

| 页面 | 解决什么问题 |
| --- | --- |
| [生态地图与选型](#/python/overview) ★ | 框架一大堆，各自管哪一层 |
| [不用框架的最小 Agent 循环](#/python/minimal-loop) ★ | 亲手读懂那条 while 循环 |
| [LangGraph：状态图与检查点](#/python/langgraph) | 需要暂停恢复与人工审批时 |
| [轻量框架：Pydantic AI 与 OpenAI Agents SDK](#/python/frameworks) | 类型安全、handoff、guardrail |
| [结构化输出、检索与评测](#/python/output-rag-eval) | 三类工程能力的最小落地 |

### 7 · 工程化（5 篇）

| 页面 | 解决什么问题 |
| --- | --- |
| [本地开发与调试](#/engineering/local-dev-debug) ★ | 打印请求、复现问题、定位故障 |
| [测试策略：从单测到评测](#/engineering/testing) | 四层金字塔与替身策略 |
| [可观测性：链路、指标与成本归因](#/engineering/observability) | 用 run_id 串起 span 树 |
| [交付与运维：配置、CI/CD 与灰度](#/engineering/delivery-ops) | 版本化、灰度、回滚与值班 |
| [安全与合规：注入、越权与数据边界](#/engineering/security-hardening) | 纵深防御与上线安全检查表 |

### 8 · 机制深入（5 篇）

| 页面 | 深入什么 |
| --- | --- |
| [Agent 循环的状态机本质与并发模型](#/internals/loop-state-machine) | 状态字段、转移表、取消传播、重入 |
| [上下文编译器：从状态到提示词的完整算法](#/internals/context-compiler) | IR 片段、预算分配、裁剪、缓存键 |
| [工具运行时深入：schema、分发、幂等与重试](#/internals/tool-runtime) | 八阶段生命周期与错误分类 |
| [状态持久化与恢复语义](#/internals/durability) | 日志 / 快照 / 事件溯源与恢复算法 |
| [评测系统深入：数据集、裁判与指标漂移](#/internals/eval-system) | 五层评测平台与裁判校准 |

### 9 · 架构与案例（11 篇）

| 组 | 页面 | 讲什么 |
| --- | --- | --- |
| 两条栈的机制 | [Spring AI 机制深入](#/deep/spring-ai-internals) | 请求生命周期、Advisor 链、工具执行链 |
| | [Python 编排深入](#/deep/python-internals) | reducer、superstep、检查点与持久化执行 |
| | [上下文工程深入](#/deep/context-engineering) | 预算、压缩顺序、检索链路优化 |
| 架构与编排 | [生产级 Agent 架构全景](#/deep/agent-architecture) ★ | 五层数据面 + 治理面、同步/异步链路 |
| | [Agent 工作流编排模式](#/deep/agent-workflow) | 五种模式的自主度—可控度谱系 |
| | [多智能体架构与隔离](#/deep/multi-agent) | 四种拓扑、预算与权限隔离 |
| 真实案例 | [企业知识库助手架构](#/deep/case-kb-agent) | 权限前置、引用溯源、拒答 |
| | [Text-to-SQL 智能体：最小安全闭环](#/deep/case-text2sql) | 四道闸与有限次自纠正 |
| | [代码助手架构](#/deep/case-code-agent) | repo map、编辑循环、沙箱测试 |
| | [运维诊断智能体架构](#/deep/case-ops-agent) | 证据链、假设验证、动作分级 |
| | [可靠性、成本与评测门禁](#/deep/reliability-eval) | 失败分类、成本抓手、发布门禁 |

### 10 · 落地架构（6 篇）

| 页面 | 交付什么 |
| --- | --- |
| [从需求到可落地架构：分层、契约与决策记录](#/blueprint/method) | 需求四象限、八步流程、ADR、容量估算 |
| [通用 Agent 平台参考架构（可落地版）](#/blueprint/reference) ★ | 组件清单、工程目录、七张表、部署与容量 |
| [智能客服 Agent 项目架构](#/blueprint/service-agent) | 路由前置、转人工一等状态、工单闭环 |
| [数据分析 Agent 项目架构](#/blueprint/analytics-agent) | 语义层、AST 校验、权限注入、异步查询 |
| [长任务研究 Agent 项目架构](#/blueprint/research-agent) | 子任务隔离、证据库、检查点续跑 |
| [从 MVP 到生产：落地路线与验收清单](#/blueprint/delivery-roadmap) | 五阶段退出条件与总验收清单 |

### 11 · 对照与选型（2 篇）

| 页面 | 解决什么问题 |
| --- | --- |
| [Spring AI ↔ Python 概念映射](#/compare/mapping) | 同一个概念在两边叫什么，迁移时别带错习惯 |
| [选型与上线检查清单](#/compare/checklist) | 按团队与场景选型；上线前逐条打勾 |

## 三、三条读法

| 你想做什么 | 怎么读 |
| --- | --- |
| **入门**（第一次接触） | 0 → 1 → 2 → 3 → 5 或 6，顺着读；每页自测题答得出再往下 |
| **搞懂内部怎么实现** | [机制深入](#/internals/loop-state-machine) → [两条栈的机制](#/deep/spring-ai-internals) → [上下文编译器](#/internals/context-compiler) |
| **照着搭项目** | [架构方法](#/blueprint/method) → [参考架构](#/blueprint/reference) → 按项目类型选客服 / 数据分析 / 长任务研究 → [落地路线](#/blueprint/delivery-roadmap) |
| **只看生产系统长什么样** | [生产级 Agent 架构全景](#/deep/agent-architecture) → [架构与编排](#/deep/agent-workflow) → [案例](#/deep/case-kb-agent) → [评测门禁](#/deep/reliability-eval) |

> [!TIP] 别同时学两条栈
> 概念还没稳就横向对比，容易把两边的名字记混。先吃透一条（Spring AI 或 Python），再用 [概念映射](#/compare/mapping) 对照，迁移成本很低。

## 四、总纲：先记住这五句

1. **Agent = 大模型 + 工具 + 循环 + 状态**。模型负责「想」，工具负责「做」，循环负责「接着做」，状态负责「记得做过什么」。
2. **大模型本身不执行任何操作**。它输出「我想调用某工具、参数是这些」，真正执行的是你的程序。
3. **Spring AI** 把这套东西做成 Spring 风格的抽象：`ChatClient` 调模型、`Advisor` 做拦截增强、`@Tool` 暴露工具、`VectorStore` 做检索、MCP 复用外部工具。
4. **Python 侧**从「裸 SDK + 一个 while 循环」起步最不容易迷路，等循环变复杂了再引入 LangGraph / Pydantic AI / OpenAI Agents SDK。
5. **框架只是编排方式**。真正决定效果的是：工具设计、上下文喂了什么、怎么评测、哪些动作必须让人类确认。

## 五、每页的固定结构

> 它解决什么问题 → 核心概念（配类比 + 图解）→ 最小必要用法（概念示意）→ 常见坑 → 自测题

刻意不堆 API 清单：框架版本迭代很快，**记住概念比记住方法名更保值**。文中代码片段仅用于说明「这个 API 长什么样」，不是可运行项目。

## 六、版本与心态

- 笔记核对时间 **2026-11**。Spring AI 以 1.x（1.0 GA 之后）的抽象为基准；Python 侧以 LangChain / LangGraph 1.x 时代的分工为基准。
- 遇到「照着写却报错」，十有八九是版本差异：先确认版本，再看对应版本的官方文档。
- **不要在挑框架上花一周**。能用一个循环解决的任务，就先用一个循环。

## 常见坑

> [!WARNING] 学习路径上最常见的四个坑
> - **跳过原理直接看框架**：报错时无法判断是模型层、工具层还是编排层的问题。
> - **把「架构全景」当实现方案**：全景告诉你有哪几层，落地还要看工程目录、表结构与契约。
> - **只读案例不动手**：案例的价值是「看每层为什么存在」，抄组件清单没有意义。
> - **把笔记当文档抄**：笔记负责建立地图，准确的参数与类名永远以官方文档为准。

> [!TIP] 一个有效的自测方法
> 读完任意一页，试着给完全没接触过 Agent 的人讲一遍「模型做了什么、我的代码做了什么」。讲得清楚，说明真的理解了。

## 自测题

> [!QUESTION] 为什么建议先学语言无关的原理，而不是直接学 Spring AI 或 LangGraph？
> 因为所有框架都在包装同一条「问模型 → 调工具 → 回填结果 → 再问模型」的循环。先掌握循环，才知道框架替你省了什么，报错时也能定位到具体层。

> [!QUESTION] 「机制深入」和「落地架构」有什么区别？
> 前者回答「内部怎么实现」（状态机、上下文编译、工具分发、恢复语义、评测系统）；后者回答「照着怎么把项目搭起来」（分层、模块目录、数据模型、接口契约、部署容量、实施与验收）。

> [!QUESTION] 什么时候才需要引入编排框架？
> 当流程不再是单个循环：需要显式分支与状态、需要暂停等待人工确认、需要崩溃后从检查点恢复、或需要回放调试时。

> [!QUESTION] 版本对不上时应该怎么办？
> 先确认自己使用的框架版本，再查该版本的官方文档；笔记里的类名与方法名只作概念示意，不作为准确依据。
