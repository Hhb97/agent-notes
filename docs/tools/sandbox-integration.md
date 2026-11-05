---
level: 进阶
tags: [工具执行层, 沙箱, 参数白名单, 幂等, 超时, 外部集成, 审计]
summary: 讲清工具执行层作为唯一权限边界要做的六件事，以及代码执行沙箱、外部系统集成的常见形态、失败回填与审计设计。
---

# 工具执行、沙箱与外部集成

> [!ABSTRACT] 一句话版本
> - **工具执行层是唯一真正产生副作用的地方**：鉴权、参数白名单、幂等、超时、沙箱、审计六件事集中在这里做。
> - 模型发来的参数一律**不可信**：身份从当前会话取，参数按白名单校验，权限在工具内部重新判断。
> - 执行代码 / 访问文件 / 发网络请求的能力必须放进**受限沙箱**（文件系统、网络、时间、资源配额）。
> - 外部集成优先走「只读、限量、可审计」的形态；失败要结构化回填，让模型能判断重试还是收尾。

## 一、执行层的六道检查

<figure class="fig">
<svg viewBox="0 0 760 215" class="dg" role="img" aria-label="工具执行层六道检查：身份鉴权、参数白名单、读写与审批、幂等、沙箱与超时、执行与审计">
<rect class="b4" x="20" y="60" width="105" height="46" rx="9"/><text class="ts" x="72" y="83" text-anchor="middle" dominant-baseline="middle">身份鉴权</text>
<rect class="b4" x="137" y="60" width="105" height="46" rx="9"/><text class="ts" x="189" y="83" text-anchor="middle" dominant-baseline="middle">参数白名单</text>
<rect class="b4" x="254" y="60" width="105" height="46" rx="9"/><text class="ts" x="306" y="83" text-anchor="middle" dominant-baseline="middle">读写 / 审批</text>
<rect class="b4" x="371" y="60" width="105" height="46" rx="9"/><text class="ts" x="423" y="83" text-anchor="middle" dominant-baseline="middle">幂等键</text>
<rect class="b4" x="488" y="60" width="105" height="46" rx="9"/><text class="ts" x="540" y="83" text-anchor="middle" dominant-baseline="middle">沙箱 / 超时</text>
<rect class="b2" x="605" y="60" width="135" height="46" rx="9"/><text class="ts" x="672" y="83" text-anchor="middle" dominant-baseline="middle">执行 + 审计</text>
<line class="l" x1="125" y1="83" x2="137" y2="83" marker-end="url(#arr)"/>
<line class="l" x1="242" y1="83" x2="254" y2="83" marker-end="url(#arr)"/>
<line class="l" x1="359" y1="83" x2="371" y2="83" marker-end="url(#arr)"/>
<line class="l" x1="476" y1="83" x2="488" y2="83" marker-end="url(#arr)"/>
<line class="l" x1="593" y1="83" x2="605" y2="83" marker-end="url(#arr)"/>
<rect class="bg" x="20" y="132" width="720" height="58" rx="10"/>
<text class="t" x="380" y="152" text-anchor="middle" dominant-baseline="middle">任一检查不通过 → 结构化拒绝（FORBIDDEN / INVALID_PARAM / NEED_APPROVAL）</text>
<text class="ts" x="380" y="176" text-anchor="middle">失败信息回填给模型，但不含堆栈、连接串、内部表结构</text>
</svg>
<figcaption>图 1：模型只能请求，能不能做由这条链决定</figcaption>
</figure>

| 检查 | 内容 | 若省略 |
| --- | --- | --- |
| 身份鉴权 | 从当前会话取 user_id / tenant_id，不信任模型传参 | 越权访问他人数据 |
| 参数白名单 | 类型、值域、长度、允许的表 / 路径 / 命令 | 注入与越权 |
| 读写分离与审批 | 写操作单独标记，敏感动作中断等待人工确认 | 误操作产生副作用 |
| 幂等 | 写工具带幂等键，重复请求返回同一结果 | 超时重试造成重复扣款 / 发送 |
| 沙箱与超时 | 代码执行、文件、网络、CPU / 内存、时间上限 | 资源耗尽、逃逸、拖垮服务 |
| 审计 | 调用方、工具名、参数摘要、结果、耗时、run_id | 出事无法还原 |

