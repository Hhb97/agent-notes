---
level: 深入
tags: [真实架构案例, Text-to-SQL, 语义层, Schema 检索, 静态校验, 只读执行, 审计]
summary: 用最小可运行规模讲透 Text-to-SQL 的安全闭环：Schema 检索、SQL 生成、AST 静态校验、只读执行与结果解释，以及权限、行数、超时限制、有限次自纠正与审计。
---

# Text-to-SQL 智能体：最小安全闭环

> [!ABSTRACT] 一句话版本
> - Text-to-SQL 的风险不在「SQL 写得好不好」，而在**能不能保证它只做只读、只查有权数据、不会把库拖垮**。
> - 完整链路：**意图与权限 → Schema 检索 → SQL 生成 → 静态校验（AST 级）→ 只读执行 → 结果校验与解释 → 审计**。
> - 三道硬闸：**只读账号 / 白名单表与字段**、**静态校验禁止写与危险函数**、**行数与超时 / 成本上限**。
> - 自纠正循环要有上限：执行报错可以回填让模型改一次，但不能无限重试，更不能把生产库错误信息直接暴露给用户。

> [!NOTE] 这页和「数据分析 Agent 项目架构」的分工
> 本页只讲**安全闭环本身**：一条链路、四道闸、有限次自纠正，读完能判断「我的实现有没有漏闸」。
> 真要排期实施（语义层治理、异步大查询、结果缓存、图表、容量与验收）看 [数据分析 Agent 项目架构](#/blueprint/analytics-agent)。

## 一、场景与风险

| 需求 | 风险 |
| --- | --- |
| 业务人员用自然语言查报表 | 模型可能选错表、错连字段，给出看似合理的错误数字 |
| 库表很多、字段命名不直观 | 全量 Schema 塞进上下文既贵又吵 |
| 数据按部门 / 租户隔离 | 生成 SQL 时若不带权限条件，就会越权 |
| 大表查询 | 一条没有限制的 SQL 可能拖垮数据库 |

> [!CAUTION] 这不是「让模型直接连库」
> 模型只产出待校验的 SQL 文本；**是否执行、以什么身份执行、能执行多久，全部由执行层决定**。工具层权限边界见 [生产级 Agent 架构全景](#/deep/agent-architecture)。

## 二、完整链路

<figure class="fig">
<svg viewBox="0 0 760 320" class="dg" role="img" aria-label="Text-to-SQL 链路：意图与权限、Schema 检索、SQL 生成、静态校验、只读执行、结果解释与审计，含有限次自纠正回环">
<rect class="b1" x="20" y="40" width="110" height="42" rx="8"/><text class="ts" x="75" y="61" text-anchor="middle" dominant-baseline="middle">意图与权限</text>
<rect class="b2" x="146" y="40" width="110" height="42" rx="8"/><text class="ts" x="201" y="61" text-anchor="middle" dominant-baseline="middle">Schema 检索</text>
<rect class="b3" x="272" y="40" width="110" height="42" rx="8"/><text class="ts" x="327" y="61" text-anchor="middle" dominant-baseline="middle">SQL 生成</text>
<rect class="b4" x="398" y="40" width="130" height="42" rx="8"/><text class="ts" x="463" y="61" text-anchor="middle" dominant-baseline="middle">静态校验 AST</text>
<rect class="b5" x="544" y="40" width="90" height="42" rx="8"/><text class="ts" x="589" y="61" text-anchor="middle" dominant-baseline="middle">只读执行</text>
<rect class="b2" x="650" y="40" width="90" height="42" rx="8"/><text class="ts" x="695" y="61" text-anchor="middle" dominant-baseline="middle">结果解释</text>
<line class="l" x1="130" y1="61" x2="146" y2="61" marker-end="url(#arr)"/>
<line class="l" x1="256" y1="61" x2="272" y2="61" marker-end="url(#arr)"/>
<line class="l" x1="382" y1="61" x2="398" y2="61" marker-end="url(#arr)"/>
<line class="l" x1="528" y1="61" x2="544" y2="61" marker-end="url(#arr)"/>
<line class="l" x1="634" y1="61" x2="650" y2="61" marker-end="url(#arr)"/>
<rect class="bg" x="20" y="110" width="720" height="56" rx="10"/>
<text class="t" x="380" y="130" text-anchor="middle" dominant-baseline="middle">静态校验：只允许 SELECT · 表/字段白名单 · 强制权限谓词 · 禁止多语句与危险函数</text>
<text class="ts" x="380" y="152" text-anchor="middle">执行层：只读账号 · LIMIT · 语句超时 · 扫描行数上限 · 结果大小上限</text>
<rect class="b3" x="180" y="190" width="400" height="46" rx="10"/>
<text class="t" x="380" y="213" text-anchor="middle" dominant-baseline="middle">有限次自纠正：报错 → 精简信息回填 → 重新生成（最多 N 次）</text>
<line class="ld" x1="589" y1="82" x2="589" y2="190"/>
<line class="la" x1="580" y1="190" x2="327" y2="82" marker-end="url(#arr-a)"/>
<text class="ts" x="640" y="180" text-anchor="middle">N 次仍失败 → 转人工 / 明确报错</text>
<rect class="b4" x="20" y="258" width="720" height="46" rx="10"/>
<text class="t" x="380" y="281" text-anchor="middle" dominant-baseline="middle">审计留痕：run_id · 用户身份 · 原始问题 · 生成的 SQL · 命中表 · 行数 · 耗时 · 最终答案</text>
</svg>
<figcaption>图 1：模型只产出 SQL 文本，执行与安全全部由校验层与执行层决定</figcaption>
</figure>

## 三、Schema 检索与语义层

全库 Schema 通常远超上下文预算，且大量无关表会干扰选择。做法：

| 手段 | 说明 |
| --- | --- |
| **语义层 / 元数据** | 维护表与字段的业务含义、常用指标定义、表间关联，供检索与提示词使用 |
| **Schema 检索** | 按问题检索相关表，只把命中的表结构注入上下文 |
| **视图收口** | 对业务人员暴露经过整理的宽表 / 视图，隐藏复杂 JOIN 细节 |
| **权限裁剪** | 无权表在 Schema 注入阶段就不出现 |
| **示例注入** | 少量「问题 → SQL」样例，但按相似度挑选，见 [上下文工程深入](#/deep/context-engineering) |

> [!TIP] 先修语义层，再换模型
> 大量「SQL 写错」其实是字段含义不清、指标口径没定义。补齐元数据与视图，往往比换更贵的模型有效得多。

## 四、四道安全闸

| 闸门 | 检查内容 | 失败行为 |
| --- | --- | --- |
| ① 输入与权限 | 用户身份、可见表 / 行级权限谓词 | 直接拒绝，不进入生成 |
| ② 静态校验 | 用解析器检查语句类型、表 / 字段白名单、是否含写操作 / 多语句 / 危险函数 | 拒绝执行，记录告警 |
| ③ 执行限制 | 只读账号、`LIMIT`、语句超时、扫描行数上限、结果集大小 | 超时 / 超限即中止 |
| ④ 输出与审计 | 结果解释是否超出数据、是否暴露原始错误、全程留痕 | 脱敏后再返回 |

**行级权限必须由执行层强制注入**，不能指望模型「记得加 WHERE dept_id = ...」。常见做法是在静态校验阶段检查或改写谓词，或用带行级安全策略的数据库视图。

## 五、自纠正循环

执行报错（字段不存在、类型不匹配）时，可以把精简后的错误信息回填给模型让它改一次。但必须：

- 设**最大次数**（通常 1～2 次），超限转人工或明确报错；
- 错误信息**脱敏**（不暴露表结构细节、连接串、内部堆栈）；
- 只回填**可恢复错误**；权限拒绝、语法被静态校验拦截不应重试；
- 每次重试都计入预算与审计，见 [可靠性、成本与评测门禁](#/deep/reliability-eval)。

## 六、评测与指标

| 指标 | 说明 |
| --- | --- |
| 执行通过率 | 生成的 SQL 能否成功执行 |
| 结果正确率 | 与标注 SQL / 标注结果比对 |
| 越权拦截率 | 无权表 / 行的请求是否被阻断（必须为 100%） |
| 危险语句拦截率 | 写操作、多语句是否被静态校验挡下 |
| 延迟与扫描行数 | P95 延迟、单次扫描行数上限命中情况 |
| 澄清率 | 问题歧义时是否主动反问而不是猜 |

## 常见坑

1. **让模型直连生产库**：没有只读账号与静态校验，等于把数据库交给提示词约束。
2. **全量 Schema 塞进提示词**：又贵又干扰，应按问题检索。
3. **权限条件靠模型自己写**：一旦漏掉就是越权；必须由执行层强制。
4. **无 LIMIT / 超时**：一条全表扫描拖垮线上库。
5. **无限自纠正**：错误反复回填，成本与延迟失控。
6. **把原始数据库错误返回用户**：泄漏表结构与内部信息。
7. **没维护语义层**：口径不清导致「SQL 对但数字错」。

## 自测题

> [!QUESTION] 为什么静态校验要用解析器（AST）而不是字符串匹配？
> 字符串规则容易被注释、大小写、嵌套子查询或函数绕过；解析成语法树后才能可靠判断语句类型、涉及的表与字段、是否含写操作或危险函数。

> [!QUESTION] 行级权限为什么必须由执行层保证？
> 模型生成的 SQL 是文本，可能漏写或写错权限谓词；只有执行层的视图 / 行级安全策略 / 强制改写不可绕过。

> [!QUESTION] 自纠正循环为什么必须限次并脱敏？
> 无限重试会让成本与延迟失控，且原始数据库错误常含表结构、连接信息等敏感内容；只回填可恢复错误，超限转人工。

> [!QUESTION] 「SQL 执行成功」能说明答案正确吗？
> 不能。可能选错表、错连字段或用错口径，执行成功但数字是错的；需要用标注 SQL / 标注结果评测，并优先维护语义层与视图。
