---
level: 进阶
tags: [可观测性, trace, span, 指标, 日志, 成本归因, 脱敏, OpenTelemetry]
summary: 把日志、指标、链路三支柱落到 Agent 场景：以 run_id 串起一次任务的 span 树，列出必须埋点的字段与关键指标，并说明成本归因与脱敏要求。
---

# 可观测性：链路、指标与成本归因

> [!ABSTRACT] 一句话版本
> - Agent 的一次任务跨多轮模型调用、多个工具、多次检索，排障的前提是**用同一个 run_id 把所有步骤串成一条链**。
> - 日志记「发生了什么」，指标看「整体是否健康」，链路（trace / span）回答「耗时花在哪一步、哪一步开始跑偏」。
> - 必须埋点的字段：轮次、模型档位、工具名与参数摘要、检索命中 ID、token 与耗时、错误类型、审批结果。
> - **成本要能归因**到业务 / 用户 / 模型档位；同时所有埋点都要脱敏，不能把提示词原文和密钥写进去。

## 一、一次 run 的 span 树

<figure class="fig">
<svg viewBox="0 0 760 235" class="dg" role="img" aria-label="一次 Agent 运行的 span 树：run 下分为上下文装配、模型调用、工具执行、检索、输出校验等子 span">
<rect class="b1" x="20" y="20" width="720" height="40" rx="9"/>
<text class="tb" x="380" y="40" text-anchor="middle" dominant-baseline="middle">run_id = run-1024（用户 / 租户 / 任务类型 / 总预算 / 最终结果）</text>
<rect class="b2" x="20" y="76" width="130" height="46" rx="8"/><text class="ts" x="85" y="99" text-anchor="middle" dominant-baseline="middle">step 1 · 装配</text>
<rect class="b3" x="164" y="76" width="130" height="46" rx="8"/><text class="ts" x="229" y="99" text-anchor="middle" dominant-baseline="middle">step 1 · 模型</text>
<rect class="b4" x="308" y="76" width="130" height="46" rx="8"/><text class="ts" x="373" y="99" text-anchor="middle" dominant-baseline="middle">step 1 · 工具</text>
<rect class="b2" x="452" y="76" width="130" height="46" rx="8"/><text class="ts" x="517" y="99" text-anchor="middle" dominant-baseline="middle">step 2 · 模型</text>
<rect class="b5" x="596" y="76" width="144" height="46" rx="8"/><text class="ts" x="668" y="99" text-anchor="middle" dominant-baseline="middle">输出校验 / 返回</text>
<line class="l" x1="150" y1="99" x2="164" y2="99" marker-end="url(#arr)"/>
<line class="l" x1="294" y1="99" x2="308" y2="99" marker-end="url(#arr)"/>
<line class="l" x1="438" y1="99" x2="452" y2="99" marker-end="url(#arr)"/>
<line class="l" x1="582" y1="99" x2="596" y2="99" marker-end="url(#arr)"/>
<rect class="bg" x="20" y="142" width="720" height="70" rx="10"/>
<text class="t" x="380" y="162" text-anchor="middle" dominant-baseline="middle">每个 span：开始/结束时间 · 输入摘要 · 输出摘要 · token · 状态 · 错误类型</text>
<text class="ts" x="380" y="186" text-anchor="middle">检索 span 额外记命中 chunk_id 与分数；工具 span 额外记工具名与参数摘要</text>
<text class="ts" x="380" y="204" text-anchor="middle">所有 span 共享 run_id，可回放整次任务</text>
</svg>
<figcaption>图 1：span 树让「哪一步开始跑偏」变成可查询的问题</figcaption>
</figure>

## 二、三支柱在 Agent 里的具体化

| 支柱 | 记什么 | 回答问题 |
| --- | --- | --- |
| **日志** | 结构化事件：每轮模型输出摘要、工具调用与结果、检索命中、审批结果 | 「这次到底发生了什么」 |
| **指标** | 成功率、轮次分布、P95 延迟、token、工具失败率、预算熔断次数 | 「整体健康吗、有没有趋势变化」 |
| **链路** | run → step → model / tool / retrieval / validation 的 span 树 | 「慢在哪、错在哪一步」 |

