---
level: 深入
tags: [Spring AI Alibaba, ReactAgent, Graph, Agent Skills, Hooks, Nacos MCP, DashScope, 图编排]
summary: 拆解 Spring AI Alibaba 的模块分层与运行机制：ReactAgent 的循环与 Hooks、Agent Skills 的渐进式披露、Graph 的节点/并行分支/检查点/中断，以及它与 Spring AI、LangGraph 的关系。
---

# Spring AI Alibaba：Agent Framework 与 Graph

> [!ABSTRACT] 一句话版本
> - Spring AI Alibaba（下称 SAA）= **Spring AI 的扩展包 + 一个 Agent 编排框架**。底层 `ChatClient`、`Advisor`、`ToolCallback` 全部沿用，新增的是 Graph 运行时与高层 Agent 封装。
> - 两个入口：**`ReactAgent`**（内置循环，快速起步）与 **`Graph`**（显式状态图，复杂流程）。它不是二选一——ReactAgent 通常是 Graph 里的一个节点。
> - **Agent Skills 的渐进式披露**是它最有价值的设计：系统提示只放技能清单，模型按需 `read_skill` 加载正文，解决「技能一多就撑爆上下文」。
> - 版本号是四段 `x.y.z.w`，前三段**对齐 Spring AI 版本**，不匹配会出现难查的 `NoSuchMethodError`。

