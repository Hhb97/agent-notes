---
level: 深入
tags: [项目架构, 数据分析 Agent, 语义层, Text-to-SQL, AST 校验, 异步查询, 结果缓存, 图表]
summary: 数据分析 Agent 的完整可落地架构：语义层与指标口径、SQL 生成与 AST 静态校验、权限谓词注入、只读异步执行、结果限额与缓存、图表与解释，含工程目录、数据模型、接口契约、容量与验收。
---

# 数据分析 Agent 项目架构

> [!ABSTRACT] 一句话版本
> - 数据分析 Agent 的最大风险不是 SQL 写错，而是**查了不该查的数据**或**一条大查询拖垮库**；架构要把这两件事变成代码级约束。
> - 流水线：**语义层检索 → SQL 生成 → AST 静态校验 → 权限谓词注入 → 只读执行 → 结果限额 → 解释 / 图表 → 审计**。
> - **语义层（表 / 字段 / 指标口径）是项目的核心资产**，比换模型更能提升正确率；口径不清时「SQL 对但数字错」。
> - 小查询同步、大查询异步（队列 + 取消 + 结果对象存储），两者不能用同一套超时模型。

> [!NOTE] 这页和「Text-to-SQL 最小安全闭环」的分工
> 想先弄懂「为什么必须只读、为什么要 AST 校验、为什么权限谓词要强制注入」，读 [Text-to-SQL 智能体：最小安全闭环](#/deep/case-text2sql)。
> 本页负责把它**落成项目**：语义层怎么建、模块怎么分、表怎么设计、接口怎么定、容量怎么估、分几期上。

## 一、场景与指标

| 需求 | 约束 |
| --- | --- |
| 业务人员用自然语言查报表 / 指标 | 口径必须统一，答案要能复核 |
| 数据按部门 / 区域 / 租户隔离 | 行级权限不可绕过 |
| 大表查询、多表关联 | 不能影响线上库 |
| 结果要图表化、可导出 | 输出需结构化、可缓存 |
| 每次查询可审计 | 谁、查了什么、扫了多少行 |

| 指标 | 说明 |
| --- | --- |
| 查询执行通过率 | 生成 SQL 能否成功执行 |
| 结果正确率 | 与标注 SQL / 标注结果比对 |
| 口径正确率 | 指标定义是否用对 |
| 越权拦截率 / 危险语句拦截率 | **100%** |
| P95 延迟（同步）/ 完成时间（异步） | 分开统计 |
| 单次扫描行数 / 结果行数 | 硬上限 |

## 二、逻辑架构

<figure class="fig">
<svg viewBox="0 0 760 320" class="dg" role="img" aria-label="数据分析 Agent 架构：语义层检索、SQL 生成、AST 校验、权限注入、只读执行、结果限额与缓存、解释图表、审计与异步队列">
<rect class="b1" x="20" y="40" width="110" height="44" rx="8"/><text class="ts" x="75" y="62" text-anchor="middle" dominant-baseline="middle">自然语言问题</text>
<rect class="b2" x="146" y="40" width="120" height="44" rx="8"/><text class="ts" x="206" y="62" text-anchor="middle" dominant-baseline="middle">语义层检索</text>
<rect class="b3" x="282" y="40" width="110" height="44" rx="8"/><text class="ts" x="337" y="62" text-anchor="middle" dominant-baseline="middle">SQL 生成</text>
<rect class="b4" x="408" y="40" width="130" height="44" rx="8"/><text class="ts" x="473" y="62" text-anchor="middle" dominant-baseline="middle">AST 静态校验</text>
<rect class="b4" x="554" y="40" width="186" height="44" rx="8"/><text class="ts" x="647" y="62" text-anchor="middle" dominant-baseline="middle">权限谓词注入 / 白名单</text>
<line class="l" x1="130" y1="62" x2="146" y2="62" marker-end="url(#arr)"/>
<line class="l" x1="266" y1="62" x2="282" y2="62" marker-end="url(#arr)"/>
<line class="l" x1="392" y1="62" x2="408" y2="62" marker-end="url(#arr)"/>
<line class="l" x1="538" y1="62" x2="554" y2="62" marker-end="url(#arr)"/>
<rect class="b5" x="20" y="120" width="180" height="46" rx="9"/><text class="ts" x="110" y="143" text-anchor="middle" dominant-baseline="middle">只读账号 / 视图</text>
<rect class="b5" x="216" y="120" width="180" height="46" rx="9"/><text class="ts" x="306" y="143" text-anchor="middle" dominant-baseline="middle">LIMIT / 超时 / 扫描上限</text>
<rect class="b5" x="412" y="120" width="160" height="46" rx="9"/><text class="ts" x="492" y="143" text-anchor="middle" dominant-baseline="middle">结果集限额 / 缓存</text>
<rect class="b2" x="588" y="120" width="152" height="46" rx="9"/><text class="ts" x="664" y="143" text-anchor="middle" dominant-baseline="middle">解释 / 图表规格</text>
<line class="l" x1="647" y1="84" x2="647" y2="120" marker-end="url(#arr)"/>
<line class="l" x1="588" y1="143" x2="572" y2="143" marker-end="url(#arr)"/>
<line class="l" x1="412" y1="143" x2="396" y2="143" marker-end="url(#arr)"/>
<line class="l" x1="216" y1="143" x2="200" y2="143" marker-end="url(#arr)"/>
<rect class="bg" x="20" y="188" width="720" height="54" rx="10"/>
<text class="tb" x="36" y="208">异步支路</text>
<text class="ts" x="36" y="230">大查询 → 任务队列 → Worker（可取消）→ 结果写对象存储 → 轮询 / 回调 → 图表渲染</text>
<rect class="bg" x="20" y="254" width="720" height="54" rx="10"/>
<text class="tb" x="36" y="274">治理</text>
<text class="ts" x="36" y="296">语义层版本 · 每次查询留痕（原始问题 / SQL / 命中表 / 行数 / 耗时）· 越权与危险语句告警</text>
</svg>
<figcaption>图 1：校验与权限必须在执行之前，异步支路保障大查询不拖垮请求链路</figcaption>
</figure>

## 三、工程模块目录

```text
analytics-agent/
├── api/                  # 查询提交、状态查询、取消、导出、SSE
├── semantic/             # 语义层：表/字段/指标定义、同义词、口径版本、Schema 检索
├── nl2sql/
│   ├── generator/        # SQL 生成、few-shot 选择、澄清反问
│   └── validator/        # AST 解析、语句类型、表字段白名单、危险函数拦截
├── security/             # 身份 → 行级权限谓词、租户过滤、只读账号凭据
├── executor/
│   ├── sync/             # 小查询同步执行（LIMIT / 语句超时）
│   ├── async/            # 队列、worker、租约、取消令牌、结果落对象存储
│   └── limiter/          # 扫描行数、结果大小、并发与配额
├── presentation/         # 结果解释、图表规格生成、导出格式
├── cache/                # 语义层缓存、查询结果缓存（带权限键）
├── audit/                # QueryLog、告警、评测数据
└── config/               # 指标口径版本、白名单、限额、模型档位
```

## 四、数据模型

```text
SemanticModel(model_id PK, tenant_id, table_name, column_name, business_name,
              description, data_type, is_sensitive, version)
MetricDef(metric_id PK, tenant_id, name, expression, grain, filters,
          owner, version, effective_from)
RowPolicy(policy_id PK, tenant_id, role, table_name, predicate_template)
QueryLog(query_id PK, run_id, tenant_id, user_id, question, rewritten_sql,
         status, hit_tables, scanned_rows, result_rows, elapsed_ms, error_code, created_at)
AsyncJob(job_id PK, query_id, status, cancel_requested, result_uri, expires_at)
ResultCache(cache_key PK, tenant_id, role_digest, sql_digest, result_uri, created_at, ttl)
Audit(audit_id PK, query_id, actor, action, params_digest, created_at)
```

| 字段 | 用途 |
| --- | --- |
| `MetricDef.expression` | 统一口径，避免每个模型自由发挥「活跃用户」定义 |
| `RowPolicy.predicate_template` | 行级权限强制注入，不依赖模型写 WHERE |
| `QueryLog.scanned_rows` | 成本归因与异常大查询告警 |
| `ResultCache.cache_key` | **必须包含租户与角色摘要**，否则跨权限命中缓存会泄漏数据 |

> [!CAUTION] 缓存键必须带权限维度
> 两个用户问同一句话、SQL 相同但行级权限不同，若共用缓存就会越权。缓存键至少包含 `tenant_id + role_digest + sql_digest`，见 [记忆系统](#/knowledge/memory-systems) 的隔离原则。

## 五、接口契约

```text
POST /v1/queries
  { question, chart_hint?, async?: bool }
  -> 同步: { query_id, columns[], rows[], chart_spec?, explanations[], citations[] }
  -> 异步: { query_id, job_id, status: QUEUED, poll_url }
GET  /v1/jobs/{job_id}     -> { status, progress?, result_uri?, error_code? }
POST /v1/jobs/{id}/cancel  -> { status: CANCELLED }
GET  /v1/semantic/metrics  -> 当前可用指标口径（供前端提示与澄清）

# 内部契约
validate(sql_ast) -> { ok, violations[] }   # 只允许 SELECT、白名单表字段、禁多语句/危险函数
inject_policy(sql_ast, session) -> sql_ast  # 强制行级谓词与租户条件
```

## 六、关键设计决策

| 决策 | 选择 | 理由 |
| --- | --- | --- |
| 语义层 | 自建表 / 字段 / 指标元数据 + 视图 | 口径统一、Schema 可检索，比换模型更有效，见 [Text-to-SQL 智能体架构](#/deep/case-text2sql) |
| 校验 | AST 解析而非字符串匹配 | 注释、大小写、嵌套查询容易绕过字符串规则 |
| 权限 | 执行层强制注入谓词 + 只读账号 | 模型生成的文本不可信 |
| 执行 | 小查询同步、大查询异步 | 超时模型不同，避免长查询占满请求线程 |
| 结果 | 行数 / 大小硬上限 + 对象存储 | 防止大结果集打爆内存与上下文 |
| 解释 | 基于结果数据生成，附 SQL 供复核 | 让业务能验证数字，而非盲信 |
| 自纠正 | 最多 1～2 次，错误信息脱敏 | 无限重试会放大成本，见 [可靠性、成本与评测门禁](#/deep/reliability-eval) |

**澄清反问是一等能力**：时间范围、口径、维度不明确时先反问，而不是猜一个默认值生成看似合理的错误数字。

## 七、容量与降级

```text
日均 2000 查询，其中 15% 为异步大查询；同步平均 1.4 次模型调用
→ 同步模型调用 ≈ 1700 × 1.4 ≈ 2380 次/日
→ 峰值按日间集中系数 5 估算并发；只读库连接池与扫描行数上限按峰值反推
→ 异步 worker 数按「峰值在途任务 × 平均执行时长 / 目标完成时间」估算
→ 结果缓存命中率目标 30%（注意缓存键带权限）
```

| 故障 | 降级 |
| --- | --- |
| 语义层 / 模型不可用 | 提供指标目录与模板查询，不生成 SQL |
| 只读库超时 | 明确超时、建议缩小范围，不重试非幂等大查询 |
| AST 校验失败 | 直接拒绝并告警，不让模型「再试一次」绕过 |
| 异步队列积压 | 限流新任务、优先小查询，展示排队位置 |
| 结果超限额 | 返回截断标记 + 聚合摘要，说明不完整 |

## 八、分阶段实施与验收

| 阶段 | 范围 | 退出条件 |
| --- | --- | --- |
| P0 | 语义层 + 白名单视图 + AST 校验 + 同步只读执行 | 危险语句拦截 100%，标注集执行通过率达标 |
| P1 | 行级权限注入 + 审计 + 结果限额 | 越权反例 0 例外，缓存跨权限测试通过 |
| P2 | 异步大查询 + 取消 + 结果对象存储 | 故障注入后可取消 / 可恢复 |
| P3 | 图表、解释、口径澄清、缓存、评测门禁 | 结果正确率与口径正确率达标，P95 符合 SLO |

**验收清单**：越权 / 危险语句拦截 100% · 每条查询可审计（SQL、表、行数、耗时）· 缓存键含权限维度 · 大查询不影响线上库（扫描行数上限生效）· 澄清反问覆盖歧义用例 · 灰度与回滚演练通过。

## 常见坑

1. **没有口径治理就先上问答**：同名字段有多种业务含义，SQL 执行成功但数字全错；先建语义层与指标口径。
2. **大查询走同步链路**：一条全表扫描把请求线程全占满；超过阈值的查询必须转异步并支持取消。
3. **缓存键不含权限维度**：A 部门命中了 B 部门的结果，直接变成数据泄漏；缓存键必须含租户与权限范围。
4. **静态校验只做关键词匹配**：注释、大小写、子查询就能绕过；要用 AST 判断语句类型与涉及的表字段。
5. **把百万行结果直接回传模型**：token 爆炸且答不出重点；先聚合、限额，再让模型解释。

## 自测题

> [!QUESTION] 为什么语义层比换模型更能提升正确率？
> 大量「SQL 写错」其实是字段含义与指标口径不清；统一元数据与视图后，模型只需在正确范围内组合，错误率显著下降。

> [!QUESTION] 为什么静态校验要用 AST 而不是字符串规则？
> 字符串匹配容易被注释、大小写、嵌套子查询或函数绕过；语法树能可靠判定语句类型、涉及表字段与危险结构。

> [!QUESTION] 查询结果缓存键为什么必须包含权限摘要？
> 同一问题、同一 SQL 在不同租户 / 角色下应返回不同数据；缓存键缺权限维度会造成跨权限数据泄漏。

> [!QUESTION] 大查询为什么要走异步支路？
> 超时模型与同步请求完全不同：需要队列、租约、取消令牌、结果落对象存储与状态查询，用 HTTP 超时兜底会导致任务失控。
