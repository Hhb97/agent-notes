---
level: 深入
tags: [项目架构, 长任务, 研究 Agent, 任务分解, 子 Agent 隔离, 证据库, 断点续跑, 产物版本]
summary: 长任务研究 Agent 的完整可落地架构：任务队列与规划、子任务并行与上下文隔离、证据库与引用校验、检查点续跑、预算配额与产物版本，含工程目录、数据模型、契约、容量与验收清单。
---

# 长任务研究 Agent 项目架构

> [!ABSTRACT] 一句话版本
> - 研究型 Agent 的难点不是生成，而是**长时间运行中的状态、证据与成本**：任务要能跑几十分钟、崩了能续、每个结论能追溯。
> - 架构主线：**提交 → 规划分解 → 子任务并行（独立上下文）→ 证据入库 → 汇总写作 → 引用校验 → 产物落盘**，全程事件日志 + 周期检查点。
> - 高噪声的检索 / 抓取交给**子任务隔离**，主链路只看结构化证据摘要，避免上下文被原始网页淹没，见 [多智能体架构与隔离](#/deep/multi-agent)。
> - 证据库是核心资产：`evidence_id → 来源 / 原文片段 / 时间 / 可信度`，没有它，「报告写得很完整」等于「编得很完整」。

## 一、场景与指标

| 需求 | 约束 |
| --- | --- |
| 多来源调研并产出带引用的报告 | 每个结论挂 evidence_id |
| 任务耗时分钟～小时 | 不能用 HTTP 超时兜底，必须可恢复 |
| 中途失败 / 进程重启 | 从检查点续跑，不重复扣费 |
| 预算可控 | 总预算 + 子任务配额 + 熔断 |
| 结果可复核、可导出 | 产物版本化、可回放 |

| 指标 | 说明 |
| --- | --- |
| 任务完成率 / 恢复成功率 | 故障注入后能否续跑 |
| 依据可追溯率 | 结论挂有效 evidence_id 的比例 |
| 重复执行率 | 恢复后是否重复抓取 / 重复调用 |
| P50 / P95 完成时长 | 与人工对比 |
| 单次任务成本 | 含子任务与重试 |

## 二、逻辑架构

<figure class="fig">
<svg viewBox="0 0 760 330" class="dg" role="img" aria-label="长任务研究 Agent 架构：提交入队、规划分解、子任务并行、证据库、汇总写作、引用校验、产物版本，以及检查点与预算治理">
<rect class="b1" x="20" y="40" width="110" height="44" rx="8"/><text class="ts" x="75" y="62" text-anchor="middle" dominant-baseline="middle">提交任务</text>
<rect class="b2" x="146" y="40" width="110" height="44" rx="8"/><text class="ts" x="201" y="62" text-anchor="middle" dominant-baseline="middle">队列 / 租约</text>
<rect class="b3" x="272" y="40" width="120" height="44" rx="8"/><text class="ts" x="332" y="62" text-anchor="middle" dominant-baseline="middle">规划与分解</text>
<rect class="bg" x="408" y="24" width="332" height="76" rx="10"/>
<text class="tb" x="424" y="44">子任务并行（独立上下文 + 独立配额）</text>
<rect class="b2" x="424" y="54" width="94" height="34" rx="7"/><text class="ts" x="471" y="71" text-anchor="middle" dominant-baseline="middle">检索</text>
<rect class="b2" x="526" y="54" width="94" height="34" rx="7"/><text class="ts" x="573" y="71" text-anchor="middle" dominant-baseline="middle">抓取</text>
<rect class="b2" x="628" y="54" width="96" height="34" rx="7"/><text class="ts" x="676" y="71" text-anchor="middle" dominant-baseline="middle">抽取</text>
<line class="l" x1="130" y1="62" x2="146" y2="62" marker-end="url(#arr)"/>
<line class="l" x1="256" y1="62" x2="272" y2="62" marker-end="url(#arr)"/>
<line class="l" x1="392" y1="62" x2="408" y2="62" marker-end="url(#arr)"/>
<rect class="b4" x="20" y="130" width="180" height="46" rx="9"/><text class="ts" x="110" y="153" text-anchor="middle" dominant-baseline="middle">证据库（evidence_id）</text>
<rect class="b4" x="216" y="130" width="180" height="46" rx="9"/><text class="ts" x="306" y="153" text-anchor="middle" dominant-baseline="middle">检查点 / 事件日志</text>
<rect class="b5" x="412" y="130" width="160" height="46" rx="9"/><text class="ts" x="492" y="153" text-anchor="middle" dominant-baseline="middle">汇总写作</text>
<rect class="b5" x="588" y="130" width="152" height="46" rx="9"/><text class="ts" x="664" y="153" text-anchor="middle" dominant-baseline="middle">引用校验 / 产物</text>
<line class="l" x1="574" y1="100" x2="110" y2="130" marker-end="url(#arr)"/>
<line class="l" x1="200" y1="153" x2="216" y2="153" marker-end="url(#arr)"/>
<line class="l" x1="396" y1="153" x2="412" y2="153" marker-end="url(#arr)"/>
<line class="l" x1="572" y1="153" x2="588" y2="153" marker-end="url(#arr)"/>
<rect class="bg" x="20" y="200" width="720" height="52" rx="10"/>
<text class="t" x="380" y="220" text-anchor="middle" dominant-baseline="middle">断点续跑：加载最近快照 → 重放事件 → 已完成的子任务按幂等键跳过 → 继续未完成项</text>
<text class="ts" x="380" y="240">总预算 + 子任务配额 + 委派深度上限 + 循环检测</text>
<rect class="bg" x="20" y="264" width="720" height="52" rx="10"/>
<text class="t" x="380" y="284" text-anchor="middle" dominant-baseline="middle">产物：报告 Markdown / PDF · 证据清单 · 运行轨迹 · 成本明细 · 版本号</text>
<text class="ts" x="380" y="304">评测：完成率 · 依据可追溯率 · 恢复成功率 · P95 时长</text>
</svg>
<figcaption>图 1：证据库与检查点是长任务的两根支柱</figcaption>
</figure>

## 三、工程模块目录

```text
research-agent/
├── api/                  # 提交、查询状态、取消、下载产物、SSE 进度
├── planner/              # 任务分解、依赖图、可证伪的子问题、重规划
├── dispatcher/           # 队列、租约、并发上限、子任务配额、循环检测
├── subtasks/
│   ├── search/           # 查询改写、多路召回、去重
│   ├── fetch/            # 抓取、限流、robots 与来源白名单
│   └── extract/          # 结构化摘要、证据片段抽取、置信度
├── evidence/             # 证据库：去重、来源元数据、引用 ID、失效标记
├── writer/               # 大纲 → 分节写作 → 汇总，结论强制挂 evidence_id
├── verifier/             # 引用存在性与支持度校验、矛盾检测
├── durability/           # Event / Checkpoint / Idempotency / 恢复器
├── artifacts/            # 产物版本、对象存储、导出
├── governance/           # 预算、超时、审计、脱敏
└── eval/                 # 固定题目集、依据可追溯评测、故障注入
```

## 四、数据模型

```text
ResearchTask(task_id PK, run_id, tenant_id, user_id, question, status,
             plan_json, budget_json, usage_json, checkpoint_seq, created_at, deadline)
SubTask(subtask_id PK, task_id, parent_id, kind, query, status, budget_cap,
        attempt, idempotency_key, result_ref, created_at)
Evidence(evidence_id PK, task_id, source_uri, title, snippet, published_at,
         fetched_at, credibility, content_hash, superseded_by)
Claim(claim_id PK, task_id, section, text, evidence_ids[], verified, created_at)
Artifact(artifact_id PK, task_id, kind, uri, checksum, version, created_at)
Event(event_seq PK, run_id, step, type, payload_json, created_at)
Checkpoint(checkpoint_id PK, run_id, event_seq, state_json, version, created_at)
Idempotency(key PK, run_id, step, tool_call_id, status, result_ref, expires_at)
```

| 设计点 | 理由 |
| --- | --- |
| `Evidence.content_hash` | 同一来源重复抓取去重，避免重复计费 |
| `Claim.evidence_ids[]` | 结论与证据强绑定，是「依据可追溯率」的计算基础 |
| `SubTask.idempotency_key` | 恢复时跳过已完成子任务，避免重复抓取 |
| `Artifact.version` | 报告可迭代、可对比、可回滚 |
| `Event + Checkpoint` | 支持续跑与回放，见 [状态持久化与恢复语义](#/internals/durability) |

## 五、接口契约

```text
POST /v1/research
  { question, scope?, output_format?, budget? } -> { task_id, run_id, poll_url }
GET  /v1/research/{task_id}
  -> { status, phase, progress, usage, subtask_summary[], artifact_uri? }
POST /v1/research/{task_id}/cancel -> { status: CANCELLED }
GET  /v1/research/{task_id}/artifacts -> [{ artifact_id, version, uri }]
SSE  /v1/research/{task_id}/events -> plan_ready | subtask_done | writing | verifying | done | error

# 子任务返回契约（结构化，禁止回传整段原始网页）
{ subtask_id, status: OK|PARTIAL|FAILED, summary, evidence_ids[], confidence, cost }
```

> [!TIP] 返回契约决定主链路是否干净
> 子任务只回传摘要 + 证据 ID + 置信度，主 Agent 的上下文才不会被原始网页塞满；需要原文时按 evidence_id 按需取，见 [上下文工程深入](#/deep/context-engineering)。

## 六、关键设计决策

| 决策 | 选择 | 理由 |
| --- | --- | --- |
| 任务形态 | 全程异步 + 队列 + worker | 分钟～小时级，不能用同步请求 |
| 规划 | 显式子任务图，可重规划 | 便于限并发、按子任务设预算、定位卡住的步骤 |
| 上下文 | 子任务隔离 + 证据库外置 | 高噪声抓取不污染主链路 |
| 恢复 | 事件日志 + 周期快照 + 幂等跳过 | 崩溃后不重跑已完成的抓取，见 [循环的状态机本质](#/internals/loop-state-machine) |
| 可信度 | 结论强制挂 evidence_id + 生成后校验 | 防止编造引用，见 [企业知识库助手架构](#/deep/case-kb-agent) |
| 预算 | 总预算 + 子任务 cap + 委派深度上限 | 防止子任务互相派生导致成本失控 |
| 取消 | 取消令牌沿队列与抓取链路传播 | 用户取消后不再产生新费用 |

**重规划要有上限**：子任务失败或证据不足时允许调整计划，但最多 1～2 次，否则会在「再搜一遍」里耗尽预算。

## 七、容量与降级

```text
日均 300 个研究任务，平均 12 个子任务，每个子任务 1～2 次模型调用
→ 日均模型调用 ≈ 300 × 12 × 1.5 ≈ 5400 次
→ 峰值在途任务 = QPS × 平均时长（按 10 分钟估算）→ 决定 worker 数
→ 证据库写入按子任务数 × 平均证据条数估算；对象存储按报告版本数估算
→ 预算按「单任务 token 上限 × 日均任务数」设硬熔断，并留重试冗余
```

| 故障 | 降级 |
| --- | --- |
| 某个来源抓取失败 | 标 PARTIAL，报告注明证据不足，不编造 |
| 子任务反复失败 | 达到 attempt 上限即跳过并标注缺口 |
| worker 崩溃 | 租约超时后由其他 worker 从检查点接管 |
| 模型限流 | 子任务排队 + 退避，优先完成已有证据的汇总 |
| 预算触顶 | 停止新子任务，用现有证据产出「不完整报告」并明确标注 |

## 八、分阶段实施与验收

| 阶段 | 范围 | 退出条件 |
| --- | --- | --- |
| P0 | 同步简化版：规划 → 检索 → 写作 → 引用校验 | 依据可追溯率达标，固定题目集可用 |
| P1 | 队列 + worker + 事件日志 + 检查点 | 故障注入后恢复成功率达标 |
| P2 | 子任务并行、证据库、预算与配额 | 重复执行率接近 0，成本符合预算 |
| P3 | 产物版本、重规划、评测门禁、灰度 | P95 时长与完成率达标，可回滚 |

**验收清单**：每个结论都有有效 evidence_id · 恢复后不重复抓取（幂等演练通过）· 取消后不产生新费用 · 子任务配额与总预算硬生效 · PARTIAL / 失败在报告里明确标注 · 成本与 P95 符合 SLO。

## 常见坑

1. **所有子任务共用一个上下文**：跑到第五个子任务前面全被挤掉，靠摘要又丢细节；大对象外置到证据库，只回传摘要与 `evidence_id`。
2. **没有检查点**：长任务跑到 40 分钟进程重启，全部重来，成本翻倍。
3. **证据不落库**：结论无法溯源，评审时无法验证，也无法去重与复用。
4. **产物无版本**：改一版覆盖一版，用户拿到的是哪一版说不清；产物要不可变、可对比。
5. **没有预算上限**：开放式研究会自己越搜越多，必须设轮次、token 与时长上限并明确降级输出。

## 自测题

> [!QUESTION] 为什么研究型 Agent 必须以证据库为中心？
> 长任务里原始网页与检索结果远超上下文窗口；证据库把大对象外置，并以 evidence_id 支撑结论溯源、去重、按需取回与引用校验。

> [!QUESTION] 子任务为什么只回传结构化摘要？
> 主链路只需要结论、证据 ID 与置信度；回传整段原始内容会迅速吃满上下文并放大注入风险，需要原文时按 ID 取。

> [!QUESTION] 恢复时如何避免重复抓取？
> 为子任务生成 `run_id + step + subtask_id + idempotency_key`，重放事件时查幂等表跳过已完成项，并用 content_hash 对同一来源去重。

> [!QUESTION] 预算触顶时正确行为是什么？
> 停止新子任务、用已有证据产出明确标注「不完整」的报告并结束，而不是静默继续或中断后什么都不返回。
