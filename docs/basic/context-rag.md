---
level: 基础
tags: [上下文窗口, 短期记忆, 长期记忆, embedding, 向量库, RAG, 切分]
summary: 区分上下文窗口、短期记忆、长期记忆与 RAG，讲清「提问前先检索资料再拼进提示词」的离线与在线两段流程，以及切分粒度与检索质量的常见坑。
---

# 上下文、记忆与 RAG

> [!ABSTRACT] 一句话版本
> - **上下文窗口**是单次请求的硬上限；**短期记忆**是本次会话的消息历史；**长期记忆**是跨会话保存、用时再取的事实。三者不是一回事。
> - **RAG 不是训练模型**：离线把文档切分、向量化、存进向量库；在线把问题也向量化、检索出相关片段、拼进提示词再提问。
> - RAG 解决「模型不知道内部资料 / 知识过期」，**不解决**「模型不会推理」或「提示词写得差」。
> - 效果主要取决于**切分粒度、检索质量、拼进提示词的内容**，而不是换一个更贵的模型。

## 一、三个层次别混

| 概念 | 是什么 | 谁负责 | 典型问题 |
| --- | --- | --- | --- |
| 上下文窗口 | 一次请求能装下的 token 上限 | 模型本身 | 超长就装不下，早期内容被挤掉 |
| 短期记忆 | 本次会话的消息历史 | 你的程序 / 框架的记忆组件 | 保留太多导致又贵又杂 |
| 长期记忆 | 跨会话的用户偏好、事实 | 数据库 + 按需检索 | 取错用户、取到过期事实 |
| RAG | 提问前检索外部资料 | 检索流水线 | 检索不到 / 检索到无关片段 |

> [!NOTE] 为什么「聊久了会失忆」
> 模型没有跨请求的记忆。所谓「记得」，其实是你的程序每次都把历史消息重新发一遍。历史太长时要做裁剪或摘要压缩，否则上下文窗口先被占满。

## 二、RAG 的两段流程

<figure class="fig">
<svg viewBox="0 0 760 300" class="dg" role="img" aria-label="RAG 离线摄取与在线查询两段流程：文档切分向量化入库，问题检索片段后拼进提示词">
<text class="th" x="20" y="26">离线：把资料变成可检索的向量</text>
<rect class="b1" x="20" y="44" width="110" height="44" rx="8"/><text class="tb" x="75" y="66" text-anchor="middle" dominant-baseline="middle">原始文档</text>
<rect class="b1" x="160" y="44" width="110" height="44" rx="8"/><text class="tb" x="215" y="66" text-anchor="middle" dominant-baseline="middle">切分 chunk</text>
<rect class="b1" x="300" y="44" width="130" height="44" rx="8"/><text class="tb" x="365" y="66" text-anchor="middle" dominant-baseline="middle">embedding</text>
<rect class="b1" x="460" y="44" width="150" height="44" rx="8"/><text class="tb" x="535" y="66" text-anchor="middle" dominant-baseline="middle">向量库 VectorStore</text>
<line class="l" x1="130" y1="66" x2="160" y2="66" marker-end="url(#arr)"/>
<line class="l" x1="270" y1="66" x2="300" y2="66" marker-end="url(#arr)"/>
<line class="l" x1="430" y1="66" x2="460" y2="66" marker-end="url(#arr)"/>
<text class="ts" x="630" y="60">一次性或定期更新</text>
<line class="ld" x1="20" y1="108" x2="740" y2="108"/>
<text class="th" x="20" y="136">在线：每次提问都先查再问</text>
<rect class="b2" x="20" y="154" width="110" height="44" rx="8"/><text class="tb" x="75" y="176" text-anchor="middle" dominant-baseline="middle">用户问题</text>
<rect class="b2" x="160" y="154" width="130" height="44" rx="8"/><text class="tb" x="225" y="176" text-anchor="middle" dominant-baseline="middle">问题向量化</text>
<rect class="b2" x="320" y="154" width="140" height="44" rx="8"/><text class="tb" x="390" y="176" text-anchor="middle" dominant-baseline="middle">相似度检索</text>
<rect class="b2" x="490" y="154" width="130" height="44" rx="8"/><text class="tb" x="555" y="176" text-anchor="middle" dominant-baseline="middle">相关片段</text>
<rect class="b3" x="20" y="224" width="600" height="50" rx="10"/><text class="tb" x="320" y="249" text-anchor="middle" dominant-baseline="middle">提示词 = 系统指令 + 历史 + 检索片段 + 用户问题</text>
<rect class="b5" x="640" y="224" width="100" height="50" rx="10"/><text class="tb" x="690" y="249" text-anchor="middle" dominant-baseline="middle">模型作答</text>
<line class="l" x1="130" y1="176" x2="160" y2="176" marker-end="url(#arr)"/>
<line class="l" x1="290" y1="176" x2="320" y2="176" marker-end="url(#arr)"/>
<line class="l" x1="460" y1="176" x2="490" y2="176" marker-end="url(#arr)"/>
<line class="l" x1="555" y1="198" x2="320" y2="224" marker-end="url(#arr)"/>
<line class="l" x1="620" y1="249" x2="640" y2="249" marker-end="url(#arr)"/>
</svg>
<figcaption>图 1：离线建索引、在线做检索；检索到的片段只是「临时拼进提示词」</figcaption>
</figure>

