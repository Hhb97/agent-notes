---
level: 进阶
tags: [工具设计, 工具粒度, 参数 schema, 错误语义, 幂等, 只读写分离, 工具数量]
summary: 把工具当成「给模型看的 API」来设计：粒度、命名与描述、参数 schema、返回值、错误语义、幂等与读写分离，并说明工具数量控制与动态工具集。
---

# 工具设计原则：粒度、参数与错误语义

> [!ABSTRACT] 一句话版本
> - 模型看不到工具实现，只看得到**名字 + 描述 + 参数 schema + 返回值**。所以工具设计首先是**接口文档设计**，其次才是代码。
> - 八个检查点：粒度、命名、描述、参数、返回值、**错误语义**、幂等、读写分离。漏掉后三个最容易造成线上事故。
> - 工具应**一件可判断的事**：太大模型不会用，太碎循环轮次暴涨。
> - 注册太多工具会拖长上下文、降低选择准确率，应按场景提供**动态工具子集**。

## 一、工具契约

<figure class="fig">
<svg viewBox="0 0 760 220" class="dg" role="img" aria-label="工具契约的四部分：名字与描述、参数 schema、执行与权限、返回与错误语义">
<rect class="bg" x="20" y="20" width="720" height="170" rx="12"/>
<text class="th" x="380" y="44" text-anchor="middle">模型看到的部分</text>
<rect class="b1" x="40" y="60" width="160" height="52" rx="9"/><text class="tb" x="120" y="80" text-anchor="middle" dominant-baseline="middle">名字 + 描述</text><text class="ts" x="120" y="100" text-anchor="middle">什么时候该用我</text>
<rect class="b2" x="212" y="60" width="160" height="52" rx="9"/><text class="tb" x="292" y="80" text-anchor="middle" dominant-baseline="middle">参数 schema</text><text class="ts" x="292" y="100" text-anchor="middle">类型 / 必填 / 值域</text>
<rect class="b3" x="384" y="60" width="160" height="52" rx="9"/><text class="tb" x="464" y="80" text-anchor="middle" dominant-baseline="middle">返回值</text><text class="ts" x="464" y="100" text-anchor="middle">精简 / 结构化</text>
<rect class="b4" x="556" y="60" width="164" height="52" rx="9"/><text class="tb" x="638" y="80" text-anchor="middle" dominant-baseline="middle">错误语义</text><text class="ts" x="638" y="100" text-anchor="middle">失败 / 无数据 / 拒绝</text>
<line class="ld" x1="380" y1="120" x2="380" y2="140"/>
<text class="tb" x="380" y="154" text-anchor="middle" dominant-baseline="middle">代码里不可见的部分：鉴权 · 参数白名单 · 幂等 · 超时 · 审计</text>
<text class="ts" x="380" y="176" text-anchor="middle">模型只能「请求」，是否执行由这一层决定</text>
</svg>
<figcaption>图 1：上半部分是给模型看的文档，下半部分是给人看的边界</figcaption>
</figure>

## 二、八个检查点

| # | 检查点 | 差 | 好 |
| --- | --- | --- | --- |
| 1 | 粒度 | 一个 `doEverything(payload)` | 每个工具做一件可判断的事 |
| 2 | 命名 | `handle`、`query` | `queryOrderStatus`、`searchKnowledgeBase` |
| 3 | 描述 | 空 / 复制方法名 | 说明用途、适用场景、不适用场景、返回什么 |
| 4 | 参数 | 一个自由文本字符串 | 明确字段、类型、是否必填、格式与示例 |
| 5 | 返回值 | 整张表 / 原始报文 | 精简结构化，只含模型需要的字段 |
| 6 | **错误语义** | 抛异常或返回空串 | 区分「无数据 / 参数错误 / 权限拒绝 / 下游故障」并结构化返回 |
| 7 | **幂等** | 写操作无幂等键 | 写工具必带幂等键或天然幂等 |
| 8 | **读写分离** | 读写混在一个工具 | 只读工具与写工具分开，写工具单独审批 |

