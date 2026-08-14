# Professor-for-a-Day — 基础架构

## 目标

先建立清晰的项目边界，为教学 Agent、用户交互、持久化和 LLM 接入提供稳定基础。
当前已实现 DeutschlandGPT 的服务端代理入口，业务功能仍将逐步加入。

## 目录结构

```text
Professor-for-a-Day/
├── apps/
│   ├── web/                 # React + Tailwind 前端应用
│   └── api/                 # TypeScript 后端/API 应用
├── packages/
│   ├── shared/              # 前后端共享类型、接口契约、常量
│   └── config/              # 共享工程配置
├── infrastructure/
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

负责 HTTP API、身份与请求边界、参数校验，以及协调领域服务。后续可以在这里
逐步加入：

- `agent/`：Agent 编排与运行循环
- `services/`：LLM、对话、课程和评估等应用服务
- `repositories/`：MongoDB 数据访问抽象
- `tools/`：可被 Agent 调用的受控工具
- `routes/`：面向前端的 API 路由

目前 `apps/api/src/server.ts` 提供最小 HTTP 边界：`GET /health` 和 `POST /api/chat`。
后续可按业务需要拆分为 routes、services 和 agent 目录。

### `packages/shared`

存放前后端都需要理解的类型和协议，例如消息角色、会话摘要、Agent 状态和
API 请求/响应结构。这里不应放数据库连接、密钥或浏览器专属代码。

### `packages/config`

集中放置 TypeScript、Lint、格式化和测试等共享配置，减少多个应用之间的配置
漂移。真正开始选定工具链后再补充具体配置文件。

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

1. 确定 monorepo 工具和包管理器。
2. 初始化前端和后端的最小启动入口。
3. 定义共享 API 类型和错误格式。
4. 接入 MongoDB 的连接层与数据模型。
5. 将当前 DeutschlandGPT 代理抽象为 LLM provider。
6. 实现最小 Agent Loop，再增加 Tool Calling、记忆和多 Agent 编排。
7. 最后扩展教学场景和用户界面。

## 当前明确不实现的内容

- 页面和交互功能
- 用户登录
- MongoDB schema 和连接代码
- Agent 级别的模型编排
- Agent Loop、Tool Calling 和多 Agent 逻辑
- CI/CD、容器和生产部署配置
