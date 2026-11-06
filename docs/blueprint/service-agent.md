---
level: 深入
tags: [项目架构, 智能客服, 意图路由, 转人工, 工单, 知识权限, 质检, CSAT]
summary: 智能客服 Agent 的完整可落地架构：渠道与会话、意图路由前置、知识与工具双路、拒答与转人工触发、质检与工单闭环，含工程目录、数据模型、接口契约、容量估算与验收清单。
---

# 智能客服 Agent 项目架构

> [!ABSTRACT] 一句话版本
> - 客服 Agent 的核心不是「答得漂亮」，而是**该答的答对、不该答的拒答、答不了的快速转人工**。
> - 架构关键：**意图路由前置**（分流闲聊 / FAQ / 查询 / 投诉 / 越权）、**知识与工具双路**（静态知识走检索、实时数据走工具）、**转人工是一等状态**而不是异常分支。
> - 权限按会话身份下推到检索前，订单 / 账户类查询只能查当前用户自己的数据。
> - 指标看**自助解决率、转人工率、误答率、首响 P95、CSAT**，安全反例（越权查他人订单）必须 0 例外。

## 一、场景与指标

| 需求 | 约束 |
| --- | --- |
| 多渠道（网页 / App / 工单）统一会话 | 会话状态跨渠道一致 |
| 回答制度、产品、活动类问题 | 知识随版本更新，需引用可追溯 |
| 查订单、物流、账户状态 | 实时数据走工具，且只能查本人 |
| 复杂 / 情绪化 / 高风险问题 | 及时转人工，带上完整上下文 |
| 服务质量可运营 | 质检、回访、知识缺口回流 |

| 指标 | 目标形态 |
| --- | --- |
| 自助解决率 | 会话中未转人工且用户确认解决的比例 |
| 转人工率 / 转人工时延 | 越低越好，但不能靠「硬答」压低 |
| 误答率 | 抽检中事实错误的比例 |
| 首响 P95 / 完整回答 P95 | 秒级 |
| CSAT | 会话结束回访 |
| 越权命中 / 隐私泄漏 | **0** |

## 二、逻辑架构

<figure class="fig">
<svg viewBox="0 0 760 330" class="dg" role="img" aria-label="智能客服 Agent 架构：渠道接入、会话管理、意图路由、知识检索与业务工具双路、生成与质检、转人工与工单闭环">
<rect class="b1" x="20" y="40" width="110" height="44" rx="8"/><text class="ts" x="75" y="62" text-anchor="middle" dominant-baseline="middle">渠道接入</text>
<rect class="b2" x="146" y="40" width="110" height="44" rx="8"/><text class="ts" x="201" y="62" text-anchor="middle" dominant-baseline="middle">会话与身份</text>
<rect class="b3" x="272" y="40" width="130" height="44" rx="8"/><text class="ts" x="337" y="62" text-anchor="middle" dominant-baseline="middle">意图路由（前置）</text>
<rect class="b2" x="418" y="20" width="150" height="40" rx="8"/><text class="ts" x="493" y="40" text-anchor="middle" dominant-baseline="middle">知识检索（权限过滤）</text>
<rect class="b2" x="418" y="72" width="150" height="40" rx="8"/><text class="ts" x="493" y="92" text-anchor="middle" dominant-baseline="middle">业务工具（本人数据）</text>
<rect class="b4" x="584" y="40" width="156" height="72" rx="9"/><text class="ts" x="662" y="66" text-anchor="middle" dominant-baseline="middle">生成 + 引用校验</text><text class="ts" x="662" y="92" text-anchor="middle">输出护栏 / 脱敏</text>
<line class="l" x1="130" y1="62" x2="146" y2="62" marker-end="url(#arr)"/>
<line class="l" x1="256" y1="62" x2="272" y2="62" marker-end="url(#arr)"/>
<line class="l" x1="402" y1="52" x2="418" y2="40" marker-end="url(#arr)"/>
<line class="l" x1="402" y1="72" x2="418" y2="92" marker-end="url(#arr)"/>
<line class="l" x1="568" y1="40" x2="584" y2="62" marker-end="url(#arr)"/>
<line class="l" x1="568" y1="92" x2="584" y2="88" marker-end="url(#arr)"/>
<rect class="b5" x="20" y="140" width="230" height="48" rx="9"/><text class="ts" x="135" y="164" text-anchor="middle" dominant-baseline="middle">转人工（携带完整上下文摘要）</text>
<rect class="b5" x="266" y="140" width="230" height="48" rx="9"/><text class="ts" x="381" y="164" text-anchor="middle" dominant-baseline="middle">工单闭环（创建 / 追问 / 回访）</text>
<rect class="b5" x="512" y="140" width="228" height="48" rx="9"/><text class="ts" x="626" y="164" text-anchor="middle" dominant-baseline="middle">质检与知识缺口回流</text>
<line class="l" x1="662" y1="112" x2="662" y2="140" marker-end="url(#arr)"/>
<line class="l" x1="337" y1="84" x2="135" y2="140" marker-end="url(#arr)"/>
<rect class="bg" x="20" y="210" width="720" height="100" rx="10"/>
<text class="tb" x="36" y="232">数据与治理</text>
<text class="ts" x="36" y="256">Conversation / Message / Ticket / KBArticle / RoutingRule / Satisfaction / Audit</text>
<text class="ts" x="36" y="280">会话按 user_id + channel 隔离 · 检索权限下推 · 每次回答挂 run_id · 预算与轮次上限</text>
<text class="ts" x="36" y="300">评测：自助解决率 · 误答率 · 转人工触发正确率 · 越权反例 0 例外</text>
</svg>
<figcaption>图 1：路由、双路取数与转人工三处决定客服系统的实际体验</figcaption>
</figure>

