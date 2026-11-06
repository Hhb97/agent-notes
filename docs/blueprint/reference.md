---
level: 深入
tags: [参考架构, 组件清单, 接口契约, 数据模型, 部署拓扑, 容量估算, 多租户, 工程目录]
summary: 一份可以直接照着排期的通用 Agent 平台参考架构：完整逻辑分层与组件清单、工程模块目录、API/事件/工具契约、数据库表结构、部署拓扑与容量估算、同步异步两条链路、多租户隔离与验收清单。
---

# 通用 Agent 平台参考架构（可落地版）

> [!ABSTRACT] 一句话版本
> - 参考架构 = **五层数据面 + 一条治理面 + 两套链路（同步 / 异步）**；每个组件都标注职责、是否必需、可替换点。
> - 落地顺序按**契约先行**：先定 `RunState`、API、事件与工具 schema，再写实现；模块因此能并行开发、独立替换。
> - 状态层是核心资产：`Run / Event / Checkpoint / Idempotency / Audit / ToolRegistry / Quota` 七张表支撑恢复、去重、审计、配额与回放。
> - 部署上把**接入编排（无状态）** 与 **worker（长任务）** 分开扩容，模型网关独立，存储与队列共享；多租户隔离落到每一行数据的 `tenant_id`。

> [!NOTE] 这页和「生产级 Agent 架构全景」的分工
> 全景页讲**为什么这样分层、故障怎么降级**（[生产级 Agent 架构全景](#/deep/agent-architecture)）；
> 本页讲**照着怎么搭**：组件清单与必需性、工程模块目录、接口与事件契约、表结构、部署拓扑与容量估算、实施与验收。

## 一、逻辑架构

<figure class="fig">
<svg viewBox="0 0 760 390" class="dg" role="img" aria-label="通用 Agent 平台逻辑架构：接入层、编排层、能力层、状态层，右侧治理面贯穿全链路">
<rect class="bg" x="20" y="20" width="580" height="58" rx="10"/>
<text class="tb" x="34" y="40">接入层</text>
<rect class="b1" x="110" y="30" width="100" height="38" rx="7"/><text class="ts" x="160" y="49" text-anchor="middle" dominant-baseline="middle">REST / SSE</text>
<rect class="b1" x="218" y="30" width="100" height="38" rx="7"/><text class="ts" x="268" y="49" text-anchor="middle" dominant-baseline="middle">身份鉴权</text>
<rect class="b1" x="326" y="30" width="100" height="38" rx="7"/><text class="ts" x="376" y="49" text-anchor="middle" dominant-baseline="middle">限流配额</text>
<rect class="b1" x="434" y="30" width="150" height="38" rx="7"/><text class="ts" x="509" y="49" text-anchor="middle" dominant-baseline="middle">输入校验 / 脱敏</text>
<rect class="bg" x="20" y="88" width="580" height="58" rx="10"/>
<text class="tb" x="34" y="108">编排层</text>
<rect class="b2" x="110" y="98" width="140" height="38" rx="7"/><text class="ts" x="180" y="117" text-anchor="middle" dominant-baseline="middle">状态机 / 循环 / 图</text>
<rect class="b2" x="258" y="98" width="140" height="38" rx="7"/><text class="ts" x="328" y="117" text-anchor="middle" dominant-baseline="middle">上下文编译器</text>
<rect class="b2" x="406" y="98" width="178" height="38" rx="7"/><text class="ts" x="495" y="117" text-anchor="middle" dominant-baseline="middle">预算 / 停止 / 审批中断</text>
<rect class="bg" x="20" y="156" width="580" height="88" rx="10"/>
<text class="tb" x="34" y="176">能力层</text>
<rect class="b3" x="110" y="188" width="140" height="44" rx="7"/><text class="ts" x="180" y="210" text-anchor="middle" dominant-baseline="middle">模型网关（路由/缓存）</text>
<rect class="b3" x="258" y="188" width="140" height="44" rx="7"/><text class="ts" x="328" y="210" text-anchor="middle" dominant-baseline="middle">工具运行时（幂等/沙箱）</text>
<rect class="b3" x="406" y="188" width="178" height="44" rx="7"/><text class="ts" x="495" y="210" text-anchor="middle" dominant-baseline="middle">检索流水线（过滤/重排）</text>
<rect class="bg" x="20" y="254" width="580" height="58" rx="10"/>
<text class="tb" x="34" y="274">状态层</text>
<rect class="b5" x="110" y="264" width="140" height="38" rx="7"/><text class="ts" x="180" y="283" text-anchor="middle" dominant-baseline="middle">Run/Event/Checkpoint</text>
<rect class="b5" x="258" y="264" width="140" height="38" rx="7"/><text class="ts" x="328" y="283" text-anchor="middle" dominant-baseline="middle">向量库 / 对象存储</text>
<rect class="b5" x="406" y="264" width="178" height="38" rx="7"/><text class="ts" x="495" y="283" text-anchor="middle" dominant-baseline="middle">幂等表 / 审计 / 评测数据</text>
<line class="l" x1="310" y1="78" x2="310" y2="88" marker-end="url(#arr)"/>
<line class="l" x1="310" y1="146" x2="310" y2="156" marker-end="url(#arr)"/>
<line class="l" x1="310" y1="244" x2="310" y2="254" marker-end="url(#arr)"/>
<rect class="b4" x="616" y="20" width="124" height="292" rx="10"/>
<text class="th" x="678" y="46" text-anchor="middle">治理面</text>
<line class="ld" x1="630" y1="60" x2="726" y2="60"/>
<text class="ts" x="678" y="88" text-anchor="middle">身份 / 权限</text>
<text class="ts" x="678" y="116" text-anchor="middle">预算 / 熔断</text>
<text class="ts" x="678" y="144" text-anchor="middle">链路追踪</text>
<text class="ts" x="678" y="172" text-anchor="middle">脱敏 / 密钥</text>
<text class="ts" x="678" y="200" text-anchor="middle">审计留痕</text>
<text class="ts" x="678" y="228" text-anchor="middle">评测门禁</text>
<text class="ts" x="678" y="256" text-anchor="middle">提示词版本</text>
<text class="ts" x="678" y="284" text-anchor="middle">多租户隔离</text>
<rect class="b1" x="20" y="330" width="720" height="44" rx="9"/>
<text class="t" x="380" y="352" text-anchor="middle" dominant-baseline="middle">同步短任务：接入 → 编排 → 能力 → 返回　　异步长任务：接入 → 队列 → worker → 检查点 → 回调</text>
</svg>
<figcaption>图 1：五层数据面 + 治理面；能力层与状态层是最值得先定契约的地方</figcaption>
</figure>

## 二、组件清单（照着排期用）

| 组件 | 职责 | 必需 | 可替换点 |
| --- | --- | --- | --- |
| API 网关 / 接入层 | 协议、鉴权、限流、SSE、输入校验 | ✅ | 框架 / 网关产品 |
| 状态机 / 编排器 | 转移、预算、停止、审批 | ✅ | 自研状态机 / 图运行时 / 工作流引擎 |
| 上下文编译器 | IR、预算、裁剪、序列化、装配报告 | ✅ | 自研（框架通常不覆盖） |
| 模型网关 | 多厂商适配、分级路由、缓存、计量 | ✅ | 直连 → 网关（强烈建议） |
| 工具运行时 | 注册、schema、分发、幂等、沙箱 | ✅ | 本地 / 独立服务 / MCP |
| 检索流水线 | ETL、向量库、过滤、混合检索、重排 | 按需 | 向量库 / 检索引擎 |
| 状态存储 | Run、Event、Checkpoint、Idempotency | ✅ | 关系库 / 文档库 |
| 审计与评测数据 | 全链路留痕、用例集、基线 | ✅ | 日志平台 / 数仓 |
| 队列 + worker | 长任务异步执行与恢复 | 长任务时 | 消息队列 / 工作流引擎 |
| 配置与版本中心 | 提示词、工具 schema、模型档位 | ✅ | 配置文件 → 配置中心 |

## 三、工程模块目录

```text
platform/
├── api/                  # 接入层：DTO、鉴权中间件、SSE、限流、参数校验
├── orchestrator/
│   ├── statemachine/     # 状态定义、转移表、事件处理
│   ├── policies/         # 重试、降级、模型路由策略
│   └── approval/         # 审批状态、超时、回调
├── context/              # 编译器：collector / budget / compressor / serializer / report
├── modelgateway/         # adapters/ (各厂商)、router、cache、metering、secrets
├── tools/
│   ├── registry/         # 工具注册、schema 版本、场景子集
│   ├── runtime/          # 分发、参数校验、幂等、并发、取消令牌
│   ├── sandbox/          # 代码 / 文件 / 网络限制
│   └── mcp/              # MCP Client 与能力转换
├── knowledge/
│   ├── ingestion/        # 解析、切分、元数据、增量重建
│   └── retrieval/        # 改写、召回、融合、重排、过滤
├── storage/
│   ├── migrations/       # 表结构
│   └── repositories/     # Run / Event / Checkpoint / Idempotency / Audit
├── governance/           # 身份、配额、脱敏、审计、评测钩子
├── workers/              # 异步消费者、租约、恢复、补偿
├── config/               # prompt_vN.yaml、toolset_vN.json、model_tiers.yaml
├── eval/                 # cases/、runners/、judges/、baselines/、gates/
└── deploy/               # 容器编排、队列、存储、监控告警配置
```

**依赖方向单向向下**：`api → orchestrator → {context, modelgateway, tools, knowledge} → storage`；治理面横切，通过中间件 / 拦截器注入，不反向依赖业务模块。

## 四、接口与契约

```text
# 对外
POST   /v1/runs                 { task_type, input, options? } -> { run_id, status, stream_url }
GET    /v1/runs/{run_id}        -> { status, step, usage, result?, approval?, error? }
SSE    /v1/runs/{run_id}/events -> delta | tool_started | tool_finished | approval_required | done | error
POST   /v1/runs/{id}/approval   { decision, params_override?, approver } -> { status }
POST   /v1/runs/{id}/cancel     -> { status: CANCELLED }
GET    /v1/tools                -> 当前可用工具清单（按租户 / 场景过滤）

# 内部事件（持久化，决定恢复语义）
SUBMITTED · MODEL_REQUESTED · MODEL_RESPONDED · TOOL_REQUESTED · TOOL_EXECUTED
APPROVAL_REQUIRED · APPROVED · REJECTED · BUDGET_EXCEEDED · DONE · FAILED · CANCELLED

# 工具 schema（注册契约）
{ name, description, parameters(JSON Schema), returns, error_codes, side_effect: read|write,
  idempotency_required, permission_scope, timeout_ms, version }
```

`side_effect` 与 `idempotency_required` 必须是注册契约的一部分：编排层据此决定能否并行、是否需要审批，见 [工具运行时深入](#/internals/tool-runtime)。

## 五、数据模型

```text
Run(run_id PK, tenant_id, user_id, task_type, status, version,
    prompt_version, model_version, tools_hash, budget_json, usage_json,
    checkpoint_seq, created_at, deadline, result_ref)

Event(event_seq PK, run_id, step, type, payload_json, created_at)
Checkpoint(checkpoint_id PK, run_id, event_seq, state_json, version, created_at)
Idempotency(key PK, run_id, step, tool_call_id, params_hash, status, result_ref, expires_at)
ToolRegistry(tool_id PK, tenant_id, name, schema_json, side_effect, permission_scope,
             version, enabled, created_at)
Quota(tenant_id, scope, limit_value, window, used, updated_at)
Audit(audit_id PK, run_id, actor, action, target, params_digest, created_at)
Artifact(artifact_id PK, run_id, kind, uri, checksum, created_at)
```

| 关注 | 索引 / 约束 |
| --- | --- |
| 顺序重放 | `Event(run_id, event_seq)` |
| 最新快照 | `Checkpoint(run_id, event_seq DESC)` |
| 去重 | `Idempotency.key` 唯一 |
| 乐观锁 | `Run.version` CAS 更新 |
| 多租户 | 所有表带 `tenant_id`，查询强制带租户条件 |
| 审计 | 只追加、不更新；按保留期归档 |

## 六、部署拓扑与容量

<figure class="fig">
<svg viewBox="0 0 760 210" class="dg" role="img" aria-label="部署拓扑：负载均衡后是无状态 API 与编排服务，长任务经队列由 worker 消费，共享数据库、向量库、对象存储与模型网关">
<rect class="b1" x="20" y="70" width="100" height="44" rx="9"/><text class="ts" x="70" y="92" text-anchor="middle" dominant-baseline="middle">LB / 网关</text>
<rect class="b2" x="140" y="30" width="140" height="44" rx="9"/><text class="ts" x="210" y="52" text-anchor="middle" dominant-baseline="middle">API（无状态 ×N）</text>
<rect class="b2" x="140" y="110" width="140" height="44" rx="9"/><text class="ts" x="210" y="132" text-anchor="middle" dominant-baseline="middle">编排服务（×N）</text>
<rect class="b3" x="300" y="30" width="120" height="44" rx="9"/><text class="ts" x="360" y="52" text-anchor="middle" dominant-baseline="middle">模型网关</text>
<rect class="b3" x="300" y="110" width="120" height="44" rx="9"/><text class="ts" x="360" y="132" text-anchor="middle" dominant-baseline="middle">任务队列</text>
<rect class="b4" x="440" y="110" width="120" height="44" rx="9"/><text class="ts" x="500" y="132" text-anchor="middle" dominant-baseline="middle">Worker（×M）</text>
<rect class="bg" x="580" y="30" width="160" height="124" rx="10"/>
<text class="tb" x="660" y="52" text-anchor="middle">共享存储</text>
<text class="ts" x="660" y="78" text-anchor="middle">关系库（Run/Event/CP）</text>
<text class="ts" x="660" y="100" text-anchor="middle">向量库 / 对象存储</text>
<text class="ts" x="660" y="122" text-anchor="middle">缓存 / 审计日志</text>
<line class="l" x1="120" y1="92" x2="140" y2="52" marker-end="url(#arr)"/>
<line class="l" x1="120" y1="92" x2="140" y2="132" marker-end="url(#arr)"/>
<line class="l" x1="280" y1="52" x2="300" y2="52" marker-end="url(#arr)"/>
<line class="l" x1="280" y1="132" x2="300" y2="132" marker-end="url(#arr)"/>
<line class="l" x1="420" y1="132" x2="440" y2="132" marker-end="url(#arr)"/>
<line class="l" x1="560" y1="132" x2="580" y2="110" marker-end="url(#arr)"/>
<line class="l" x1="420" y1="52" x2="580" y2="60" marker-end="url(#arr)"/>
<text class="ts" x="380" y="188" text-anchor="middle">API 按 QPS 扩容，Worker 按在途长任务数扩容；模型网关独立限流与计量</text>
</svg>
<figcaption>图 2：无状态服务与有状态任务分离，是容量规划的关键</figcaption>
</figure>

```text
容量估算示例（示意，数值需按业务替换）：
  峰值 20 QPS，同步任务平均 2.5 轮，每轮输入 3k token，冗余系数 2
  → 输入 ≈ 20 × 2.5 × 3000 × 2 = 300k token/分钟
  单模型账号配额 200k token/分钟 → 需 2 个账号 / 多档位分流
  长任务日均 500 个 × 平均 8 分钟 → 在途约 3 个（低谷）～ 30 个（高峰）
  → Worker 按峰值在途数 × 单任务资源估算，检查点写入按每步 1 条事件估算
```

**扩容策略**：API / 编排按 QPS；worker 按队列积压与在途 run；模型网关按供应商配额做限流与排队；状态库按事件写入量；向量库按索引规模与查询 QPS。

## 七、两条链路

**同步短任务**：`POST /runs` → 鉴权限流 → 编译上下文 → 模型 →（工具 → 回填）×N → 输出校验 → SSE 返回 → 写 Event/Audit。全程在一个请求里，网关超时统一。

**异步长任务**：`POST /runs` 落 Run + `SUBMITTED` 事件 → 返回 run_id → 队列 → worker 领租约 → 按状态机推进，每步写事件、周期快照 → 敏感动作 `APPROVAL_REQUIRED` 并等待 → resume → 结果写 Artifact → `DONE` → 回调 / 轮询。见 [状态持久化与恢复语义](#/internals/durability)。

## 八、多租户隔离

| 层 | 隔离手段 |
| --- | --- |
| 数据 | 所有表 `tenant_id`，查询强制带条件；向量库按租户过滤下推到检索前 |
| 工具 | `ToolRegistry` 按租户启用；写工具单独授权 |
| 模型与预算 | `Quota` 按租户 / 用户分档，超限硬熔断 |
| 提示词 | 版本可按租户覆盖，但必须记录版本键 |
| 审计 | 只追加、按租户分权访问、按保留期归档 |
| 观测 | run_id 关联租户，成本可归因，见 [可观测性](#/engineering/observability) |

## 九、分阶段实施与验收

| 阶段 | 范围 | 退出条件 |
| --- | --- | --- |
| P0 骨架 | API + 状态机 + 模型网关 + Run/Event 表 | 同步链路跑通，能打印完整请求与装配报告 |
| P1 能力 | 工具运行时 + 幂等 + 上下文编译器 | 工具调用评测通过，写操作幂等演练通过 |
| P2 可靠性 | 队列 + worker + 检查点 + 审批 | 故障注入后恢复成功率达标 |
| P3 治理 | 审计、配额、观测、评测门禁 | 安全反例 0 例外，成本可归因 |
| P4 规模化 | 检索平台、多租户、模型分级路由 | 容量压测与灰度观察通过 |

**验收清单**：契约文件与 ADR 齐全 · 七张表结构与索引评审通过 · 同步 / 异步链路各有一条可回放的 run · 故障注入（模型超时 / 工具失败 / 进程重启 / 审批拒绝）逐项通过 · 安全反例 0 例外 · 成本与 P95 符合 SLO · 灰度与回滚演练通过。

## 常见坑

1. **一次把五个层全上齐**：没有真实用例就引入队列、多租户、审计，最后 80% 组件空转；按 P0～P4 分期。
2. **状态层当成业务库用**：把业务数据塞进 `Run` 表，回放与清理都变成灾难；业务数据留在业务库，状态层只存运行所需。
3. **多租户只在网关判断**：网关之后任何一条 SQL、缓存键、对象存储路径漏了 `tenant_id` 就是越权。
4. **长任务跑在同步链路上**：用同一套超时模型，结果要么超时要么连接被占满；异步链路必须有独立 worker 与取消语义。
5. **契约里没有幂等键与预算字段**：上线后补，等于要求所有调用方改接口。

## 自测题

> [!QUESTION] 为什么能力层与状态层要最先定契约？
> 它们决定编排能否暂停恢复、工具能否并行与幂等、评测能否复现；契约稳定后各模块可并行实现，后续换模型或换向量库也不必改业务层。

> [!QUESTION] 为什么 API/编排无状态而 worker 单独扩容？
> 同步请求按 QPS 波动，长任务按在途数量波动，两者资源曲线不同；分离后各自独立扩缩容，长任务也不会占用请求线程。

> [!QUESTION] `side_effect` 为什么要写进工具注册契约？
> 编排层据此决定能否并行、是否需要审批与幂等键；若只有运行时才知道，调度决策就会失去依据。

> [!QUESTION] 容量估算里冗余系数主要覆盖什么？
> 失败重试、查询改写、多轮循环与多智能体委派，它们常让实际 token 达到理论值的 1.5～3 倍。
