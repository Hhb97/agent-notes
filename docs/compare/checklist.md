---
level: 基础
tags: [选型, 上线检查清单, 团队, 成本控制, 人工确认, 回归评测]
summary: 用一棵简单的决策树回答「该选哪条栈、要不要上框架」，并给出一份按循环、工具、上下文、观测、配置分组的上线前检查清单。
---

# 选型与上线检查清单

> [!ABSTRACT] 一句话版本
> - 选型先答两问：**控制流有多复杂？是否必须跨厂商可移植？** 再考虑团队已有技术栈。
> - 已有 Spring Boot 服务 → Spring AI；脚本 / 研究 / 快速原型 → Python；两边都要 → 用 [概念映射表](#/compare/mapping) 对齐。
> - 上线检查分五组：**循环与预算、工具与权限、上下文与检索、观测与评测、密钥与配置**。
> - 最容易被漏掉的三项：最大轮次与预算上限、工具内部的鉴权、固定评测集里的反例。

## 一、选型决策树

<figure class="fig">
<svg viewBox="0 0 760 270" class="dg" role="img" aria-label="Agent 技术栈选型决策树：按团队技术栈、控制流复杂度与可移植性要求分支">
<rect class="b1" x="280" y="20" width="200" height="44" rx="10"/>
<text class="tb" x="380" y="42" text-anchor="middle" dominant-baseline="middle">团队已有技术栈？</text>
<rect class="b2" x="20" y="100" width="200" height="54" rx="10"/>
<text class="tb" x="120" y="120" text-anchor="middle" dominant-baseline="middle">Spring Boot 服务</text>
<text class="ts" x="120" y="142" text-anchor="middle">→ Spring AI 起步</text>
<rect class="b5" x="540" y="100" width="200" height="54" rx="10"/>
<text class="tb" x="640" y="120" text-anchor="middle" dominant-baseline="middle">Python / 脚本</text>
<text class="ts" x="640" y="142" text-anchor="middle">→ 最小循环起步</text>
<rect class="b3" x="280" y="100" width="200" height="54" rx="10"/>
<text class="tb" x="380" y="120" text-anchor="middle" dominant-baseline="middle">两边都有 / 新项目</text>
<text class="ts" x="380" y="142" text-anchor="middle">按可移植性与运维定</text>
<rect class="bg" x="20" y="188" width="720" height="64" rx="10"/>
<text class="tb" x="380" y="210" text-anchor="middle" dominant-baseline="middle">第二问：需要显式状态、暂停恢复、人工审批吗？</text>
<text class="ts" x="380" y="234" text-anchor="middle">需要 → 上图编排（LangGraph 等）　不需要 → 单个循环 + 少量工具即可</text>
<line class="l" x1="330" y1="64" x2="120" y2="100" marker-end="url(#arr)"/>
<line class="l" x1="380" y1="64" x2="380" y2="100" marker-end="url(#arr)"/>
<line class="l" x1="430" y1="64" x2="640" y2="100" marker-end="url(#arr)"/>
<line class="l" x1="380" y1="154" x2="380" y2="188" marker-end="url(#arr)"/>
</svg>
<figcaption>图 1：先定栈，再定要不要编排框架；顺序反了容易过度设计</figcaption>
</figure>

## 二、按场景选型

| 场景 | 建议 | 理由 |
| --- | --- | --- |
| 已有 Spring Boot 服务，要加问答 / 检索 | [Spring AI](#/springai/overview) | 复用现有鉴权、配置、观测与部署体系 |
| 个人脚本、验证想法、教学 | [Python 最小循环](#/python/minimal-loop) | 依赖最少，最能看清原理 |
| 知识库 / 文档问答为主 | LlamaIndex 或自建检索流水线 | 检索是主体，见 [RAG 原理](#/basic/context-rag) |
| 长流程、要审批、要崩溃恢复 | [LangGraph](#/python/langgraph) 一类状态图 | 显式状态与检查点 |
| 深度绑定某模型厂商 | 该厂商 Agents SDK | 集成最紧、上手最快，代价是可移植性 |
| 强要求未来换模型 | 模型无关的抽象 + 统一适配层 | 把可移植性当一等约束 |
| 任务步骤可预先写死 | **不用 Agent**：普通代码 + 一次模型调用 | Agent 的成本与不确定性不值得 |

> [!TIP] 一句实在话
> **框架不是最大的账单，模型调用才是。** 多 Agent、无限循环、重复检索会悄悄把 token 成本翻倍；先把预算上限和日志加上，再谈优化提示词。

## 三、上线前检查清单

**① 循环与预算**

- [ ] 有最大轮次、最大耗时、单次预算上限
- [ ] 超限时有明确行为：报错 / 转人工 / 返回「未完成」，而不是静默继续
- [ ] 工具失败被显式标记，可重试的错误才重试

**② 工具与权限**

- [ ] 工具描述清楚「什么时候用我」「参数是什么」
- [ ] 鉴权基于当前登录身份，不信任模型传来的 user_id
- [ ] 写操作有幂等键或人工确认
- [ ] 外部返回内容按不可信数据处理（提示注入）
- [ ] 工具返回值精简，不把整张表 / 整份报文塞进上下文

**③ 上下文与检索**

- [ ] 会话按 ID 隔离，历史过长会裁剪或摘要
- [ ] 文档更新后索引会重建
- [ ] 提示词明确「仅依据给定资料，不足时说明不知道」
- [ ] 实时数据走工具接口，不走 RAG
- [ ] 输出用类型化结构，不手工解析字符串

**④ 观测与评测**

- [ ] 每次运行有唯一 ID 与结构化日志
- [ ] 记录每步工具名、参数摘要、耗时、token、失败原因
- [ ] 日志与追踪做过脱敏
- [ ] 有固定的评测用例集，含**反例**（越权、危险动作、资料不足）
- [ ] 改动提示词 / 模型 / 工具后会重跑评测

**⑤ 密钥与配置**

- [ ] API Key 只在环境变量或密钥管理服务
- [ ] 代码、notebook、日志、截图里都没有真实密钥
- [ ] 依赖版本锁定（BOM / 依赖文件）
- [ ] AI 调用的超时、重试、线程池与业务接口分开配置

## 四、学习路线收尾

1. 回头看 [学习大纲与路线](#/start/outline)，确认每个自测题都能用自己的话答出来。
2. 选一条栈，照官方文档跑一次 Quickstart —— 笔记负责地图，官方文档负责准确 API。
3. 从最小可用开始：一次问答 → 一个工具 → 记忆 → 检索 → 评测。**每步只加一个变量。**
4. 想加第二个框架、第二个 Agent 之前，先问「现在的瓶颈真的是编排吗」。

## 常见坑

> [!WARNING] 三个最常见的上线事故
> - **没有预算与轮次上限**：一次误判导致循环打转、账单失控。
> - **鉴权只写在提示词里**：模型被注入内容带偏后就绕过了「约束」。
> - **评测集只有正例**：危险动作与越权调用这类回归完全没被发现。

## 自测题

> [!QUESTION] 选型时最先要回答的两个问题是什么？
> 控制流有多复杂（决定要不要显式编排），以及是否必须跨厂商可移植（决定要不要模型无关抽象）；之后才看团队已有栈。

> [!QUESTION] 什么情况下正确选择是「不用 Agent」？
> 步骤可预先写死、只需文本改写 / 抽取 / 分类、对延迟成本极敏感、或动作不可逆且无法加人工确认时。

> [!QUESTION] 上线清单里为什么强调评测集要有反例？
> 正例只能验证「能答对」，反例才能发现越权调用、危险动作、资料不足时编造这类安全回归。

> [!QUESTION] 为什么说框架不是最大的成本？
> 主要开销来自模型调用本身；多 Agent、无限循环、重复检索会成倍放大 token 消耗，所以预算上限与日志比换框架更优先。
