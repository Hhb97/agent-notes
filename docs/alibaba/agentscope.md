---
level: 深入
tags: [AgentScope, Actor 模型, MsgHub, Pipeline, Runtime, 沙箱, A2A, Meta Tool, 分布式]
summary: 讲透 AgentScope 的三位一体结构（SDK / Studio / Runtime）、Actor 消息驱动范式与 LangGraph 状态图的本质差异、Meta Tool 与上下文管理机制，以及从原型到分布式部署的完整路径。
---

# AgentScope：Actor 多智能体与 Runtime

> [!ABSTRACT] 一句话版本
> - AgentScope 的核心不是「又一个图编排」，而是 **Actor 模型**：每个 agent 是独立的执行单元，只通过消息通信。这让它天然支持跨机分布、动态增减成员。
> - 三位一体：**SDK**（写 agent）、**Studio**（看它在干什么）、**Runtime**（安全地跑起来）。三者共享同一套原语，原型不用重写就能上生产。
> - 两个值得单独学的机制：**Meta Tool**（工具太多时分组渐进披露）与 **AutoContextMemory**（上下文压缩-卸载）。
> - 代价要说清：Actor 心智比状态图难，`MsgHub` 广播会让 token 成倍增长，分布式运行时带来额外的运维复杂度。

> [!NOTE] 和相邻页的分工
> 本页讲 AgentScope **独有**的概念。消息与工具的基础见 [核心循环与工具调用](#/basic/loop)；如果要对比「图编排」这条路，看 [LangGraph](#/python/langgraph) 与 [Agent 工作流编排模式](#/deep/agent-workflow)；多智能体的通用问题（成本放大、失败传播）见 [多智能体架构与隔离](#/deep/multi-agent)。

## 一、三位一体：SDK / Studio / Runtime

很多框架只有 SDK，写完发现「调试靠 print、部署靠手搓」。AgentScope 把这条链路拆成三块，各自解决一个阶段的问题：

<figure class="fig">
<svg viewBox="0 0 760 250" class="dg" role="img" aria-label="AgentScope 三位一体结构：SDK 负责开发、Studio 负责调试与评估、Runtime 负责沙箱与部署">
<rect class="b1" x="20" y="40" width="230" height="150" rx="10"/>
<text class="t" x="36" y="62">SDK（开发）</text>
<text class="ts" x="36" y="86">Agent 层</text>
<text class="ts" x="36" y="104">ReActAgent / DialogAgent</text>
<text class="ts" x="36" y="130">编排层</text>
<text class="ts" x="36" y="148">MsgHub / Pipeline</text>
<text class="ts" x="36" y="174">服务层：模型适配 / 工具 / 记忆</text>
<rect class="b2" x="266" y="40" width="230" height="150" rx="10"/>
<text class="t" x="280" y="62">Studio（调试）</text>
<text class="ts" x="280" y="86">对话实时查看</text>
<text class="ts" x="280" y="104">trace 下钻：每次 LLM / 工具耗时</text>
<text class="ts" x="280" y="130">评估结果可视化</text>
<text class="ts" x="280" y="148">不同运行轨迹对比</text>
<text class="ts" x="280" y="174">内置 Friday 助手（查框架文档）</text>
<rect class="b3" x="512" y="40" width="228" height="150" rx="10"/>
<text class="t" x="526" y="62">Runtime（上线）</text>
<text class="ts" x="526" y="86">引擎：FastAPI + 健康检查</text>
<text class="ts" x="526" y="104">会话与中断恢复</text>
<text class="ts" x="526" y="130">沙箱：Docker / K8s / BoxLite</text>
<text class="ts" x="526" y="148">代码 / 文件 / 浏览器隔离</text>
<text class="ts" x="526" y="174">A2A 协议对外暴露</text>
<line class="l" x1="250" y1="115" x2="266" y2="115" marker-end="url(#arr)"/>
<line class="l" x1="496" y1="115" x2="512" y2="115" marker-end="url(#arr)"/>
<text class="ts" x="20" y="222">同一套原语贯穿三阶段 —— 在 Studio 里调通的流程，改造成本几乎为零就能进 Runtime</text>
</svg>
<figcaption>理解关键：<b>Studio 不是演示玩具</b>，它读的是同一份 trace 数据，所以「本地看到的」和「线上跑的」是同构的。</figcaption>
</figure>

## 二、Actor 模型：和状态图的本质差异

这是最需要建立直觉的地方。同样是「多智能体协作」，两种世界观完全不同：

| 视角 | 状态图（LangGraph / SAA Graph） | Actor（AgentScope） |
| --- | --- | --- |
| 谁在控制流程 | **编排器**：边决定下一步走谁 | **消息**：谁收到消息谁行动 |
| 状态存在哪 | 集中的 State 对象 | 分散在每个 agent 内部 |
| 拓扑 | 编译期确定（可条件分支） | 运行时可增删成员 |
| 扩展 | 整体复制 | 单个 agent 可搬机器 |
| 调试 | 好（状态可快照、可回放） | 难一些（要重建消息序列） |
| 失败处理 | 检查点恢复 | 消息重放 + 容错 |
| 适合 | 流程有明确阶段、要人工审批 | 角色协作、负载不均、要横向扩 |

一个类比：**状态图像「流水线工厂」**——每个工位固定、传送带决定顺序；**Actor 像「公司群聊」**——每个人自己判断要不要接活，人可以随时进出群。

选择建议很直接：**流程阶段清晰（检索→判断→执行→复核）用状态图；角色分工清晰、负载差异大（研究/写作/审查各司其职）用 Actor。**

## 三、核心组件

### 3.1 Agent 层

| 组件 | 定位 | 什么时候用 |
| --- | --- | --- |
| `AgentBase` | 所有 agent 的基类，定义 `reply` / `observe` 行为 | 要自定义行为时继承 |
| `ReActAgent` | 推理-行动循环，支持工具调用 | 绝大多数场景 |
| `DialogAgent` | 纯对话，不调工具 | 角色扮演、审稿、讨论 |
| 内置 agent | 深度研究、浏览器使用、元规划器等 | 想直接复用成熟流程 |

`reply` 与 `observe` 的区分值得记：**`reply` 是对「问我」的回应，`observe` 是「别人说话我听着」。** 这个区分让 agent 能在群聊里选择「不发言」，也避免了每条消息都触发一轮模型调用。

### 3.2 编排层：MsgHub 与 Pipeline

<figure class="fig">
<svg viewBox="0 0 760 272" class="dg" role="img" aria-label="MsgHub 群聊广播与 Pipeline 顺序流水线的结构差异">
<text class="th" x="20" y="24">① MsgHub：广播式群聊（成员可动态增删）</text>
<rect class="b1" x="300" y="38" width="140" height="40" rx="8"/>
<text class="ts" x="370" y="58" text-anchor="middle" dominant-baseline="middle">MsgHub</text>
<rect class="b2" x="176" y="98" width="104" height="36" rx="7"/>
<text class="ts" x="228" y="116" text-anchor="middle" dominant-baseline="middle">研究员</text>
<rect class="b3" x="318" y="98" width="104" height="36" rx="7"/>
<text class="ts" x="370" y="116" text-anchor="middle" dominant-baseline="middle">写作</text>
<rect class="b4" x="460" y="98" width="104" height="36" rx="7"/>
<text class="ts" x="512" y="116" text-anchor="middle" dominant-baseline="middle">审校</text>
<line class="l" x1="330" y1="78" x2="240" y2="98" marker-end="url(#arr)"/>
<line class="l" x1="370" y1="78" x2="370" y2="98" marker-end="url(#arr)"/>
<line class="l" x1="410" y1="78" x2="500" y2="98" marker-end="url(#arr)"/>
<text class="ts" x="176" y="160">每条消息广播给全体 → 上下文×N，要控制发言频率</text>
<text class="ts" x="176" y="180">适合：头脑风暴、评审、需要互相看见彼此结论</text>
<text class="th" x="20" y="212">② Pipeline：顺序流水线（上一站输出即下一站输入）</text>
<rect class="b2" x="20" y="228" width="150" height="36" rx="7"/>
<text class="ts" x="95" y="246" text-anchor="middle" dominant-baseline="middle">检索</text>
<rect class="b3" x="204" y="228" width="150" height="36" rx="7"/>
<text class="ts" x="279" y="246" text-anchor="middle" dominant-baseline="middle">撰写</text>
<rect class="b4" x="388" y="228" width="150" height="36" rx="7"/>
<text class="ts" x="463" y="246" text-anchor="middle" dominant-baseline="middle">润色</text>
<rect class="b5" x="572" y="228" width="150" height="36" rx="7"/>
<text class="ts" x="647" y="246" text-anchor="middle" dominant-baseline="middle">合规检查</text>
<line class="l" x1="170" y1="246" x2="204" y2="246" marker-end="url(#arr)"/>
<line class="l" x1="354" y1="246" x2="388" y2="246" marker-end="url(#arr)"/>
<line class="l" x1="538" y1="246" x2="572" y2="246" marker-end="url(#arr)"/>
</svg>
<figcaption>两者可组合：流水线的某一站内部是 MsgHub 群聊。 <b>消息路由方式决定了成本结构。</b></figcaption>
</figure>

`MsgHub` 的成本陷阱要提前知道：N 个 agent 互相可见时，每个 agent 的上下文都要容纳其他 N-1 个的发言，token 消耗大致是**平方级**。控制手段有三种：

1. **限制谁发言**（按角色指定发言顺序，其余只 `observe`）
2. **只广播结论不广播过程**（中间推理留在本地）
3. **定期压缩**（把前几轮讨论摘要成一条系统消息）

### 3.3 工具层：Meta Tool 解决「工具爆炸」

和 [Agent Skills](#/alibaba/spring-ai-alibaba) 是同一个问题的两种解法。当工具有 50 个时，全部塞进 schema 会：占满上下文、拉低选择准确率、增加延迟。

Meta Tool 的做法是**先分组，再按需展开**：

<figure class="fig">
<svg viewBox="0 0 760 216" class="dg" role="img" aria-label="Meta Tool 两阶段工具暴露：先只暴露工具组清单，模型选择组后再展开该组的具体工具">
<rect class="b1" x="20" y="40" width="200" height="60" rx="8"/>
<text class="t" x="34" y="60">① 只暴露组</text>
<text class="ts" x="34" y="80">订单 / 库存 / 财务</text>
<text class="ts" x="34" y="94">每组一行描述</text>
<rect class="b2" x="266" y="40" width="200" height="60" rx="8"/>
<text class="t" x="280" y="60">② 模型选组</text>
<text class="ts" x="280" y="80">例如选「订单」</text>
<text class="ts" x="280" y="94">基于描述判断</text>
<rect class="b3" x="512" y="40" width="228" height="60" rx="8"/>
<text class="t" x="526" y="60">③ 展开该组工具</text>
<text class="ts" x="526" y="80">6 个具体工具的 schema</text>
<text class="ts" x="526" y="94">其余组保持折叠</text>
<line class="l" x1="220" y1="70" x2="266" y2="70" marker-end="url(#arr)"/>
<line class="l" x1="466" y1="70" x2="512" y2="70" marker-end="url(#arr)"/>
<rect class="b4" x="20" y="122" width="720" height="72" rx="8"/>
<text class="t" x="36" y="142">对比：50 个工具全量暴露</text>
<text class="ts" x="36" y="162">schema 本身就可能上万 token，且模型在 50 选 1 时准确率显著下降</text>
<text class="ts" x="36" y="180">分组后：常驻只占几行，展开也只多一次往返 —— 和「先查目录再翻章节」一个道理</text>
</svg>
<figcaption>分组维度应该按<b>业务域</b>而不是按技术实现（别分「查询类/写入类」，要分「订单/库存/财务」）。</figcaption>
</figure>

## 四、上下文管理：压缩与卸载

长任务跑久了，上下文一定爆。AgentScope 给的思路是**压缩 + 卸载**：

| 机制 | 做法 | 保留什么 |
| --- | --- | --- |
| 短期压缩 | 把较早的对话摘要成一条 | 结论、约定、未完成事项 |
| 卸载 | 大块中间结果（网页全文、查询结果）存到外部，上下文只留引用 | 引用 ID + 一句话摘要 |
| 长期记忆（ReMe） | 跨会话提取可复用的经验/偏好 | 结构化条目，按需检索 |

判断标准：**「下一步决策真的需要这段原文吗？」** 不需要就卸载，需要就保留原文并标注来源。这个判断在 [上下文编译器](#/internals/context-compiler) 里被形式化成「引用 vs 内联」的取舍。

## 五、Runtime：从「跑得通」到「敢上线」

`Runtime` 解决的是 Python agent 最尴尬的一段：本地能跑，线上不敢开。

| 能力 | 解决什么 | 细节 |
| --- | --- | --- |
| 引擎 | 把 agent 变成标准 Web 服务 | FastAPI + 健康检查 + 会话管理 |
| 沙箱 | 工具执行不能污染宿主 | Docker / K8s / BoxLite 隔离代码、文件、浏览器 |
| 会话与恢复 | 长任务中断后继续 | 状态持久化 + 恢复 |
| A2A | 与其他 agent 系统互通 | 标准协议，跨语言/跨团队 |
| 可观测 | 定位问题 | trace 接入，与 Studio 同源 |

**沙箱不是默认开启的**，这是最容易踩的坑。一个能执行 Python 代码的 agent，如果不隔离，等于把宿主机交给模型——包括读环境变量里的 API key。

## 六、实时介入：interrupt

长任务里，人常常要中途喊停：「方向错了」「别查了」。AgentScope 提供 `interrupt()`：打断当前执行、保存状态、允许人修正后继续。

这和状态图的 `interrupt` 有意区别：

| 对比 | 状态图 interrupt | AgentScope interrupt |
| --- | --- | --- |
| 触发方式 | 编排器在指定位置暂停 | 用户随时打断 |
| 典型场景 | 敏感操作前审批 | 长任务中途纠偏 |
| 状态处理 | 检查点 | 保存后可续跑 |

两者都需要：**暂停点必须可序列化，且恢复语义要定义清楚**（哪些副作用已发生、哪些没有）。

## 七、代码骨架

概念示意（不同版本 API 可能变化，以官方文档为准）：

```python
# 概念示意：三个角色 + 群聊
researcher = ReActAgent(name="researcher", model=..., toolkit=search_tools)
writer     = ReActAgent(name="writer",     model=..., toolkit=doc_tools)
reviewer   = DialogAgent(name="reviewer",  model=..., sys_prompt="你是严格的审校")

async with MsgHub([researcher, writer, reviewer]) as hub:   # 组内消息互相可见
    await hub.broadcast(Msg("user", "写一份 XX 调研报告"))
    report = await writer(Msg("user", "请基于讨论产出初稿"))
    await reviewer(Msg("user", "指出这份初稿的三个问题"))
```

```python
# 概念示意：顺序流水线
pipeline = SequentialPipeline([researcher, writer, reviewer])
result = await pipeline(Msg("user", "写一份 XX 调研报告"))
```

差别一目了然：**Pipeline 是「传下去」，MsgHub 是「都在场」**。前者便宜可控，后者协作充分但贵。生产里最常见的是「Pipeline 主干 + 局部 MsgHub」。

## 八、评估：两种评估器

| 评估器 | 执行方式 | 适合 |
| --- | --- | --- |
| 通用评估器 | 顺序执行，逐步可跟 | 开发调试、定位单条失败 |
| Ray 分布式评估器 | 并行跑大量用例 | 生产前回归、规模化对比 |

分布式评估是它相对少见的优势：**多智能体系统的评估本来就慢**（每个用例要跑多轮对话），串行跑 500 条要几小时，并行能压到分钟级。评估指标设计见 [评测系统深入](#/internals/eval-system)。

## 九、什么时候选它，什么时候别选

| 选它 | 别选它 |
| --- | --- |
| 多角色协作是核心（研究、评审、辩论） | 只是「一问一答 + 几个工具」 |
| 需要跨机扩展、负载不均 | 单机跑得下，团队不熟 actor |
| 要沙箱执行代码/浏览器 | 流程严格固定、强审批（状态图更合适） |
| 团队是 Python 且要快速试新架构 | 团队是 Java（看 [SAA](#/alibaba/spring-ai-alibaba)） |

## 常见坑

> [!WARNING] 六个高频坑

1. **以为 Actor 就必须分布式**。单进程也能跑，actor 只是编程模型；分布式是可选项，别为了「架构先进」提前引入。
2. **MsgHub 里不加控制地广播**。N 个 agent 的上下文互相包含，token 近似平方增长，账单会先于效果出问题。
3. **沙箱不开就上线**。能执行代码的 agent 不隔离，等于把宿主机和密钥交给模型。
4. **把 Studio 暴露到公网**。它能看到完整对话与 trace，属于内部工具，必须加鉴权或只在内网。
5. **忽略 Runtime 与 SDK 的版本差**。两者独立发版，版本不匹配会出现接口对不上的问题。
6. **用 `observe` 当 `reply` 用**。每条消息都触发模型调用，群聊场景成本会失控；该沉默时要沉默。

## 自测题

> [!QUESTION] Actor 模型与状态图在「流程控制」上的根本区别是什么？
> 状态图由编排器（边与条件）决定下一步谁执行，状态集中存放；Actor 由消息驱动，谁收到消息谁行动，状态分散在各执行单元内部，因此拓扑可在运行时变化。

> [!QUESTION] MsgHub 广播为什么会导致成本近似平方增长？
> 组内每个 agent 的消息对其他成员可见，N 个 agent 的上下文都要容纳其余 N-1 个的发言，总输入 token 近似 N² 增长；需要限制发言、只广播结论或定期压缩。

> [!QUESTION] Meta Tool 与 Agent Skills 解决的是同一个问题吗？
> 是同一类问题（工具/技能过多导致上下文膨胀与选择准确率下降）的两种解法：Skills 用「清单 + 按需读文档」，Meta Tool 用「分组 + 按需展开 schema」；前者载入的是指令，后者载入的是工具定义。

> [!QUESTION] Runtime 的沙箱为什么是上线必需项？
> 因为能执行代码或访问文件的工具一旦不隔离，就等于把宿主机的文件系统、网络与环境变量（含密钥）暴露给模型输出，属于不可接受的权限放大。
