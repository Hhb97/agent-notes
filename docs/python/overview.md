---
level: 基础
tags: [Python, LangChain, LangGraph, LlamaIndex, Pydantic AI, OpenAI Agents SDK, 选型]
summary: 给 Python 侧框架画一张分层地图，说明各自管哪一层、什么时候根本不需要框架，并给出按问题复杂度递进的选型方法。
---

# 生态地图与选型

> [!ABSTRACT] 一句话版本
> - Python 是 AI 生态最密集的语言，代价是**选择太多**。初学者最容易犯的错：还没写过一个循环，就先花一周挑框架。
> - 分层看：**模型 SDK**（发请求）→ **组件库**（模型 / 检索器 / 工具集成）→ **编排运行时**（状态图、检查点）→ **高层封装**（现成 Agent 骨架）。
> - **LangGraph 是底层状态编排层，高层 `create_agent` 之类的封装构建在它之上**；LlamaIndex 偏检索，Pydantic AI 偏类型安全，OpenAI Agents SDK 偏快速上手。
> - 选型只需回答两个问题：**控制流有多复杂？要不要跨厂商可移植？**

> [!NOTE] 版本背景
> 核对时间 2026-11：LangChain / LangGraph 已进入 1.x 时代，各库仍在快速迭代。本页描述的是**分工与定位**，具体 API 与包名以官方文档为准。

## 一、分层地图

<figure class="fig">
<svg viewBox="0 0 760 280" class="dg" role="img" aria-label="Python Agent 生态分层：模型 SDK、组件库、编排运行时、高层封装与横切工具">
<rect class="bg" x="20" y="20" width="720" height="54" rx="10"/>
<text class="tb" x="36" y="40">高层封装</text>
<rect class="b1" x="150" y="30" width="166" height="34" rx="7"/><text class="ts" x="233" y="47" text-anchor="middle" dominant-baseline="middle">create_agent / Deep Agents</text>
<rect class="b1" x="324" y="30" width="150" height="34" rx="7"/><text class="ts" x="399" y="47" text-anchor="middle" dominant-baseline="middle">OpenAI Agents SDK</text>
<rect class="b1" x="482" y="30" width="112" height="34" rx="7"/><text class="ts" x="538" y="47" text-anchor="middle" dominant-baseline="middle">Pydantic AI</text>
<rect class="b1" x="602" y="30" width="122" height="34" rx="7"/><text class="ts" x="663" y="47" text-anchor="middle" dominant-baseline="middle">CrewAI</text>
<rect class="bg" x="20" y="86" width="720" height="54" rx="10"/>
<text class="tb" x="36" y="106">编排运行时</text>
<rect class="b2" x="150" y="96" width="200" height="34" rx="7"/><text class="ts" x="250" y="113" text-anchor="middle" dominant-baseline="middle">LangGraph（状态图 · 检查点）</text>
<text class="ts" x="380" y="113" dominant-baseline="middle">负责显式状态、分支、暂停恢复与人工审批</text>
<rect class="bg" x="20" y="152" width="720" height="54" rx="10"/>
<text class="tb" x="36" y="172">组件与集成</text>
<rect class="b3" x="150" y="162" width="150" height="34" rx="7"/><text class="ts" x="225" y="179" text-anchor="middle" dominant-baseline="middle">LangChain 集成包</text>
<rect class="b3" x="312" y="162" width="150" height="34" rx="7"/><text class="ts" x="387" y="179" text-anchor="middle" dominant-baseline="middle">LlamaIndex 检索</text>
<text class="ts" x="480" y="179" dominant-baseline="middle">模型适配 · 文档加载 · 向量库 · 工具集</text>
<rect class="bg" x="20" y="218" width="720" height="48" rx="10"/>
<text class="tb" x="36" y="238">模型层</text>
<text class="ts" x="150" y="238" dominant-baseline="middle">各厂商原生 SDK：发请求 · 收响应 · 处理工具调用报文</text>
</svg>
<figcaption>图 1：上层依赖下层，但你可以从最底层直接开始</figcaption>
</figure>

