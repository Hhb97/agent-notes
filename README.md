# Agent Notes · AI Agent 学习笔记

面向**初学者**的 AI Agent 学习笔记站点，在线阅读：https://hhb97.github.io/agent-notes/

一条主线（Agent 通用原理）+ 两条技术栈（**Spring AI / Java**、**Python 生态**），**先大纲，再详细**。

> 这是**笔记**，不是项目脚手架。文中的代码片段只是「概念示意」，用来说明某个 API 长什么样，不能直接复制运行；仓库里不附带可运行的真实项目 demo。

## 大纲

| # | 分类 | 覆盖内容 |
| --- | --- | --- |
| 0 | 从这里开始 | **完整学习大纲与路线**、术语速查、环境与心态准备 |
| 1 | Agent 基础 | 一次问答 vs Agent、四要素、ReAct 循环、工具调用的真实数据流、上下文窗口、短期/长期记忆、RAG 三步、MCP、评测与可观测、安全边界 |
| 2 | Spring AI（Java） | 定位与分层抽象、BOM 与 starter、`ChatModel` / `ChatClient` / `Advisor`、`@Tool` 与 `ToolCallback`、`entity()` 结构化输出、`ChatMemory`、`VectorStore` 与文档 ETL、MCP Client/Server、Micrometer 观测、版本差异与常见坑 |
| 3 | Python 生态 | 生态地图（裸 SDK / LangChain / LangGraph / LlamaIndex / Pydantic AI / OpenAI Agents SDK）、不用框架的最小循环、工具 schema 三种写法、结构化输出、LangGraph 状态图与检查点、轻量框架、检索与评测、虚拟环境 |
| 4 | 对照与落地 | Spring AI ↔ Python 概念映射表、选型决策树、迁移时的心智模型差异、上线前检查清单 |

**总纲（先看这 5 句）**

1. Agent = 大模型 + 工具 + 循环 + 状态；模型负责「想」，工具负责「做」，循环负责「接着做」，状态负责「记得做过什么」。
2. **大模型本身不执行任何操作**——它只输出「想调用哪个工具、参数是什么」，真正执行的是你的代码。
3. Spring AI 把这套东西做成 Spring 风格抽象：`ChatClient` 调模型、`Advisor` 做拦截、`@Tool` 暴露工具、`VectorStore` 做检索、`MCP` 复用外部工具。
4. Python 侧从「裸 SDK + 一个 while 循环」起步，流程复杂了再上 LangGraph / Pydantic AI / OpenAI Agents SDK。
5. 框架只是编排方式，决定效果的是工具设计、上下文喂了什么、怎么评测、哪些动作必须让人确认。

详细大纲见 [学习大纲与路线](docs/start/outline.md)；每篇笔记的结构都是「它解决什么问题 → 核心概念（配类比与图解）→ 最小必要用法 → 常见坑 → 自测题」。

## 内容

每篇包含：front matter（难度 / 标签 / 一句话摘要）、`[!ABSTRACT]` 核心要点、SVG 图解、对比表格、常见坑、页尾自测题。格式规范见 [WRITING_GUIDE.md](WRITING_GUIDE.md)。

站点格式与工具链沿用 [java-notes](https://github.com/Hhb97/java-notes)：顶部分类标签 + 多级目录、页内大纲与滚动高亮、全文搜索（<kbd>Ctrl</kbd>+<kbd>K</kbd>）、明暗主题、代码高亮与复制、图解点击放大、阅读进度。纯静态，无构建步骤。

## 本地预览

页面通过 `fetch` 加载 Markdown，需要本地静态服务器：

```bash
python -m http.server 8000
```

然后打开 http://localhost:8000 。

## 新增笔记

1. 按 [WRITING_GUIDE.md](WRITING_GUIDE.md) 的规范在 `docs/<分类>/` 下新建 `.md`（front matter、提示块、SVG 图解）；
2. 在 `assets/nav.js` 对应分类下添加 `{ title: '标题', path: '分类/文件名' }`；
3. 运行 `python tools/build_index.py` 刷新搜索索引，并用 `python tools/check.py` 自检；修改了 `assets/` 下的文件时，把 `index.html` 里的 `?v=` 版本号加一；
4. 提交并推送，GitHub Pages 自动更新。

## 校验与索引

- `python tools/check.py`：校验页面登记、H1 与导航标题一致、SVG 图解规范、站内链接、孤儿页面、搜索索引是否最新（GitHub Actions 在每次推送时自动运行）；
- `python tools/build_index.py`：重新生成 `assets/search-index.json`（新增或修改笔记后必须运行并一并提交）；
- `python tools/svgcheck.py`：可选的 SVG 坐标越界检查。

## 版本说明

笔记内容核对时间：**2026-11**。Spring AI 以 1.x（1.0 GA 之后）的抽象为基准，Python 侧以 LangChain / LangGraph 1.x 时代的分工为基准。框架迭代很快，遇到报错请先核对所用版本的官方文档。
