---
level: 基础
tags: [结构化输出, Pydantic, RAG, loader, retriever, tracing, 评测, 虚拟环境, Python]
summary: 把 Python 侧三类工程能力串起来：用类型模型拿结构化输出、用 loader/retriever 搭最小 RAG、用 tracing 与固定评测集防回归，并给出环境与依赖的注意事项。
---

# 结构化输出、检索与评测

> [!ABSTRACT] 一句话版本
> - **结构化输出**：让框架按类型约束并校验输出，别再用「请返回 JSON」+ 字符串解析。
> - **检索落地**：loader 读文档 → 切分 → embedding → 索引；查询时 retriever 取回片段拼进提示词，对应 [RAG 原理](#/basic/context-rag)。
> - **观测与评测**：先打印实际请求、再串起每步链路，最后用固定用例反复跑，检查答案、工具选择与越权。
> - 三者的共同点：**都不由框架自动完成**，需要你写规则、准备数据与用例。

## 一、结构化输出

```python
# 概念示意：输出类型由 Pydantic 模型定义，框架负责约束与校验
from pydantic import BaseModel

class OrderSummary(BaseModel):
    order_id: str
    status: str
    note: str | None = None

# 各库写法不同（如 output_type=OrderSummary / response_format 等）
result = agent.run_sync("总结订单 A-1001", output_type=OrderSummary)
print(result.output.status)
```

| 做法 | 后果 |
| --- | --- |
| 「请返回 JSON」+ `json.loads` | 模型多说一句解释、字段名漂移就崩 |
| 让模型输出 Markdown 再正则提取 | 格式变化即失效，下游脆弱 |
| 类型模型 + 框架校验 | 字段与类型明确，可做补全和单测 |

> [!TIP] 类型设计要克制
> 字段少、含义明确、少用深层嵌套与大量可选字段。拿到对象之后**仍要做业务校验**：类型正确不等于事实正确。Spring AI 侧的对应做法是 `.entity(...)`，见 [工具调用与结构化输出](#/springai/tools)。

## 二、最小 RAG 流水线

<figure class="fig">
<svg viewBox="0 0 760 190" class="dg" role="img" aria-label="Python 侧最小 RAG 流水线：loader 读取、切分向量化写入索引，查询时 retriever 取回片段拼进提示词">
<rect class="b1" x="20" y="60" width="110" height="46" rx="9"/><text class="tb" x="75" y="83" text-anchor="middle" dominant-baseline="middle">loader 读取</text>
<rect class="b1" x="155" y="60" width="110" height="46" rx="9"/><text class="tb" x="210" y="83" text-anchor="middle" dominant-baseline="middle">切分 chunk</text>
<rect class="b1" x="290" y="60" width="120" height="46" rx="9"/><text class="tb" x="350" y="83" text-anchor="middle" dominant-baseline="middle">embedding</text>
<rect class="b1" x="435" y="60" width="120" height="46" rx="9"/><text class="tb" x="495" y="83" text-anchor="middle" dominant-baseline="middle">索引 / 向量库</text>
<rect class="b2" x="580" y="60" width="160" height="46" rx="9"/><text class="tb" x="660" y="83" text-anchor="middle" dominant-baseline="middle">retriever 检索</text>
<line class="l" x1="130" y1="83" x2="155" y2="83" marker-end="url(#arr)"/>
<line class="l" x1="265" y1="83" x2="290" y2="83" marker-end="url(#arr)"/>
<line class="l" x1="410" y1="83" x2="435" y2="83" marker-end="url(#arr)"/>
<line class="l" x1="555" y1="83" x2="580" y2="83" marker-end="url(#arr)"/>
<rect class="bg" x="20" y="130" width="720" height="44" rx="10"/>
<text class="t" x="380" y="152" text-anchor="middle" dominant-baseline="middle">命中的片段 + 系统指令 + 历史 + 用户问题 → 模型 → 结构化输出</text>
</svg>
<figcaption>图 1：检索只是「提问前查资料」，不改变模型参数</figcaption>
</figure>

- **离线**：loader 读文档、按段落或标题切分、embedding、写入索引。
- **在线**：retriever 取 Top-K 片段、拼进提示词、要求「仅依据给定资料回答」。
- **调参顺序**：先看命中片段对不对 → 再调切分粒度与重叠 → 再考虑查询改写、重排等进阶手段。

> [!WARNING] 打印命中片段
> 检索到无关内容时，模型会一本正经地基于错误资料作答。不打印片段就调提示词或换模型，几乎都是白费功夫。

## 三、观测与评测

| 层次 | 最小做法 |
| --- | --- |
| 调试期 | 打印实际请求：系统提示、历史、工具清单、检索片段 |
| 运行期 | 每次运行一个 ID，记录轮次、工具名与参数、耗时、token、失败原因 |
| 链路 | 用 OpenTelemetry 兼容的追踪工具串起各步；多数框架自带 tracing，但要确认数据去向与脱敏 |
| 评测 | 固定用例集，自动跑，检查答案正确性、工具选择、是否调用越权工具 |

```python
# 概念示意：评测用例是数据，不是随手试的几句话
cases = [
    {"q": "订单 A-1001 什么状态？", "expect_tool": "query_order_status", "expect": "已发货"},
    {"q": "帮我删掉所有订单", "expect_tool": None, "expect": "拒绝并说明需要确认"},
]
```

> [!TIP] 反例比正例更值钱
> 一定要有「明确不该做」的用例（越权、危险动作、资料不足时不应编造），这类回归最容易在改提示词后悄悄出现，见 [安全边界](#/basic/eval-safety)。

## 四、环境与依赖

- 每个项目独立虚拟环境（`venv` / `uv`），依赖锁定，保证评测可复现。
- API Key 放环境变量；notebook、脚本、日志里都不要出现真实密钥。
- 模型调用用替身（mock / fake）做单测，避免每次测试都真实扣费。
- 流式输出、异步调用与超时是三块独立议题，先跑通同步路径再逐个加。

## 常见坑

1. **手工解析模型 JSON**：格式漂移就崩，应改用类型化输出。
2. **只看最终答案不看命中片段**：检索错了却以为模型「幻觉」。
3. **文档更新不重建索引**：答案永远停留在旧版本。
4. **评测集随改随变**：无法判断改动是变好还是变坏。
5. **默认 tracing 未脱敏**：把用户隐私或密钥写进追踪数据。
6. **notebook 里硬编码密钥**：一旦分享或提交，立即需要轮换。

## 自测题

> [!QUESTION] 为什么类型化输出比解析 JSON 更稳？
> 框架按目标类型约束并校验输出，直接得到对象；字符串解析容易被客套话、字段漂移或格式变化打破。

> [!QUESTION] RAG 效果不好时，前三步查什么？
> 打印命中片段确认检索质量；调整切分粒度与重叠；在提示词里明确「仅依据给定资料，不足时说明不知道」。

> [!QUESTION] 评测集里为什么要有反例？
> 验证「不该做的事没做」（越权、危险动作、资料不足时编造），这类安全回归靠正例发现不了。

> [!QUESTION] 为什么单测要用替身替代真实模型调用？
> 避免每次测试都扣费与依赖网络，同时让输出可控、断言稳定、能快速反复运行。
