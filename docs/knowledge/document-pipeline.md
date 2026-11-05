---
level: 进阶
tags: [文档解析, ETL, chunk 切分, 父子块, 元数据, 增量索引, OCR]
summary: 讲清 RAG 离线段最容易被低估的一环：不同格式文档的解析难点、切分策略对比与元数据设计，以及增量更新、版本标记与常见解析事故。
---

# 文档解析与切分策略

> [!ABSTRACT] 一句话版本
> - RAG 效果的上限常常卡在**离线段**：解析错了、切碎了、元数据没打，后面换什么模型都救不回来。
> - 流水线是 **采集 → 解析清洗 → 切分 → 元数据打标 → 向量化 → 入库**，每一步都要可重跑、可追溯。
> - 切分的第一原则是**语义完整**：按标题 / 条款 / 段落切，必要时用父子块；固定长度切只是兜底。
> - 元数据（来源、部门、密级、版本、生效时间、章节路径）不是附属品，**权限过滤与引用溯源全靠它**，见 [企业知识库助手架构](#/deep/case-kb-agent)。

## 一、离线 ETL 流水线

<figure class="fig">
<svg viewBox="0 0 760 200" class="dg" role="img" aria-label="文档 ETL 流水线：采集、解析清洗、切分、元数据打标、向量化、写入索引，并支持增量重跑">
<rect class="b1" x="20" y="56" width="105" height="44" rx="8"/><text class="ts" x="72" y="78" text-anchor="middle" dominant-baseline="middle">采集</text>
<rect class="b2" x="143" y="56" width="105" height="44" rx="8"/><text class="ts" x="195" y="78" text-anchor="middle" dominant-baseline="middle">解析清洗</text>
<rect class="b3" x="266" y="56" width="105" height="44" rx="8"/><text class="ts" x="318" y="78" text-anchor="middle" dominant-baseline="middle">切分</text>
<rect class="b4" x="389" y="56" width="120" height="44" rx="8"/><text class="ts" x="449" y="78" text-anchor="middle" dominant-baseline="middle">元数据打标</text>
<rect class="b5" x="527" y="56" width="105" height="44" rx="8"/><text class="ts" x="579" y="78" text-anchor="middle" dominant-baseline="middle">向量化</text>
<rect class="b1" x="650" y="56" width="90" height="44" rx="8"/><text class="ts" x="695" y="78" text-anchor="middle" dominant-baseline="middle">索引</text>
<line class="l" x1="125" y1="78" x2="143" y2="78" marker-end="url(#arr)"/>
<line class="l" x1="248" y1="78" x2="266" y2="78" marker-end="url(#arr)"/>
<line class="l" x1="371" y1="78" x2="389" y2="78" marker-end="url(#arr)"/>
<line class="l" x1="509" y1="78" x2="527" y2="78" marker-end="url(#arr)"/>
<line class="l" x1="632" y1="78" x2="650" y2="78" marker-end="url(#arr)"/>
<rect class="bg" x="20" y="124" width="720" height="52" rx="10"/>
<text class="t" x="380" y="144" text-anchor="middle" dominant-baseline="middle">每一步保留 doc_id / chunk_id / 版本号，支持按文档增量重跑与回滚</text>
<text class="ts" x="380" y="164" text-anchor="middle">解析失败要留错误记录，不能静默跳过（否则「资料莫名少了」）</text>
</svg>
<figcaption>图 1：离线流水线要可重跑、可观测、可回滚</figcaption>
</figure>

## 二、不同格式的解析难点

| 格式 | 常见坑 | 处理方向 |
| --- | --- | --- |
| 纯文本 / Markdown | 标题层级丢失 | 保留标题路径作为元数据，按标题切 |
| PDF（文字版） | 双栏错序、页眉页脚混入、表格线丢失 | 版面分析、去页眉页脚、按阅读顺序重排 |
| 扫描件 / 图片 | 没有文字层 | OCR + 版面还原，标记低置信度段落 |
| 表格 | 合并单元格、跨页表头丢失 | 转结构化（行列 / Markdown 表），保留表头上下文 |
| 网页 | 导航栏、广告、脚本混入正文 | 正文抽取、去模板噪声 |
| 代码 / 日志 | 按行切会破坏函数与调用栈 | 按语法单元或完整事件块切 |

> [!WARNING] 解析质量要单独验收
> 别直接拿「答案正确率」判断解析好坏。先抽样看**切出来的 chunk 原文**：如果人读不懂这一段，模型也不可能基于它答对。

## 三、切分策略对比

| 策略 | 做法 | 优点 | 代价 |
| --- | --- | --- | --- |
| 固定长度 | 每 N 个 token 切一段，可加重叠 | 简单、可预测 | 容易把句子 / 条款劈开 |
| 按段落 / 标题 | 以文档结构为边界 | **语义最完整**，推荐首选 | 需要可靠的版面解析 |
| 语义切分 | 按相邻内容相似度找边界 | 主题一致 | 计算成本、阈值难调 |
| **父子块** | 小块用于检索、大块（父段落）用于作答 | 命中准 + 语境全 | 索引里要维护父子关系 |
| 重叠窗口 | 相邻块共享一小段 | 减少边界信息丢失 | 索引变大、结果易重复（要去重） |

**经验顺序**：按结构切 → 太长再二次切 → 需要完整语境时上父子块 → 最后才考虑固定长度兜底。切分粒度要用评测集验证，别凭感觉，见 [检索优化](#/knowledge/retrieval-advanced)。

## 四、元数据设计

```text
Document(doc_id, source_uri, title, dept, level, version, effective_from, effective_to, checksum)
Chunk(chunk_id, doc_id, parent_chunk_id, text, section_path, page_no, tokens, embedding_id)
```

| 字段 | 用途 |
| --- | --- |
| `dept` / `level` | 权限过滤（**必须下推到检索请求**） |
| `version` / 生效时间 | 过期制度不再被检索，见 [上下文工程深入](#/deep/context-engineering) |
| `section_path` / `page_no` | 引用展示与人工核查 |
| `parent_chunk_id` | 父子块回溯 |
| `checksum` | 判断文档是否变化，驱动增量更新 |

> [!CAUTION] 权限元数据错误 = 越权
> 密级 / 部门打标错了，权限过滤再正确也会漏。元数据打标要可审计、可批量校正，并在评测集里放权限反例，见 [企业知识库助手架构](#/deep/case-kb-agent)。

## 五、增量更新与版本

| 场景 | 处理 |
| --- | --- |
| 文档新增 | 走完整流水线，写入新 doc_id |
| 文档修订 | 按 checksum 找出变化的 chunk，重算向量，旧片段标记失效 |
| 文档下线 | 按 doc_id 删除或标记 `effective_to` |
| 切分策略变更 | **全量重建**，并保留新旧索引对照评测 |
| embedding 模型更换 | 必须全量重算（维度 / 向量空间都变了） |

> [!TIP] 别在同一索引里混两个向量模型
> 不同 embedding 模型产出的向量不在同一空间，混用会让相似度失去意义。换模型时全量重建，见 [embedding 与向量库](#/knowledge/embedding-vectorstore)。

## 常见坑

1. **只做向量化，不做解析质检**：错序、乱码、表格散架全被写进索引。
2. **chunk 太大 / 太小**：太大噪声多，太小语义断；没有评测就调不出来。
3. **元数据缺失**：权限过滤、引用溯源、过期判断全部失效。
4. **文档更新不重建索引**：答案停留在旧版本。
5. **解析失败静默跳过**：索引看起来正常，实际少了整章。
6. **换 embedding 模型只增量更新**：新旧向量混在一起，检索质量骤降。

## 自测题

> [!QUESTION] 为什么说 RAG 上限常在离线段？
> 解析错序、切碎语义、元数据缺失都会让检索拿不到正确依据；此时换模型或调提示词都无法补回缺失的信息。

> [!QUESTION] 父子块解决什么矛盾？
> 小块检索更精准但语境不足，大块语境完整但噪声多；父子块用小片段命中、用父段落提供完整上下文。

> [!QUESTION] 元数据里哪两类字段最关键，为什么？
> 权限类（部门 / 密级）与版本类（版本 / 生效时间）：前者支撑检索前过滤，后者保证过期内容不被检索。

> [!QUESTION] 更换 embedding 模型时为什么要全量重建？
> 不同模型的向量空间、维度与相似度分布都不同，新旧向量混在同一索引里比较没有意义。