## 二、各管一层

| 名字 | 本质 | 适合 | 不适合 |
| --- | --- | --- | --- |
| **模型厂商原生 SDK** | 发请求、收响应、处理工具调用报文 | 学习原理、极简任务 | 流程复杂后样板代码爆炸 |
| **LangChain** | 组件与集成库，并提供高层 Agent 封装 | 需要大量现成集成 | 只想写十行代码时 |
| **LangGraph** | 底层**状态图编排运行时**：节点、边、检查点、中断 | 长流程、暂停恢复、人工审批 | 简单一问一答 |
| **LlamaIndex** | 以**检索 / RAG** 为中心的文档索引与查询 | 知识库问答为主 | 与检索无关的任务 |
| **Pydantic AI** | 类型安全的轻量 Agent 库 | 重视类型检查与可测试性的工程 | 需要庞大集成生态 |
| **OpenAI Agents SDK** | 轻量原语：Agent、handoff、guardrail、tracing | 已深度使用 OpenAI、追求快速上手 | 强要求多厂商可移植 |
| **CrewAI / AutoGen** | 多智能体角色协作 | 探索多角色分工 | 单 Agent 就能搞定的任务 |

> [!TIP] 一条经验法则
> **能用一个循环解决的，别上图；需要暂停、回放、人工确认时，才上 LangGraph。** 大多数看起来需要多 Agent 的任务，其实是一个工具设计良好的单 Agent。

## 三、按两个问题选型

| 问题 | 答案 | 建议 |
| --- | --- | --- |
| 控制流有多复杂？ | 单个循环、几步就结束 | 裸 SDK 或 Pydantic AI / OpenAI Agents SDK |
| | 有分支、成环、长任务、要人工审批 | [LangGraph](#/python/langgraph) |
| 要不要跨厂商可移植？ | 不在意，深度绑定一家 | 该厂商的 Agents SDK 最省事 |
| | 在意，未来可能换模型 | 模型无关的库 + 统一适配层 |
| 任务以什么为主？ | 查文档、知识库 | LlamaIndex 或自己搭检索 |
| | 调接口、执行动作 | 工具调用 + 循环即可 |

**别在挑框架上花一周**：先用 [不用框架的最小 Agent 循环](#/python/minimal-loop) 把原理跑通，再按上面两个问题做选择，依据会清楚得多。

## 四、环境与依赖

```bash
# 概念示意：每个项目独立虚拟环境
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install <按所选框架>
```

- 依赖锁定到文件中，保证评测和复现时环境一致。
- API Key 放环境变量，不写进 notebook、脚本或仓库。
- Jupyter 适合探索，但正式代码建议放进模块，方便测试与版本管理。

## 常见坑

> [!WARNING] 五个高频问题
> - **先挑框架后写循环**：遇到问题分不清是框架还是原理。
> - **把 LangChain 和 LangGraph 当二选一**：一个是组件与高层封装，一个是底层编排运行时，常一起用。
> - **一个服务混用两个 Agent 框架**：概念、状态、追踪各自一套，排查成本翻倍。
> - **为简单任务上图**：节点、边、reducer 的学习成本超过了收益。
> - **只看星标选型**：框架流行度不等于和自己任务的契合度。

## 自测题

> [!QUESTION] LangChain 与 LangGraph 的分工是什么？
> LangGraph 是底层状态图运行时，负责显式状态、分支、检查点与中断；LangChain 提供组件集成，并在此之上提供 `create_agent` 这类高层封装。

> [!QUESTION] 什么时候根本不需要框架？
> 任务只是一个循环加少量工具、流程可预判时，裸 SDK 更直接、依赖更少、也更容易排查。

> [!QUESTION] 为什么建议先手写一次最小循环？
> 因为所有框架都在包装同一条「问模型 → 调工具 → 回填 → 再问」的循环；理解它之后，才知道框架替你省了什么。

> [!QUESTION] LlamaIndex 适合什么任务？
> 以文档索引、检索、知识库问答为主的任务；若核心是调接口执行动作，用工具调用与循环更合适。
