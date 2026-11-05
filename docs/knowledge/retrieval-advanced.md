---
level: 进阶
tags: [检索优化, 查询改写, 混合检索, RRF, 重排 rerank, 元数据过滤, Recall@K]
summary: 把检索拆成六个可优化的环节，讲清查询改写、混合检索与结果融合、元数据前置过滤、重排与去重，以及用命中率类指标驱动调参的方法。
---

# 检索优化：改写、混合检索与重排

> [!ABSTRACT] 一句话版本
> - 检索是一条**流水线**而不是一次 API 调用：权限过滤 → 查询改写 → 多路召回 → 融合 → 重排 → 去重拼装。
> - 用户问法和文档措辞常常不一致 → **查询改写**；纯向量对编号 / 缩写不敏感 → **混合检索**；Top-K 前几条其实不相关 → **重排**。
> - **过滤必须最前置**，否则无权内容已经进入候选集与上下文。
> - 调参看**命中率类指标**（Recall@K / MRR / NDCG）与依据可追溯率，不要只盯最终答案正确率。

## 一、六段流水线

<figure class="fig">
<svg viewBox="0 0 760 210" class="dg" role="img" aria-label="检索优化流水线：权限过滤、查询改写、向量与关键词多路召回、结果融合、重排、去重与上下文拼装">
<rect class="b4" x="20" y="60" width="110" height="44" rx="8"/><text class="ts" x="75" y="82" text-anchor="middle" dominant-baseline="middle">权限过滤</text>
<rect class="b1" x="142" y="60" width="110" height="44" rx="8"/><text class="ts" x="197" y="82" text-anchor="middle" dominant-baseline="middle">查询改写</text>
<rect class="b2" x="264" y="30" width="130" height="38" rx="8"/><text class="ts" x="329" y="49" text-anchor="middle" dominant-baseline="middle">向量召回</text>
<rect class="b2" x="264" y="96" width="130" height="38" rx="8"/><text class="ts" x="329" y="115" text-anchor="middle" dominant-baseline="middle">关键词召回</text>
<rect class="b3" x="410" y="60" width="110" height="44" rx="8"/><text class="ts" x="465" y="82" text-anchor="middle" dominant-baseline="middle">融合 / 去重</text>
<rect class="b5" x="532" y="60" width="100" height="44" rx="8"/><text class="ts" x="582" y="82" text-anchor="middle" dominant-baseline="middle">重排</text>
<rect class="b1" x="644" y="60" width="96" height="44" rx="8"/><text class="ts" x="692" y="82" text-anchor="middle" dominant-baseline="middle">拼装</text>
<line class="l" x1="130" y1="82" x2="142" y2="82" marker-end="url(#arr)"/>
<line class="l" x1="252" y1="72" x2="264" y2="49" marker-end="url(#arr)"/>
<line class="l" x1="252" y1="92" x2="264" y2="115" marker-end="url(#arr)"/>
<line class="l" x1="394" y1="49" x2="410" y2="72" marker-end="url(#arr)"/>
<line class="l" x1="394" y1="115" x2="410" y2="92" marker-end="url(#arr)"/>
<line class="l" x1="520" y1="82" x2="532" y2="82" marker-end="url(#arr)"/>
<line class="l" x1="632" y1="82" x2="644" y2="82" marker-end="url(#arr)"/>
<text class="ts" x="380" y="164" text-anchor="middle">先缩小合法候选集，再提高召回质量，最后控制进入上下文的片段数</text>
<text class="ts" x="380" y="190" text-anchor="middle">每一段都可单独埋点：命中 ID、分数、耗时、是否被后续阶段淘汰</text>
</svg>
<figcaption>图 1：把「检索质量」拆成可分别优化、可分别观测的六段</figcaption>
</figure>

## 二、各环节做什么

