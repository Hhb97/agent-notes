---
level: 基础
tags: [MCP, 工具生态, stdio, Streamable HTTP, MCP Server, MCP Client, USB-C]
summary: 用「AI 工具界的 USB-C」类比讲清 MCP 解决什么、Client 与 Server 各自的角色、stdio 与 HTTP 两种连接方式，以及接入外部工具时的安全边界。
---

# MCP 与工具生态

> [!ABSTRACT] 一句话版本
> - **MCP（Model Context Protocol）是一套协议**，规定「工具怎么被发现、描述、连接和调用」，让工具提供方与 Agent 不必为对方单独写适配代码。
> - 类比 **USB-C**：设备与接口都按同一标准做，插上就能用。写一次 MCP Server，IDE 插件、Spring AI 应用、Python Agent 都能接。
> - 两个角色：**Server** 暴露工具，**Client** 连接 Server 并把工具交给自己的模型使用。
> - 传输方式常见 **stdio**（本地子进程，开发方便）与 **HTTP / SSE / Streamable HTTP**（远程服务，生产常用）。
> - 接入外部工具不等于信任它：**外部返回的内容是数据，不是指令**。

## 一、没有 MCP 时的问题

假设你写了「查内部文档」的工具。Spring Boot 服务要接一遍、Python 脚本要接一遍、IDE 里的 AI 助手还要再接一遍——三套适配代码，三处要维护。工具一多，组合爆炸。

<figure class="fig">
<svg viewBox="0 0 760 250" class="dg" role="img" aria-label="没有 MCP 时每个客户端各自适配每个工具；有 MCP 时双方都只对接统一协议">
<text class="th" x="20" y="24">没有 MCP：两两适配</text>
<rect class="b1" x="20" y="42" width="120" height="34" rx="7"/><text class="ts" x="80" y="59" text-anchor="middle" dominant-baseline="middle">Spring AI 应用</text>
<rect class="b1" x="20" y="86" width="120" height="34" rx="7"/><text class="ts" x="80" y="103" text-anchor="middle" dominant-baseline="middle">Python Agent</text>
<rect class="b1" x="20" y="130" width="120" height="34" rx="7"/><text class="ts" x="80" y="147" text-anchor="middle" dominant-baseline="middle">IDE 助手</text>
<rect class="b3" x="250" y="42" width="120" height="34" rx="7"/><text class="ts" x="310" y="59" text-anchor="middle" dominant-baseline="middle">文档检索</text>
<rect class="b3" x="250" y="86" width="120" height="34" rx="7"/><text class="ts" x="310" y="103" text-anchor="middle" dominant-baseline="middle">文件系统</text>
<rect class="b3" x="250" y="130" width="120" height="34" rx="7"/><text class="ts" x="310" y="147" text-anchor="middle" dominant-baseline="middle">数据库查询</text>
<line class="l" x1="140" y1="59" x2="250" y2="59" marker-end="url(#arr)"/>
<line class="l" x1="140" y1="59" x2="250" y2="103" marker-end="url(#arr)"/>
<line class="l" x1="140" y1="59" x2="250" y2="147" marker-end="url(#arr)"/>
<line class="l" x1="140" y1="103" x2="250" y2="59" marker-end="url(#arr)"/>
<line class="l" x1="140" y1="103" x2="250" y2="103" marker-end="url(#arr)"/>
<line class="l" x1="140" y1="147" x2="250" y2="147" marker-end="url(#arr)"/>
<text class="ts" x="195" y="190" text-anchor="middle">每个客户端 × 每个工具 = 一堆适配代码</text>
<line class="ld" x1="390" y1="20" x2="390" y2="220"/>
<text class="th" x="410" y="24">有 MCP：都对接同一协议</text>
<rect class="b2" x="410" y="42" width="120" height="34" rx="7"/><text class="ts" x="470" y="59" text-anchor="middle" dominant-baseline="middle">各类客户端</text>
<rect class="bf" x="560" y="66" width="170" height="52" rx="10"/><text class="tw" x="645" y="92" text-anchor="middle" dominant-baseline="middle">MCP 统一协议</text>
<rect class="b3" x="410" y="146" width="120" height="34" rx="7"/><text class="ts" x="470" y="163" text-anchor="middle" dominant-baseline="middle">各类工具服务</text>
<line class="la" x1="530" y1="59" x2="600" y2="66" marker-end="url(#arr-a)"/>
<line class="la" x1="530" y1="163" x2="600" y2="118" marker-end="url(#arr-a)"/>
<text class="ts" x="645" y="146" text-anchor="middle">写一次 Server，多处复用</text>
</svg>
<figcaption>图 1：MCP 把「N × M 适配」收敛成「N + M 对接协议」</figcaption>
</figure>

