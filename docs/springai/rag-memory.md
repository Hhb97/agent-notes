---
level: 基础
tags: [ChatMemory, VectorStore, ETL, QuestionAnswerAdvisor, MCP Client, MCP Server, Micrometer]
summary: 把 Spring AI 里容易混淆的三块串起来：ChatMemory 管会话历史、VectorStore 与文档 ETL 管检索、MCP starter 管外部工具，并说明可观测性与常见配置坑。
---

# 记忆、RAG 与 MCP 落地

> [!ABSTRACT] 一句话版本
> - **ChatMemory 管「本次会话说过什么」**，是短期记忆；跨会话的用户事实要自己存数据库，属于长期记忆。
> - **RAG 分两段**：离线用文档 ETL 切分、向量化、写入 `VectorStore`；在线由问答类 Advisor 自动检索并把片段拼进提示词。
> - **MCP Client** 连外部工具 Server，**MCP Server** 把自己的 `@Tool` 暴露出去；两边都靠 starter 自动配置。
> - 这三块容易混：**会话连贯用记忆，静态知识用检索，实时数据用工具，外部复用用 MCP**。

## 一、四件事各归各位

<figure class="fig">
<svg viewBox="0 0 760 240" class="dg" role="img" aria-label="Spring AI 中记忆、RAG、工具与 MCP 的分工：分别对应会话历史、静态文档、实时数据与外部工具复用">
<rect class="b1" x="20" y="36" width="170" height="70" rx="10"/>
<text class="tb" x="105" y="60" text-anchor="middle" dominant-baseline="middle">ChatMemory</text>
<text class="ts" x="105" y="84" text-anchor="middle">本次会话历史</text>
<rect class="b2" x="210" y="36" width="170" height="70" rx="10"/>
<text class="tb" x="295" y="60" text-anchor="middle" dominant-baseline="middle">VectorStore</text>
<text class="ts" x="295" y="84" text-anchor="middle">静态文档检索</text>
<rect class="b3" x="400" y="36" width="170" height="70" rx="10"/>
<text class="tb" x="485" y="60" text-anchor="middle" dominant-baseline="middle">@Tool</text>
<text class="ts" x="485" y="84" text-anchor="middle">实时数据 / 动作</text>
<rect class="b5" x="590" y="36" width="150" height="70" rx="10"/>
<text class="tb" x="665" y="60" text-anchor="middle" dominant-baseline="middle">MCP</text>
<text class="ts" x="665" y="84" text-anchor="middle">外部工具复用</text>
<rect class="bg" x="20" y="130" width="720" height="66" rx="10"/>
<text class="tb" x="380" y="152" text-anchor="middle" dominant-baseline="middle">ChatClient + Advisor 链</text>
<text class="ts" x="380" y="178" text-anchor="middle">记忆 Advisor 附加历史 · 问答 Advisor 拼入检索片段 · 日志 Advisor 记录报文</text>
<line class="l" x1="105" y1="106" x2="105" y2="130" marker-end="url(#arr)"/>
<line class="l" x1="295" y1="106" x2="295" y2="130" marker-end="url(#arr)"/>
<line class="l" x1="485" y1="106" x2="485" y2="130" marker-end="url(#arr)"/>
<line class="l" x1="665" y1="106" x2="665" y2="130" marker-end="url(#arr)"/>
<text class="ts" x="380" y="222" text-anchor="middle">先分清数据来源，再决定用哪块积木；不要用 RAG 去查实时订单</text>
</svg>
<figcaption>图 1：四种能力解决四类不同问题，最终都汇入 ChatClient</figcaption>
</figure>

## 二、ChatMemory：会话历史

| 关注点 | 学习期 | 生产期 |
| --- | --- | --- |
| 存储 | 内存实现即可 | 数据库 / Redis 持久化 |
| 隔离 | 单个会话 | **按会话 ID + 用户 ID 严格隔离** |
| 长度 | 保留最近若干轮 | 裁剪或摘要压缩，避免占满上下文窗口 |
| 接入方式 | 手动拼历史 | 记忆类 Advisor 自动附加与保存 |

