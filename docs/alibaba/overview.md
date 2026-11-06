---
level: 基础
tags: [Spring AI Alibaba, AgentScope, 百炼, DashScope, Higress, Nacos, ARMS, Qwen, 技术选型]
summary: 把阿里 AI 生态拆成模型、平台、框架、基础设施四层，讲清 Spring AI Alibaba 与 AgentScope 两条路线的分工与选型依据，以及国产化落地的四个真实动机。
---

# 阿里 AI 生态全景与两条技术路线

> [!ABSTRACT] 一句话版本
> - 阿里这套不是「一个框架」，而是**四层**：模型（Qwen 家族）→ 平台（百炼 / DashScope）→ 框架（Java 用 Spring AI Alibaba，Python 用 AgentScope）→ 基础设施（Higress、Nacos、ARMS、向量存储）。
> - 两条框架路线**不是竞争关系**：Spring AI Alibaba 是 Spring AI 的**扩展**，AgentScope 是独立的**多智能体框架**（Actor 模型、分布式优先）。选谁取决于团队主语言，不取决于谁「更强」。
> - 真正的选型问题是三个：**主语言是什么、要不要分布式、能不能接受云绑定**。
> - 国产化落地的四个真实动机：合规备案、数据不出境、内网私有化、成本与配额可控。不是口号，每一条都对应具体的技术约束。