> [!CAUTION] 提示词不是权限控制
> 「请不要删除数据」只是降低误触发概率。模型受注入影响或判断失误时仍会发出调用请求；**拦截必须在执行层**，见 [评测、可观测与安全边界](#/basic/eval-safety)。

## 二、沙箱形态

| 能力 | 主要风险 | 限制手段 |
| --- | --- | --- |
| 代码执行 | 任意读写、网络外联、无限循环 | 独立进程 / 容器、只读文件系统、网络白名单、CPU / 内存 / 时间配额 |
| 文件访问 | 读到敏感目录 | 限定工作目录、路径规范化校验、禁止符号链接逃逸 |
| 数据库 | 写操作、全表扫描 | 只读账号、视图、静态校验、`LIMIT` 与超时，见 [Text-to-SQL 智能体架构](#/deep/case-text2sql) |
| HTTP 调用 | SSRF、数据外传 | 目标域名白名单、禁止内网地址、响应大小限制 |
| 外部 API | 重复副作用 | 幂等键、限流、重试退避 |

**沙箱的输出也要当数据**：执行结果里可能夹带指令文本，回填前做精简与结构化，见 [提示词工程](#/llm/prompt-engineering)。

## 三、外部系统集成模式

| 形态 | 适合 | 注意 |
| --- | --- | --- |
| 同进程调用业务 Service | 简单、低延迟 | 权限与事务复用现有体系（Spring AI 常见，见 [Spring AI 全景](#/springai/overview)） |
| 独立工具服务 | 多 Agent 复用、权限隔离 | 网络超时、鉴权传递、服务治理 |
| MCP Server | 跨语言 / 跨客户端复用 | 协议与能力协商，见 [MCP 协议深入](#/tools/mcp-deep) |
| 消息队列 / 异步任务 | 长耗时、可重试 | 需要 run_id、结果回传与状态查询 |
| 只读数据视图 | 报表 / 分析类 | 天然规避写风险 |

## 四、失败与回填

| 情形 | 回填给模型什么 | 是否重试 |
| --- | --- | --- |
| 参数不合法 | `INVALID_PARAM` + 期望格式 | 有限次自纠正 |
| 权限拒绝 | `FORBIDDEN` + 通用说明 | 否，记告警 |
| 下游超时 | `UPSTREAM_ERROR` | 退避重试一次（仅幂等工具） |
| 需要审批 | `NEED_APPROVAL` + 暂停状态 | 等人确认后继续 |
| 执行成功 | 精简后的结构化结果 | — |

**所有路径都要计入预算与审计**；重试只针对可恢复错误，见 [可靠性、成本与评测门禁](#/deep/reliability-eval)。

## 常见坑

1. **信任模型传来的 user_id**：越权的主要来源。
2. **写工具无幂等键**：重试产生重复副作用。
3. **沙箱开着网络出口**：代码执行变成数据外传通道。
4. **错误回填带堆栈**：泄漏内部结构。
5. **所有错误都重试**：权限拒绝被反复触发。
6. **工具层没有 run_id**：无法把一次任务的各环节串起来。

## 自测题

> [!QUESTION] 为什么工具执行层是唯一真正的权限边界？
> 模型只发出调用请求，提示词与输出护栏都可被绕过；是否执行、以谁的身份执行、能执行多久，只有执行层能决定。

> [!QUESTION] 代码执行类工具至少要限制哪几类资源？
> 文件系统（只读 / 限定目录）、网络（白名单）、CPU 与内存、执行时间，以及可用的系统调用；否则容易造成逃逸或资源耗尽。

> [!QUESTION] 为什么权限拒绝类错误不能重试？
> 重试不会改变权限结果，只会放大风险与成本；应结构化回填、结束流程并留告警审计。

> [!QUESTION] 沙箱执行结果为什么也要精简和结构化？
> 结果会回填进上下文，既可能占用预算，也可能夹带提示注入文本；只保留模型需要的字段，并当作不可信数据。