> [!NOTE] 和另外两页的分工
> 本页讲 **SAA 独有的东西**（Graph、ReactAgent、Skills、Nacos 集成）。Spring AI 本身的 `ChatClient`/`Advisor`/`ToolCallback` 机制见 [ChatClient 与 Advisor](#/springai/chatclient) 与 [Spring AI 机制深入](#/deep/spring-ai-internals)，不在此重复。

## 一、模块地图：它到底加了什么

<figure class="fig">
<svg viewBox="0 0 760 320" class="dg" role="img" aria-label="Spring AI Alibaba 的五层模块结构：应用层、Agent Framework、Graph 运行时、Spring AI 核心、模型与集成">
<text class="th" x="20" y="24">从下往上是被依赖关系；你写的代码通常只在最上面两层</text>
<rect class="b1" x="20" y="40" width="720" height="42" rx="8"/>
<text class="t" x="34" y="59">你的 Spring Boot 应用</text>
<text class="ts" x="34" y="76">Controller / Service / 定时任务 —— 业务逻辑只在这一层</text>
<rect class="b2" x="20" y="94" width="720" height="52" rx="8"/>
<text class="t" x="34" y="113">Agent Framework（SAA 新增）</text>
<text class="ts" x="34" y="131">ReactAgent · Flow Agent · Hooks · Agent Skills · 多智能体模式（Routing / Supervisor / Handoffs）</text>
<rect class="b3" x="20" y="158" width="720" height="52" rx="8"/>
<text class="t" x="34" y="177">Graph 运行时（SAA 新增）</text>
<text class="ts" x="34" y="195">StateGraph · 条件边 · 并行分支（AllOf/AnyOf）· Checkpoint · interrupt · AgentToolNode</text>
<rect class="b4" x="20" y="222" width="720" height="46" rx="8"/>
<text class="t" x="34" y="241">Spring AI 核心（沿用）</text>
<text class="ts" x="34" y="259">ChatClient · Advisor · ToolCallback · ChatMemory · Structured Output · VectorStore · ETL</text>
<rect class="b5" x="20" y="280" width="720" height="40" rx="8"/>
<text class="t" x="34" y="305">模型与集成：DashScope · Nacos（配置 / 服务发现 / MCP Registry）· ARMS · 各类 VectorStore</text>
</svg>
<figcaption>灰色理解：<b>SAA 没有重造 Spring AI</b>，它在中间插了「Graph 运行时 + Agent Framework」两层，向上提供编排，向下复用已有的模型与工具抽象。</figcaption>
</figure>

对应的 starter 大致是这几类（具体名称以官方文档为准）：

| 依赖 | 作用 | 什么时候需要 |
| --- | --- | --- |
| `spring-ai-alibaba-starter-dashscope` | DashScope 模型实现（Chat/Embedding/图像） | 用百炼模型时必装 |
| `spring-ai-alibaba-agent-framework` | ReactAgent、Hooks、Skills | 写 Agent 时 |
| `spring-ai-alibaba-graph-core` | 图运行时 | 需要显式流程编排时 |
| `spring-ai-alibaba-starter-nacos-mcp-client/server` | 从 Nacos 发现 / 暴露 MCP | 工具分散在多团队时 |
| `spring-ai-alibaba-starter-arms-observation` | ARMS 可观测接入 | 上生产 |
| `spring-ai-alibaba-starter-rag` | RAG 便捷封装 | 快速搭知识库问答 |
| `spring-ai-alibaba-starter-nl2sql` | 自然语言转 SQL | 有 BI/报表需求 |

**一句话记忆**：`starter-dashscope` 决定「用谁思考」，`agent-framework` 决定「怎么循环」，`graph-core` 决定「流程怎么走」，`nacos/arms` 决定「能不能进生产」。

## 二、ReactAgent：把循环封装起来

### 2.1 它内部在做什么

`ReactAgent` 不是新范式，它就是 [核心循环](#/basic/loop) 的工程化封装：组装系统提示 → 调模型 → 若有工具调用则执行并回填 → 再调模型 → 直到无工具调用或触达上限。差别在于它把这些做成了可配置、可拦截、可流式输出的组件。

概念示意（不是可直接运行的完整代码）：

```java
// 概念示意：ReactAgent 的典型用法与关键配置
ReactAgent agent = ReactAgent.builder()
    .chatClient(chatClient)            // 复用 Spring AI 的 ChatClient
    .tools(orderTools, refundTools)    // 工具集
    .maxIterations(8)                  // 循环上限，必须有
    .build();

// 流式拿到「思考 / 工具调用 / 回答」的增量事件
agent.stream("帮我查下订单 123 的退款进度")
     .doOnNext(event -> log.info("step={}", event.type()));
```

三个关键参数决定了它的行为边界：

| 参数 | 作用 | 设错的后果 |
| --- | --- | --- |
| 循环上限 | 防止无限工具调用 | 不设 = 账单无上限 |
| 工具集 | 本次可见的工具 | 全量暴露 = 模型选错工具、上下文被占满 |
| 输出类型 | 结构化输出约束 | 靠提示词要求 JSON = 解析随时崩 |

### 2.2 Hooks：在循环的固定位置插逻辑

Hooks 是 SAA 里最实用的扩展点，等价于「Agent 版的 AOP 切面」。典型插入点：

| Hook 位置 | 典型用途 |
| --- | --- |
| 模型调用前 | 注入动态上下文、裁剪历史、改写用户输入 |
| 工具执行前 | 权限校验、参数脱敏、危险操作拦截（人工确认） |
| 工具执行后 | 结果截断、敏感信息过滤、写审计日志 |
| 本轮结束 | 记录 token 用量、判定是否需要总结/压缩 |

用好 Hooks 的分界线：**只要是「所有 Agent 都要做、且与业务无关」的事，就放 Hook；只要和业务判断有关，就留在工具或节点里。** 混在一起会让 Hook 变成第二个业务层，没人敢动。

## 三、Agent Skills：解决「技能多了塞不下」

这是 1.1.x 里最值得学的机制。假设你有 40 个业务技能（退货、开票、查物流、改地址……），全写进系统提示会怎样？几万 token 一次性烧掉，而且模型在几十条指令里更容易选错。

**渐进式披露（progressive disclosure）** 的做法：

<figure class="fig">
<svg viewBox="0 0 760 268" class="dg" role="img" aria-label="Agent Skills 渐进式披露的三个阶段：系统提示只放技能清单，模型按需调用 read_skill 加载正文，正文再按需引用附件">
<text class="th" x="20" y="24">三阶段加载：清单常驻 → 正文按需 → 附件再按需</text>
<rect class="b1" x="20" y="42" width="230" height="76" rx="8"/>
<text class="t" x="34" y="62">① 系统提示（常驻）</text>
<text class="ts" x="34" y="82">只有 name + description</text>
<text class="ts" x="34" y="100">+ skillPath</text>
<text class="ts" x="34" y="116">≈ 每个技能 20~40 token</text>
<rect class="b2" x="266" y="42" width="230" height="76" rx="8"/>
<text class="t" x="280" y="62">② read_skill(name)</text>
<text class="ts" x="280" y="82">模型自行判断需要某技能</text>
<text class="ts" x="280" y="100">加载完整 SKILL.md</text>
<text class="ts" x="280" y="116">含步骤、约束、示例</text>
<rect class="b3" x="512" y="42" width="228" height="76" rx="8"/>
<text class="t" x="526" y="62">③ 引用附件</text>
<text class="ts" x="526" y="82">正文里再指到模板/表格</text>
<text class="ts" x="526" y="100">用到才读</text>
<text class="ts" x="526" y="116">上下文按需增长</text>
<line class="l" x1="250" y1="80" x2="266" y2="80" marker-end="url(#arr)"/>
<line class="l" x1="496" y1="80" x2="512" y2="80" marker-end="url(#arr)"/>
<rect class="b4" x="20" y="140" width="352" height="110" rx="8"/>
<text class="t" x="34" y="160">对比：全量注入</text>
<text class="ts" x="34" y="180">40 个技能全文 ≈ 数十万字符</text>
<text class="ts" x="34" y="198">代价：贵、慢、指令互相干扰</text>
<text class="ts" x="34" y="216">失败模式：模型在长指令里挑错技能</text>
<text class="ts" x="34" y="236">可观测：上下文几乎恒定占满</text>
<rect class="b5" x="388" y="140" width="352" height="110" rx="8"/>
<text class="t" x="402" y="160">对比：渐进式披露</text>
<text class="ts" x="402" y="180">常驻仅清单 ≈ 每技能几十 token</text>
<text class="ts" x="402" y="198">代价：多一轮工具调用的延迟</text>
<text class="ts" x="402" y="216">收益：技能数量可线性扩展</text>
<text class="ts" x="402" y="236">可观测：能看到「读了哪个技能」</text>
</svg>
<figcaption>本质是把「提示词工程」升级成「提示词的分层加载策略」——同一思想在 [上下文编译器](#/internals/context-compiler) 里还会再出现一次。</figcaption>
</figure>

这个机制的工程价值有三点：

1. **技能可独立演进**：每个 `SKILL.md` 单独维护、单独发版，不用改系统提示。
2. **描述质量成了关键**：清单里只有 `description`，它写不清模型就不会加载 —— 于是「描述是写给模型看的文档」这条原则第一次有了硬性考核。
3. **可观测性变好**：加载了哪个技能是显式事件，出问题时能定位到「技能选错」还是「技能内容错」。

代价也要认：多一次工具往返（延迟 +1 轮），且模型可能「不知道自己不知道」——清单描述太泛时会漏加载。兜底办法是在系统提示里加一句「涉及 X/Y/Z 类问题时，必须先读取对应技能」。

## 四、Graph：把流程画出来

### 4.1 四个核心概念

| 概念 | 含义 | 类比 |
| --- | --- | --- |
| **State** | 在节点间流动的数据对象 | 一张不断被批注的表单 |
| **Node** | 一个函数：读状态、干活、返回更新 | 流水线上的一站 |
| **Edge** | 固定流向；**条件边**按状态分支；可成环 | 传送带与岔道 |
| **Checkpoint** | 每步把状态存下来 | 存档点 |

和 [LangGraph](#/python/langgraph) 的对应关系几乎是一对一，这也是它最大的价值：**Java 团队不必为了图编排去引入 Python 栈**。

| 能力 | Spring AI Alibaba Graph | LangGraph |
| --- | --- | --- |
| 状态定义 | 状态对象 + 合并策略 | `State` + reducer |
| 条件分支 | 条件边 | conditional edges |
| 并行分支 | 并行条件边 + 聚合策略（AllOf / AnyOf） | fan-out + reducer |
| 中断人工确认 | `interrupt` / `interruptAfter` | `interrupt()` |
| 持久化 | Checkpoint | Checkpointer（内存/DB） |
| 子图复用 | 节点内嵌子图 | subgraph |
| 异步工具 | `AgentToolNode` 异步执行 | 节点内 async |

### 4.2 执行流长什么样

<figure class="fig">
<svg viewBox="0 0 760 250" class="dg" role="img" aria-label="Graph 执行流：入口节点经条件边分流为并行分支，聚合后进入人工确认中断，确认后继续产出">
<text class="th" x="20" y="24">一个典型的「检索 → 分流 → 并行 → 聚合 → 人工确认 → 产出」图</text>
<rect class="b1" x="20" y="96" width="104" height="44" rx="8"/>
<text class="ts" x="72" y="118" text-anchor="middle" dominant-baseline="middle">入口 / 解析</text>
<rect class="b2" x="150" y="96" width="104" height="44" rx="8"/>
<text class="ts" x="202" y="118" text-anchor="middle" dominant-baseline="middle">条件判断</text>
<rect class="b3" x="282" y="42" width="120" height="40" rx="8"/>
<text class="ts" x="342" y="62" text-anchor="middle" dominant-baseline="middle">分支 A：查库</text>
<rect class="b3" x="282" y="154" width="120" height="40" rx="8"/>
<text class="ts" x="342" y="174" text-anchor="middle" dominant-baseline="middle">分支 B：查文档</text>
<rect class="b4" x="430" y="96" width="110" height="44" rx="8"/>
<text class="ts" x="485" y="111" text-anchor="middle" dominant-baseline="middle">聚合</text>
<text class="ts" x="485" y="128" text-anchor="middle" dominant-baseline="middle">AllOf / AnyOf</text>
<rect class="b5" x="564" y="96" width="110" height="44" rx="8"/>
<text class="ts" x="619" y="111" text-anchor="middle" dominant-baseline="middle">interrupt</text>
<text class="ts" x="619" y="128" text-anchor="middle" dominant-baseline="middle">人工确认</text>
<rect class="b1" x="688" y="96" width="56" height="44" rx="8"/>
<text class="ts" x="716" y="118" text-anchor="middle" dominant-baseline="middle">产出</text>
<line class="l" x1="124" y1="118" x2="150" y2="118" marker-end="url(#arr)"/>
<line class="l" x1="254" y1="110" x2="282" y2="62" marker-end="url(#arr)"/>
<line class="l" x1="254" y1="126" x2="282" y2="174" marker-end="url(#arr)"/>
<line class="l" x1="402" y1="62" x2="430" y2="106" marker-end="url(#arr)"/>
<line class="l" x1="402" y1="174" x2="430" y2="130" marker-end="url(#arr)"/>
<line class="l" x1="540" y1="118" x2="564" y2="118" marker-end="url(#arr)"/>
<line class="l" x1="674" y1="118" x2="688" y2="118" marker-end="url(#arr)"/>
<text class="ts" x="20" y="222">并行分支的价值：A 与 B 互不依赖时，总耗时从 tA+tB 降到 max(tA,tB)</text>
<text class="ts" x="20" y="240">聚合策略的价值：AllOf 要求全部成功（完整性优先），AnyOf 拿到第一个就继续（时延优先）</text>
</svg>
<figcaption>注意 <b>interrupt 在聚合之后、产出之前</b>——这是「副作用前必须有人确认」的标准位置。</figcaption>
</figure>

定义图的骨架（概念示意）：

```java
// 概念示意：节点很薄，只做「读状态 → 调能力 → 返回更新」
StateGraph graph = new StateGraph(OrderState.SCHEMA)
    .addNode("parse",   this::parse)
    .addNode("queryDb", this::queryDb)
    .addNode("queryKb", this::queryKb)
    .addNode("merge",   this::merge)
    .addNode("commit",  this::commit)
    .addEdge(START, "parse")
    .addConditionalEdges("parse", this::route)      // 返回下一个节点名
    .addEdge("queryDb", "merge")
    .addEdge("queryKb", "merge")
    .addEdge("merge", "commit")
    .compile(checkpointStore);                      // 注入检查点存储
```

### 4.3 节点的写法决定图的可维护性

一条经验：**节点应该是「薄」的**。判断标准是「这个节点能不能用一句话说清它的输入输出」。

| 反模式 | 症状 | 改法 |
| --- | --- | --- |
| 巨型节点 | 一个节点里塞了 200 行业务逻辑 | 拆成多个节点，或用工具表达 |
| 节点里偷偷调模型 | 图看起来 5 个节点，实际每次调用 3 次模型，成本不可预测 | 模型调用必须显式可见 |
| 状态字段膨胀 | State 里有 30 个字段，谁改谁不知道 | 分组为子对象，或按阶段拆图 |
| 用图表达纯串行 | 5 个节点一条直线 | 直接用 Service 方法，别上图 |

## 五、Nacos MCP Registry：工具从哪来

Spring AI 里 MCP server 通常在配置文件里写死。团队一多，问题就来了：A 团队的 3 个 server、B 团队的 5 个，谁改了地址都要发版。

Nacos 的做法是把 MCP server 的元信息注册到配置中心，客户端按名发现：

| 做法 | 工具地址管理 | 改一次要发版吗 |
| --- | --- | --- |
| 配置文件写死 | 散落在各服务 | 要 |
| Nacos MCP Registry | 集中注册、按名发现 | 不要 |
| 网关托管 MCP（Higress） | 网关统一暴露 | 不要，且有统一鉴权 |

三者可以叠加：**Nacos 管「有哪些」，Higress 管「怎么访问」，SAA 管「怎么用」。** 网关方案见 [Higress：AI 网关](#/alibaba/higress-gateway)。

## 六、选型：什么时候用哪一层

| 你的需求 | 用什么 | 理由 |
| --- | --- | --- |
| 一问一答 + 少量工具 | 裸 `ChatClient` | Graph 是负担 |
| 需要循环调用工具直到完成 | `ReactAgent` | 循环已封装，带 Hooks 与流式 |
| 流程固定、要人工确认、要断点续跑 | Graph | 显式状态与检查点是刚需 |
| 多角色分工 | Graph + 子图 / Supervisor 模式 | 见 [多智能体架构](#/deep/multi-agent) |
| 已有 Spring AI 项目想加编排 | 只引入 `graph-core` | 增量最小 |
| 从零做，团队不熟 Spring | 先看 [Spring AI 全景](#/springai/overview) | 缺基础会一直卡在概念上 |

## 常见坑

> [!WARNING] SAA 的六个高频坑

1. **版本不对齐**。四段版本号前三段对齐 Spring AI，不匹配时 Spring 容器启动就报 `NoSuchMethodError` / `ClassNotFoundException`，报错信息完全指不到根因。
2. **把 ReactAgent 和 ChatClient 当二选一**。ReactAgent 内部就走 ChatClient，你仍然可以（也应该）继续用 Advisor 做记忆、审计、限流。
3. **Graph 里塞业务逻辑**。节点一胖，检查点保存的状态就巨大，恢复变慢、序列化容易失败。业务留在 Service，节点只做适配。
4. **没有设置循环上限**。任何「工具调用循环」都必须有次数与预算上限，否则一次异常输入就能烧掉当月配额。
5. **以为 Nacos 是可选项**。单团队单服务不用它没问题；一旦工具跨团队，配置散落是必然结果。
6. **忽略状态序列化**。检查点要落库，State 里放了不可序列化的对象（连接、句柄、大文件）会在恢复时才炸，而且往往在生产环境才发现。

## 自测题

> [!QUESTION] Spring AI Alibaba 与 Spring AI 的依赖关系是什么？
> 扩展关系：SAA 构建在 Spring AI 之上，沿用 ChatClient、Advisor、ToolCallback、ChatMemory 等抽象，额外提供 DashScope 模型实现、Agent Framework（ReactAgent/Hooks/Skills）、Graph 运行时与 Nacos/ARMS 集成。

> [!QUESTION] Agent Skills 的渐进式披露解决了什么问题？代价是什么？
> 解决技能数量增长时系统提示被撑爆、指令互相干扰、成本与延迟线性上升的问题；代价是多一次工具往返的延迟，以及清单描述不清时模型可能漏加载技能。

> [!QUESTION] Graph 中的 Checkpoint 和 interrupt 分别解决什么？
> Checkpoint 把每步状态持久化，支持断点续跑、回放与时间旅行调试；interrupt 在敏感副作用（写库、发消息、付款）前暂停，等待人工确认后再继续。

> [!QUESTION] 为什么要求 Graph 的节点尽量「薄」？
> 因为状态要序列化落库、要可回放、要能定位失败点；节点越薄，状态越小、恢复越快、失败归因越清晰，业务逻辑也更容易单测。