| 环节 | 解决什么 | 典型做法 |
| --- | --- | --- |
| **权限过滤** | 越权 | 按用户 / 部门 / 密级 / 生效时间生成过滤条件，作为检索请求的一部分 |
| **查询改写** | 问法与文档措辞不一致、多轮指代 | 结合历史补全省略；生成 2～3 个不同措辞的查询；把「它 / 上一个」换成实体 |
| **多路召回** | 单一检索方式各有盲区 | 向量（语义）+ 关键词 / BM25（编号、缩写、精确匹配） |
| **融合** | 两路结果怎么合并 | 按排名融合（如 RRF）或加权打分，避免某一路独大 |
| **重排** | Top-K 前几条其实不相关 | 用重排模型 / 交叉编码器对候选重新打分，再取少量高质量片段 |
| **去重拼装** | 片段重复、彼此矛盾 | 按 chunk_id 去重、父子块回溯、标注来源、控制总长度 |

> [!WARNING] 顺序不能反
> 常见错误是「先全局检索，再在结果里过滤权限」，或「先重排再多召回」。前者造成越权，后者让重排根本看不到被漏掉的正确片段。

## 三、什么时候加哪一环

| 现象 | 优先检查 / 加什么 |
| --- | --- |
| 该找的片段完全没出现 | 查询改写、多路召回、切分粒度，见 [文档解析与切分策略](#/knowledge/document-pipeline) |
| 片段出现了但排在后面 | 重排、融合权重 |
| 编号 / 型号 / 条款号查不到 | 关键词召回、混合检索 |
| 答案引用了无权内容 | 权限过滤没有下推（P0） |
| 答案自相矛盾 | 去重、按来源标注、版本过滤 |
| 上下文总是不够用 | 减小 Top-K、缩短片段、父子块，见 [上下文工程深入](#/deep/context-engineering) |

> [!TIP] 一次只调一个环节
> 六个环节同时改，指标变化无法归因。先打印每段的命中 ID 与分数，定位「丢在哪一段」，再改那一段，并用固定用例集回归。

## 四、评测指标

| 指标 | 看什么 |
| --- | --- |
| Recall@K / 命中率 | 正确片段是否进入候选集（**最关键**） |
| MRR | 第一个正确结果排在第几位 |
| NDCG@K | 排序质量（相关片段是否靠前） |
| 依据可追溯率 | 答案的每个结论能否指回真实片段 |
| 拒答正确率 | 没有可靠依据时是否诚实说不知道 |
| 越权命中率 | 必须恒为 0 |
| 延迟 / 成本 | 各段耗时、重排与多查询带来的开销 |

**分层归因**：Recall 低是召回问题；Recall 高但答案错是拼装 / 提示词 / 模型问题。把两者混在一起看「答案正确率」，就永远找不到真正的瓶颈，见 [可靠性、成本与评测门禁](#/deep/reliability-eval)。

## 常见坑

1. **权限后置**：越权片段已进入上下文。
2. **Top-K 一味调大**：噪声、成本、延迟一起上升，正确率反降。
3. **只做向量**：编号与缩写类查询命中差。
4. **多查询扩展不做预算**：一次请求变成多次检索与多次生成。
5. **重排放在极小的候选集上**：正确片段早就被召回阶段丢掉了。
6. **只看最终答案**：把召回问题误判为模型幻觉。

## 自测题

> [!QUESTION] 为什么权限过滤必须放在流水线最前面？
> 它决定合法候选集；若放在召回之后，无权片段已经被取出甚至送进上下文，事后无法真正撤回。

> [!QUESTION] 为什么需要混合检索？
> 向量擅长语义相近，但对编号、型号、专有缩写不敏感；关键词 / BM25 正好补上这一盲区，两路结果再融合。

> [!QUESTION] Recall@K 高但答案仍然错，说明什么？
> 正确片段已经进入候选，问题更可能出在排序、去重拼装、提示词约束或生成环节，而不是召回。

> [!QUESTION] 为什么调参要一次只改一个环节并打印每段命中？
> 六段互相影响，同时改无法归因；先定位丢失发生在哪一段，再改该段并用固定用例集验证是否真的提升。
