---
level: 基础
tags: [Spring AI, ChatModel, ChatClient, Advisor, BOM, starter, 自动配置, Java]
summary: 用「Spring AI 之于大模型，近似 Spring Data 之于数据库」的类比讲清它的定位、从模型到业务的四层抽象、BOM 与 starter 的依赖思路，以及适合与不适合的场景。
---

# Spring AI 全景与分层抽象

> [!ABSTRACT] 一句话版本
> - **Spring AI 之于大模型，近似 Spring Data 之于数据库**：一套统一抽象 + 各家厂商实现 + Boot Starter 自动配置，换模型厂商时业务代码基本不动。
> - 分层：**`ChatModel`（能不能调）→ `ChatClient`（好不好用）→ `Advisor`（调用前后自动加点东西）→ 你的 Service / Controller**。
> - 它不是「Agent 全家桶」，而是**一组可组合的积木**：循环、工具、检索、记忆可以按需拼。
> - 适合已有 Spring Boot 项目；若只是写个脚本验证想法，Python 或裸 SDK 更轻。

## 一、它解决什么问题

在 Java 项目里直接调大模型 API，要自己处理：不同厂商的报文格式、流式响应、重试、工具调用的 JSON schema、结构化输出解析、对话历史、日志埋点。这些都是**与业务无关的样板代码**。

Spring AI 把它们做成 Spring 生态里的一等公民，和 JDBC、Redis、消息队列一样：**接口 + 实现 + 自动配置 + 配置项**。

> [!NOTE] 版本提示
> Spring AI 自 1.0 GA 之后持续迭代（1.1 起陆续加入 Agents 相关能力与评测工具），**类名、包名、starter 名称与配置键在版本间有调整**。本页及后续页面的代码都是「概念示意」，落地请以所用版本的官方文档为准。核对时间：2026-11。

## 二、分层抽象

<figure class="fig">
<svg viewBox="0 0 760 300" class="dg" role="img" aria-label="Spring AI 四层抽象：业务层、Advisor 增强层、ChatClient 客户端层、ChatModel 模型层与厂商适配">
<rect class="b1" x="20" y="20" width="720" height="50" rx="10"/>
<text class="th" x="380" y="38" text-anchor="middle">业务层：Controller / Service</text>
<text class="ts" x="380" y="58" text-anchor="middle">鉴权 · 会话管理 · 业务规则 · 组织 Agent 循环</text>
<rect class="b2" x="20" y="84" width="720" height="50" rx="10"/>
<text class="th" x="380" y="102" text-anchor="middle">Advisor 增强层（拦截链）</text>
<text class="ts" x="380" y="122" text-anchor="middle">对话记忆 · 检索增强 · 日志 · 自定义前后处理</text>
<rect class="b3" x="20" y="148" width="720" height="50" rx="10"/>
<text class="th" x="380" y="166" text-anchor="middle">ChatClient（Fluent API）</text>
<text class="ts" x="380" y="186" text-anchor="middle">prompt · user · system · options · tools · call / stream · content / entity</text>
<rect class="b5" x="20" y="212" width="350" height="50" rx="10"/>
<text class="th" x="195" y="230" text-anchor="middle">ChatModel / EmbeddingModel</text>
<text class="ts" x="195" y="250" text-anchor="middle">同步与流式的底层抽象</text>
<rect class="b5" x="390" y="212" width="350" height="50" rx="10"/>
<text class="th" x="565" y="230" text-anchor="middle">VectorStore / ToolCallback</text>
<text class="ts" x="565" y="250" text-anchor="middle">检索与工具的可替换接口</text>
<rect class="b4" x="20" y="276" width="720" height="20" rx="6"/>
<text class="ts" x="380" y="286" text-anchor="middle" dominant-baseline="middle">下方由各厂商 starter 适配：模型服务 · 向量库 · MCP Server</text>
<line class="l" x1="380" y1="70" x2="380" y2="84" marker-end="url(#arr)"/>
<line class="l" x1="380" y1="134" x2="380" y2="148" marker-end="url(#arr)"/>
<line class="l" x1="380" y1="198" x2="380" y2="212" marker-end="url(#arr)"/>
</svg>
<figcaption>图 1：越往上越贴近业务，越往下越贴近具体厂商</figcaption>
</figure>

