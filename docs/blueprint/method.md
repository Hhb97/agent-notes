---
level: 深入
tags: [架构方法, 需求边界, 非功能指标, 分层模板, 接口契约, ADR, 容量估算, 验收清单]
summary: 给出把 Agent 需求变成可落地架构的标准流程：需求四象限、非功能指标、分层模板、工程模块目录、接口与数据契约、ADR 决策记录、容量估算与分阶段验收。
---

# 从需求到可落地架构：分层、契约与决策记录

> [!ABSTRACT] 一句话版本
> - 落地架构的起点不是选框架，而是回答四个问题：**步骤能不能枚举、有没有副作用、要不要实时、数据有多敏感**。
> - 标准流程八步：**边界 → 指标 → 分层 → 模块 → 契约 → 数据模型 → 部署容量 → 演进路线**，每一步都产出可评审的工件。
> - **契约先于实现**：先把 API、工具 schema、事件与状态结构定下来，模块才能并行开发、独立替换。
> - 每个关键取舍写成 **ADR（架构决策记录）**，否则半年后没人记得「为什么不用方案 B」。

## 一、需求四象限（先定边界）

| 维度 | 问什么 | 决定什么 |
| --- | --- | --- |
| **步骤确定性** | 下一步能否预先枚举？ | 固定流程 / ReAct 循环 / 状态图，见 [Agent 工作流编排模式](#/deep/agent-workflow) |
| **副作用** | 会不会写库、发消息、下单？ | 是否需要幂等、审批、沙箱 |
| **实时性** | 秒级返回还是分钟～小时？ | 同步链路 / 异步任务 + 检查点 |
| **数据敏感性** | 是否含个人信息、跨租户、受限文档？ | 权限下推、脱敏、部署区域、审计 |

再加一条常被忽略的：**失败代价**。答错一句话和误删一条数据，架构完全不同。

## 二、八步流程

<figure class="fig">
<svg viewBox="0 0 760 220" class="dg" role="img" aria-label="从需求到可落地架构的八步流程：边界、指标、分层、模块、契约、数据模型、部署容量、演进路线">
<rect class="b1" x="20" y="46" width="168" height="52" rx="9"/><text class="tb" x="104" y="66" text-anchor="middle" dominant-baseline="middle">① 边界 / ② 指标</text><text class="ts" x="104" y="88" text-anchor="middle">四象限 · SLO · 成本上限</text>
<rect class="b2" x="204" y="46" width="168" height="52" rx="9"/><text class="tb" x="288" y="66" text-anchor="middle" dominant-baseline="middle">③ 分层 / ④ 模块</text><text class="ts" x="288" y="88" text-anchor="middle">职责边界 · 工程目录</text>
<rect class="b3" x="388" y="46" width="168" height="52" rx="9"/><text class="tb" x="472" y="66" text-anchor="middle" dominant-baseline="middle">⑤ 契约 / ⑥ 数据</text><text class="ts" x="472" y="88" text-anchor="middle">API · 事件 · 表结构</text>
<rect class="b5" x="572" y="46" width="168" height="52" rx="9"/><text class="tb" x="656" y="66" text-anchor="middle" dominant-baseline="middle">⑦ 容量 / ⑧ 演进</text><text class="ts" x="656" y="88" text-anchor="middle">部署拓扑 · 分阶段</text>
<line class="l" x1="188" y1="72" x2="204" y2="72" marker-end="url(#arr)"/>
<line class="l" x1="372" y1="72" x2="388" y2="72" marker-end="url(#arr)"/>
<line class="l" x1="556" y1="72" x2="572" y2="72" marker-end="url(#arr)"/>
<rect class="bg" x="20" y="126" width="720" height="66" rx="10"/>
<text class="t" x="380" y="148" text-anchor="middle" dominant-baseline="middle">每步产出可评审工件：边界说明 · SLO 表 · 分层图 · 模块目录 · 契约文件 · ER/状态模型</text>
<text class="ts" x="380" y="172" text-anchor="middle">容量估算 · ADR 列表 · 里程碑与验收清单；全部纳入版本管理</text>
</svg>
<figcaption>图 1：架构不是一张图，是一组能评审、能追溯的工件</figcaption>
</figure>

## 三、非功能指标（先写死）

| 类别 | 指标 | 示例目标 |
| --- | --- | --- |
| 质量 | 任务正确率 / 依据可追溯率 / 拒答正确率 | 由业务标注集定义 |
| 安全 | 越权调用数、未审批写操作数 | **0** |
| 延迟 | 同步 P95、长任务完成时间 | 同步 3s / 长任务 10min |
| 成本 | 单次任务 token / 费用上限 | 设硬熔断 |
| 可用性 | 成功返回率、降级触发率 | 99.5% |
| 可恢复 | 长任务恢复成功率 | 99% |
| 合规 | 数据出域、日志保留、删除响应 | 按法规与内控 |

> [!TIP] 指标要能证伪
> 「回答尽量准确」不是指标；「在 200 条固定用例上正确率 ≥ 85%，安全反例 0 例外」才是。指标写不清，后面所有验收都会变成争论，见 [评测系统深入](#/internals/eval-system)。

## 四、分层模板与模块目录

**通用五层 + 治理面**（详细版见 [通用 Agent 平台参考架构](#/blueprint/reference)）：接入层 → 编排层 → 能力层（模型网关 / 工具 / 检索）→ 状态与数据层 → 治理面（身份、预算、观测、审计、评测）。

```text
agent-service/                       # 工程模块目录（结构示意，非可运行代码）
├── api/                     # 接入层：协议、鉴权中间件、限流、SSE、参数校验
├── orchestrator/            # 编排层：状态机、循环/图定义、预算与停止条件、审批
│   ├── state/               #   RunState、事件、检查点读写
│   └── policies/            #   重试、降级、路由策略
├── context/                 # 上下文编译器：IR 片段、预算、裁剪、序列化
├── modelgateway/            # 模型网关：多厂商适配、路由、缓存、密钥、计量
├── tools/                   # 工具运行时：注册表、schema、分发、幂等、沙箱
│   ├── builtin/             #   业务工具实现
│   └── mcp/                 #   MCP Client 接入
├── knowledge/               # 文档 ETL、向量库适配、检索与重排
├── storage/                 # Run / Event / Checkpoint / Audit / Idempotency
├── governance/              # 身份、配额、审计、脱敏、评测钩子
├── workers/                 # 异步长任务消费者
├── config/                  # 提示词版本、工具 schema 版本、环境配置
└── eval/                    # 用例集、执行器、裁判、基线、门禁脚本
```

**模块划分原则**：① 契约先行，模块间只依赖接口；② 有副作用的能力（tools、storage）集中，不散落；③ 可替换点（模型、向量库、编排引擎）显式隔离；④ 每层都能单独单测，见 [测试策略](#/engineering/testing)。

## 五、契约设计

| 契约 | 内容 | 为什么先定 |
| --- | --- | --- |
| 对外 API | 提交任务、查询状态、流式输出、审批回调 | 前端 / 调用方可并行开发 |
| 内部事件 | `ModelRequested`、`ToolExecuted`、`ApprovalRequired` 等 | 决定持久化与回放，见 [状态持久化与恢复语义](#/internals/durability) |
| 工具 schema | 名字、描述、参数、返回与错误码 | 决定模型能否正确调用，见 [工具设计原则](#/tools/tool-design) |
| 状态结构 | `RunState` 字段与版本 | 决定恢复、审计、观测 |
| 配置版本 | 提示词 / 工具集 / 模型档位版本键 | 决定可复现与灰度 |

```text
POST /v1/runs            -> { run_id, status, stream_url }
GET  /v1/runs/{run_id}   -> { status, step, usage, result?, approval? }
POST /v1/runs/{id}/approval -> { decision: approve|reject, params_override? }
SSE  /v1/runs/{id}/events  -> delta | tool_started | tool_finished | done | error
```

## 六、ADR：把取舍写下来

```text
ADR-007：长任务采用「事件日志 + 周期快照」而非纯状态图检查点
- 背景：任务最长 2 小时，需支持进程重启后恢复与人工审批
- 备选：A 纯检查点 / B 外部工作流引擎 / C 事件日志+快照
- 决策：C
- 理由：团队已有消息与事件基础设施；B 引入新运维成本；A 无法覆盖审批与预算状态
- 代价：需要自己实现重放器与事件版本兼容
- 验证：故障注入演练，恢复成功率 ≥ 99%
```

至少要为这几件事写 ADR：编排方式、状态归属、模型网关、权限边界、检索方案、部署形态。

## 七、容量估算方法

```text
QPS_peak × 平均轮次 × 每轮输入 token × 冗余系数 = 每分钟输入 token 需求
每分钟输入 token / 单模型每分钟配额 = 所需并发额度
日均任务数 × 平均轮次 × 单价 = 日成本
长任务并发数 × 平均时长 = 在途 run 数 → 决定 worker 与检查点存储写入量
```

**别忘算失败重试与多查询扩展**：它们常让实际 token 是理论值的 1.5～3 倍，见 [可观测性](#/engineering/observability) 的成本归因。

## 八、验收清单

- [ ] 边界与四象限结论已评审，明确「不做什么」
- [ ] 非功能指标可量化、可证伪，安全项为 0 例外
- [ ] 分层图 + 模块目录 + 契约文件齐全并版本化
- [ ] 关键取舍有 ADR，含备选与代价
- [ ] 容量估算含重试冗余，预算有硬熔断
- [ ] 失败模式与降级路径逐条有处理
- [ ] 评测用例集（含安全反例）与门禁接好
- [ ] 分阶段实施路线与每阶段退出条件明确

## 深入追问

> [!QUESTION] 为什么架构起点是需求四象限而不是选框架？
> 步骤确定性、副作用、实时性、数据敏感性直接决定编排方式、幂等与审批、同步/异步、权限与部署；框架只是这些决策之后的 implementation detail。

> [!QUESTION] 为什么说契约要先于实现？
> API、事件、工具 schema 与状态结构定下来后，模块才能并行开发、独立替换与单测；否则各模块耦合在具体类上，后续每换一个组件都要全链路改。

> [!QUESTION] 容量估算为什么必须乘冗余系数？
> 失败重试、查询改写、多轮循环、多智能体会让实际 token 显著高于理论值；不加冗余会在峰值期限流或击穿预算。

> [!QUESTION] 什么情况下应该引入外部工作流引擎（ADR 里的方案 B）？
> 已有引擎运维能力、需要跨服务的长事务与自动重试、或团队不想自研重放与恢复；代价是新增基础设施与一套编程模型。
