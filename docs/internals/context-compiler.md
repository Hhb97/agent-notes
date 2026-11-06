---
level: 深入
tags: [上下文编译器, IR, 预算分配, 裁剪, 稳定前缀, prompt cache, 序列化, 可复现]
summary: 把「组装提示词」建模成一个编译器：状态编译为带优先级与 token 数的中间片段，按预算分配与裁剪，再序列化成消息列表；讲清缓存键、可复现性与每段的命运记录。
---

# 上下文编译器：从状态到提示词的完整算法

> [!ABSTRACT] 一句话版本
> - 上下文装配不是字符串拼接，而是一次**编译**：`RunState → IR 片段 → 预算分配 → 排序 / 裁剪 → 序列化 → Prompt`。
> - 每个 IR 片段带 `source / priority / tokens / droppable / cacheable`，预算不足时按**可丢弃性与优先级**裁剪，而不是粗暴截断末尾。
> - **稳定前缀**（系统指令 + 工具 schema + 提示词版本）决定 prompt 缓存命中率；变动内容一律放后面。
> - 编译器要输出**装配报告**：每段是保留、压缩还是丢弃，占多少 token。没有这份报告，「模型没看到某条规则」永远查不清。

## 一、编译流水线

<figure class="fig">
<svg viewBox="0 0 760 235" class="dg" role="img" aria-label="上下文编译流水线：RunState 收集为 IR 片段，按预算分配与裁剪，序列化为消息列表并生成装配报告">
<rect class="b1" x="20" y="60" width="110" height="46" rx="9"/><text class="ts" x="75" y="83" text-anchor="middle" dominant-baseline="middle">RunState</text>
<rect class="b2" x="146" y="60" width="120" height="46" rx="9"/><text class="ts" x="206" y="83" text-anchor="middle" dominant-baseline="middle">收集 IR 片段</text>
<rect class="b3" x="282" y="60" width="120" height="46" rx="9"/><text class="ts" x="342" y="83" text-anchor="middle" dominant-baseline="middle">预算分配</text>
<rect class="b4" x="418" y="60" width="120" height="46" rx="9"/><text class="ts" x="478" y="83" text-anchor="middle" dominant-baseline="middle">排序 / 裁剪</text>
<rect class="b5" x="554" y="60" width="90" height="46" rx="9"/><text class="ts" x="599" y="83" text-anchor="middle" dominant-baseline="middle">序列化</text>
<rect class="b1" x="660" y="60" width="80" height="46" rx="9"/><text class="ts" x="700" y="83" text-anchor="middle" dominant-baseline="middle">Prompt</text>
<line class="l" x1="130" y1="83" x2="146" y2="83" marker-end="url(#arr)"/>
<line class="l" x1="266" y1="83" x2="282" y2="83" marker-end="url(#arr)"/>
<line class="l" x1="402" y1="83" x2="418" y2="83" marker-end="url(#arr)"/>
<line class="l" x1="538" y1="83" x2="554" y2="83" marker-end="url(#arr)"/>
<line class="l" x1="644" y1="83" x2="660" y2="83" marker-end="url(#arr)"/>
<rect class="bg" x="20" y="130" width="720" height="46" rx="10"/>
<text class="t" x="380" y="153" text-anchor="middle" dominant-baseline="middle">IR 片段：id · source · priority · tokens · droppable · cacheable · version</text>
<rect class="bg" x="20" y="188" width="720" height="38" rx="10"/>
<text class="ts" x="380" y="207" text-anchor="middle" dominant-baseline="middle">副产物「装配报告」：每段 KEEP / COMPRESS / DROP + token 数 + 缓存键 hash，写入链路</text>
</svg>
<figcaption>图 1：编译过程要可观测，否则上下文问题只能靠猜</figcaption>
</figure>

## 二、IR 片段与优先级

```text
Segment = {
  id, source,                     # system | tool_spec | memory | retrieval | history | tool_result | user
  priority: int,                  # 数值越大越不可丢
  tokens: int,
  droppable: bool,                # 是否允许丢弃
  compressible: bool,             # 是否可摘要压缩
  cacheable: bool,                # 是否属于稳定前缀
  version,                        # 提示词 / 工具 schema / 模型版本
  content
}
```

| source | 优先级 | droppable | compressible | cacheable |
| --- | --- | --- | --- | --- |
| 系统硬规则（安全、拒答、输出格式） | 最高 | **否** | 否 | 是 |
| 工具 schema | 高 | 部分（按场景选工具） | 否 | 是 |
| 用户当前问题 | 最高 | 否 | 否 | 否 |
| 结构化输出 schema | 高 | 否 | 否 | 是 |
| 检索片段 | 中 | 是（降 Top-K） | 是（截断 / 摘要） | 否 |
| 工具结果 | 中 | 是 | 是（只留必要字段） | 否 |
| 历史消息 | 低～中 | 是 | 是（滑窗 / 摘要） | 否 |
| 中间推理 / 计划 | 低 | 是 | 是（只留当前步骤） | 否 |

> [!CAUTION] 硬规则必须不可丢弃
> 「不得执行写操作」「资料不足时说明不知道」这类约束若参与压缩或裁剪，一次长对话后就可能被挤掉，行为悄悄改变。它们应属于最高优先级、`droppable=false`。