| 层 | 代表接口 | 类比 | 你通常在哪工作 |
| --- | --- | --- | --- |
| 模型层 | `ChatModel` / `EmbeddingModel` | `JdbcTemplate` 级底层封装 | 需要精细控制时 |
| 客户端层 | `ChatClient` | `RestClient` / `WebClient` 式流式 API | **最常用**，见 [ChatClient 与 Advisor](#/springai/chatclient) |
| 增强层 | `Advisor` | Servlet Filter / AOP 环绕通知 | 加记忆、加检索、加日志 |
| 业务层 | `@Service` / `@RestController` | 普通 Spring 代码 | 组织循环与业务规则 |

记忆点：**`ChatModel` 负责「能不能调」，`ChatClient` 负责「好不好用」，`Advisor` 负责「调用前后自动加点东西」。**

## 三、依赖与配置的思路

```xml
<!-- 概念示意：用 BOM 统一版本，starter 按需引入；具体 artifact 名以官方文档为准 -->
<dependencyManagement>
  <dependencies>
    <dependency>
      <groupId>org.springframework.ai</groupId>
      <artifactId>spring-ai-bom</artifactId>
      <version>${spring-ai.version}</version>
      <type>pom</type><scope>import</scope>
    </dependency>
  </dependencies>
</dependencyManagement>
```

```yaml
# 概念示意：密钥走环境变量，模型与参数写在配置里
spring:
  ai:
    openai:
      api-key: ${LLM_API_KEY}
      chat:
        options:
          model: ${LLM_MODEL}
          temperature: 0.2
```

三条经验：

- **BOM 先上**：Spring AI 模块很多，版本不一致是初学者最常见的启动失败原因。
- **starter 按需**：模型厂商 starter、向量库 starter、MCP client / server starter，用哪个加哪个。
- **配置不写死**：API Key 用 `${...}` 占位，模型名、温度等可调参数放配置，方便评测时对比。

## 四、适合谁、不适合谁

| | 说明 |
| --- | --- |
| **适合** | 已有 Spring Boot 服务，要加问答、文档检索、工具调用；团队熟悉 Bean / 自动配置 / `application.yml`；需要与现有鉴权、事务、观测体系打通 |
| **不适合** | 只想写几行脚本验证想法；项目不在 JVM 生态；需要大量现成的 Python 研究型工具链（那时看 [Python 生态地图](#/python/overview)） |

> [!TIP] 学习顺序建议
> ① 跑通一次 `.prompt().user().call().content()` → ② 加一个 `@Tool` → ③ 加 `ChatMemory` → ④ 加 RAG → ⑤ 接 MCP。每步只加一个变量，出错时容易定位。

## 常见坑

1. **照抄旧版本教程**：1.0 前后 API 与 starter 名有变化，报错先核对版本对应的官方文档。
2. **依赖版本混搭**：没用 BOM，模型 starter 与向量库 starter 版本不一致。
3. **API Key 硬编码或提交进仓库**：应使用环境变量，且日志里脱敏。
4. **一上来就引入所有 starter**：依赖变重、自动配置互相干扰，先最小可用。
5. **把 Spring AI 当 Agent 运行时**：它给的是积木，循环与停止条件仍需自己组织，见 [核心循环与工具调用](#/basic/loop)。

## 自测题

> [!QUESTION] 为什么说 Spring AI 像 Spring Data？
> 两者都用「统一接口 + 厂商实现 + 自动配置」屏蔽底层差异：换数据库 / 换模型厂商时，业务代码基本不动。

> [!QUESTION] `ChatModel` 与 `ChatClient` 的分工是什么？
> `ChatModel` 是对模型调用的底层抽象（同步 / 流式）；`ChatClient` 在其上提供面向业务的流式 API，负责组装提示词、工具、Advisor 与结果转换。

> [!QUESTION] 为什么必须用 BOM？
> Spring AI 由多个模块组成，版本不一致会导致类找不到或配置不生效；BOM 统一约束整组依赖的版本。

> [!QUESTION] Spring AI 会自动帮我实现 Agent 循环吗？
> 不要指望它「全自动」。它提供调用模型、工具、记忆与检索的积木；是否循环、何时停止、哪些动作需要人工确认，仍由业务代码决定。
