---
level: 基础
tags: [Agent, 一次问答, 自主循环, 四要素, ReAct, 入门]
summary: 用「一次问答 vs Agent」的对照讲清 Agent 到底多做了什么，拆出模型、工具、循环、状态四个组成部分，并说明什么情况下根本不需要 Agent。
---

# Agent 是什么：从一次问答到自主循环

> [!ABSTRACT] 一句话版本
> - **Agent 不是更聪明的模型，而是一种程序结构**：让模型决定下一步做什么，由代码执行，再把结果喂回去，直到任务完成。
> - 四个组成部分：**模型**（推理）、**工具**（执行）、**循环**（接着做）、**状态**（记得做过什么）。
> - 多出来的能力是「查实时数据 + 产生副作用 + 失败后自己换一种做法」，代价是**多轮调用、更多 token、更难排查**。
> - 关键认知：**模型不会执行任何代码**，它只输出一次工具调用请求。这点想通，Agent 就不神秘了。

## 一、从一次问答说起

普通的「问一句、答一句」只能做两件事：改写文字、凭训练记忆编内容。但真实需求往往是「查一下订单 A-1001 到哪了」「把这份文档总结后存进知识库」——需要**读外部数据**和**执行动作**，而大模型本身做不到。

| | 一次问答 | Agent |
| --- | --- | --- |
| 调用模型次数 | 1 次 | 多次，直到满足停止条件 |
| 谁决定下一步 | 用户 | 模型 |
| 能不能查实时数据 | 不能 | 能（通过工具） |
| 能不能产生副作用 | 不能 | 能（写库、发消息、下单） |
| 失败后怎么办 | 让用户重试 | 可以换一种做法重试 |
| 主要风险 | 答错 | 答错 + **做错事** + 费用失控 |

> [!TIP] 一句话判断需不需要 Agent
> 如果任务的步骤**事先就能写死**（查一次接口 → 格式化 → 返回），用普通代码调用模型即可；只有「下一步取决于上一步的结果、且无法预先枚举」时，才需要把决定权交给模型。

## 二、四个组成部分

<figure class="fig">
<svg viewBox="0 0 760 260" class="dg" role="img" aria-label="Agent 的四要素：模型负责决定，工具负责执行，循环负责反复，状态负责记忆">
<rect class="bg" x="20" y="20" width="720" height="220" rx="12"/>
<text class="th" x="380" y="44" text-anchor="middle">Agent（你的程序）</text>
<rect class="b1" x="40" y="70" width="150" height="60" rx="10"/>
<text class="tb" x="115" y="92" text-anchor="middle" dominant-baseline="middle">模型</text>
<text class="ts" x="115" y="114" text-anchor="middle">决定下一步</text>
<rect class="b2" x="40" y="150" width="150" height="60" rx="10"/>
<text class="tb" x="115" y="172" text-anchor="middle" dominant-baseline="middle">工具</text>
<text class="ts" x="115" y="194" text-anchor="middle">真正执行动作</text>
<rect class="b3" x="305" y="70" width="150" height="60" rx="10"/>
<text class="tb" x="380" y="92" text-anchor="middle" dominant-baseline="middle">循环</text>
<text class="ts" x="380" y="114" text-anchor="middle">做完再看结果</text>
<rect class="b5" x="305" y="150" width="150" height="60" rx="10"/>
<text class="tb" x="380" y="172" text-anchor="middle" dominant-baseline="middle">状态</text>
<text class="ts" x="380" y="194" text-anchor="middle">记得做过什么</text>
<rect class="b4" x="570" y="70" width="150" height="60" rx="10"/>
<text class="tb" x="645" y="92" text-anchor="middle" dominant-baseline="middle">停止条件</text>
<text class="ts" x="645" y="114" text-anchor="middle">轮次 · 时间 · 预算</text>
<rect class="b4" x="570" y="150" width="150" height="60" rx="10"/>
<text class="tb" x="645" y="172" text-anchor="middle" dominant-baseline="middle">人工确认</text>
<text class="ts" x="645" y="194" text-anchor="middle">敏感动作前暂停</text>
<line class="l" x1="190" y1="100" x2="305" y2="100" marker-end="url(#arr)"/>
<line class="l" x1="190" y1="180" x2="305" y2="180" marker-end="url(#arr)"/>
<line class="la" x1="455" y1="100" x2="570" y2="100" marker-end="url(#arr-a)"/>
</svg>
<figcaption>图 1：四要素之外，还必须有停止条件与人工确认这两道护栏</figcaption>
</figure>

