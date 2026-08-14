# Professor-for-a-Day — 基础架构

## 目标

先建立清晰的项目边界，为教学 Agent、用户交互、持久化和 LLM 接入提供稳定基础。
当前后端为 Python 脚手架：FastAPI 负责 HTTP 边界，LangChain 负责 LLM 接入，
DeutschlandGPT 是当前的模型提供方。业务功能仍将逐步加入。

## 目录结构

```text
Professor-for-a-Day/
├── apps/
│   ├── web/                 # React + Tailwind 前端应用
│   └── api/                 # Python 后端/API 应用（FastAPI + LangChain）
├── packages/
│   ├── shared/              # 前后端共享类型、接口契约、常量
│   └── config/              # 共享工程配置
├── infrastructure/
│   ├── docker-compose.yml   # 本地开发用 MongoDB
│   └── scripts/             # 本地开发、检查和部署辅助脚本
├── docs/                    # 架构、决策和产品说明
├── .env.example             # 环境变量名称示例，不放真实密钥
├── README.md
└── LICENSE
```

## 分层职责

### `apps/web`

负责浏览器端展示和用户交互：页面、组件、客户端状态和对后端 API 的调用。
它不直接访问 MongoDB，也不直接保存或使用 DeepSeek API Key。

### `apps/api`

负责 HTTP API、身份与请求边界、参数校验，以及协调领域服务。当前目录：

```text
apps/api/
├── pyproject.toml           # 依赖与工具配置（FastAPI、LangChain、pytest、ruff）
├── .env.example             # 后端环境变量清单，复制为 .env 后填入真实密钥
├── app/
│   ├── main.py              # FastAPI 入口、CORS、lifespan（Mongo 连接）、路由注册
│   ├── config.py            # 环境变量配置，密钥只从环境读取
│   ├── db.py                # MongoDB 客户端生命周期
│   ├── dependencies.py      # FastAPI 依赖（注入 repository）
│   ├── schemas.py           # 面向前端的请求/响应契约（Pydantic）
│   ├── models.py            # 持久化文档模型（与 schemas 分离）
│   ├── routes/              # 面向前端的 API 路由
│   │   ├── health.py        # GET /health（含数据库状态）
│   │   ├── chat.py          # POST /api/chat
│   │   └── conversations.py # /api/conversations 的增删查
│   ├── services/            # LLM、对话、课程和评估等应用服务
│   │   └── llm.py           # LangChain provider（DeutschlandGPT）
│   ├── repositories/        # MongoDB 数据访问抽象
│   │   └── conversations.py # conversations 集合
│   ├── agent/               # Agent 编排与运行循环（占位）
│   └── tools/               # 可被 Agent 调用的受控工具（占位）
└── tests/                   # pytest（路由层用假实现；repository 打真实 Mongo，缺库则跳过）
```

`services/llm.py` 是唯一知道模型提供方的模块：DeutschlandGPT 提供
OpenAI 兼容的 `/chat/completions`，因此用 LangChain 的 `ChatOpenAI` 覆盖
`base_url` 接入。路由层只依赖 LangChain Runnable，日后换提供方不需要改路由。

`build_chat_chain()` 是后续加入 Prompt 模板、检索、Tool Calling 和记忆的接缝。

### MongoDB 数据层

`db.py` 在应用 lifespan 中创建唯一的 `AsyncMongoClient`（pymongo 原生异步驱动，
Motor 已弃用），挂在 `app.state` 上；路由通过 `dependencies.py` 拿到 repository，
不接触 driver。URI 可能含密码，因此日志里只出现数据库名，不出现 URI。

`repositories/conversations.py` 是唯一知道文档结构的模块：消息内嵌在会话文档中
（一次读取即拿到整段会话），并对 `updated_at` 建降序索引供“最近会话”列表使用。
若单个会话超过 16MB 文档上限，可在不改动 repository 接口的前提下把消息拆到独立集合。

**Mongo 在开发期是可选的**：连不上时应用照常启动，`/health` 返回
`"database": "down"`，`/api/conversations` 返回 503，而 `/api/chat` 不受影响。
本地启动：`docker compose -f infrastructure/docker-compose.yml up -d`。

### `packages/shared`

存放前后端都需要理解的类型和协议，例如消息角色、会话摘要、Agent 状态和
API 请求/响应结构。这里不应放数据库连接、密钥或浏览器专属代码。

### `packages/config`

集中放置前端 TypeScript、Lint、格式化和测试等共享配置，减少多个应用之间的配置
漂移。后端的依赖和工具配置放在 `apps/api/pyproject.toml`。

### `infrastructure`

放置 MongoDB 本地开发、容器化、部署和运维相关内容。它与应用代码分离，便于
未来替换部署方式。

## 依赖方向

```text
web ────────► shared
  │
  └─────────► api ───────► shared
                         ├► agent/services
                         ├► repositories ───► MongoDB
                         └► LLM provider
```

基本规则：

1. 前端只能通过 API 与后端交互。
2. API Key 只存在服务端环境中。
3. Agent 不直接操作数据库连接，而是通过服务或 repository 访问数据。
4. 共享包只放稳定的协议和类型，不承载业务实现。
5. 先定义边界，再逐步实现功能；不要一开始把所有逻辑塞进单个 API 路由。

## 后续实现顺序

1. ~~初始化后端最小启动入口，并把 DeutschlandGPT 抽象为 LLM provider。~~（已完成）
2. ~~接入 MongoDB 的连接层与 conversations 数据模型。~~（已完成）
3. 把 `/api/chat` 的一问一答写入会话（可选 `conversation_id`），让对话有记忆。
4. 确定 monorepo 工具和前端包管理器。
5. 初始化前端最小启动入口。
6. 定义共享 API 类型和错误格式（后端契约已在 `app/schemas.py`）。
7. 增加流式响应（`/api/chat/stream`，基于 LangChain `astream`）。
8. 实现最小 Agent Loop，再增加 Tool Calling、记忆和多 Agent 编排。
9. 最后扩展教学场景和用户界面。

## 当前明确不实现的内容

- 页面和交互功能
- 用户登录（`conversations` 目前没有 owner 字段）
- 会话与聊天的打通：`/api/chat` 仍是无状态单轮，不写库
- 生产环境的 Mongo 认证、副本集和迁移策略
- Agent 级别的模型编排
- Agent Loop、Tool Calling 和多 Agent 逻辑
- CI/CD、容器和生产部署配置
