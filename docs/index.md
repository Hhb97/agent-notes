<div class="hero">
<div class="eyebrow">AI Agent Notes · 从初学者到可落地</div>
<h1>AI Agent 学习笔记</h1>
<p>一条主线、五层结构：先把「模型 + 工具 + 循环 + 状态」讲清，再补模型与提示词、知识与工具这两层通用能力，接着展开 <b>Spring AI（Java）</b> 与 <b>Python 生态</b> 两条栈，最后落到工程化、内部机制与可落地架构。每篇配核心要点、SVG 图解、常见坑与自测题。<b>先大纲，再详细</b>；这是笔记，不是项目脚手架。</p>
</div>

<div id="home-stats"></div>

## 学习地图

所有框架都在解决同一件事：**让模型决定下一步、让代码执行下一步、把结果喂回去再问一次**。区别只在于「这条循环由谁包装、状态存在哪里」。图中方块可点击跳转。

<figure class="fig">
<svg viewBox="0 0 760 250" class="dg" role="img" aria-label="五层学习结构：入门与原理、知识与工具、技术栈、工程与机制、架构与落地，评测可观测安全成本贯穿每一层">
<a href="#/start/outline"><rect class="b1" x="20" y="44" width="136" height="74" rx="9"/><text class="tb" x="88" y="68" text-anchor="middle" dominant-baseline="middle">① 入门与原理</text><text class="ts" x="88" y="92" text-anchor="middle" dominant-baseline="middle">大纲 · 循环 · 模型</text></a>
<a href="#/knowledge/document-pipeline"><rect class="b2" x="168" y="44" width="136" height="74" rx="9"/><text class="tb" x="236" y="68" text-anchor="middle" dominant-baseline="middle">② 知识与工具</text><text class="ts" x="236" y="92" text-anchor="middle" dominant-baseline="middle">检索 · 记忆 · MCP</text></a>
<a href="#/springai/overview"><rect class="b3" x="316" y="44" width="136" height="74" rx="9"/><text class="tb" x="384" y="68" text-anchor="middle" dominant-baseline="middle">③ 技术栈</text><text class="ts" x="384" y="92" text-anchor="middle" dominant-baseline="middle">Spring AI · Python</text></a>
<a href="#/engineering/local-dev-debug"><rect class="b5" x="464" y="44" width="136" height="74" rx="9"/><text class="tb" x="532" y="68" text-anchor="middle" dominant-baseline="middle">④ 工程与机制</text><text class="ts" x="532" y="92" text-anchor="middle" dominant-baseline="middle">调试 · 运行时 · 恢复</text></a>
<a href="#/deep/agent-architecture"><rect class="b1" x="612" y="44" width="128" height="74" rx="9"/><text class="tb" x="676" y="68" text-anchor="middle" dominant-baseline="middle">⑤ 架构与落地</text><text class="ts" x="676" y="92" text-anchor="middle" dominant-baseline="middle">全景 · 蓝图 · 案例</text></a>
<line class="l" x1="156" y1="81" x2="166" y2="81" marker-end="url(#arr)"/>
<line class="l" x1="304" y1="81" x2="314" y2="81" marker-end="url(#arr)"/>
<line class="l" x1="452" y1="81" x2="462" y2="81" marker-end="url(#arr)"/>
<line class="l" x1="600" y1="81" x2="610" y2="81" marker-end="url(#arr)"/>
<text class="ts" x="380" y="24" text-anchor="middle">前两层与语言无关；第三层选一条栈深入；后两层把「能跑」变成「能上线」</text>
<rect class="bg" x="20" y="150" width="720" height="62" rx="10"/>
<text class="th" x="380" y="172" text-anchor="middle" dominant-baseline="middle">横切能力：提示词 · 评测 · 可观测 · 安全与合规 · 成本控制</text>
<text class="ts" x="380" y="196" text-anchor="middle" dominant-baseline="middle">它们不属于任何一层，而是每一层都要回答的问题；对照与选型见「对照与选型」分类</text>
</svg>
<figcaption>图 1：五层结构，原理是共同底座，两条技术栈只是同一套概念的不同包装</figcaption>
</figure>

## 学习路线

| 阶段 | 目标 | 入口 |
| --- | --- | --- |
| 0 · 地图 | 先看全局大纲，知道要学什么、按什么顺序学 | [学习大纲与路线](#/start/outline)、[术语速查与准备](#/start/glossary) |
| 1 · 原理 | 不依赖任何框架，搞懂循环、工具、上下文、MCP | [Agent 是什么](#/basic/what-is-agent)、[核心循环与工具调用](#/basic/loop) |
| 2 · 通用能力 | 补模型与提示词、上下文与知识、工具与协议三块 | [大模型怎么工作](#/llm/how-llm-works)、[文档解析与切分策略](#/knowledge/document-pipeline)、[工具设计原则](#/tools/tool-design) |
| 3 · 技术栈 | 挑一条栈深入：Java 走 Spring AI，Python 从最小循环起步 | [Spring AI 全景](#/springai/overview)、[生态地图与选型](#/python/overview) |
| 4 · 工程化 | 调试、测试、可观测、安全、交付运维 | [本地开发与调试](#/engineering/local-dev-debug)、[安全与合规](#/engineering/security-hardening) |
| 5 · 架构落地 | 看内部机制与生产架构，再照蓝图搭项目 | [循环的状态机本质](#/internals/loop-state-machine)、[通用 Agent 平台参考架构](#/blueprint/reference) |

**总纲五句**：① Agent = 模型 + 工具 + 循环 + 状态；② 模型不执行代码，只发出工具调用请求；③ Spring AI 把它做成 Spring 风格抽象；④ Python 从一个 while 循环起步；⑤ 决定效果的是工具设计、上下文、评测与人工确认，不是框架。

> [!TIP] 三种读法
> **想入门**：0 → 1 → 2 → 3，一路顺着读，每页的自测题能答出来再往下。
> **想搞懂内部怎么实现**：直接进 [机制深入](#/internals/loop-state-machine)，再回来看 [两条栈的机制](#/deep/spring-ai-internals)。
> **想照着搭项目**：从 [从需求到可落地架构](#/blueprint/method) 起，配 [通用 Agent 平台参考架构](#/blueprint/reference)，按项目类型选客服 / 数据分析 / 长任务研究。

## 知识分类

<div id="home-cats"></div>

## 阅读约定

- **页首「核心要点」**：先看结论，再读原理。
- **SVG 图解**：点击可放大，深浅主题下同样清晰。
- **提示块**：说明、实践建议、注意、危险操作分别用不同样式标出。
- **自测题**：页尾问题默认折叠，先自己回答，再展开核对。
- **代码片段都是概念示意**，不是可运行 demo；版本差异以官方文档为准。
- 快捷键：<kbd>Ctrl</kbd> + <kbd>K</kbd> 或 <kbd>/</kbd> 打开全文搜索。