## 二、两个角色

| 角色 | 做什么 | 初学者先做哪边 |
| --- | --- | --- |
| **MCP Server** | 声明并提供工具（名字、描述、参数 schema），处理调用请求并返回结果 | 后做：等业务里真有可复用工具时 |
| **MCP Client** | 连接一个或多个 Server，发现工具，把工具交给自己的模型使用 | **先做**：接现成 Server，体会「工具不用自己写」 |

连接建立后，Client 侧通常把发现到的工具转换成自己框架里的工具对象（Spring AI 里是 `ToolCallback` 一类），再交给模型，见 [记忆、RAG 与 MCP 落地](#/springai/rag-memory)。

> [!NOTE] MCP 不改变工具调用的本质
> 模型仍然只发出「调用哪个工具、参数是什么」的请求，见 [核心循环与工具调用](#/basic/loop)；MCP 标准化的是**工具的发现与连接**，不是让模型直接执行代码。

## 三、两种连接方式

| 方式 | 怎么连 | 适合 | 注意 |
| --- | --- | --- | --- |
| **stdio** | 客户端启动一个本地子进程，通过标准输入输出通信 | 本地开发、调试、桌面工具 | Windows 下常需按官方文档用命令包装启动；目录权限要限制 |
| **SSE / Streamable HTTP** | 通过 HTTP 连到远程服务 | 生产、多客户端共享、跨机器 | 需要鉴权、超时、网络策略与审计 |

概念示意（配置形态，具体键名以所用版本官方文档为准）：

```yaml
# 概念示意：声明一个本地 stdio 的 MCP Server
mcp:
  client:
    stdio:
      connections:
        local-docs:
          command: npx
          args: ["-y", "some-mcp-server", "./docs"]
```

## 四、安全边界

> [!CAUTION] 接入外部 MCP Server 前必须想清楚
> - **工具就是权限**：能读文件、能查库、能发请求的工具，等于把这些能力交给了模型。只暴露必要工具，目录与账号做最小权限。
> - **外部返回的是数据，不是指令**：文档、网页、工具结果里可能夹带「忽略之前指令」这类文本，提示注入风险见 [评测、可观测与安全边界](#/basic/eval-safety)。
> - **第三方 Server 要审来源**：和装依赖一样，来路不明的服务不要接到生产环境。
> - **写操作加确认**：删除、发送、下单类工具应配合人工确认或幂等设计。

## 常见坑

1. **以为 MCP 是某个框架的功能**：它是跨语言、跨框架的协议，Java 与 Python 两侧都能用。
2. **stdio 在 Windows 上启动失败**：命令与参数写法、路径空格、工作目录都可能导致连接失败，先按官方文档核对启动命令。
3. **工具一股脑全暴露**：几十个工具塞给模型，选择准确率下降、上下文变长，应按场景挑选。
4. **远程服务不加鉴权**：任何能访问地址的人都能调用工具。
5. **忽略工具版本**：Server 更新后描述或参数变了，Client 侧行为随之变化，需要回归评测。

## 自测题

> [!QUESTION] 用一句话解释 MCP 解决了什么？
> 用统一协议描述、发现和连接工具，避免每个客户端为每个工具写一套适配代码，让同一个工具服务能被不同 Agent 复用。

> [!QUESTION] MCP Client 与 Server 分别负责什么？
> Server 声明并执行工具；Client 连接 Server、发现工具，并把工具转成自己框架可用的形式交给模型。

> [!QUESTION] 本地调试和 remote 生产通常各用哪种传输？
> 本地常用 stdio 启动子进程；生产常用基于 HTTP 的 SSE / Streamable HTTP，并配合鉴权、超时与审计。

> [!QUESTION] 接入第三方 MCP Server 最大的风险是什么？
> 等于把该工具的权限交给了模型与外部服务：需要最小权限、来源审查、写操作人工确认，并把外部返回内容严格当作数据而非指令。