> [!NOTE] 和前后几页的分工
> 本页只讲**生态怎么分层、你怎么选**。框架细节看 [Spring AI Alibaba](#/alibaba/spring-ai-alibaba) 与 [AgentScope](#/alibaba/agentscope)；平台与网关分别看 [百炼与 DashScope](#/alibaba/bailian-dashscope)、[Higress：AI 网关](#/alibaba/higress-gateway)。如果你还没读过 [Spring AI 全景](#/springai/overview)，建议先补那页——本文大量概念是它的延伸。

## 一、先看清四层

不把这四层分开，就会陷入最常见的困惑：「Spring AI Alibaba 和百炼是什么关系？我要两个都装吗？」

<figure class="fig">
<svg viewBox="0 0 760 372" class="dg" role="img" aria-label="阿里 AI 生态四层结构：应用层、框架层、平台层、模型层，右侧为横跨全链路的基础设施">
<text class="th" x="20" y="24">业务视角：从下往上是被依赖关系；从上往下是调用方向</text>
<rect class="b1" x="20" y="44" width="518" height="44" rx="8"/>
<text class="t" x="32" y="63">应用层</text>
<text class="ts" x="32" y="80">JManus · DeepResearch · DataAgent · Playground（官方参考应用）</text>
<rect class="b2" x="20" y="104" width="518" height="44" rx="8"/>
<text class="t" x="32" y="123">框架层</text>
<text class="ts" x="32" y="140">Java：Spring AI Alibaba　|　Python：AgentScope</text>
<rect class="b3" x="20" y="164" width="518" height="44" rx="8"/>
<text class="t" x="32" y="183">平台层</text>
<text class="ts" x="32" y="200">百炼 Model Studio（编排/知识库/评测）→ DashScope API → OpenAI 兼容端点</text>
<rect class="b4" x="20" y="224" width="518" height="44" rx="8"/>
<text class="t" x="32" y="243">模型层</text>
<text class="ts" x="32" y="260">Qwen3.8-Max / Plus / Flash · Qwen3-VL · Qwen3-Omni · Wan · ASR / TTS</text>
<rect class="b5" x="20" y="284" width="518" height="44" rx="8"/>
<text class="t" x="32" y="303">数据与训练</text>
<text class="ts" x="32" y="320">PAI（训练/推理）· AnalyticDB / Hologres / OpenSearch（向量与检索）</text>
<rect class="b1" x="562" y="44" width="178" height="284" rx="8"/>
<text class="t" x="576" y="66">基础设施（横切）</text>
<text class="ts" x="576" y="92">Higress</text>
<text class="ts" x="576" y="112">AI 网关 / MCP 托管</text>
<text class="ts" x="576" y="140">Nacos</text>
<text class="ts" x="576" y="160">配置 / 注册 / MCP 目录</text>
<text class="ts" x="576" y="188">ARMS</text>
<text class="ts" x="576" y="208">链路追踪 / token 成本</text>
<text class="ts" x="576" y="236">RAM + KMS</text>
<text class="ts" x="576" y="256">鉴权 / 密钥管理</text>
<text class="ts" x="576" y="284">SLS</text>
<text class="ts" x="576" y="304">日志与审计</text>
</svg>
<figcaption>四层 + 一个横切面。新手最容易漏掉右侧那条：它不参与「思考」，但决定了能不能上生产。</figcaption>
</figure>

| 层 | 代表组件 | 你什么时候会碰它 |
| --- | --- | --- |
| 应用层 | JManus、DeepResearch、DataAgent | 想先看一个能跑的东西长什么样，抄结构不抄代码 |
| 框架层 | Spring AI Alibaba、AgentScope | 你要写自己的 Agent |
| 平台层 | 百炼、DashScope | 你要模型、要知识库、要配额与账单 |
| 模型层 | Qwen 家族 | 你要挑模型档位、调参数 |
| 基础设施 | Higress、Nacos、ARMS、SLS | 你有多个团队/多个模型，需要统一入口与审计 |

## 二、模型层：Qwen 不是「一个模型」

初学者常犯的错是「用最强那个」。Qwen 家族是按**任务档位**分工的，选错档位直接体现为账单。

| 档位 | 典型模型 | 适合 | 代价 |
| --- | --- | --- | --- |
| 旗舰 | Qwen3.8-Max | 复杂推理、长周期自主执行、代码 | 最贵，延迟最高 |
| 均衡 | Qwen3.7-Plus | 大多数业务主链路 | 中等 |
| 轻快 | Qwen3.8-Flash | 分类、路由、抽取、摘要、百万级长上下文吞文档 | 便宜快，复杂推理弱 |
| 视觉 | Qwen3-VL-Plus | 文档 OCR、截图理解、视频 | 按图/视频计费 |
| 全模态 | Qwen3-Omni-Flash | 文本+图+音视频统一交互 | 新，生态适配待验证 |
| 生成 | Qwen-Image、Wan 视频 | 出图、出片 | 与文本链路完全不同 |
| 语音 | Fun-ASR、Qwen3-TTS | 语音输入输出 | 需处理流式与打断 |

**一条实用原则**：Agent 系统里真正烧钱的往往不是「回答」，而是「路由、抽取、判断、重试」这些高频小调用。把它们压到 Flash 档，只让主推理走 Max，成本能降一个量级。具体做法见 [模型选型与关键参数](#/llm/model-selection)。

## 三、平台层：百炼、DashScope、Qwen 是什么关系

这是最容易被三个名字绕晕的地方，一句话记住：

> **你在控制台点的是「百炼」，代码里调的是「DashScope」，最终回答你的是「Qwen」。**

- **百炼（Model Studio）**：平台层。管模型开通、应用编排、知识库、Prompt 管理、评测、配额与账单。
- **DashScope**：API 与协议层。两套端点——原生协议（能用全部私有能力）和 OpenAI 兼容模式（`/compatible-mode/v1`，方便换厂商）。
- **Qwen**：跑在上面的模型本身。

它们的边界很清楚：**平台能力（知识库、编排）是「省事但黑盒」，协议能力（原生 API）是「灵活但要自己搭」。** 复杂 RAG 场景不要指望平台知识库能调到底，见 [百炼与 DashScope](#/alibaba/bailian-dashscope) 里「什么时候该自建」。

## 四、框架层：两条路线，两种世界观

<figure class="fig">
<svg viewBox="0 0 760 258" class="dg" role="img" aria-label="Spring AI Alibaba 与 AgentScope 的定位对比：前者是 Spring AI 扩展的 Java 编排框架，后者是独立的多智能体分布式框架">
<rect class="b1" x="20" y="36" width="350" height="200" rx="10"/>
<text class="t" x="38" y="62">Spring AI Alibaba（Java）</text>
<text class="ts" x="38" y="86">底座：Spring AI 的扩展，不是替代</text>
<text class="ts" x="38" y="108">编排：Graph（DAG / 状态图，对标 LangGraph）</text>
<text class="ts" x="38" y="130">入口：ReactAgent、ChatClient、Advisor</text>
<text class="ts" x="38" y="152">配套：Studio、Admin、Nacos MCP Registry</text>
<text class="ts" x="38" y="174">心智：延续 Spring 生态，注解 + 自动装配</text>
<text class="ts" x="38" y="196">适合：已有 Spring Boot 体系的企业后端</text>
<text class="ts" x="38" y="218">弱点：Python 生态的工具与论文复现跟不上</text>
<rect class="b2" x="390" y="36" width="350" height="200" rx="10"/>
<text class="t" x="408" y="62">AgentScope（Python）</text>
<text class="ts" x="408" y="86">底座：独立框架，模型无关（适配多家）</text>
<text class="ts" x="408" y="108">编排：Actor 消息驱动 + MsgHub / Pipeline</text>
<text class="ts" x="408" y="130">入口：ReActAgent、DialogAgent、Meta Tool</text>
<text class="ts" x="408" y="152">配套：Studio、Runtime（沙箱 + 部署 + A2A）</text>
<text class="ts" x="408" y="174">心智：分布式优先，agent 是可独立部署的单元</text>
<text class="ts" x="408" y="196">适合：多智能体、要横向扩、要分布式运行时</text>
<text class="ts" x="408" y="218">弱点：概念比 LangGraph 多，团队要花时间建立模型</text>
</svg>
<figcaption>左边是「给 Spring 团队用的」，右边是「给分布式多智能体用的」。两者都能接百炼。</figcaption>
</figure>

| 维度 | Spring AI Alibaba | AgentScope |
| --- | --- | --- |
| 语言 | Java / Spring Boot | Python（另有 Java SDK） |
| 底层 | 构建在 Spring AI 之上 | 自研核心，模型适配层 |
| 编排范式 | 显式 Graph（节点+边+状态） | Actor 消息传递 + 编排原语 |
| 分布式 | 靠部署形态（无状态服务 + 外部状态） | **原生**，agent 可跨机 |
| 多智能体 | Supervisor / Routing / Handoffs 等模式 | MsgHub 群聊、Pipeline、动态增删 |
| 可视化 | Studio + Admin | Studio（含评估可视化） |
| 部署 | Spring Boot 应用 | Runtime（FastAPI + 沙箱 + A2A） |
| 学习曲线 | 低（Spring 开发者） | 中高（要理解 actor 与消息） |

背后的范式差异值得单独记一句：**Spring AI Alibaba 的 Graph 是「集中式状态 + 显式控制流」，AgentScope 的 Actor 是「去中心化消息 + 独立执行单元」。** 前者强在可控、可回放、好调试；后者强在横向扩展、动态拓扑、跨机协作。想深入对比可回到 [Agent 工作流编排模式](#/deep/agent-workflow) 与 [多智能体架构与隔离](#/deep/multi-agent)。

## 五、基础设施层：不参与思考，但决定能不能上线

| 组件 | 解决什么 | 不上会怎样 |
| --- | --- | --- |
| **Higress** | 多模型统一入口、fallback、token 级限流、语义缓存、MCP 托管 | 每个服务各自管 API key；主模型 429 时全站挂；成本看不见 |
| **Nacos** | 配置中心、服务发现、**MCP Registry** | MCP server 地址散落在 N 个配置文件里，改一次要发版 |
| **ARMS** | 全链路追踪、token 用量与成本归因 | 出问题只能看日志猜，成本分摊算不清 |
| **SLS** | 日志、审计 | 谁让 Agent 做了什么写操作，查不到 |
| **向量存储** | AnalyticDB / Hologres / OpenSearch | 自建向量库的运维成本与召回效果通常不如托管 |

这一层最容易犯的错是「MVP 阶段就全装」。合理顺序是：**先用直连 API 跑通业务 → 出现第二个模型或第二个团队时上 Higress → 工具超过 10 个时上 MCP Registry → 要对账时上 ARMS。**

## 六、怎么选：三个问题定路线

| 问题 | 答案指向 |
| --- | --- |
| ① 团队主语言？ | Java → Spring AI Alibaba；Python → AgentScope；两者都有 → 见第七节 |
| ② 需要跨机分布式 / 动态增减 agent？ | 需要 → AgentScope Runtime（或 SAA + K8s 自行解决）；不需要 → 两边都行 |
| ③ 数据能出内网吗？ | 不能 → 私有化模型（vLLM + Qwen 开源权重）+ 自建网关；能 → 直接用百炼 |

典型组合：

| 场景 | 推荐 | 理由 |
| --- | --- | --- |
| 已有 Spring Boot 中台，要加 AI 能力 | Spring AI Alibaba + DashScope | 复用现有鉴权、事务、监控，改动最小 |
| 客服/工单类业务系统 | Spring AI Alibaba + 百炼知识库 | 强业务耦合，Java 侧事务与权限现成 |
| 研究型、算法团队主导 | AgentScope + 自建模型 | 要试新架构，要分布式评估 |
| 多团队共用一套模型出口 | Higress + Nacos + ARMS | 统一密钥、限流、成本与审计 |
| 数据不能出境 | Qwen 开源权重 + vLLM + Higress | 全链路自控，代价是运维 |

## 七、跨语言怎么互通

现实中很常见的组合是：**Java 做业务编排与鉴权，Python 做算法型 agent**。可行的三条通道：

1. **A2A（Agent2Agent）**：把另一个语言的 agent 当作对等实体调用，双方都支持。适合「两个自治系统互相派活」。
2. **MCP**：只共享工具层。Java 侧把内部服务暴露成 MCP server，Python agent 直接调用，不必知道对方是 Java。
3. **HTTP + 事件**：最土也最稳。同步用 REST，长任务用消息队列 + 回调。

选哪条：**能力共享用 MCP，任务委派用 A2A，状态同步用事件。** 三者可以同时存在。

## 常见坑

> [!WARNING] 五个高频误判

1. **把 Spring AI Alibaba 当成「国产版 Spring AI」**。它是**扩展**：底层 `ChatModel`、`ToolCallback`、`Advisor` 全部继承，额外提供 DashScope 实现、Agent Framework、Graph 与生态集成。想只用 Spring AI 完全没问题，两者可共存。
2. **以为 AgentScope 只能配 Qwen**。它的模型适配层支持多家 provider（含 OpenAI 协议兼容与本地 vLLM），绑定的是协议不是厂商。
3. **Java 项目硬上 LangGraph**。多语言运维成本（两套 CI、两套监控、两种错误模型）通常远超框架收益。真需要图编排，SAA 的 Graph 是同构替代。
4. **误读版本号**。SAA 是四段版本 `1.1.2.0`：前三段**对齐 Spring AI 版本**，第四段是 SAA 自己的修订号。版本不匹配会出现难以定位的 `NoSuchMethodError`。
5. **一上来就上全套基础设施**。网关、注册中心、观测平台在单团队 MVP 阶段是纯负担，先直连，等出现「第二个模型」再上。

## 自测题

> [!QUESTION] 百炼、DashScope、Qwen 三者的边界怎么划？
> 百炼是平台层（控制台、应用编排、知识库、配额账单），DashScope 是 API 与协议层（原生端点 + OpenAI 兼容端点），Qwen 是跑在上面的模型本身。

> [!QUESTION] Spring AI Alibaba 与 Spring AI 是什么关系？
> 扩展关系而非替代关系：底层抽象（ChatModel、ToolCallback、Advisor）完全继承，SAA 额外提供 DashScope 模型实现、Agent Framework、Graph 编排与 Nacos/ARMS 等生态集成。

> [!QUESTION] Graph 编排与 Actor 消息传递，各自强在哪？
> Graph 是集中式状态 + 显式控制流，强在可控、可回放、易调试；Actor 是去中心化消息 + 独立执行单元，强在横向扩展、动态拓扑与跨机协作。

> [!QUESTION] 为什么说「基础设施层不参与思考但决定能否上线」？
> 它管的是密钥、限流、降级、成本归因与审计这些生产必需项；缺了它们，业务逻辑再对也会在流量、账单或合规上出问题。
