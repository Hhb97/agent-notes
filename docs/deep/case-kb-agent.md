---
level: 深入
tags: [真实架构案例, 知识库助手, RAG, 权限过滤, 引用溯源, 拒答, 增量索引]
summary: 以企业知识库助手为例，完整拆解离线索引流水线与在线问答链路，重点讲权限前置过滤、引用可追溯、资料不足拒答、增量索引与评测闭环这些生产必需设计。
---

# 企业知识库助手架构

> [!ABSTRACT] 一句话版本
> - 知识库助手是 **RAG + 权限 + 溯源** 的组合，不是「把文档丢给模型」；难点全在检索前与回答后的工程环节。
> - 两条链路：**离线**（采集 → 解析 → 切分 → 向量化 → 带权限元数据入库）与**在线**（身份 → 权限过滤 → 检索 → 重排 → 拼装 → 生成 → 引用校验）。
> - 三个必须做的硬设计：**权限过滤在检索之前**、**答案能指回原文片段**、**资料不足时明确拒答**。
> - 效果由评测闭环驱动：命中率、依据可追溯率、拒答正确率、越权命中率，而不是「感觉回答还不错」。

## 一、场景与边界

| 需求 | 说明 |
| --- | --- |
| 用户问内部制度 / 产品手册 / 历史工单 | 知识在模型训练数据之外，且随业务更新 |
| 不同部门可见文档不同 | 权限必须与现有身份体系一致 |
| 答案要能核查 | 需要给出处，便于用户与审计复核 |
| 资料里没有时不能编 | 需要明确的拒答策略 |

