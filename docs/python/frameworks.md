---
level: 基础
tags: [Pydantic AI, OpenAI Agents SDK, LlamaIndex, handoff, guardrail, output_type, Python]
summary: 介绍三个轻量取向的 Python 框架各自的核心原语与适用场景：Pydantic AI 的类型安全、OpenAI Agents SDK 的 handoff 与护栏、LlamaIndex 的检索中心，并给出选择建议。
---

# 轻量框架：Pydantic AI 与 OpenAI Agents SDK

> [!ABSTRACT] 一句话版本
> - **Pydantic AI**：把 Agent 当成「普通的类型化 Python 代码」，用 Pydantic 模型定义输出，类型检查与单元测试最舒服。
> - **OpenAI Agents SDK**：少数几个原语（Agent、Runner、handoff、guardrail、tracing）就能跑起来，适合快速原型与已深度使用 OpenAI 的团队。
> - **LlamaIndex**：以文档索引与检索为中心，检索密集型任务更顺手，见 [生态地图与选型](#/python/overview)。
> - 三者都比 [LangGraph](#/python/langgraph) 轻：**先问自己要不要显式状态图，不需要就别上图**。

> [!NOTE] 版本背景
> 核对时间 2026-11，这些库迭代较快（例如各家的持久化执行集成、追踪能力都在变化）。以下以**概念与典型写法**为主，具体 API 以官方文档为准。

## 一、三个框架的取向

<figure class="fig">
<svg viewBox="0 0 760 210" class="dg" role="img" aria-label="三个轻量框架的核心取向：Pydantic AI 类型安全、OpenAI Agents SDK 少量原语、LlamaIndex 检索中心">
<rect class="b1" x="20" y="40" width="230" height="120" rx="12"/>
<text class="th" x="135" y="66" text-anchor="middle">Pydantic AI</text>
<text class="ts" x="135" y="94" text-anchor="middle">类型化的输入输出</text>
<text class="ts" x="135" y="118" text-anchor="middle">Pydantic 模型校验</text>
<text class="ts" x="135" y="142" text-anchor="middle">像测普通函数一样测 Agent</text>
<rect class="b2" x="265" y="40" width="230" height="120" rx="12"/>
<text class="th" x="380" y="66" text-anchor="middle">OpenAI Agents SDK</text>
<text class="ts" x="380" y="94" text-anchor="middle">Agent · Runner · handoff</text>
<text class="ts" x="380" y="118" text-anchor="middle">guardrail · 内建 tracing</text>
<text class="ts" x="380" y="142" text-anchor="middle">少量原语，快速原型</text>
<rect class="b3" x="515" y="40" width="225" height="120" rx="12"/>
<text class="th" x="628" y="66" text-anchor="middle">LlamaIndex</text>
<text class="ts" x="628" y="94" text-anchor="middle">文档索引与检索</text>
<text class="ts" x="628" y="118" text-anchor="middle">知识库问答流水线</text>
<text class="ts" x="628" y="142" text-anchor="middle">检索密集型任务</text>
<text class="ts" x="380" y="190" text-anchor="middle">共同点：都比状态图轻，适合「单个循环 + 少量工具」的任务</text>
</svg>
<figcaption>图 1：取向不同，但都不要求你先学一套图编排模型</figcaption>
</figure>

## 二、Pydantic AI：类型安全优先

核心思路是**让 Agent 保持「普通的、带类型的 Python」**：输出类型用 Pydantic 模型声明，框架负责约束模型输出并校验。

```python
# 概念示意：输出直接是类型化对象
from pydantic import BaseModel
from pydantic_ai import Agent

class Trip(BaseModel):
    city: str
    days: int

agent = Agent("some-model", output_type=Trip)
result = agent.run_sync("规划一个三天的行程")
print(result.output.city)      # 有类型、有补全、有校验
```

| 优点 | 注意 |
| --- | --- |
| 类型错误在开发期暴露；工具参数与输出都能校验 | 生态集成数量不如 LangChain 系 |
| 单元测试像测普通函数，可用替身避免真实扣费 | 复杂长流程仍需要额外的持久化 / 编排方案 |
| 代码量小，不引入一整套运行时 | 版本迭代快，API 需核对文档 |

## 三、OpenAI Agents SDK：少量原语

一组很小的概念就能构成可用 Agent：

| 原语 | 作用 |
| --- | --- |
| **Agent** | 指令 + 模型 + 工具 + 输出类型 |
| **Runner** | 驱动一次运行（同步 / 异步），内部执行那条循环 |
| **handoff** | 把任务转交给另一个 Agent（受控的委派，而非随意多智能体） |
| **guardrail** | 输入 / 输出的校验规则 |
| **session / tracing** | 会话状态与默认开启的链路追踪 |
| **needs_approval** | 工具需要人工批准时暂停，运行状态可序列化后恢复 |

```python
# 概念示意：Agent + 工具 + 运行
from agents import Agent, Runner

agent = Agent(name="订单助手", instructions="只回答订单相关问题", tools=[query_order_status])
result = await Runner.run(agent, "订单 A-1001 到哪了？")
```

> [!WARNING] 供应商绑定
> 这类 SDK 的默认路径通常针对自家模型服务；通过适配层接其他厂商时，能力与稳定性往往不如原生路径。**如果跨厂商可移植是硬要求，选型时要把它当作一等约束**，见 [选型清单](#/compare/checklist)。

## 四、LlamaIndex：检索中心

当任务主体是「从一堆文档里找依据再回答」，LlamaIndex 把索引、检索、查询组织成一条连贯流水线，比自己拼 loader + 向量库 + 提示词省事。对应原理见 [上下文、记忆与 RAG](#/basic/context-rag)。

| 任务主体 | 更顺手的选择 |
| --- | --- |
| 文档问答、知识库 | LlamaIndex 或自建检索流水线 |
| 调接口、执行动作 | Pydantic AI / Agents SDK + 工具 |
| 长流程、审批、恢复 | [LangGraph](#/python/langgraph) |

## 五、三者的共同边界

- **都替代不了工具设计**：描述、参数、鉴权、幂等仍由你负责，见 [核心循环与工具调用](#/basic/loop)。
- **都替代不了评测**：要有固定用例，检查答案、工具选择与安全边界。
- **别在一个服务里混用两套 Agent 框架**：状态、追踪、错误处理各不相同，排查成本翻倍。

## 常见坑

1. **把类型安全当成「答案一定正确」**：类型校验保证格式，不保证事实。
2. **以为 guardrail 等于权限控制**：护栏校验的是模型输入输出，鉴权必须在工具内部。
3. **handoff 用得太随意**：多 Agent 会成倍增加 token 与调试难度，先确认单 Agent 不够用。
4. **忽略默认 tracing 的数据去向**：确认追踪内容是否含敏感信息、上传到哪里。
5. **凭星标选型**：先看任务形态，再看生态。

## 自测题

> [!QUESTION] Pydantic AI 最核心的价值是什么？
> 用 Pydantic 模型约束工具参数与输出，让类型错误在开发期暴露，Agent 能像普通 Python 代码一样被测试和补全。

> [!QUESTION] handoff 与「多智能体自由协作」有什么区别？
> handoff 是受控的、显式的任务转交，由开发者定义谁能转给谁；后者往往让模型自由决定协作，成本与不确定性都更高。

> [!QUESTION] 为什么供应商 SDK 的可移植性需要单独评估？
> 默认路径通常针对自家模型服务，接其他厂商多靠适配层，能力与稳定性可能打折；若换模型是硬需求，应优先选模型无关的抽象。

> [!QUESTION] 什么时候该从轻量框架升级到 LangGraph？
> 需要显式状态与分支、崩溃后从检查点恢复、敏感动作人工审批、或要回放调试长任务时。
