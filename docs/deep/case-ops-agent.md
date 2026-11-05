---
level: 深入
tags: [真实架构案例, 运维诊断, 证据采集, 假设验证, 只读优先, 人工审批, AIOps]
summary: 以运维诊断智能体为例拆解真实架构：告警接入、指标日志链路的证据采集、假设生成与验证循环、结论的可追溯要求、动作分级与人工审批。
---

# 运维诊断智能体架构

> [!ABSTRACT] 一句话版本
> - 运维诊断的本质不是「让模型猜原因」，而是**证据采集 → 假设生成 → 用工具验证 → 结论附证据**的可核查循环。
> - 三条铁律：**结论必须挂证据 ID**、**只读优先**、**任何修复动作都要分级审批**。
> - 高噪声的日志与链路数据是最大的上下文挑战，常用**子任务隔离 + 结构化摘要**处理，见 [多智能体架构与隔离](#/deep/multi-agent)。
> - 评测看「定位准确率 + 平均定位时间 + 误操作率」，而不是看报告写得多完整。

## 一、场景与难点

| 需求 | 难点 |
| --- | --- |
| 告警来了快速定位根因 | 指标、日志、链路、变更记录分散在多个系统 |
| 关联近期发布 / 配置变更 | 时间线对齐，容易被无关噪声带偏 |
| 给出可执行的处置建议 | 建议若被自动执行，可能扩大故障 |
| 沉淀复盘 | 每一步依据必须可追溯、可回放 |

> [!CAUTION] 生产环境里「猜错」的代价很高
> 运维 Agent 的误判可能触发重启、扩缩容、回滚等动作。默认应只读诊断；写操作必须分级 + 人工确认，见 [生产级 Agent 架构全景](#/deep/agent-architecture)。

## 二、完整架构

<figure class="fig">
<svg viewBox="0 0 760 330" class="dg" role="img" aria-label="运维诊断智能体架构：告警接入、证据采集、假设生成与验证循环、结论报告、动作分级与审批执行">
<rect class="b1" x="20" y="40" width="110" height="42" rx="8"/><text class="ts" x="75" y="61" text-anchor="middle" dominant-baseline="middle">告警 / 工单</text>
<rect class="b2" x="146" y="40" width="130" height="42" rx="8"/><text class="ts" x="211" y="61" text-anchor="middle" dominant-baseline="middle">时间窗与范围</text>
<rect class="b3" x="292" y="40" width="150" height="42" rx="8"/><text class="ts" x="367" y="61" text-anchor="middle" dominant-baseline="middle">证据采集（只读）</text>
<rect class="b4" x="458" y="40" width="130" height="42" rx="8"/><text class="ts" x="523" y="61" text-anchor="middle" dominant-baseline="middle">假设生成</text>
<rect class="b5" x="604" y="40" width="136" height="42" rx="8"/><text class="ts" x="672" y="61" text-anchor="middle" dominant-baseline="middle">验证循环</text>
<line class="l" x1="130" y1="61" x2="146" y2="61" marker-end="url(#arr)"/>
<line class="l" x1="276" y1="61" x2="292" y2="61" marker-end="url(#arr)"/>
<line class="l" x1="442" y1="61" x2="458" y2="61" marker-end="url(#arr)"/>
<line class="l" x1="588" y1="61" x2="604" y2="61" marker-end="url(#arr)"/>
<rect class="bg" x="20" y="100" width="720" height="76" rx="10"/>
<text class="tb" x="36" y="122">证据层（每个证据带 ID、时间戳、来源、原始查询）</text>
<text class="ts" x="36" y="146">指标：错误率 / 延迟 / 饱和度　·　日志：错误聚类与异常模式　·　链路：慢 span 与依赖拓扑</text>
<text class="ts" x="36" y="166">变更：发布记录 / 配置变更 / 依赖状态　·　所有查询只读、限量、可回放</text>
<rect class="b2" x="20" y="192" width="230" height="46" rx="9"/><text class="ts" x="135" y="215" text-anchor="middle" dominant-baseline="middle">结论报告：结论 + 证据 ID + 置信度</text>
<rect class="b3" x="266" y="192" width="230" height="46" rx="9"/><text class="ts" x="381" y="215" text-anchor="middle" dominant-baseline="middle">动作分级：只读 / 低风险 / 高风险</text>
<rect class="b4" x="512" y="192" width="228" height="46" rx="9"/><text class="ts" x="626" y="215" text-anchor="middle" dominant-baseline="middle">高风险 → 人工审批 → 执行</text>
<line class="l" x1="250" y1="215" x2="266" y2="215" marker-end="url(#arr)"/>
<line class="l" x1="496" y1="215" x2="512" y2="215" marker-end="url(#arr)"/>
<rect class="b5" x="20" y="256" width="720" height="52" rx="10"/>
<text class="t" x="380" y="276" text-anchor="middle" dominant-baseline="middle">护栏：查询只读账号 · 行数与时间上限 · 证据不可伪造 · 全链路 run_id · 执行前幂等检查</text>
<text class="ts" x="380" y="296" text-anchor="middle">评测：定位准确率 · 平均定位时间 · 误操作率 · 结论可追溯率</text>
</svg>
<figcaption>图 1：证据链与动作分级，把「AI 建议」和「AI 执行」严格分开</figcaption>
</figure>

## 三、证据采集与上下文

| 数据源 | 高噪声风险 | 处理 |
| --- | --- | --- |
| 指标时序 | 维度多、时间窗长 | 先聚合异常维度，只取突变区间 |
| 日志 | 单条查询可能返回上万行 | 错误聚类、采样、只回传模式与计数 |
| 链路 | span 层级深 | 提取慢 span 与关键路径，见 [可观测性](#/engineering/observability) |
| 变更记录 | 与故障无关的信息多 | 按时间窗过滤发布 / 配置事件 |
| 拓扑 / 配置 | 结构复杂 | 只取与告警服务相关的子图 |

> [!TIP] 用子任务隔离高噪声查询
> 把「扫日志」「查链路」交给独立上下文的子 Agent，只回传结构化摘要 + 证据 ID；主 Agent 保持干净，见 [多智能体架构与隔离](#/deep/multi-agent) 与 [上下文工程深入](#/deep/context-engineering)。

## 四、假设—验证循环

```text
① 生成 2～3 个可证伪的假设（不要只给一个结论）
② 为每个假设列出「需要什么证据」
③ 调只读工具取证据 → 支持 / 排除 / 证据不足
④ 收敛到最可能的根因；仍不足则明确「无法定位」并列出待补数据
⑤ 输出：结论 + 证据 ID + 置信度 + 影响范围 + 建议动作
```

**结论必须挂证据 ID**：这是防幻觉最有效的工程手段。模型可以给出推断，但每个推断都要能回查到具体指标片段 / 日志聚类 / span，见 [企业知识库助手架构](#/deep/case-kb-agent) 里的引用校验思路。

## 五、动作分级

| 级别 | 例子 | 是否自动执行 |
| --- | --- | --- |
| 只读 | 查询指标、日志、链路、配置 | 允许自动 |
| 低风险 | 生成工单、补充标签、发诊断报告 | 可自动，留审计 |
| 中风险 | 扩容、重启单个实例 | 需人工确认 + 幂等 |
| 高风险 | 回滚、切流、批量删除、改核心配置 | **强制人工审批**，变更窗口执行 |

执行前检查：当前会话身份、目标范围白名单、幂等键、是否已有进行中的同类动作、变更窗口与回滚方案，见 [工具执行、沙箱与外部集成](#/tools/sandbox-integration)。

## 六、评测与演练

| 指标 | 说明 |
| --- | --- |
| 定位准确率 | 与复盘标注的根因是否一致 |
| 平均定位时间 | 相比人工是否真的更快 |
| 结论可追溯率 | 每条结论是否有有效证据 ID |
| 误操作率 | 未审批 / 越范围动作，必须为 0 |
| 拒答 / 升级率 | 证据不足时是否诚实升级人工 |
| 成本 | 每轮查询次数、token、数据源负载 |

**用历史故障做回放演练**：把过去的告警与当时的证据快照作为固定用例集，验证改动不会让旧故障定位能力退化，见 [测试策略](#/engineering/testing)。

## 常见坑

1. **结论没有证据 ID**：报告漂亮但无法核查，也无法防幻觉。
2. **日志原样塞进上下文**：噪声迅速吃掉预算，关键信号被淹没。
3. **只读与写操作混在一个工具**：一次误判直接扩大故障。
4. **只给一个假设**：没有证伪过程，容易锚定在错误方向。
5. **证据不足仍硬下结论**：应明确「无法定位」并列出待补数据。
6. **忽略数据源负载**：诊断 Agent 本身把监控打爆。

## 深入追问

> [!QUESTION] 为什么结论必须挂证据 ID？
> 让每个推断都能回查到具体指标 / 日志 / span，是防幻觉与支撑复盘的关键；没有证据 ID 的报告无法核查，也无法评测。

> [!QUESTION] 运维 Agent 为什么要按动作分级而不是统一人工审批？
> 只读查询占绝大多数，全部审批会失去自动化价值；按风险分级，把人力集中在中高风险动作上，同时保留审计与幂等。

> [!QUESTION] 高噪声日志应该怎么处理？
> 聚类、采样、只回传模式与计数，或用独立上下文的子 Agent 做探索并回传结构化摘要 + 证据 ID，避免主上下文被淹没。

> [!QUESTION] 为什么说「无法定位」也是一种正确输出？
> 证据不足时硬下结论会误导处置；明确升级人工并列出待补数据，比给出一个看似合理的错误根因更安全。