**不该由它做的事**：查实时订单 / 库存（应走工具接口，见 [上下文、记忆与 RAG](#/basic/context-rag)）、执行写操作、跨租户自由检索。

## 二、完整架构

<figure class="fig">
<svg viewBox="0 0 760 350" class="dg" role="img" aria-label="企业知识库助手架构：离线索引流水线与在线问答链路，含权限过滤、重排、引用校验与评测闭环">
<text class="th" x="20" y="24">离线：索引流水线</text>
<rect class="b1" x="20" y="40" width="110" height="40" rx="8"/><text class="ts" x="75" y="60" text-anchor="middle" dominant-baseline="middle">文档采集</text>
<rect class="b1" x="146" y="40" width="110" height="40" rx="8"/><text class="ts" x="201" y="60" text-anchor="middle" dominant-baseline="middle">解析与清洗</text>
<rect class="b1" x="272" y="40" width="110" height="40" rx="8"/><text class="ts" x="327" y="60" text-anchor="middle" dominant-baseline="middle">切分 chunk</text>
<rect class="b1" x="398" y="40" width="130" height="40" rx="8"/><text class="ts" x="463" y="60" text-anchor="middle" dominant-baseline="middle">权限元数据打标</text>
<rect class="b1" x="544" y="40" width="196" height="40" rx="8"/><text class="ts" x="642" y="60" text-anchor="middle" dominant-baseline="middle">向量化 → 索引（可增量更新）</text>
<line class="l" x1="130" y1="60" x2="146" y2="60" marker-end="url(#arr)"/>
<line class="l" x1="256" y1="60" x2="272" y2="60" marker-end="url(#arr)"/>
<line class="l" x1="382" y1="60" x2="398" y2="60" marker-end="url(#arr)"/>
<line class="l" x1="528" y1="60" x2="544" y2="60" marker-end="url(#arr)"/>
<line class="ld" x1="20" y1="98" x2="740" y2="98"/>
<text class="th" x="20" y="124">在线：一次问答</text>
<rect class="b2" x="20" y="140" width="100" height="40" rx="8"/><text class="ts" x="70" y="160" text-anchor="middle" dominant-baseline="middle">身份与权限</text>
<rect class="b3" x="136" y="140" width="110" height="40" rx="8"/><text class="ts" x="191" y="160" text-anchor="middle" dominant-baseline="middle">候选集过滤</text>
<rect class="b2" x="262" y="140" width="110" height="40" rx="8"/><text class="ts" x="317" y="160" text-anchor="middle" dominant-baseline="middle">混合检索</text>
<rect class="b2" x="388" y="140" width="110" height="40" rx="8"/><text class="ts" x="443" y="160" text-anchor="middle" dominant-baseline="middle">重排 / 去重</text>
<rect class="b3" x="514" y="140" width="110" height="40" rx="8"/><text class="ts" x="569" y="160" text-anchor="middle" dominant-baseline="middle">上下文装配</text>
<rect class="b5" x="640" y="140" width="100" height="40" rx="8"/><text class="ts" x="690" y="160" text-anchor="middle" dominant-baseline="middle">模型生成</text>
<line class="l" x1="120" y1="160" x2="136" y2="160" marker-end="url(#arr)"/>
<line class="l" x1="246" y1="160" x2="262" y2="160" marker-end="url(#arr)"/>
<line class="l" x1="372" y1="160" x2="388" y2="160" marker-end="url(#arr)"/>
<line class="l" x1="498" y1="160" x2="514" y2="160" marker-end="url(#arr)"/>
<line class="l" x1="624" y1="160" x2="640" y2="160" marker-end="url(#arr)"/>
<rect class="bg" x="20" y="204" width="720" height="52" rx="10"/>
<text class="t" x="380" y="222" text-anchor="middle" dominant-baseline="middle">回答后处理：引用校验（每个结论能指回片段）→ 资料不足则拒答 → 脱敏 → 审计留痕</text>
<text class="ts" x="380" y="244" text-anchor="middle">所有步骤挂到同一个 run_id，便于回放</text>
<rect class="b4" x="20" y="278" width="720" height="50" rx="10"/>
<text class="t" x="380" y="296" text-anchor="middle" dominant-baseline="middle">评测闭环：命中率 · 依据可追溯率 · 拒答正确率 · 越权命中率</text>
<text class="ts" x="380" y="316" text-anchor="middle">用例集固定，改动索引 / 切分 / 提示词后跑回归门禁</text>
</svg>
<figcaption>图 1：权限在检索之前、引用在生成之后，是这套架构的两条硬约束</figcaption>
</figure>

## 三、关键设计决策

| 决策点 | 选择 | 理由 |
| --- | --- | --- |
| 权限过滤时机 | **检索前过滤候选文档集** | 无权内容一旦进入上下文就无法撤回，见 [上下文工程深入](#/deep/context-engineering) |
| 元数据 | 每个 chunk 带部门 / 密级 / 生效时间 / 文档版本 | 支持过滤、过期判断与引用展示 |
| 检索方式 | 向量 + 关键词混合，再重排 | 制度里的编号、缩写靠关键词更准 |
| 切分 | 按标题 / 条款切，父子 chunk | 小块检索、大块提供完整语境 |
| 提示词 | 明确「仅依据给定资料；不足时说明不知道」 | 抑制编造，便于评测拒答正确率 |
| 引用 | 输出带片段 ID，生成后校验是否真实存在 | 防止模型编造出处 |
| 更新 | 增量索引 + 版本标记 | 文档修订后旧片段不再被检索 |
| 多轮 | 历史只保留必要的指代消解信息 | 避免上下文被历史吃掉 |

> [!CAUTION] 越权是这类系统的头号事故
> 常见错误是「先全局检索，再在提示词里说不要引用无权内容」，或把权限判断放在生成后的过滤。正确做法是**用当前用户身份生成候选集过滤条件，作为检索请求的一部分**。

## 四、数据模型（概念）

```text
Document(doc_id, title, dept, level, version, effective_from, effective_to)
Chunk(chunk_id, doc_id, parent_chunk_id, text, embedding, section_path, tokens)
QueryLog(run_id, user_id, question_rewrite, filters, hit_chunk_ids, answer, citations, verdict)
```

`QueryLog` 是评测与审计的基础：能回答「这次为什么检索到这些片段」「答案引用是否真实」「有没有命中越权片段」。

## 五、失败模式与降级

| 现象 | 根因 | 处理 |
| --- | --- | --- |
| 答非所问 | 命中片段不相关 | 打印命中、调查询改写 / 重排 / 切分 |
| 编造出处 | 模型生成了不存在的片段 ID | 生成后按 ID 校验，失败则去掉引用或拒答 |
| 答案过期 | 索引未随文档更新 | 增量重建 + 生效时间过滤 |
| 资料不足却硬答 | 提示词没约束或评测缺反例 | 明确拒答策略并纳入用例集 |
| 检索服务不可用 | 依赖故障 | 退化为「暂无法查询资料」并明确标注，见 [生产级架构](#/deep/agent-architecture) |
| 越权命中 | 过滤条件没下推 | 阻断并告警，作为 P0 处理 |

## 六、评测指标

| 指标 | 含义 |
| --- | --- |
| 命中率 / Recall@K | 正确片段是否进入候选 |
| 答案正确率 | 与标注答案是否一致 |
| 依据可追溯率 | 每个关键结论能否指回真实片段 |
| 拒答正确率 | 资料不足时是否诚实说不知道 |
| 越权命中率 | 必须恒为 0，出现即阻断发布 |
| 延迟与成本 | P95 延迟、单次 token / 检索开销 |

评测集要包含**权限反例**（低权限用户问高密级内容）与**资料不足反例**，并作为发布门禁，见 [可靠性、成本与评测门禁](#/deep/reliability-eval)。

## 常见坑

1. **只做向量检索**：编号、型号、制度条款号命中差。
2. **权限后置**：敏感片段已进入上下文。
3. **引用不校验**：模型编造出处，审计完全失效。
4. **不重建索引 / 不留版本**：答案停留在旧制度。
5. **Top-K 一味调大**：噪声上升、成本上升、正确率反降。
6. **只看答案不看命中**：把检索问题误判成模型幻觉。

## 深入追问

> [!QUESTION] 为什么权限过滤必须下推到检索请求里？
> 因为一旦无权片段被检索并送进上下文，事后任何提示词或输出过滤都无法真正「撤回」信息；只有从候选集层面排除才成立。

> [!QUESTION] 引用溯源为什么要在生成后校验？
> 模型可能生成看似合理但不存在的片段 ID；按 ID 回查索引，校验失败就删掉引用或转拒答，才能让用户与审计真的可核查。

> [!QUESTION] 这套系统里哪类评测用例最不能省？
> 权限反例与资料不足反例。它们分别验证「不该看的没看到」和「不知道时没编造」，正例覆盖不到这两类安全回归。

> [!QUESTION] 答案变差的排查顺序是什么？
> 先打印命中片段与过滤条件，再检查查询改写 / 切分 / 重排，然后看提示词约束，最后才考虑换模型或调温度。