- **模型（Model）**：推理引擎。输入上下文，输出文本或一次工具调用请求。
- **工具（Tools）**：你写的普通函数，例如 `queryOrder(id)`、`searchDocs(keyword)`。模型只看到名字、描述、参数说明。
- **循环（Loop）**：反复执行「问模型 → 看它要不要调工具 → 调 → 结果追加进上下文 → 再问」。详见 [核心循环与工具调用](#/basic/loop)。
- **状态（State）**：对话历史、中间结果、已执行步骤。没有状态，多轮任务就会失忆；管理方式是 [上下文、记忆与 RAG](#/basic/context-rag) 的主题。

**「自主性」来自你写的循环，不是模型突然有了意志。**

## 三、三种骨架，先认识第一种

| 骨架 | 怎么走 | 适合 |
| --- | --- | --- |
| **ReAct 循环** | 观察 → 思考 → 行动 → 再观察，循环到给出答案 | 大多数任务，初学者从这里开始 |
| **Plan-and-Execute** | 先让模型列计划，再逐条执行 | 步骤多、耗时长的任务 |
| **图编排** | 把步骤画成节点与边，显式管理状态 | 流程固定、需要暂停 / 审批 / 恢复，见 [LangGraph](#/python/langgraph) |

三者不冲突：图编排里的一个「环」，本质上就是 ReAct 循环被显式画了出来。

## 四、什么时候不该用 Agent

- 步骤确定、可以写死的流程 → 普通代码 + 一次模型调用。
- 只需要文本改写、分类、抽取 → 一次调用 + [结构化输出](#/python/output-rag-eval) 就够了。
- 对延迟和成本极度敏感 → 多轮调用会成倍增加 token 与耗时。
- 动作不可逆且无法加人工确认 → 先解决流程与权限问题，再谈自动化。

> [!WARNING] 多智能体别急着上
> 「多个 Agent 分工」听起来很酷，但每个额外 Agent 都意味着更多轮模型调用、更多 token、更难排查的错误。**大多数看起来需要多 Agent 的任务，其实是一个工具设计良好的单 Agent。**

## 常见坑

1. **把 Agent 当更强的聊天机器人**：期待它「什么都能做」，却没有提供任何工具，结果只能编内容。
2. **循环没有停止条件**：模型在两个工具之间来回打转，账单悄悄上涨。
3. **忘记状态**：每轮都只发当前问题，模型「失忆」，反复问同样的信息。
4. **工具设计成万能函数**：一个 `doEverything(param)`，模型无法判断该传什么，见 [MCP 与工具生态](#/basic/mcp)。
5. **跳过评测**：只看一两次对话「感觉还行」，上线后才发现它经常调错工具。

## 自测题

> [!QUESTION] Agent 与一次问答最本质的差别是什么？
> 是否有一个由程序驱动的多轮循环，让模型根据上一步结果决定下一步；以及是否拥有能读数据、能产生副作用的工具。模型本身没有变强。

> [!QUESTION] 模型「调用了工具」这句话准确吗？
> 不准确。模型只输出工具调用请求（工具名 + 参数），真正执行的是你的代码，因此鉴权、校验、幂等都必须写在工具里。

> [!QUESTION] 为什么必须有停止条件？
> 模型可能误判而反复调用工具；最大轮次、最大耗时、最大预算能防止无限循环与费用失控。

> [!QUESTION] 什么情况下应该放弃 Agent 方案？
> 流程可预先写死、只需文本处理、延迟成本敏感、或动作不可逆且无法加人工确认时。
