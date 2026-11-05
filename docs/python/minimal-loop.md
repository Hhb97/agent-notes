---
level: 基础
tags: [最小循环, 裸 SDK, 工具 schema, 装饰器, Pydantic, MAX_STEPS, Python]
summary: 不借助任何框架，用一段结构化的伪代码把 Agent 循环讲透，并对比工具 schema 的三种写法、消息回填与停止条件这三个最容易出错的地方。
---

# 不用框架的最小 Agent 循环

> [!ABSTRACT] 一句话版本
> - **整页只有一件事**：让你能指着代码说出「模型在哪一步、我的代码在哪一步」。
> - 循环四步：发消息列表与工具清单 → 看模型要不要调工具 → 执行并回填结果 → 再问模型，直到没有工具请求或触发停止条件。
> - 工具 schema 三种写法：手写字典、装饰器自动推断、Pydantic 模型生成；**传给模型的永远是名字 + 描述 + 参数说明**。
> - 所有框架做的事，本质是把这段循环包得更省心：自动 schema、自动回填、自动记账、崩了能恢复、要审批能暂停。

## 一、循环本身

```python
# 概念示意：不同 SDK 的方法名不同，这里只表达结构
messages = [
    {"role": "system", "content": "你是订单助手，资料不足时说不知道"},
    {"role": "user", "content": question},
]
tools = [...]                        # 工具清单：名字 + 描述 + 参数 schema

for step in range(MAX_STEPS):        # ① 停止条件：必须有
    resp = client.responses.create(model=MODEL, input=messages, tools=tools)

    if not resp.tool_calls:          # ② 模型给最终答案了
        return resp.output_text

    for call in resp.tool_calls:
        result = run_tool(call.name, call.arguments)   # ③ 你的代码执行
        messages.append({                             # ④ 结果回填进上下文
            "role": "tool",
            "tool_call_id": call.id,
            "content": str(result),
        })

raise RuntimeError("超过最大轮次，转人工处理")
```

<figure class="fig">
<svg viewBox="0 0 760 230" class="dg" role="img" aria-label="最小 Agent 循环状态图：请求模型、判断是否有工具调用、执行工具回填结果、回到请求模型，或输出答案退出">
<rect class="b1" x="20" y="90" width="140" height="50" rx="10"/>
<text class="tb" x="90" y="115" text-anchor="middle" dominant-baseline="middle">请求模型</text>
<rect class="b3" x="200" y="90" width="150" height="50" rx="10"/>
<text class="tb" x="275" y="115" text-anchor="middle" dominant-baseline="middle">有工具调用？</text>
<rect class="b2" x="390" y="90" width="150" height="50" rx="10"/>
<text class="tb" x="465" y="115" text-anchor="middle" dominant-baseline="middle">执行工具</text>
<rect class="b2" x="580" y="90" width="160" height="50" rx="10"/>
<text class="tb" x="660" y="115" text-anchor="middle" dominant-baseline="middle">结果回填</text>
<rect class="b5" x="200" y="178" width="150" height="42" rx="10"/>
<text class="tb" x="275" y="199" text-anchor="middle" dominant-baseline="middle">输出答案 / 退出</text>
<line class="l" x1="160" y1="115" x2="200" y2="115" marker-end="url(#arr)"/>
<line class="l" x1="350" y1="115" x2="390" y2="115" marker-end="url(#arr)"/>
<text class="ts" x="370" y="105" text-anchor="middle">是</text>
<line class="l" x1="540" y1="115" x2="580" y2="115" marker-end="url(#arr)"/>
<line class="l" x1="660" y1="140" x2="660" y2="166" marker-end="url(#arr)"/>
<line class="l" x1="660" y1="166" x2="90" y2="166" marker-end="url(#arr)"/>
<line class="l" x1="90" y1="166" x2="90" y2="140" marker-end="url(#arr)"/>
<text class="ts" x="375" y="160" text-anchor="middle">带新消息回到第 ① 步</text>
<line class="l" x1="275" y1="140" x2="275" y2="178" marker-end="url(#arr)"/>
<text class="ts" x="310" y="160" text-anchor="middle">否</text>
</svg>
<figcaption>图 1：一个带停止条件的循环，就是 Agent 的全部骨架</figcaption>
</figure>

