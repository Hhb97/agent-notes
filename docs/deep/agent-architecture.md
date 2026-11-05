---
level: 深入
tags: [生产架构, 分层设计, 模型网关, 工具执行层, 控制面, 数据面, 降级, 高可用]
summary: 给出生产级 Agent 系统的完整分层架构：接入与会话、编排与循环、模型网关、工具执行、状态与知识存储，以及横跨全链路的治理面；并说明同步与长任务两种链路、关键设计取舍与故障降级。
---

# 生产级 Agent 架构全景

> [!ABSTRACT] 一句话版本
> - 生产系统不是「一个循环 + 几个工具」，而是**数据面**（接入 → 编排 → 模型 → 工具 → 状态）加**治理面**（鉴权、预算、观测、评测、审计）两条线。
> - 关键分层动机：**把「模型决定做什么」与「代码决定能做什么」隔开**——工具执行层是唯一的权限边界。
> - 短任务走同步链路，长任务走「提交 → 异步执行 → 状态可查 → 人工审批 → 回传」链路；两者不要混在同一套超时模型里。
> - 可靠性来自工程手段：幂等、检查点、限流、降级、模型分级路由与回归门禁，见 [可靠性、成本与评测门禁](#/deep/reliability-eval)。

## 一、分层架构

<figure class="fig">
<svg viewBox="0 0 760 400" class="dg" role="img" aria-label="生产级 Agent 分层架构：接入层、编排层、模型网关、工具执行层、状态与知识层，右侧为贯穿全链路的治理面">
<rect class="bg" x="20" y="20" width="590" height="56" rx="10"/>
<text class="tb" x="36" y="40">接入层</text>
<rect class="b1" x="120" y="30" width="110" height="36" rx="7"/><text class="ts" x="175" y="48" text-anchor="middle" dominant-baseline="middle">API / SSE</text>
<rect class="b1" x="238" y="30" width="110" height="36" rx="7"/><text class="ts" x="293" y="48" text-anchor="middle" dominant-baseline="middle">会话与身份</text>
<rect class="b1" x="356" y="30" width="110" height="36" rx="7"/><text class="ts" x="411" y="48" text-anchor="middle" dominant-baseline="middle">限流与配额</text>
<rect class="b1" x="474" y="30" width="120" height="36" rx="7"/><text class="ts" x="534" y="48" text-anchor="middle" dominant-baseline="middle">输入输出校验</text>
<rect class="bg" x="20" y="86" width="590" height="56" rx="10"/>
<text class="tb" x="36" y="106">编排层</text>
<rect class="b2" x="120" y="96" width="140" height="36" rx="7"/><text class="ts" x="190" y="114" text-anchor="middle" dominant-baseline="middle">循环 / 状态图</text>
<rect class="b2" x="268" y="96" width="140" height="36" rx="7"/><text class="ts" x="338" y="114" text-anchor="middle" dominant-baseline="middle">上下文装配</text>
<rect class="b2" x="416" y="96" width="178" height="36" rx="7"/><text class="ts" x="505" y="114" text-anchor="middle" dominant-baseline="middle">预算 / 轮次 / 审批中断</text>
<rect class="bg" x="20" y="152" width="590" height="56" rx="10"/>
<text class="tb" x="36" y="172">模型网关</text>
<rect class="b3" x="120" y="162" width="140" height="36" rx="7"/><text class="ts" x="190" y="180" text-anchor="middle" dominant-baseline="middle">多模型路由</text>
<rect class="b3" x="268" y="162" width="140" height="36" rx="7"/><text class="ts" x="338" y="180" text-anchor="middle" dominant-baseline="middle">密钥与限流</text>
<rect class="b3" x="416" y="162" width="178" height="36" rx="7"/><text class="ts" x="505" y="180" text-anchor="middle" dominant-baseline="middle">重试 / 降级 / 缓存</text>
<rect class="bg" x="20" y="218" width="590" height="56" rx="10"/>
<text class="tb" x="36" y="238">工具执行层</text>
<rect class="b4" x="120" y="228" width="140" height="36" rx="7"/><text class="ts" x="190" y="246" text-anchor="middle" dominant-baseline="middle">鉴权与参数白名单</text>
<rect class="b4" x="268" y="228" width="140" height="36" rx="7"/><text class="ts" x="338" y="246" text-anchor="middle" dominant-baseline="middle">幂等与沙箱</text>
<rect class="b4" x="416" y="228" width="178" height="36" rx="7"/><text class="ts" x="505" y="246" text-anchor="middle" dominant-baseline="middle">业务服务 / MCP Server</text>
<rect class="bg" x="20" y="284" width="590" height="56" rx="10"/>
<text class="tb" x="36" y="304">状态与知识层</text>
<rect class="b5" x="120" y="294" width="140" height="36" rx="7"/><text class="ts" x="190" y="312" text-anchor="middle" dominant-baseline="middle">会话 / 检查点</text>
<rect class="b5" x="268" y="294" width="140" height="36" rx="7"/><text class="ts" x="338" y="312" text-anchor="middle" dominant-baseline="middle">向量库 / 文档索引</text>
<rect class="b5" x="416" y="294" width="178" height="36" rx="7"/><text class="ts" x="505" y="312" text-anchor="middle" dominant-baseline="middle">审计日志 / 评测数据</text>
<rect class="b2" x="626" y="20" width="114" height="320" rx="10"/>
<text class="th" x="683" y="48" text-anchor="middle">治理面</text>
<line class="ld" x1="640" y1="64" x2="726" y2="64"/>
<text class="ts" x="683" y="96" text-anchor="middle">身份与权限</text>
<text class="ts" x="683" y="130" text-anchor="middle">成本与预算</text>
<text class="ts" x="683" y="164" text-anchor="middle">链路追踪</text>
<text class="ts" x="683" y="198" text-anchor="middle">评测与门禁</text>
<text class="ts" x="683" y="232" text-anchor="middle">提示注入防护</text>
<text class="ts" x="683" y="266" text-anchor="middle">密钥与脱敏</text>
<text class="ts" x="683" y="300" text-anchor="middle">审计与合规</text>
<text class="ts" x="315" y="372" text-anchor="middle">数据面自上而下执行；治理面横跨每一层，决定「能做什么、花了多少、留下了什么证据」</text>
</svg>
<figcaption>图 1：数据面负责把事做完，治理面负责让事情可控、可查、可复现</figcaption>
</figure>

| 层 | 职责 | 为什么单独成层 |
| --- | --- | --- |
| 接入层 | 协议（REST / SSE / WebSocket）、身份、限流、输入校验 | 与业务无关，且是安全与成本的第一道闸 |
| 编排层 | 循环 / 状态图、上下文装配、停止条件、审批中断 | 控制流与模型调用解耦，便于测试与替换 |
| 模型网关 | 多模型路由、密钥托管、重试、降级、缓存 | 换模型 / 多厂商 / 限流不改变业务代码 |
| 工具执行层 | 鉴权、参数白名单、幂等、沙箱、审计 | **唯一真正执行动作的地方**，权限边界 |
| 状态与知识层 | 会话、检查点、向量索引、日志与评测数据 | 保证恢复、检索与可追溯 |
| 治理面 | 预算、追踪、评测门禁、注入防护、密钥、审计 | 横切能力，不能散落在各层里各做一份 |

> [!CAUTION] 权限边界只有一处
> 模型只发出工具调用请求；**是否允许执行，只能由工具执行层基于当前会话身份判断**。任何「在提示词里禁止」「在模型网关里过滤」都只是辅助，见 [评测、可观测与安全边界](#/basic/eval-safety)。

## 二、两条请求链路

**同步短任务**（问答、单轮查询）：
```text
请求 → 身份与配额校验 → 上下文装配 → 模型 → （工具 → 回填 → 再问）× N
     → 输出校验 → 流式返回 → 记录链路与用量
```

**异步长任务**（调研、批处理、需人工审批）：
```text
提交任务 → 返回 run_id → 队列 / 工作流引擎 → 按检查点逐步执行
         → 敏感动作中断等待审批 → resume → 结果落库
         → 客户端轮询 / 回调 / 推送 → 全链路可回放
```

| 维度 | 同步 | 异步 |
| --- | --- | --- |
| 超时模型 | 秒级，网关超时统一 | 分钟到小时，不能用 HTTP 超时兜底 |
| 状态 | 内存为主 | 必须持久化、按 run_id 索引 |
| 人工介入 | 基本没有 | 中断 / 恢复是核心能力 |
| 失败处理 | 直接返回错误 | 重试、续跑、补偿、告警 |

> [!TIP] 先用同步链路跑通价值
> 只有当任务时长超过网关容忍、或需要审批与恢复时，才引入队列与持久化执行。过早异步化会把调试难度提高一个量级。

## 三、关键设计决策

| 决策 | 选项 | 取舍 |
| --- | --- | --- |
| 编排放哪 | 业务进程内 / 独立编排服务 | 前者简单，后者便于多端复用与独立扩缩容 |
| 状态存哪 | 内存 / 数据库 / 工作流引擎 | 见 [Python 编排深入](#/deep/python-internals)，谁拥有状态谁负责恢复 |
| 工具在哪执行 | 同进程 / 独立工具服务 / MCP Server | 独立部署便于权限隔离与复用，代价是网络与运维 |
| 模型怎么接 | 直连厂商 / 统一模型网关 | 网关支持路由、降级、缓存、密钥托管，生产更常见 |
| 权限粒度 | 按工具 / 按参数 / 按数据行 | 越细越安全，但要与现有鉴权体系对齐 |
| 流式与否 | 全量返回 / 逐段流式 | 流式体验好，但与结构化输出、审计落库要协调 |

## 四、部署形态演进

| 阶段 | 形态 | 适用 |
| --- | --- | --- |
| 1 · 单体 | 一个服务里包含编排、工具、状态 | 验证价值、团队小 |
| 2 · 服务化 | 模型网关与工具执行层拆出，状态持久化 | 多业务接入、需要权限隔离 |
| 3 · 平台化 | 统一编排平台 + 工具注册中心 + 评测门禁 + 多租户治理 | 多个 Agent 共用基础设施 |

**不要跳级**：平台化的收益来自「多个 Agent 复用同一套治理」，只有一个 Agent 时它只是成本。

## 五、故障模式与降级

| 故障 | 表现 | 降级 / 处理 |
| --- | --- | --- |
| 模型超时 / 限流 | 请求挂起或报错 | 超时 + 退避重试 + 切换备用模型 |
| 工具不可用 | 循环里反复失败 | 明确回填失败、限制重试、转人工或直接答「暂无法查询」 |
| 检索服务异常 | 无资料可用 | 退化为「不依据资料的通用回答」并明确标注，或拒答 |
| 状态存储故障 | 无法恢复长任务 | 检查点写入失败即停止推进，避免状态不一致 |
| 成本突增 | 账单异常 | 预算上限熔断、模型分级路由、告警 |
| 提示注入 | 模型尝试越权动作 | 工具层白名单 + 动作审批 + 审计告警 |

## 常见坑

1. **把治理逻辑写进提示词**：预算、权限、审计必须用代码实现。
2. **模型网关与业务共用密钥**：泄漏面扩大，且无法按业务统计用量。
3. **长任务用 HTTP 超时兜底**：连接断了任务还在跑，状态无处可查。
4. **工具执行层直接信任模型参数**：越权与注入的主要来源。
5. **没有 run_id 贯通全链路**：出事时无法把模型、工具、检索、审批串起来。
6. **一上来就平台化**：治理成本超过了业务收益。

## 深入追问

> [!QUESTION] 为什么必须把工具执行层独立出来？
> 因为它是唯一真正产生副作用的地方。独立成层后，鉴权、参数白名单、幂等、沙箱与审计可以集中实现并被所有 Agent 复用，模型与编排层永远无法绕过它。

> [!QUESTION] 同步链路与异步长任务最本质的差别是什么？
> 状态是否需要跨进程、跨时间存活。异步链路必须持久化状态、按 run_id 可查可恢复、支持中断审批，且不能用 HTTP 超时作为失败判据。

> [!QUESTION] 模型网关除了转发请求还承担什么？
> 多模型路由与降级、密钥托管、按业务限流与计量、重试与退避、缓存；它让换模型不影响业务代码，也是成本控制点。

> [!QUESTION] 什么时候才值得做「平台化」？
> 当有多个 Agent 需要复用同一套身份、工具注册、观测、评测门禁与租户治理时；只有一个 Agent 时，平台化只会增加复杂度。