> [!WARNING] 会话串台是真实事故
> 记忆必须按会话 ID 隔离。把不同用户的历史混在一起，轻则答非所问，重则泄漏信息。短期记忆与长期记忆的区别见 [上下文、记忆与 RAG](#/basic/context-rag)。

## 三、RAG：离线 ETL + 在线检索

**离线摄取**：读文档 → 切分（chunk）→ `EmbeddingModel` 向量化 → 写入 `VectorStore`。Spring AI 提供文档读取、切分与写入的抽象，各类向量库（内存、pgvector、Redis 等）有对应实现。

**在线查询**：问答 / 检索类 Advisor 自动完成「问题向量化 → 相似度检索 → 拼进提示词 → 请求模型」，对应 [RAG 三段流程](#/basic/context-rag) 的在线部分。

```yaml
# 概念示意：向量库配置随实现与版本变化，以官方文档为准
spring:
  ai:
    vectorstore:
      pgvector:
        initialize-schema: true
        dimensions: 1024
```

关键判断：**`VectorStore` 是可替换接口**。换库改依赖与配置，业务代码基本不动——这正是 Spring 抽象的价值。

> [!TIP] 效果不好时先查三件事
> ① 打印命中的检索片段（是不是压根没查到）；② 调整切分粒度与重叠；③ 在提示词里明确「仅依据给定资料回答，不足时说明不知道」。换更贵的模型通常排在这三件之后。

## 四、MCP：Client 与 Server

| 方向 | 做什么 | 典型配置 |
| --- | --- | --- |
| **作为 Client** | 加 MCP client starter，声明要连的 Server；发现到的工具以 `ToolCallbackProvider` 形式注册，交给 `ChatClient` 使用 | stdio 本地进程，或 SSE / Streamable HTTP 远程服务 |
| **作为 Server** | 把已有的 `@Tool` 方法暴露成 MCP Server，让 IDE 插件、别的 Agent 也能调用 | MCP server starter + 工具 Bean |

```yaml
# 概念示意：连接一个远程 MCP Server；具体键名以官方文档为准
spring:
  ai:
    mcp:
      client:
        streamable-http:
          connections:
            internal-docs:
              url: http://localhost:8081
```

> [!NOTE] Windows 与 stdio
> 本地 stdio 方式启动子进程时，常需按官方文档用命令包装（如 `cmd /c`）并注意路径空格；把可访问目录限制在非敏感位置。协议本身的角色与安全边界见 [MCP 与工具生态](#/basic/mcp)。

## 五、可观测性

- 基于 Micrometer 的指标与链路追踪，可对接 Prometheus / OpenTelemetry 兼容后端。
- 学习阶段最有效的仍是**日志类 Advisor**：把实际发出的提示词与工具清单打印出来。
- 每次运行记录唯一 ID、轮次、工具名与参数、耗时与 token，才能还原问题，见 [评测、可观测与安全边界](#/basic/eval-safety)。

## 常见坑

1. **把 RAG 当实时查询**：订单、库存、余额应走 `@Tool` 调接口。
2. **文档更新后没重建索引**：向量库里还是旧内容，答案自然过期。
3. **记忆没按会话隔离**：出现答非所问甚至信息串台。
4. **MCP 工具一股脑全注册**：工具太多会拖长上下文、降低选择准确率，按场景挑选。
5. **向量维度与 embedding 模型不匹配**：配置里的维度必须与实际模型输出一致。
6. **忽略远程 MCP 的鉴权与超时**：等于把工具权限暴露给所有能访问地址的人。

## 自测题

> [!QUESTION] ChatMemory 和长期记忆有什么区别？
> ChatMemory 管理本次会话的消息历史，属于短期记忆；长期记忆是跨会话保存的用户事实，通常存数据库，用时按用户取出。

> [!QUESTION] 一次 RAG 问答，离线与在线各做了什么？
> 离线把文档切分、向量化、写入向量库；在线把问题向量化、检索相关片段、拼进提示词后请求模型。

> [!QUESTION] 作为 MCP Client 接入后，工具是怎么到模型手里的？
> starter 连接 Server 并发现工具，把他们转换成 `ToolCallbackProvider` 形式，注册进 `ChatClient`，本次请求即可携带这些工具清单。

> [!QUESTION] 为什么向量库维度配置要和 embedding 模型一致？
> 维度是向量的长度，写入与检索必须使用同一模型产生的同维度向量；不匹配会导致写入失败或检索结果无意义。