## 三、工程模块目录

```text
service-agent/
├── channels/             # Web/App/工单适配器，统一消息格式与身份映射
├── conversation/         # 会话状态、多轮指代、历史压缩、渠道一致性
├── router/               # 意图分类（规则 + 小模型）、路由表、置信度与兜底
├── knowledge/            # KB 检索、权限过滤、引用校验、知识缺口记录
├── tools/                # 订单/物流/账户只读工具，参数与权限白名单
├── generation/           # 提示词版本、生成、拒答策略、输出护栏
├── handoff/              # 转人工触发、上下文摘要、坐席工作台接口
├── ticket/               # 工单创建、状态同步、回访
├── qa/                   # 抽检、误答标注、CSAT、坏例回流评测集
├── storage/              # 表结构与仓储
└── config/               # 路由规则、提示词、SLA 阈值、知识版本
```

## 四、数据模型

```text
Conversation(conversation_id PK, tenant_id, user_id, channel, status,
             current_intent, handoff_reason, created_at, closed_at)
Message(message_id PK, conversation_id, role, content_digest, citation_ids,
        tool_call_ids, run_id, created_at)
Ticket(ticket_id PK, conversation_id, category, priority, assignee, status,
       sla_deadline, created_at)
KBArticle(article_id PK, tenant_id, title, dept, level, version,
          effective_from, effective_to, chunk_refs)
RoutingRule(rule_id PK, tenant_id, intent, condition_json, target, priority)
Satisfaction(conversation_id, score, feedback, created_at)
Audit(run_id, actor, action, target, params_digest, created_at)
```

