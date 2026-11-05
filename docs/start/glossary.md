---
level: 基础
tags: [术语, token, 上下文窗口, embedding, RAG, MCP, checkpoint, 入门准备]
summary: 把 Agent 学习中最常遇到的一组名词一次性对齐，并说明 Java 与 Python 两边各需要准备什么环境、API Key 应该怎么放。
---

# 术语速查与准备

> [!ABSTRACT] 一句话版本
> - 术语不是用来背的，是用来**定位层次**的：模型层（LLM / token / 上下文窗口）、能力层（工具调用 / 结构化输出 / RAG / MCP）、编排层（循环 / 状态图 / 检查点）、治理层（评测 / 可观测 / 护栏）。
> - **token 是计价与长度单位**，上下文窗口是硬上限，embedding 是「把文本变成一串数字以便按语义检索」。
> - RAG 解决「模型不知道内部资料」，MCP 解决「工具接口不统一」，checkpoint 解决「长任务崩了要重跑」。
> - 准备环境时最要紧的一条：**API Key 只放环境变量**，不要写进代码或提交到仓库。

## 一、术语关系图

<figure class="fig">
<svg viewBox="0 0 760 290" class="dg" role="img" aria-label="Agent 术语的四层关系：模型层、能力层、编排层、治理层">
<rect class="bg" x="20" y="20" width="720" height="58" rx="10"/>
<text class="tb" x="36" y="40">模型层</text>
<rect class="b1" x="36" y="50" width="120" height="24" rx="6"/><text class="ts" x="96" y="62" text-anchor="middle" dominant-baseline="middle">LLM · 提示词</text>
<rect class="b1" x="168" y="50" width="110" height="24" rx="6"/><text class="ts" x="223" y="62" text-anchor="middle" dominant-baseline="middle">token</text>
<rect class="b1" x="290" y="50" width="150" height="24" rx="6"/><text class="ts" x="365" y="62" text-anchor="middle" dominant-baseline="middle">上下文窗口</text>
<rect class="b1" x="452" y="50" width="130" height="24" rx="6"/><text class="ts" x="517" y="62" text-anchor="middle" dominant-baseline="middle">温度 temperature</text>
<rect class="bg" x="20" y="90" width="720" height="58" rx="10"/>
<text class="tb" x="36" y="110">能力层</text>
<rect class="b2" x="36" y="120" width="140" height="24" rx="6"/><text class="ts" x="106" y="132" text-anchor="middle" dominant-baseline="middle">工具调用 Tool Calling</text>
<rect class="b2" x="188" y="120" width="140" height="24" rx="6"/><text class="ts" x="258" y="132" text-anchor="middle" dominant-baseline="middle">结构化输出</text>
<rect class="b2" x="340" y="120" width="140" height="24" rx="6"/><text class="ts" x="410" y="132" text-anchor="middle" dominant-baseline="middle">embedding · RAG</text>
<rect class="b2" x="492" y="120" width="120" height="24" rx="6"/><text class="ts" x="552" y="132" text-anchor="middle" dominant-baseline="middle">MCP</text>
<rect class="bg" x="20" y="160" width="720" height="58" rx="10"/>
<text class="tb" x="36" y="180">编排层</text>
<rect class="b3" x="36" y="190" width="140" height="24" rx="6"/><text class="ts" x="106" y="202" text-anchor="middle" dominant-baseline="middle">循环 · ReAct</text>
<rect class="b3" x="188" y="190" width="140" height="24" rx="6"/><text class="ts" x="258" y="202" text-anchor="middle" dominant-baseline="middle">状态 State</text>
<rect class="b3" x="340" y="190" width="140" height="24" rx="6"/><text class="ts" x="410" y="202" text-anchor="middle" dominant-baseline="middle">检查点 checkpoint</text>
<rect class="b3" x="492" y="190" width="120" height="24" rx="6"/><text class="ts" x="552" y="202" text-anchor="middle" dominant-baseline="middle">handoff</text>
<rect class="bg" x="20" y="230" width="720" height="48" rx="10"/>
<text class="tb" x="36" y="250">治理层</text>
<text class="ts" x="140" y="250" dominant-baseline="middle">评测 · 可观测链路 · guardrail 护栏 · 提示注入防护 · 预算与人工确认</text>
</svg>
<figcaption>图 1：术语按层次归类，遇到问题先判断属于哪一层</figcaption>
</figure>

## 二、术语速查表

