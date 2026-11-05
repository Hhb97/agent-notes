// AI Agent 学习笔记目录
// 顶层是「大分类」（显示为顶部标签），children 可无限嵌套；叶子节点 path 对应 docs/<path>.md
window.NAV = [
  {
    id: 'start', title: '从这里开始', desc: '先大纲，再详细；学习路线与术语速查',
    children: [
      {
        title: '入门', children: [
          { title: '学习大纲与路线', path: 'start/outline' },
          { title: '术语速查与准备', path: 'start/glossary' }
        ]
      }
    ]
  },
  {
    id: 'basic', title: 'Agent 基础', desc: '不依赖任何语言，先建立一张地图',
    children: [
      {
        title: '认识 Agent', children: [
          { title: 'Agent 是什么：从一次问答到自主循环', path: 'basic/what-is-agent' },
          { title: '核心循环与工具调用', path: 'basic/loop' }
        ]
      },
      {
        title: '上下文与工具', children: [
          { title: '上下文、记忆与 RAG', path: 'basic/context-rag' },
          { title: 'MCP 与工具生态', path: 'basic/mcp' }
        ]
      },
      {
        title: '工程底线', children: [
          { title: '评测、可观测与安全边界', path: 'basic/eval-safety' }
        ]
      }
    ]
  },
  {
    id: 'springai', title: 'Spring AI', desc: 'Java / Spring 技术栈的 AI 抽象',
    children: [
      {
        title: '全景', children: [
          { title: 'Spring AI 全景与分层抽象', path: 'springai/overview' }
        ]
      },
      {
        title: '核心 API', children: [
          { title: 'ChatClient 与 Advisor', path: 'springai/chatclient' },
          { title: '工具调用与结构化输出', path: 'springai/tools' }
        ]
      },
      {
        title: '数据与集成', children: [
          { title: '记忆、RAG 与 MCP 落地', path: 'springai/rag-memory' }
        ]
      }
    ]
  },
  {
    id: 'python', title: 'Python 生态', desc: '从裸 SDK 循环到状态图编排',
    children: [
      {
        title: '生态与起步', children: [
          { title: '生态地图与选型', path: 'python/overview' },
          { title: '不用框架的最小 Agent 循环', path: 'python/minimal-loop' }
        ]
      },
      {
        title: '编排与框架', children: [
          { title: 'LangGraph：状态图与检查点', path: 'python/langgraph' },
          { title: '轻量框架：Pydantic AI 与 OpenAI Agents SDK', path: 'python/frameworks' }
        ]
      },
      {
        title: '工程能力', children: [
          { title: '结构化输出、检索与评测', path: 'python/output-rag-eval' }
        ]
      }
    ]
  },
  {
    id: 'compare', title: '对照与落地', desc: '两边概念映射、选型与上线检查',
    children: [
      {
        title: '对照', children: [
          { title: 'Spring AI ↔ Python 概念映射', path: 'compare/mapping' }
        ]
      },
      {
        title: '落地', children: [
          { title: '选型与上线检查清单', path: 'compare/checklist' }
        ]
      }
    ]
  }
];
