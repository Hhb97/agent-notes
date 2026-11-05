---
level: 基础
tags: [ReAct, Agent 循环, Tool Calling, 工具描述, 停止条件, 消息列表]
summary: 把 Agent 拆成一条看得见的 while 循环，讲清工具调用在模型与代码之间往返的真实数据流，以及为什么工具描述、结果回填和停止条件比选框架更关键。
---

# 核心循环与工具调用

> [!ABSTRACT] 一句话版本
> - Agent 的骨架就是：**问模型 → 若要调工具就执行 → 结果回填进消息列表 → 再问模型**，直到给出答案或触发停止条件。
> - **模型只发出调用请求，不执行代码**；工具结果是作为一条新消息追加进上下文的，不是「函数返回值」直接传给模型。
> - **工具描述是写给模型看的 API 文档**：描述含糊、参数命名随意，比代码写错更容易导致失败。
> - 框架只是把这条循环包装得更好看，并附带记忆、重试、日志和暂停恢复能力。

## 一、那条循环长什么样

```python
# 概念示意：不同 SDK 的方法名不同，这里只表达结构
messages = [{"role": "system", "content": "你是订单助手"},
            {"role": "user", "content": question}]
tools = [ ... ]                       # 工具清单：名字 + 描述 + 参数 schema

for step in range(MAX_STEPS):         # 停止条件：必须有
    resp = call_model(messages, tools)
    if not resp.tool_calls:          # 模型没再要工具 → 认为任务完成
        return resp.text
    for call in resp.tool_calls:
        result = run_tool(call.name, call.arguments)   # 你的代码执行
        messages.append({"role": "tool", "content": str(result),
                         "tool_call_id": call.id})     # 结果回填
raise RuntimeError("超过最大轮次，请人工介入")
```

三个初学者容易忽略的点：

