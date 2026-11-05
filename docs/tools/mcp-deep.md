---
level: 进阶
tags: [MCP, tools, resources, prompts, 能力协商, stdio, Streamable HTTP, 鉴权]
summary: 深入 MCP 协议：tools / resources / prompts 三类能力、初始化与能力协商、传输方式与鉴权、Server 实现要点，以及接入第三方 Server 的安全边界。
---

# MCP 协议深入：能力与传输

> [!ABSTRACT] 一句话版本
> - MCP 不只有「工具」：**tools**（可执行动作）、**resources**（可读取的数据）、**prompts**（可复用的提示模板）三类能力。
> - 一次连接大致是：建立传输 → 初始化与能力协商 → 列出能力 → 调用 → 返回结果；Client 把发现到的能力转成自己框架的对象。
> - 传输分 **stdio**（本地子进程）与 **HTTP 系**（SSE / Streamable HTTP，远程）；远程必须做鉴权、超时与审计。
> - 接第三方 Server 与安装依赖同等风险：**最小权限、来源审查、写操作人工确认、外部内容当数据**。

> [!NOTE] 版本边界
> MCP 规范与各家 SDK 仍在演进，传输方式、能力名称与配置键随版本变化。核对时间 2026-11，具体字段以所用版本官方文档为准。入门版见 [MCP 与工具生态](#/basic/mcp)。

## 一、连接与调用流程

<figure class="fig">
<svg viewBox="0 0 760 250" class="dg" role="img" aria-label="MCP 交互时序：客户端与服务端建立传输、初始化与能力协商、列出工具、调用工具、返回结果">
<rect class="b1" x="20" y="20" width="150" height="36" rx="8"/><text class="tb" x="95" y="38" text-anchor="middle" dominant-baseline="middle">MCP Client</text>
<rect class="b3" x="590" y="20" width="150" height="36" rx="8"/><text class="tb" x="665" y="38" text-anchor="middle" dominant-baseline="middle">MCP Server</text>
<line class="ld" x1="95" y1="56" x2="95" y2="230"/>
<line class="ld" x1="665" y1="56" x2="665" y2="230"/>
<text class="ts" x="380" y="76" text-anchor="middle">① 建立传输（stdio 子进程 / HTTP 连接）</text>
<line class="l" x1="95" y1="86" x2="665" y2="86" marker-end="url(#arr)"/>
<text class="ts" x="380" y="106" text-anchor="middle">② 初始化 + 能力协商（双方声明支持什么）</text>
<line class="l" x1="95" y1="116" x2="665" y2="116" marker-end="url(#arr)"/>
<line class="la" x1="665" y1="126" x2="95" y2="126" marker-end="url(#arr-a)"/>
<text class="ts" x="380" y="146" text-anchor="middle">③ 列出 tools / resources / prompts</text>
<line class="l" x1="95" y1="156" x2="665" y2="156" marker-end="url(#arr)"/>
<line class="la" x1="665" y1="166" x2="95" y2="166" marker-end="url(#arr-a)"/>
<text class="ts" x="380" y="186" text-anchor="middle">④ Client 把能力转成 ToolCallback / 工具对象交给 Agent</text>
<line class="l" x1="95" y1="196" x2="665" y2="196" marker-end="url(#arr)"/>
<text class="ts" x="380" y="216" text-anchor="middle">⑤ 调用工具（名字 + 参数） → 结果 / 结构化错误</text>
<line class="la" x1="665" y1="226" x2="95" y2="226" marker-end="url(#arr-a)"/>
</svg>
<figcaption>图 1：MCP 标准化的是「发现与连接」，执行仍发生在 Server 端</figcaption>
</figure>

## 二、三类能力

| 能力 | 是什么 | 类比 | 典型例子 |
| --- | --- | --- | --- |
| **tools** | 可被调用、可能产生副作用的动作 | API 的 POST / 函数 | 查询文档、创建工单、执行检索 |
| **resources** | 可读取的数据 / 上下文 | API 的 GET / 文件 | 配置、文档片段、数据库 schema |
| **prompts** | 可复用的提示模板与工作流 | 预置模板 | 「总结这份文档」的标准提示 |

> [!TIP] 别把所有东西都做成 tool
> 只读的、需要被反复引用的数据更适合作为 resource；固定流程的指令适合 prompt。混在一起会让工具清单膨胀，见 [工具设计原则](#/tools/tool-design)。

## 三、传输方式

| 方式 | 怎么连 | 适合 | 注意 |
| --- | --- | --- | --- |
| **stdio** | Client 启动本地子进程，通过标准输入输出交换消息 | 本地开发、桌面工具、调试 | Windows 常需命令包装；可访问目录要限制；子进程生命周期要管理 |
| **SSE / Streamable HTTP** | 通过 HTTP 连到远程服务 | 生产、多客户端共享、跨机器 | 必须鉴权、超时、TLS、限流与审计 |

```yaml
# 概念示意：远程 MCP Server 连接；具体键名以官方文档为准
mcp:
  client:
    streamable-http:
      connections:
        internal-docs:
          url: https://mcp.internal.example/mcp
          headers:
            authorization: ${MCP_TOKEN}
```

Spring AI 侧由 MCP starter 完成连接与工具注册，见 [记忆、RAG 与 MCP 落地](#/springai/rag-memory)；Python 侧由对应的 MCP client 库完成，二者接的是同一套协议。

## 四、Server 实现要点

| 要点 | 说明 |
| --- | --- |
| 工具 schema | 名字、描述、参数类型与错误返回都要结构化，见 [工具设计原则](#/tools/tool-design) |
| 最小权限 | 只暴露必要能力；文件系统限定目录、数据库限定只读视图 |
| 鉴权 | 远程 Server 校验调用方身份，并把用户身份传到工具内部再做一次校验 |
| 超时与限流 | 防止单个调用拖垮整个 Agent 链路 |
| 错误语义 | 返回可区分的错误码，不要抛原始堆栈，见 [可靠性、成本与评测门禁](#/deep/reliability-eval) |
| 可观测 | 记录调用方、工具名、参数摘要、耗时与结果状态，挂到统一 run_id |
| 版本管理 | schema 变更要通知所有 Client 并回归评测 |

## 五、安全边界

> [!CAUTION] 接第三方 MCP Server 的四条红线
> - **来源审查**：与安装依赖一样，来路不明的 Server 不要接生产。
> - **最小权限**：目录、账号、工具集、网络出口都要收窄，见 [工具执行、沙箱与外部集成](#/tools/sandbox-integration)。
> - **写操作确认**：删除 / 发送 / 下单类能力要人工确认或幂等设计。
> - **外部内容当数据**：Server 返回的文本可能夹带注入指令，见 [提示词工程](#/llm/prompt-engineering)。

特别提醒：**能力协商不等于授权**。Server 声明自己支持哪些能力，不代表当前用户有权使用它们；权限判断必须在工具内部基于当前会话身份重做一次。

## 常见坑

1. **把所有能力都做成 tool**：清单膨胀、选择准确率下降。
2. **远程连接无鉴权**：任何能访问地址的人都能调用工具。
3. **stdio 在 Windows 启动失败**：命令包装、路径空格、工作目录未处理。
4. **工具一股脑全注册**：上下文与成本双双上升。
5. **Server 更新 schema 不通知 Client**：行为悄悄变化，评测才发现回归。
6. **把「协商到的能力」当成「用户有权」**：越权风险。

## 自测题

> [!QUESTION] MCP 的三类能力有什么区别？
> tools 是可调用的动作，resources 是可读取的数据，prompts 是可复用的提示模板；把只读数据也做成 tool 会让工具清单膨胀。

> [!QUESTION] stdio 与 HTTP 系传输各自适合什么？
> stdio 适合本地子进程与开发调试；HTTP 系（SSE / Streamable HTTP）适合远程、多客户端共享，但必须加鉴权、超时与审计。

> [!QUESTION] 为什么说「能力协商不等于授权」？
> 协商只说明 Server 支持哪些能力，与当前用户是否有权无关；权限判断必须在工具内部基于会话身份重新进行。

> [!QUESTION] 接入第三方 MCP Server 最需要防的是什么？
> 供应链与权限风险：审查来源、最小权限、写操作人工确认，并把返回内容严格当作不可信数据。