```json
{
  "name": "queryOrderStatus",
  "description": "根据订单号查询当前状态；只用于状态查询，不用于修改订单。",
  "parameters": {
    "orderId": { "type": "string", "description": "订单号，形如 A-1001", "required": true }
  },
  "returns": "{ status, updatedAt } 或 { error: 'NOT_FOUND' | 'FORBIDDEN' | 'UPSTREAM_ERROR' }"
}
```

> [!TIP] 描述里写「什么时候不要用我」很有用
> 模型选错工具，常常是因为两个工具描述重叠。明确边界（「只查询，不修改」「仅内部文档，不查实时订单」）比堆更多示例有效。

## 三、错误语义为什么重要

工具结果会作为消息回填给模型，模型据此决定重试、换工具还是说明不知道。如果失败被吞掉或只返回一个空串，模型只能**虚构一个结果**。

| 返回 | 模型应能做出的判断 |
| --- | --- |
| `NOT_FOUND` | 换参数或说明查无此单 |
| `INVALID_PARAM` | 修正参数重试（有限次） |
| `FORBIDDEN` | 立即停止，不再重试 |
| `UPSTREAM_ERROR` | 可退避重试一次，或明确告知暂不可用 |
| `PARTIAL` | 说明结果不完整，别当成完整事实 |

错误文本也要**脱敏**：不返回堆栈、连接串、内部表结构，见 [Text-to-SQL 智能体架构](#/deep/case-text2sql)。

## 四、工具数量与动态工具集

| 问题 | 后果 | 做法 |
| --- | --- | --- |
| 一次注册几十个工具 | 上下文变长、选择准确率下降 | 按场景 / 租户 / 阶段提供工具子集 |
| 工具描述过长 | 挤占预算 | 精简描述，详细规则放到外部文档 |
| 工具来自多个来源（本地 + MCP） | 命名冲突、职责重叠 | 统一命名规范与注册清单，见 [MCP 协议深入](#/tools/mcp-deep) |
| 工具版本变化 | 行为悄悄改变 | 版本化 schema，改动后跑回归评测 |

> [!WARNING] 动态工具集要保证可复现
> 每次请求的工具清单若不一样，评测结果就不可比。至少记录「本次请求实际带了哪些工具」到日志与链路里，见 [本地开发与调试](#/engineering/local-dev-debug)。

## 五、和权限边界的关系

再好的描述与 schema 也只是**降低误触发**；鉴权、参数白名单、幂等、沙箱、审计必须落在执行层，见 [工具执行、沙箱与外部集成](#/tools/sandbox-integration)。Spring AI 的 `@Tool` 与 Python 的装饰器只是**声明方式**，不改变这一原则，见 [Spring AI 机制深入](#/deep/spring-ai-internals)。

## 常见坑

1. **描述空着**：模型乱选工具或编造参数，是最常见的失败原因。
2. **返回值塞整份报文**：上下文迅速被噪声占满，还扩大注入面。
3. **失败吞掉**：模型虚构执行结果。
4. **写操作没幂等键**：超时重试造成重复副作用。
5. **读写混在一个工具**：一次误判就可能产生写操作。
6. **工具一股脑全注册**：又贵又不准。

## 自测题

> [!QUESTION] 为什么说工具设计首先是接口文档设计？
> 模型只看得到名字、描述、参数 schema 与返回值，看不到实现；描述与参数是否清晰直接决定它能否选对工具并给出合法参数。

> [!QUESTION] 工具的错误语义为什么必须结构化？
> 结果会回填给模型，它据此决定重试、换工具还是说明不知道；若失败被吞掉，模型只能虚构一个执行结果。

> [!QUESTION] 为什么要读写分离并给写工具加幂等键？
> 读工具误调用最多答错，写工具误调用会产生副作用；分离便于单独审批，幂等键保证超时重试不会重复执行。

> [!QUESTION] 动态工具集带来什么新风险？
> 每次请求的工具清单不同会让行为与评测不可复现；必须记录本次实际注册的工具，并对 schema 变更做回归评测。
