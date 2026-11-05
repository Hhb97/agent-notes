<div class="hero">
<div class="eyebrow">AI Agent Notes · For Beginners</div>
<h1>AI Agent 学习笔记</h1>
<p>面向初学者的 Agent 学习地图：先讲清「模型 + 工具 + 循环 + 状态」这条与语言无关的主线，再分别展开 <b>Spring AI（Java）</b> 与 <b>Python 生态</b> 两条技术栈。每篇配核心要点、SVG 图解、常见坑与自测题。<b>先大纲，再详细</b>；这是笔记，不是项目脚手架。</p>
</div>

<div id="home-stats"></div>

## 学习全景

所有框架都在解决同一件事：**让模型决定下一步、让代码执行下一步、把结果喂回去再问一次**。区别只在于「这条循环由谁包装、状态存在哪里」。图中方块可点击跳转。

<figure class="fig">
<svg viewBox="0 0 760 350" class="dg" role="img" aria-label="Agent 学习笔记的三层结构：通用原理、两条技术栈、横切工程能力">
<rect class="bg" x="20" y="20" width="720" height="92" rx="12"/>
<text class="th" x="36" y="42">通用原理（语言无关）</text>
<a href="#/basic/what-is-agent"><rect class="b1" x="36" y="58" width="108" height="38" rx="7"/><text class="t" x="90" y="77" text-anchor="middle" dominant-baseline="middle">Agent 四要素</text></a>
<a href="#/basic/loop"><rect class="b1" x="152" y="58" width="108" height="38" rx="7"/><text class="t" x="206" y="77" text-anchor="middle" dominant-baseline="middle">核心循环</text></a>
<a href="#/basic/loop"><rect class="b1" x="268" y="58" width="108" height="38" rx="7"/><text class="t" x="322" y="77" text-anchor="middle" dominant-baseline="middle">工具调用</text></a>
<a href="#/basic/context-rag"><rect class="b1" x="384" y="58" width="108" height="38" rx="7"/><text class="t" x="438" y="77" text-anchor="middle" dominant-baseline="middle">上下文 · RAG</text></a>
<a href="#/basic/mcp"><rect class="b1" x="500" y="58" width="108" height="38" rx="7"/><text class="t" x="554" y="77" text-anchor="middle" dominant-baseline="middle">MCP</text></a>
<a href="#/basic/eval-safety"><rect class="b1" x="616" y="58" width="108" height="38" rx="7"/><text class="t" x="670" y="77" text-anchor="middle" dominant-baseline="middle">评测 · 安全</text></a>
<line class="l" x1="230" y1="112" x2="180" y2="140" marker-end="url(#arr)"/>
<line class="l" x1="530" y1="112" x2="580" y2="140" marker-end="url(#arr)"/>
<rect class="bg" x="20" y="140" width="350" height="150" rx="12"/>
<text class="th" x="36" y="164">Spring AI · Java 栈</text>
<a href="#/springai/overview"><rect class="b2" x="36" y="180" width="150" height="40" rx="7"/><text class="t" x="111" y="200" text-anchor="middle" dominant-baseline="middle">分层抽象全景</text></a>
<a href="#/springai/chatclient"><rect class="b2" x="198" y="180" width="156" height="40" rx="7"/><text class="t" x="276" y="200" text-anchor="middle" dominant-baseline="middle">ChatClient · Advisor</text></a>
<a href="#/springai/tools"><rect class="b2" x="36" y="232" width="150" height="40" rx="7"/><text class="t" x="111" y="252" text-anchor="middle" dominant-baseline="middle">@Tool · 结构化输出</text></a>
<a href="#/springai/rag-memory"><rect class="b2" x="198" y="232" width="156" height="40" rx="7"/><text class="t" x="276" y="252" text-anchor="middle" dominant-baseline="middle">记忆 · RAG · MCP</text></a>
<rect class="bg" x="390" y="140" width="350" height="150" rx="12"/>
<text class="th" x="406" y="164">Python 生态</text>
<a href="#/python/overview"><rect class="b5" x="406" y="180" width="150" height="40" rx="7"/><text class="t" x="481" y="200" text-anchor="middle" dominant-baseline="middle">生态地图 · 选型</text></a>
<a href="#/python/minimal-loop"><rect class="b5" x="568" y="180" width="156" height="40" rx="7"/><text class="t" x="646" y="200" text-anchor="middle" dominant-baseline="middle">最小 Agent 循环</text></a>
<a href="#/python/langgraph"><rect class="b5" x="406" y="232" width="150" height="40" rx="7"/><text class="t" x="481" y="252" text-anchor="middle" dominant-baseline="middle">LangGraph 状态图</text></a>
<a href="#/python/frameworks"><rect class="b5" x="568" y="232" width="156" height="40" rx="7"/><text class="t" x="646" y="252" text-anchor="middle" dominant-baseline="middle">轻量框架</text></a>
<rect class="b4" x="20" y="304" width="720" height="34" rx="10"/>
<text class="t" x="380" y="321" text-anchor="middle" dominant-baseline="middle">横切能力：评测 · 可观测 · 安全边界 · 成本控制　→　对照与选型见「对照与落地」</text>
</svg>
<figcaption>图 1：原理是共同底座，两条技术栈只是同一套概念的不同包装</figcaption>
</figure>