| 术语 | 一句话解释 | 常见误解 |
| --- | --- | --- |
| **LLM / 大模型** | 输入一段文本，输出下一段文本或一次工具调用请求 | 以为它能自己上网、查库、执行代码 |
| **提示词 prompt** | 你发给模型的全部上下文，通常含系统指令、历史消息、用户问题、检索到的资料 | 以为只有用户那句问话 |
| **token** | 模型处理文本的最小单位，计费和长度都按它算 | 以为 1 token = 1 个汉字（中文通常更耗 token） |
| **上下文窗口** | 单次请求能装下的文本上限，超出就装不进去 | 以为「多轮对话」会被模型自动永久记住 |
| **temperature** | 控制输出随机性，越低越稳定；做工具调用、抽取任务通常调低 | 以为调高就能让模型「更聪明」 |
| **工具调用 Tool Calling** | 模型输出结构化的「调用哪个工具、参数是什么」，由你的代码执行 | 以为模型真的调用了函数 |
| **结构化输出** | 让模型按指定类型返回，框架帮你校验并映射成对象 | 用「请返回 JSON」再自己切字符串 |
| **embedding / 向量** | 把文本转成一组数字，语义相近的文本向量也相近 | 以为它是「压缩后的原文」，能直接读回来 |
| **RAG** | 提问前先检索相关资料，把片段拼进提示词再让模型回答 | 以为它是「训练模型」或能让模型永远不胡说 |
| **向量库 VectorStore** | 存向量并支持相似度检索的数据库 / 组件 | 以为只有专门的向量数据库才能做 |
| **MCP** | 工具提供方与 Agent 之间的统一协议 | 以为它是某个框架特有的功能 |
| **记忆 ChatMemory** | 管理多轮消息历史的组件（短期）；跨会话的事实存数据库（长期） | 把两者混为一谈 |
| **循环 / ReAct** | 观察 → 思考 → 行动 → 再观察，直到给出答案或达到停止条件 | 以为框架内部有个「自主意识」 |
| **状态 State / 状态图** | 在步骤之间传递的数据对象，以及由节点和边组成的流程 | 以为只有复杂系统才需要状态 |
| **checkpoint 检查点** | 每走一步保存状态，支持恢复、回放、时间旅行调试 | 以为只是「缓存」 |
| **human-in-the-loop** | 敏感动作前暂停，等人类批准再继续 | 以为加一句提示词「请谨慎」就够了 |
| **handoff / 多智能体** | 把任务转交给另一个 Agent | 以为任务一复杂就该拆成多个 Agent |
| **guardrail 护栏** | 输入 / 输出的校验规则 | 以为能替代工具层的鉴权 |
| **幻觉** | 模型编出看似合理但不成立的内容 | 以为换个框架就能根治 |
| **评测 eval** | 用一组固定问题反复检查答案、工具选择与安全边界 | 只靠「感觉还不错」 |

> [!NOTE] 关于版本
> 这些术语在 Spring AI 与 Python 框架里往往有不同叫法，对照表见 [Spring AI ↔ Python 概念映射](#/compare/mapping)。具体类名与配置项以所用版本的官方文档为准。

## 三、环境准备

| 方向 | 需要什么 | 说明 |
| --- | --- | --- |
| 通用 | 一个模型服务的 API Key、网络可达 | 用环境变量保存，例如 `OPENAI_API_KEY` / `LLM_API_KEY` |
| Spring AI | JDK（较新的 LTS）、Spring Boot、Maven / Gradle | 用 BOM 统一 Spring AI 依赖版本，starter 按需引入 |
| Python | Python 3.10+、虚拟环境（`venv` 或 `uv`）、包管理器 | 每个项目独立虚拟环境，避免依赖互相污染 |
| 调试 | 一个能看请求报文的日志开关 | 学习期最重要：确认模型**实际收到了什么** |

```bash
# 概念示意：密钥只放在环境变量里，不写进代码
export LLM_API_KEY="sk-..."     # macOS / Linux
# Windows PowerShell 用 $env:LLM_API_KEY = "sk-..."
```

> [!CAUTION] 不要把密钥提交到仓库
> 配置文件、`.env`、截图、日志里都不要出现真实密钥。学习阶段也建议先在项目里配好忽略规则，一旦推送到公开仓库就要**立即轮换密钥**，删掉提交记录并不能让密钥失效。

## 四、学习时的心态

- **先跑通最短路径**：一次问答 → 加一个工具 → 加记忆 → 加检索。每步只加一个变量，出问题好定位。
- **看不懂就打印请求**：把发给模型的消息、工具清单、返回结果打出来，比猜快得多。
- **框架不是越多越好**：一个服务里混用两个 Agent 框架，排查成本会翻倍。

## 常见坑

> [!WARNING] 初学者最容易混淆的三组词
> - **上下文窗口 vs 记忆**：前者是单次请求的硬上限，后者是你为「跨轮次保留什么」做的工程决策。
> - **RAG vs 微调**：RAG 是查资料后临时拼进提示词；微调是改模型参数。初学者遇到的绝大多数「模型不懂内部知识」需求，答案是 RAG。
> - **护栏 vs 鉴权**：护栏是校验模型输出，鉴权是工具内部基于当前用户的权限判断。后者不能省。

## 自测题

> [!QUESTION] token 和上下文窗口是什么关系？
> token 是文本的计量单位，上下文窗口是单次请求能容纳的 token 上限。消息历史、检索片段、工具结果都要占用这个额度。

> [!QUESTION] RAG 是在训练模型吗？
> 不是。它是提问前先检索外部资料并把片段拼进提示词，模型参数不变；解决的是「模型不知道内部资料 / 知识过期」。

> [!QUESTION] MCP 和工具调用有什么区别？
> 工具调用是模型与程序之间的交互方式；MCP 是「工具怎么被发现、怎么被连接」的统一协议，让同一个工具能被不同客户端复用。

> [!QUESTION] 为什么评测集要固定？
> 只有问题固定，改提示词或换模型之后的对比才有意义；否则「感觉变好了」无法复现，也无法判断回归。