- **停止条件是必需品**：最大轮次、最大耗时、最大花费。少一个，模型一次误判就可能让程序一直转。
- **工具结果也占上下文**：每轮消息越来越长，token 成本和「注意力稀释」同时上升。
- **循环是你写的**：框架没有魔法，它只是把上面几行封装成 API，见 [不用框架的最小 Agent 循环](#/python/minimal-loop)。

## 二、工具调用的真实数据流

<figure class="fig">
<svg viewBox="0 0 760 330" class="dg" role="img" aria-label="工具调用时序：用户提问，程序把问题与工具清单发给模型，模型返回调用请求，程序执行工具并回填结果，再问模型">
<rect class="b" x="20" y="20" width="120" height="36" rx="8"/><text class="tb" x="80" y="38" text-anchor="middle" dominant-baseline="middle">用户</text>
<rect class="b1" x="200" y="20" width="140" height="36" rx="8"/><text class="tb" x="270" y="38" text-anchor="middle" dominant-baseline="middle">你的程序</text>
<rect class="b2" x="400" y="20" width="140" height="36" rx="8"/><text class="tb" x="470" y="38" text-anchor="middle" dominant-baseline="middle">大模型</text>
<rect class="b3" x="600" y="20" width="140" height="36" rx="8"/><text class="tb" x="670" y="38" text-anchor="middle" dominant-baseline="middle">工具函数</text>
<line class="ld" x1="80" y1="56" x2="80" y2="290"/>
<line class="ld" x1="270" y1="56" x2="270" y2="290"/>
<line class="ld" x1="470" y1="56" x2="470" y2="290"/>
<line class="ld" x1="670" y1="56" x2="670" y2="290"/>
<text class="ts" x="175" y="82" text-anchor="middle">① 提问</text>
<line class="l" x1="80" y1="92" x2="270" y2="92" marker-end="url(#arr)"/>
<text class="ts" x="370" y="122" text-anchor="middle">② 消息列表 + 工具清单</text>
<line class="l" x1="270" y1="132" x2="470" y2="132" marker-end="url(#arr)"/>
<text class="ts" x="370" y="162" text-anchor="middle">③ 工具调用请求（名字 + 参数）</text>
<line class="la" x1="470" y1="172" x2="270" y2="172" marker-end="url(#arr-a)"/>
<text class="ts" x="470" y="202" text-anchor="middle">④ 在程序里真正执行工具</text>
<line class="l" x1="270" y1="212" x2="670" y2="212" marker-end="url(#arr)"/>
<text class="ts" x="470" y="242" text-anchor="middle">⑤ 把结果作为新消息回填</text>
<line class="la" x1="670" y1="252" x2="270" y2="252" marker-end="url(#arr-a)"/>
<text class="ts" x="370" y="282" text-anchor="middle">⑥ 带着新上下文再问一次模型</text>
<line class="l" x1="270" y1="292" x2="470" y2="292" marker-end="url(#arr)"/>
</svg>
<figcaption>图 1：模型始终只收发文本，执行动作的是你的程序</figcaption>
</figure>

由此推出两条实践原则：

- **描述就是文档**。工具名、用途说明、每个参数的含义，构成模型看到的全部信息。`query(x)` 这种写法几乎必然导致乱传参数。
- **工具即权限边界**。模型能「请求」调用，但你的代码才决定「是否允许」。鉴权、参数校验、幂等控制都要写在工具内部，见 [评测、可观测与安全边界](#/basic/eval-safety)。

## 三、好工具和坏工具

| | 差的做法 | 好的做法 |
| --- | --- | --- |
| 命名 | `doIt`、`handle` | `queryOrderStatus`、`searchKnowledgeBase` |
| 描述 | 空着或复制方法名 | 说明「什么时候该用我」「返回什么」 |
| 参数 | 一个自由文本字符串 | 明确字段、类型、是否必填、取值范围 |
| 粒度 | 一个万能工具 | 每个工具做一件可判断的事 |
| 返回 | 大段原始报文 / 整张表 | 精简、结构化、只含模型需要的信息 |
| 副作用 | 不区分读与写 | 写操作单独标记，必要时加人工确认 |

> [!TIP] 一个立竿见影的调试方法
> 模型调错工具时，先打印**本次请求实际发出去的工具清单**，往往一眼就能看出是描述没写清、工具没注册，还是描述与参数对不上。

## 四、循环的三个变体

| 变体 | 差别 | 什么时候用 |
| --- | --- | --- |
| 单轮工具循环（ReAct） | 模型自己决定下一步 | 步骤不确定但总体简单 |
| 先规划再执行 | 先产出计划，逐条执行 | 长任务、需要可检查的中间计划 |
| 图编排 | 循环被画成节点与边 | 需要暂停、恢复、人工审批，见 [LangGraph](#/python/langgraph) |

无论哪种，**消息列表 + 停止条件 + 工具集合**这三样都在。

## 常见坑

> [!WARNING] 六个高频问题
> - **没设最大轮次**：两个工具之间来回打转，费用失控。
> - **结果没回填**：模型收不到工具输出，只能凭空编一个结果。
> - **工具清单每次不一样**：模型行为不可复现，评测失去意义。
> - **把失败当答案**：工具抛异常后直接把错误文本交给模型，应该明确标记失败并允许重试或退出。
> - **把外部文本当指令**：网页、文档、工具结果里可能藏「忽略之前指令」，见 [安全边界](#/basic/eval-safety)。
> - **盲目重试**：同一错误反复重试 N 轮，应先判断错误是否可恢复。

## 自测题

> [!QUESTION] 模型返回「请调用 queryOrder」时，代码发生了什么？
> 框架解析出工具名与参数，由你的程序执行对应函数，再把结果作为一条新的 tool 消息追加进消息列表，然后重新请求模型。

> [!QUESTION] 为什么工具描述比方法名更重要？
> 模型只看到名字、描述与参数 schema，看不到实现。描述决定了它能否在正确时机选对工具并给出合法参数。

> [!QUESTION] 停止条件应该包含哪些？
> 至少最大轮次；生产还应加最大耗时与预算上限，并在超限时留下日志、转人工或明确报错。

> [!QUESTION] 「框架帮我实现了 Agent 循环」，这句话里框架具体省了什么？
> 自动生成工具 schema、自动回填消息、管理历史与状态、提供重试与日志、支持暂停恢复；但循环的判断逻辑与工具实现仍是你的责任。