**OpenTelemetry 是通用底座**：多数框架自带 tracing 或可导出 OTel；接入统一后端后，模型、工具、检索能画在同一条链上，见 [生产级 Agent 架构全景](#/deep/agent-architecture)。

> [!TIP] 学习期的最小可用观测
> 不必一上来搭平台。先做两件事：① 打印实际发出的请求；② 给每次运行一个 ID，按顺序记录每轮的工具名、结果摘要与耗时。已经能解决大部分调试问题，见 [本地开发与调试](#/engineering/local-dev-debug)。

## 三、必须埋点的字段

| 类别 | 字段 |
| --- | --- |
| 身份与归因 | run_id、user_id（脱敏）、tenant_id、业务线、任务类型 |
| 模型 | 模型档位、提示词版本、温度等参数、输入/输出 token、耗时、是否流式 |
| 工具 | 工具名、参数摘要、执行状态、耗时、是否重试、是否幂等命中 |
| 检索 | 查询改写结果、命中 chunk_id 与分数、Top-K、是否触发权限过滤 |
| 流程 | 轮次、是否触发停止条件 / 预算上限、审批结果与等待时长 |
| 结果 | 结构化输出是否校验通过、是否拒答、最终状态 |
| 错误 | 错误类型（可恢复 / 不可恢复 / 安全拦截）、降级路径 |

## 四、成本归因

| 维度 | 用途 |
| --- | --- |
| 按业务线 / 功能 | 判断哪个场景值得优化 |
| 按用户 / 租户 | 配额、异常检测与计费 |
| 按模型档位 | 验证分级路由是否划算，见 [模型选型与关键参数](#/llm/model-selection) |
| 按轮次 / 工具 | 定位「循环打转」与重复检索 |
| 按失败重试 | 把无效重试的成本单独算出来 |

> [!WARNING] 成本突增通常是行为异常
> 账单突然上涨，先看轮次分布、工具调用次数与多智能体委派链，而不是先怀疑单价，见 [可靠性、成本与评测门禁](#/deep/reliability-eval)。

## 五、脱敏与保留

| 风险 | 处理 |
| --- | --- |
| 提示词原文含个人信息 / 内部资料 | 只记摘要与长度，不记全文；需要全文时用受控的调试开关 |
| 工具参数含密钥、身份证、手机号 | 字段级脱敏或只记参数名与类型 |
| 模型输出含敏感内容 | 采样存储并按保留策略过期 |
| 链路数据外传到第三方 | 确认数据去向与合规要求，默认关闭不必要上报 |
| 日志保留过久 | 设定保留期与访问权限，支持按用户删除 |

## 常见坑

1. **没有统一 run_id**：出事时无法把模型、工具、检索串起来。
2. **只记最终答案**：过程回归与行为异常完全看不见。
3. **只埋技术指标不埋成本**：无法定位账单异常。
4. **日志里打印完整提示词与密钥**：观测变成泄漏源。
5. **默认 tracing 未审计**：数据悄悄上传到第三方。
6. **只看平均延迟**：长尾与长任务被掩盖，应看 P95 / P99。

## 自测题

> [!QUESTION] 为什么 Agent 观测必须以 run_id 为中心？
> 一次任务跨多轮模型调用、多个工具与检索，只有共享同一个 run_id 才能把各环节串成可回放的链路。

> [!QUESTION] 日志、指标、链路分别回答什么问题？
> 日志回答「发生了什么」，指标回答「整体是否健康」，链路回答「耗时与错误发生在哪一步」。

> [!QUESTION] 成本归因至少要做到哪几个维度？
> 业务线 / 功能、用户或租户、模型档位、轮次与工具调用、失败重试；缺了这些就无法判断优化重点。

> [!QUESTION] 观测埋点为什么要默认脱敏？
> 提示词、工具参数与模型输出常含个人信息和内部资料；只记摘要与长度，并对采样数据设保留期与访问权限。