## 先读大纲

| 阶段 | 目标 | 从这里开始 |
| --- | --- | --- |
| 0 · 大纲 | 先看全局地图，知道要学什么、按什么顺序学 | [学习大纲与路线](#/start/outline)、[术语速查与准备](#/start/glossary) |
| 1 · 原理 | 不依赖任何框架，搞懂循环、工具、上下文、MCP | [Agent 是什么](#/basic/what-is-agent)、[核心循环与工具调用](#/basic/loop) |
| 2 · Java 栈 | 已有 Spring Boot 基础，把 AI 接进现有服务 | [Spring AI 全景与分层抽象](#/springai/overview) |
| 3 · Python 栈 | 从裸 SDK 起步，按复杂度选编排方式 | [生态地图与选型](#/python/overview)、[不用框架的最小 Agent 循环](#/python/minimal-loop) |
| 4 · 对照落地 | 把两边概念对齐，知道上线前查什么 | [Spring AI ↔ Python 概念映射](#/compare/mapping)、[选型与上线检查清单](#/compare/checklist) |

**总纲五句**：① Agent = 模型 + 工具 + 循环 + 状态；② 模型不执行代码，只发出工具调用请求；③ Spring AI 把它做成 Spring 风格抽象；④ Python 从一个 while 循环起步；⑤ 决定效果的是工具设计、上下文、评测与人工确认，不是框架。

## 知识分类

<div id="home-cats"></div>

## 学习路线

1. **先读第 1 章原理**：把「模型不执行代码」「循环是谁写的」想清楚。跳过这步，后面看任何框架都像魔法。
2. **再挑一条栈深入**：Java / Spring 背景走 Spring AI，Python 背景走 Python 生态。两章结构刻意对齐，方便对照。
3. **读对照与落地**：理解「同一个概念在两边叫什么」，再做选型。
4. 每页结尾有**自测题**，能用自己的话答出来就往下走。
5. 真要动手时去看官方文档 Quickstart —— 笔记负责建立地图，官方文档负责提供准确的最新 API。

## 阅读约定

- **页首「核心要点」**：先看结论，再读原理。
- **SVG 图解**：点击可放大，深浅主题下同样清晰。
- **提示块**：说明、实践建议、注意、危险操作分别用不同样式标出。
- **自测题**：页尾问题默认折叠，先自己回答，再展开核对。
- **代码片段都是概念示意**，不是可运行 demo；版本差异以官方文档为准。
- 快捷键：<kbd>Ctrl</kbd> + <kbd>K</kbd> 或 <kbd>/</kbd> 打开全文搜索。
