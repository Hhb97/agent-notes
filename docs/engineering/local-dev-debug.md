---
level: 基础
tags: [本地开发, 调试, 打印请求, mock, 录制回放, 最小复现, 环境变量]
summary: 给出 Agent 本地开发的最短起步顺序与四件调试利器：打印实际请求、打印工具清单、记录每一轮、用固定用例做最小复现，并附常见故障的定位表。
---

# 本地开发与调试

> [!ABSTRACT] 一句话版本
> - 起步顺序固定：**一次问答 → 加一个工具 → 加记忆 → 加检索 → 加编排**，每步只加一个变量，出错时才能定位。
> - 调试四件套：**打印实际请求、打印工具清单、记录每一轮、固定用例最小复现**。九成「模型不听话」都能在前两件里找到答案。
> - 用 **mock / 录制回放** 替代真实模型调用，让调试可复现、不扣费、不受网络影响。
> - 密钥只放环境变量；本地配置与提示词都要能版本化、能回滚，见 [交付与运维](#/engineering/delivery-ops)。

## 一、最短起步路径

```text
① 一次问答：prompt → call → content
② 加一个工具：确认模型能看到 schema、调用能被执行、结果能回填
③ 加记忆：确认会话 ID 隔离、历史确实被带上
④ 加检索：打印命中片段，确认拼进了提示词
⑤ 加编排 / 流式 / 结构化输出 / 多 Agent
```

> [!TIP] 一次只加一个变量
> 同时上工具 + 记忆 + 检索，出问题时你无法判断是哪一层把提示词改坏了。这条原则比任何调试工具都有效，见 [学习大纲与路线](#/start/outline)。

| 栈 | 本地准备 |
| --- | --- |
| 通用 | 模型服务 API Key、网络可达、一个能打印请求的日志开关 |
| Spring AI | JDK + Spring Boot + BOM 统一版本，见 [Spring AI 全景](#/springai/overview) |
| Python | 独立虚拟环境、锁定依赖，见 [生态地图与选型](#/python/overview) |
| 两者 | `.env` 只在本地、加忽略规则；密钥用环境变量占位 |

```bash
# 概念示意：密钥只放环境变量
export LLM_API_KEY="sk-..."        # Windows PowerShell: $env:LLM_API_KEY = "sk-..."
```

## 二、调试四件套

<figure class="fig">
<svg viewBox="0 0 760 210" class="dg" role="img" aria-label="Agent 调试决策流程：现象出现后依次检查实际请求、工具清单、每轮状态与最小复现用例">
<rect class="b1" x="20" y="70" width="120" height="46" rx="9"/><text class="ts" x="80" y="93" text-anchor="middle" dominant-baseline="middle">答非所问 / 没调工具</text>
<rect class="b2" x="160" y="70" width="120" height="46" rx="9"/><text class="ts" x="220" y="93" text-anchor="middle" dominant-baseline="middle">① 打印实际请求</text>
<rect class="b3" x="300" y="70" width="120" height="46" rx="9"/><text class="ts" x="360" y="93" text-anchor="middle" dominant-baseline="middle">② 打印工具清单</text>
<rect class="b4" x="440" y="70" width="120" height="46" rx="9"/><text class="ts" x="500" y="93" text-anchor="middle" dominant-baseline="middle">③ 记录每一轮</text>
<rect class="b5" x="580" y="70" width="160" height="46" rx="9"/><text class="ts" x="660" y="93" text-anchor="middle" dominant-baseline="middle">④ 固定用例最小复现</text>
<line class="l" x1="140" y1="93" x2="160" y2="93" marker-end="url(#arr)"/>
<line class="l" x1="280" y1="93" x2="300" y2="93" marker-end="url(#arr)"/>
<line class="l" x1="420" y1="93" x2="440" y2="93" marker-end="url(#arr)"/>
<line class="l" x1="560" y1="93" x2="580" y2="93" marker-end="url(#arr)"/>
<rect class="bg" x="20" y="140" width="720" height="50" rx="10"/>
<text class="t" x="380" y="160" text-anchor="middle" dominant-baseline="middle">定位到具体一层后再改：提示词 / 注册 / 回填 / 停止条件 / 输出转换</text>
<text class="ts" x="380" y="180" text-anchor="middle">不要一上来就换模型、调温度或改三个地方</text>
</svg>
<figcaption>图 1：先看清发生了什么，再决定改哪里</figcaption>
</figure>

| 手段 | 具体看什么 |
| --- | --- |
| **① 打印实际请求** | 系统提示、历史、检索片段、用户问题——确认 Advisor / 中间件是否改写、有没有被覆盖，见 [ChatClient 与 Advisor](#/springai/chatclient) |
| **② 打印工具清单** | 本次请求实际注册了哪些工具、描述与参数 schema 是否完整，见 [工具设计原则](#/tools/tool-design) |
| **③ 记录每一轮** | 轮次、模型输出、工具名与参数、结果摘要、耗时、token |
| **④ 最小复现** | 固定问题 + 固定工具集 + 固定模型输出，能稳定重现才谈修复 |

## 三、常见故障定位表

| 现象 | 先查 |
| --- | --- |
| 「模型说自己查不了」 | 工具没注册 / 描述为空 / 本次请求的工具清单被覆盖 |
| 模型乱传参数 | 参数 schema 含糊、类型不明确，见 [工具设计原则](#/tools/tool-design) |
| 模型「失忆」 | 会话 ID 不一致、记忆 Advisor 未生效、历史被截断 |
| 答非所问但检索正常 | 打印命中片段与拼装后的提示词，看是否被噪声淹没 |
| 循环打转 | 工具结果没回填、错误被吞、没有停止条件，见 [核心循环与工具调用](#/basic/loop) |
| 输出解析失败 | 模型多输出了说明文字，改用结构化输出，见 [结构化输出与护栏](#/llm/structured-output-guardrails) |
| 本地能跑、线上不行 | 环境变量 / 配置差异、依赖版本、网络与超时，见 [交付与运维](#/engineering/delivery-ops) |

## 四、mock 与录制回放

| 方式 | 用途 |
| --- | --- |
| **固定输出替身** | 单测里让「模型」返回预设文本 / 预设工具调用，断言业务代码行为 |
| **录制回放** | 录一次真实请求与响应，之后离线重放，调试与回归不扣费 |
| **故障注入** | 模拟超时、限流、工具报错，验证重试与降级路径 |
| **固定用例集** | 把线上坏例沉淀成可复现输入，见 [测试策略](#/engineering/testing) |

> [!NOTE] 日志要脱敏
> 「打印实际请求」很容易把密钥、用户隐私、内部资料一起打出来。本地可放宽，提交到共享环境前必须脱敏，见 [评测、可观测与安全边界](#/basic/eval-safety)。

## 常见坑

1. **不打印请求就反复改提示词**：可能那段内容根本没发出去。
2. **同时改多处**：无法归因。
3. **每次调试都真实调模型**：慢、贵、结果不可复现。
4. **把 `.env` 提交到仓库**：密钥泄漏，必须立即轮换。
5. **本地与线上依赖版本不一致**：框架 API 差异导致「本地好好的」。
6. **日志含敏感信息**：调试便利变成合规问题。

## 自测题

> [!QUESTION] 为什么起步要「一次问答 → 工具 → 记忆 → 检索」逐步加？
> 每步只引入一个变量，出问题时能立刻定位到具体层；同时上多层会让提示词、工具、状态互相干扰。

> [!QUESTION] 「模型说自己查不了」最先查什么？
> 打印本次请求实际注册的工具清单与 schema，确认工具已注册、描述不为空、没有被单次配置覆盖。

> [!QUESTION] 录制回放解决什么问题？
> 让调试与回归可复现、不依赖网络、不产生真实费用，同时便于对同一输入反复验证改动效果。

> [!QUESTION] 打印实际请求时最需要注意什么？
> 脱敏：密钥、用户隐私与内部资料不能随日志进入共享环境或仓库。