| 设计点 | 理由 |
| --- | --- |
| `Message.content_digest` + 受控原文存储 | 便于审计又控制敏感信息扩散 |
| `citation_ids` | 答案可回溯到知识片段，防编造出处 |
| `KBArticle.level / effective_*` | 权限过滤与过期知识拦截，见 [企业知识库助手架构](#/deep/case-kb-agent) |
| `RoutingRule` 可配置 | 路由调整不改代码，且能灰度 |

## 五、接口契约

```text
POST /v1/conversations/{id}/messages
  { content, channel, user_asserted_id? }        # 身份只从会话取，不信任入参
  -> { reply, citations[], intent, confidence, action: answer|clarify|refuse|handoff }

POST /v1/conversations/{id}/handoff
  { reason, summary, recent_messages, suggested_ticket_category } -> { ticket_id, queue }

GET  /v1/conversations/{id}/context            # 坐席工作台：完整上下文摘要
POST /v1/qa/feedback                          # 误答标注 / CSAT → 坏例回流

# 工具契约（示例）
queryMyOrder(orderId, userIdFromSession) -> { status, updatedAt } | NOT_FOUND | FORBIDDEN
searchKB(query, deptFilter, levelFilter) -> [{ chunk_id, text, article_id, score }]
```

> [!CAUTION] 身份只从会话取
> 工具参数里出现「用户 ID」时，必须忽略模型传入值，改用会话身份重新注入；否则一次提示注入就能查到他人订单，见 [工具执行、沙箱与外部集成](#/tools/sandbox-integration)。

## 六、关键设计决策

| 决策 | 选择 | 理由 |
| --- | --- | --- |
| 路由位置 | 入口前置，规则 + 小模型 | 闲聊 / 越权 / 简单 FAQ 不进主 Agent，省成本降风险，见 [模型选型与关键参数](#/llm/model-selection) |
| 静态知识 vs 实时数据 | 检索 / 工具双路 | 制度用 RAG，订单状态用接口，见 [上下文、记忆与 RAG](#/basic/context-rag) |
| 低置信度怎么办 | 澄清或拒答，不硬答 | 提示词明确「资料不足说明不知道」+ 拒答评测用例 |
| 转人工触发 | 一等状态 + 显式条件 | 置信度低、连续 2 轮未解决、用户明确要求、投诉/高风险、越权请求 |
| 多轮上下文 | 摘要 + 结构化槽位 | 转人工时坐席只接摘要与槽位，不接整段原始日志 |
| 输出 | 引用校验 + 脱敏 | 防止编造出处与泄漏，见 [结构化输出与护栏](#/llm/structured-output-guardrails) |

**转人工触发条件要可配置且可评测**：过松会让自助解决率失去意义，过严会让用户在错误答案里打转。把「触发正确率」纳入评测集。

## 七、容量与降级

```text
峰值 50 并发会话，平均 1.8 轮，路由命中「简单 FAQ」约 40%（不进主模型）
→ 主模型请求 ≈ 50 × 1.8 × 0.6 ≈ 54 次/轮次窗口
→ 按单账号配额与 P95 延迟反推并发度；知识检索按租户缓存热门问题
```

| 故障 | 降级 |
| --- | --- |
| 模型不可用 | 返回 FAQ 精确匹配答案 / 直接转人工，并明确标注 |
| 知识检索异常 | 不依据资料硬答，改为「暂无法查询资料」或转人工 |
| 业务工具超时 | 明确告知暂无法查询，提供工单入口 |
| 路由服务异常 | 保守走「转人工」，不要默认放行到主 Agent |
| 队列积压 | 优先保障转人工链路，自助回答可排队 |

## 八、分阶段实施与验收

| 阶段 | 范围 | 退出条件 |
| --- | --- | --- |
| P0 | 单渠道 + 意图路由 + FAQ 检索 + 拒答 | 固定用例集正确率达标，越权反例 0 |
| P1 | 业务只读工具 + 引用校验 + 输出护栏 | 本人数据查询正确，越权拦截 100% |
| P2 | 转人工 + 工单 + 坐席上下文 | 转人工触发正确率达标，坐席可用 |
| P3 | 质检、CSAT、坏例回流、灰度 | 自助解决率与 CSAT 达到目标，可回滚 |

**验收清单**：越权 / 隐私 / 注入反例 0 例外 · 引用可追溯率达标 · 转人工不丢上下文 · 知识更新后旧版本不再被检索 · 故障降级逐项演练 · 成本与 P95 符合 SLO。

## 常见坑

1. **所有请求都进主 Agent**：闲聊、查单号、越权请求也跑一遍循环，成本高且风险大；路由必须前置且可单独灰度。
2. **转人工不是一等状态**：只做成「发个通知」，会话状态、上下文交接、排队与回访全丢，用户体验比没有更差。
3. **工具直接写业务系统且无幂等**：模型重试一次就重复开工单；写操作必须带幂等键并落审计。
4. **只看答案准确率**：不看转人工率、首响时长、误拦截率，最后上线「答得挺准但没人用」。
5. **知识库与工单两套口径**：客服答的和工单里写的不一致，用户一对比就失去信任。

## 自测题

> [!QUESTION] 为什么意图路由必须前置？
> 闲聊、简单 FAQ、越权与高风险请求不需要主 Agent，前置分流能显著降低成本与风险，也让路由规则可独立灰度和评测。

> [!QUESTION] 为什么「转人工」要设计成一等状态？
> 它是客服流程的正常终点之一，需要携带上下文摘要、原因、工单与 SLA；当成异常分支处理会丢上下文、无法统计也无法优化触发条件。

> [!QUESTION] 工具参数里的用户 ID 为什么必须忽略？
> 模型参数不可信，可能被提示注入诱导；身份应从当前会话注入并重新鉴权，否则可查询他人订单。

> [!QUESTION] 为什么要把「触发正确率」单独评测？
> 转人工过松会让自助解决率虚高失去意义，过严会让用户困在错误答案里；只有单独评测才能同时守住体验与质量。
