---
level: 进阶
tags: [记忆系统, 短期记忆, 长期记忆, 会话隔离, 摘要压缩, 事实抽取, 遗忘]
summary: 把「记忆」拆成会话内、跨会话与任务工作记忆三层，讲清写入时机、取回方式、冲突与遗忘策略、严格的隔离边界，以及隐私删除要求。
---

# 记忆系统：短期、长期与遗忘

> [!ABSTRACT] 一句话版本
> - 模型没有记忆；所谓记忆是**程序在每次请求前把相关信息重新放进上下文**，或在用时从存储里取回。
> - 三层：**短期记忆**（本次会话消息）、**长期记忆**（跨会话的用户事实与偏好）、**任务工作记忆**（长任务的计划、中间结果、外部对象引用）。
> - 关键工程问题是四个：**什么时候写、怎么取回、冲突怎么办、怎么遗忘**；以及最重要的 **按用户 + 会话 + 租户严格隔离**。
> - 记忆要可删除：用户要求「忘掉我」时，必须能从存储与索引里真正清除。

## 一、三层记忆

| 层 | 存什么 | 存多久 | 取回方式 |
| --- | --- | --- | --- |
| **短期记忆** | 本次会话的消息历史 | 会话结束即可清理 | 每次请求直接拼进上下文（滑窗 / 摘要），见 [ChatClient 与 Advisor](#/springai/chatclient) |
| **长期记忆** | 用户偏好、稳定事实、常用口径 | 跨会话，直到更新 / 删除 | 按用户 ID 查询，取回后放进系统提示 |
| **任务工作记忆** | 长任务的计划、已完成步骤、大对象引用 | 任务生命周期内 | 按 run_id 从检查点 / 存储取回，见 [Python 编排深入](#/deep/python-internals) |

<figure class="fig">
<svg viewBox="0 0 760 225" class="dg" role="img" aria-label="记忆流转：对话产生候选事实，经抽取与校验写入长期存储，按用户与会话取回后装配进上下文，并处理冲突与遗忘">
<rect class="b1" x="20" y="60" width="120" height="46" rx="9"/><text class="ts" x="80" y="83" text-anchor="middle" dominant-baseline="middle">会话消息</text>
<rect class="b2" x="160" y="60" width="130" height="46" rx="9"/><text class="ts" x="225" y="83" text-anchor="middle" dominant-baseline="middle">事实抽取 / 校验</text>
<rect class="b3" x="310" y="30" width="140" height="40" rx="8"/><text class="ts" x="380" y="50" text-anchor="middle" dominant-baseline="middle">短期：消息历史</text>
<rect class="b3" x="310" y="96" width="140" height="40" rx="8"/><text class="ts" x="380" y="116" text-anchor="middle" dominant-baseline="middle">长期：事实库</text>
<rect class="b5" x="480" y="60" width="130" height="46" rx="9"/><text class="ts" x="545" y="83" text-anchor="middle" dominant-baseline="middle">上下文装配</text>
<rect class="b1" x="630" y="60" width="110" height="46" rx="9"/><text class="ts" x="685" y="83" text-anchor="middle" dominant-baseline="middle">模型请求</text>
<line class="l" x1="140" y1="83" x2="160" y2="83" marker-end="url(#arr)"/>
<line class="l" x1="290" y1="73" x2="310" y2="50" marker-end="url(#arr)"/>
<line class="l" x1="290" y1="93" x2="310" y2="116" marker-end="url(#arr)"/>
<line class="l" x1="450" y1="50" x2="480" y2="73" marker-end="url(#arr)"/>
<line class="l" x1="450" y1="116" x2="480" y2="93" marker-end="url(#arr)"/>
<line class="l" x1="610" y1="83" x2="630" y2="83" marker-end="url(#arr)"/>
<rect class="bg" x="20" y="160" width="720" height="46" rx="10"/>
<text class="t" x="380" y="183" text-anchor="middle" dominant-baseline="middle">隔离：user_id + session_id + tenant_id　·　遗忘：过期 / 冲突覆盖 / 用户删除</text>
</svg>
<figcaption>图 1：记忆是「写入—取回—装配」的工程闭环，不是模型能力</figcaption>
</figure>

## 二、什么时候写

| 触发 | 写什么 | 注意 |
| --- | --- | --- |
| 每轮对话结束 | 短期消息（原样或摘要） | 按会话 ID 存，控制总量 |
| 用户明确表达偏好 | 长期事实（「回答用中文」「只要摘要」） | **先确认再写**，避免把一次性要求当长期偏好 |
| 任务阶段完成 | 工作记忆里的阶段结论 | 只存结论与大对象引用，不存整段过程 |
| 事实发生变化 | 更新 / 作废旧事实 | 保留版本与时间，避免新旧并存 |

> [!WARNING] 别把一切都写进长期记忆
> 长期记忆会随用户增长而膨胀，错误事实还会持续污染后续所有回答。**只写稳定、可验证、明确表达的事实**，并给每条记录加来源与时间。

## 三、取回、冲突与遗忘

| 问题 | 处理 |
| --- | --- |
| 取回太多 | 按相关性 / 时间取 Top-N，控制注入长度 |
| 历史太长 | 滑窗 + 摘要压缩，硬规则固定在系统提示层不被压掉，见 [上下文工程深入](#/deep/context-engineering) |
| 事实冲突 | 新事实覆盖旧事实（带时间戳），或标记「待确认」并询问用户 |
| 事实过期 | 设 TTL 或定期复核；业务类事实以业务系统为准，不从对话里推断 |
| 用户要求删除 | 从长期库、向量索引、日志快照中按 user_id 清除，并保留删除审计 |

**业务事实与记忆要分开**：订单状态、账户余额这类实时数据属于业务系统，应走工具查询，而不是「记住」，见 [上下文、记忆与 RAG](#/basic/context-rag)。

## 四、隔离边界

| 维度 | 要求 |
| --- | --- |
| `tenant_id` | 多租户场景第一道隔离，检索与取回都要带 |
| `user_id` | 长期记忆按用户隔离，绝不跨用户取回 |
| `session_id` | 短期记忆按会话隔离，防止「串台」 |
| `run_id` | 任务工作记忆按运行隔离，便于恢复与审计 |

> [!CAUTION] 会话串台是真实事故
> 记忆键只用一个「会话 ID」而没带用户 / 租户，可能导致 A 用户看到 B 用户的历史。所有读写都要带完整隔离键，并在评测集里放跨用户反例，见 [评测、可观测与安全边界](#/basic/eval-safety)。

## 五、和框架能力对应

| 框架侧 | 对应 |
| --- | --- |
| Spring AI `ChatMemory` + 记忆 Advisor | 短期记忆，见 [记忆、RAG 与 MCP 落地](#/springai/rag-memory) |
| LangGraph `State` / checkpointer | 任务工作记忆，见 [Python 编排深入](#/deep/python-internals) |
| 长期记忆 | 通常**自己实现**：数据库 + 按用户取回 + 注入系统提示 |

## 常见坑

1. **把实时业务数据写进记忆**：数据变了，回答还是旧的。
2. **一次性要求当长期偏好**：用户随口一句被永久记住。
3. **隔离键不完整**：跨用户 / 跨租户串台。
4. **摘要压掉硬规则**：安全约束应在系统提示层固定，不参与压缩。
5. **没有删除路径**：无法满足隐私删除要求。
6. **长期记忆无来源与时间**：冲突时无法判断谁更新。

## 自测题

> [!QUESTION] 短期记忆、长期记忆、任务工作记忆分别是什么？
> 短期是本次会话消息；长期是跨会话的稳定事实与偏好；工作记忆是长任务的计划、阶段结论与大对象引用，按 run_id 存取。

> [!QUESTION] 为什么业务实时数据不该写进记忆？
> 订单状态、余额等由业务系统维护，写进记忆只会过期；应通过工具调用实时查询。

> [!QUESTION] 记忆隔离最少要带哪些键？
> tenant_id、user_id、session_id（任务工作记忆再加 run_id）；缺任何一个都可能造成串台或越权取回。

> [!QUESTION] 用户要求「忘掉我」时，除了删长期库还要做什么？
> 还要清理向量索引、日志 / 快照里的相关记录，并保留删除审计，确保后续取回不会再带回旧数据。