四个必须存在的要素：

| 要素 | 缺失后果 |
| --- | --- |
| 消息列表（状态） | 模型「失忆」，反复问同样的信息 |
| 工具清单（能力） | 模型只能凭训练记忆编内容 |
| 结果回填（闭环） | 模型收不到执行结果，只能虚构结果 |
| 停止条件（护栏） | 无限循环、费用失控 |

## 二、工具 schema 的三种写法

同一个工具，写法不同，但**传给模型的都是名字 + 描述 + 参数说明**：

| 写法 | 怎么做 | 优点 | 风险 |
| --- | --- | --- | --- |
| **手写字典 / JSON schema** | 直接写 `name` / `description` / `parameters` | 最透明，适合理解底层 | 字段多，容易漏 |
| **装饰器** | 在函数上加装饰器，框架从签名与 docstring 生成 schema | 代码最少 | docstring 含糊 → 模型乱传参数 |
| **Pydantic 模型** | 用类型标注定义参数模型，由其生成 schema | 类型安全、运行时校验 | 要明白类型标注与模型定义 |

```python
# 概念示意：装饰器写法，描述与 docstring 就是给模型看的文档
@function_tool
def query_order_status(order_id: str) -> str:
    """根据订单号查询订单当前状态，只用于订单状态查询。"""
    return order_service.status(order_id)
```

> [!WARNING] 最常见的失败原因不是代码
> 工具描述空着、参数名含糊、把多个动作塞进一个工具——这些都会让模型选错工具或编错参数。排查时先打印**实际发出去的工具清单**，见 [核心循环与工具调用](#/basic/loop)。

## 三、三个容易被忽略的细节

- **`tool_call_id` 要对得上**：一轮里可能有多个工具调用，结果必须和请求一一对应，否则模型会混淆。
- **工具结果要精简**：返回整张表、整份原始报文，会迅速吃满上下文窗口，还增加提示注入面。
- **失败要显式标记**：工具抛异常时，把「失败 + 原因」写进结果消息，让模型决定重试或说明不知道；不要静默忽略。

## 四、什么时候该换框架

| 出现了这个信号 | 说明你需要 |
| --- | --- |
| 工具越来越多、schema 手写烦了 | 组件库 / 装饰器 + 类型模型 |
| 流程有分支、要成环、要暂停 | [状态图编排](#/python/langgraph) |
| 长任务跑一半挂了要能接着跑 | 检查点 / 持久化 |
| 敏感动作前需要人类批准 | 中断 + 人工确认 |
| 想让输出直接是对象 | [结构化输出](#/python/output-rag-eval) |

## 常见坑

1. **没有 `MAX_STEPS`**：一次误判就能让程序无限打转。
2. **结果没回填或 `tool_call_id` 错位**：模型收不到执行结果。
3. **只发当前问题、不带历史**：多轮任务必然失忆。
4. **把工具返回的文本当指令**：提示注入风险，见 [安全边界](#/basic/eval-safety)。
5. **盲目重试不可恢复错误**：应先分类错误，再决定重试、换工具或退出。

## 自测题

> [!QUESTION] 模型返回工具调用请求后，代码要做的两件事是什么？
> 解析并执行对应工具；把结果作为一条带 `tool_call_id` 的新消息追加进消息列表，然后重新请求模型。

> [!QUESTION] 为什么停止条件必须写在循环里？
> 模型可能误判或反复调用同一工具；最大轮次、耗时与预算上限能防止无限循环和费用失控。

> [!QUESTION] 装饰器写法最容易出现什么问题？
> docstring 与参数说明写得太含糊，导致模型选错工具或编造参数——因为它看不到函数实现。

> [!QUESTION] 从这段循环过渡到框架，通常是因为出现了哪些需求？
> 自动管理工具 schema、显式分支与状态、崩溃后恢复、敏感动作人工确认、结构化输出与可观测性。