## 三、预算分配与裁剪算法

```text
compile(state, model_ctx_limit):
  segs = collect(state)                       # ① 收集
  reserve = state.budget.max_output_tokens     # ② 先为输出预留
  budget  = model_ctx_limit - reserve - SAFETY_MARGIN
  fixed   = [s for s in segs if not s.droppable]
  if sum(tokens(fixed)) > budget: fail_fast()  # 固定部分超预算 → 设计错误，不要静默截断
  # ③ 按优先级降序装入
  kept = sorted(segs, key=(-priority, -cacheable))
  used, result = 0, []
  for s in kept:
      if used + s.tokens <= budget:
          result.append(s); used += s.tokens
      elif s.compressible:
          c = compress(s, budget - used)      # ④ 压缩而非直接丢
          if c: result.append(c); used += c.tokens
      elif not s.droppable: fail_fast()
      else: report.drop(s)                   # ⑤ 记录丢弃原因
  # ⑥ 稳定前缀在前，变动内容在后；同 source 内保持原始顺序
  return serialize(stabilize(result)), report
```

四个工程要点：

- **先给输出预留额度**，否则长回答被截断、结构化输出解析失败，见 [结构化输出与护栏](#/llm/structured-output-guardrails)。
- **固定部分超预算要直接报错**，说明提示词或工具集设计有问题；静默截断会制造最难排查的故障。
- **压缩优先于丢弃**：历史摘要、工具结果字段裁剪、检索片段截断都比整段丢掉信息损失小，见 [上下文工程深入](#/deep/context-engineering)。
- **每段都要留痕**：装配报告进入链路，回答「这条规则为什么没生效」时能一眼看到它被 DROP 了。

## 四、稳定前缀与缓存键

```text
cache_key = hash(
  model_version +
  system_prompt_version +
  tool_schema_snapshot +
  output_schema +
  serialization_format
)
```

- 稳定前缀（系统指令、工具 schema、输出 schema）保持**字节级一致**，才能命中 prompt 缓存。
- 任何会变动的内容（时间、用户 ID、检索片段、历史）都放到前缀之后；把「当前时间」写进系统提示是常见的缓存杀手。
- 缓存只影响成本与延迟，**不影响正确性**；但提示词版本混杂会让命中率骤降，见 [模型选型与关键参数](#/llm/model-selection)。

## 五、可复现性

| 破坏可复现的因素 | 对策 |
| --- | --- |
| 工具清单动态变化 | 在 RunState 里快照，见 [循环的状态机本质](#/internals/loop-state-machine) |
| 检索结果每次不同 | 记录命中 chunk_id 与分数；评测时用固定快照 |
| 历史摘要由模型生成 | 摘要也记版本与输入范围 |
| 提示词 / 模型版本没记录 | 编译报告写入 `prompt_version`、`model_version` |
| 随机裁剪顺序 | 用确定性排序（优先级 + 稳定 id） |

**评测要能重放同一次编译**：保存 RunState 快照 + 装配报告 + 最终 Prompt 摘要，才能把「答案变差」归因到检索、裁剪还是模型，见 [评测系统深入](#/internals/eval-system)。

## 六、关键参数

| 参数 | 说明 |
| --- | --- |
| `model_ctx_limit` | 模型上下文上限（输入 + 输出） |
| `reserve_output_tokens` | 输出预留，含结构化输出所需长度 |
| `safety_margin` | 分词估算误差余量（中文尤其需要） |
| `max_tool_specs` | 单次请求工具数量上限 |
| `top_k_retrieval` / `max_chunk_tokens` | 检索片段数与单段长度 |
| `history_window` / `summary_trigger` | 滑窗大小与触发摘要的阈值 |
| `compression_policy` | 各 source 的压缩器与最小保留长度 |

## 常见坑

1. **按字符数估算 token**：中文误差大，预算被击穿。
2. **把时间戳写进系统提示**：缓存前缀每轮都变。
3. **硬规则参与压缩**：长会话后安全约束消失。
4. **静默截断固定部分**：问题随机出现且无法复现。
5. **不记录装配报告**：无法解释「模型为何没看到某条指令」。
6. **检索片段与历史混排**：来源不清，引用溯源与去重都难做。

## 深入追问

> [!QUESTION] 为什么固定部分超预算应该直接报错而不是截断？
> 说明系统提示或工具集设计本身有问题；静默截断会制造随机、不可复现的行为异常，是最难排查的一类故障。

> [!QUESTION] 稳定前缀为什么决定缓存命中率？
> prompt 缓存依赖前缀字节级一致；系统指令、工具 schema、输出 schema 稳定才能复用，把时间或用户 ID 写进前缀会让每轮都失效。

> [!QUESTION] 装配报告为什么是必需副产物？
> 它记录每段 KEEP / COMPRESS / DROP 与 token 数，使「某条规则没生效」「某段资料没进上下文」变成可查询的事实，而不是猜测。

> [!QUESTION] 怎样让一次编译可复现？
> 快照 RunState（含工具清单、提示词与模型版本）、固定检索结果、记录摘要版本、用确定性排序裁剪，并保存装配报告与最终 Prompt 摘要。