**离线（摄取 / ETL）**：读文档 → 切分 → 调 embedding 模型 → 写入向量库。**在线（查询）**：问题向量化 → 相似度检索 → 挑 Top-K 片段 → 拼进提示词并要求「只依据给定资料回答」。

Spring AI 侧对应 `VectorStore` + 文档 ETL，Python 侧对应各类 loader / retriever，见 [记忆、RAG 与 MCP 落地](#/springai/rag-memory) 与 [结构化输出、检索与评测](#/python/output-rag-eval)。

## 三、embedding 到底做了什么

把文本映射成一串数字（向量），**语义相近的文本，向量距离也近**。检索时不是关键词匹配，而是找「向量最接近的几段」。所以：

- 用户说「报销多久到账」，也可能检索到写着「费用结算周期」的段落；
- 但纯编号、精确型号、专有缩写，向量检索未必比关键词检索准，实践中常做**混合检索**。

> [!TIP] 切分粒度是第一个该调的参数
> 切太大 → 一段里混进多个主题，检索到的片段噪声多；切太小 → 语义不完整，模型看不到上下文。通常按段落 / 标题切并留一点重叠，再用评测集验证，不要凭感觉定。

## 四、RAG 与「记忆」怎么配合

| 需求 | 做法 |
| --- | --- |
| 本轮之前说过什么 | 短期记忆：消息历史（必要时摘要压缩） |
| 用户上次说喜欢简洁回答 | 长期记忆：存数据库，按用户 ID 取出拼进系统提示 |
| 我司制度里怎么规定 | RAG：检索制度文档片段 |
| 订单当前状态 | **不要 RAG**：调工具查实时接口，见 [核心循环与工具调用](#/basic/loop) |

一句话：**静态知识用检索，动态数据用工具，会话连贯用记忆。**

## 常见坑

> [!WARNING] 五个高频问题
> - **把整份长文档塞进提示词**：又贵又容易漏关键信息，应先切分检索。
> - **只做向量检索不看结果**：检索到无关片段时，模型会一本正经地基于错误资料作答；务必打印命中片段。
> - **忘记在提示词里限定依据**：应明确要求「仅依据给定资料，资料不足时说明不知道」。
> - **文档更新后没重建索引**：向量库里还是旧版本，答案自然过期。
> - **用 RAG 查实时数据**：库存、订单、余额这类每时每刻在变的数据应走工具接口。

## 自测题

> [!QUESTION] 短期记忆、长期记忆、RAG 分别解决什么问题？
> 短期记忆维持本次会话连贯；长期记忆保存跨会话的用户事实；RAG 让模型在回答前临时获得它训练时没有的外部资料。

> [!QUESTION] RAG 会改变模型参数吗？
> 不会。检索到的内容只是拼进本次提示词，模型权重完全不变；因此知识更新只需更新文档与索引。

> [!QUESTION] 为什么切分粒度会显著影响效果？
> 它决定每个检索单元的信息完整度与噪声量：过大混杂多主题，过小缺少上下文，两者都会让检索命中质量下降。

> [!QUESTION] 「查订单状态」应该做 RAG 吗？
> 不应该。这是实时数据，应由工具调用查询业务接口；RAG 适合制度、文档、手册这类相对静态的知识。
