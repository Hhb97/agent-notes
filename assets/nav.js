// AI Agent 学习笔记目录
// 顶层是「大分类」（显示为顶部标签），children 可无限嵌套；叶子节点 path 对应 docs/<path>.md
// 顺序即学习路径：入门 → 原理 → 模型与提示词 → 上下文与知识 → 工具与协议 → 两条栈 → 工程化 → 深入架构 → 对照落地
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
    id: 'llm', title: '模型与提示词', desc: 'LLM 原理、提示词设计、选型参数与输出护栏',
    children: [
      {
        title: '认知基础', children: [
          { title: '大模型怎么工作：token、预测与幻觉', path: 'llm/how-llm-works' },
          { title: '提示词工程：从一句话到可复用的指令', path: 'llm/prompt-engineering' }
        ]
      },
      {
        title: '选型与控制', children: [
          { title: '模型选型与关键参数', path: 'llm/model-selection' },
          { title: '结构化输出与护栏', path: 'llm/structured-output-guardrails' }
        ]
      }
    ]
  },
  {
    id: 'knowledge', title: '上下文与知识', desc: '文档入库、向量检索、检索优化与记忆系统',
    children: [
      {
        title: '知识入库', children: [
          { title: '文档解析与切分策略', path: 'knowledge/document-pipeline' },
          { title: 'embedding 与向量库', path: 'knowledge/embedding-vectorstore' }
        ]
      },
      {
        title: '检索与记忆', children: [
          { title: '检索优化：改写、混合检索与重排', path: 'knowledge/retrieval-advanced' },
          { title: '记忆系统：短期、长期与遗忘', path: 'knowledge/memory-systems' }
        ]
      }
    ]
  },
  {
    id: 'tools', title: '工具与协议', desc: '工具设计、MCP 协议深入、执行沙箱与外部集成',
    children: [
      {
        title: '设计', children: [
          { title: '工具设计原则：粒度、参数与错误语义', path: 'tools/tool-design' }
        ]
      },
      {
        title: '协议与执行', children: [
          { title: 'MCP 协议深入：能力与传输', path: 'tools/mcp-deep' },
          { title: '工具执行、沙箱与外部集成', path: 'tools/sandbox-integration' }
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
    id: 'engineering', title: '工程化', desc: '本地调试、测试、可观测、交付与运维',
    children: [
      {
        title: '开发期', children: [
          { title: '本地开发与调试', path: 'engineering/local-dev-debug' },
          { title: '测试策略：从单测到评测', path: 'engineering/testing' }
        ]
      },
      {
        title: '运行期', children: [
          { title: '可观测性：链路、指标与成本归因', path: 'engineering/observability' },
          { title: '交付与运维：配置、CI/CD 与灰度', path: 'engineering/delivery-ops' }
        ]
      }
    ]
  },
  {
    id: 'internals', title: '机制深入', desc: '进阶：循环、上下文、工具、持久化与评测的内部机制',
    children: [
      {
        title: '运行时机制', children: [
          { title: 'Agent 循环的状态机本质与并发模型', path: 'internals/loop-state-machine' },
          { title: '上下文编译器：从状态到提示词的完整算法', path: 'internals/context-compiler' },
          { title: '工具运行时深入：schema、分发、幂等与重试', path: 'internals/tool-runtime' }
        ]
      },
      {
        title: '可靠性与评测', children: [
          { title: '状态持久化与恢复语义', path: 'internals/durability' },
          { title: '评测系统深入：数据集、裁判与指标漂移', path: 'internals/eval-system' }
        ]
      }
    ]
  },
  {
    id: 'blueprint', title: '落地架构', desc: '可落地项目架构讲解：分层、契约、数据模型、部署与实施路线',
    children: [
      {
        title: '方法与参考架构', children: [
          { title: '从需求到可落地架构：分层、契约与决策记录', path: 'blueprint/method' },
          { title: '通用 Agent 平台参考架构（可落地版）', path: 'blueprint/reference' }
        ]
      },
      {
        title: '项目架构讲解', children: [
          { title: '智能客服 Agent 项目架构', path: 'blueprint/service-agent' },
          { title: '数据分析 Agent 项目架构', path: 'blueprint/analytics-agent' },
          { title: '长任务研究 Agent 项目架构', path: 'blueprint/research-agent' }
        ]
      },
      {
        title: '实施', children: [
          { title: '从 MVP 到生产：落地路线与验收清单', path: 'blueprint/delivery-roadmap' }
        ]
      }
    ]
  },
  {
    id: 'deep', title: '深入与架构', desc: '进阶阅读：机制原理、生产级架构与真实案例',
    children: [
      {
        title: '机制深入', children: [
          { title: 'Spring AI 机制深入：Advisor 与工具执行链', path: 'deep/spring-ai-internals' },
          { title: 'Python 编排深入：运行时与持久化执行', path: 'deep/python-internals' },
          { title: '上下文工程深入：预算、压缩与检索优化', path: 'deep/context-engineering' }
        ]
      },
      {
        title: '架构与编排', children: [
          { title: '生产级 Agent 架构全景', path: 'deep/agent-architecture' },
          { title: 'Agent 工作流编排模式', path: 'deep/agent-workflow' },
          { title: '多智能体架构与隔离', path: 'deep/multi-agent' }
        ]
      },
      {
        title: '真实架构案例', children: [
          { title: '企业知识库助手架构', path: 'deep/case-kb-agent' },
          { title: 'Text-to-SQL 智能体架构', path: 'deep/case-text2sql' },
          { title: '代码助手架构', path: 'deep/case-code-agent' },
          { title: '运维诊断智能体架构', path: 'deep/case-ops-agent' },
          { title: '可靠性、成本与评测门禁', path: 'deep/reliability-eval' }
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
