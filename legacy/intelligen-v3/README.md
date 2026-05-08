# IntelliGen

> **v3.1.0** — 智能学术论文生成系统

IntelliGen 是一个三层架构的 AI 学术论文生成平台，支持多 Provider LLM 管理、对话式需求澄清、实时流式生成预览和多格式导出。

## 系统架构

```
┌──────────────┐     HTTP      ┌──────────────┐    内部调用    ┌──────────────┐
│   Web 前端    │ ──────────── │  API 网关     │ ──────────── │  生成引擎     │
│  Vue 3 :9991 │              │ FastAPI :9992 │              │ FastAPI :9993 │
└──────────────┘              └──────┬───────┘              └──────┬───────┘
                                     │                             │
                              ┌──────┴───────┐              ┌─────┴────────┐
                              │ PostgreSQL   │              │ Redis 缓存    │
                              │    :5432     │              │    :6379     │
                              └──────────────┘              └──────────────┘
```

| 层 | 包 | 技术栈 | 端口 |
| --- | --- | --- | --- |
| 前端 | `packages/web` | Vue 3 + Vite + Pinia | 9991 |
| API 网关 | `packages/api` | FastAPI + SQLAlchemy 2.0 + Pydantic | 9992 |
| 生成引擎 | `packages/engine` | FastAPI + asyncpg + FAISS + LLM Pipeline | 9993 |
| 数据库 | — | PostgreSQL 15 | 5432 |
| 缓存 | — | Redis 7 | 6379 |
| 对象存储 | — | 腾讯云 COS（可选） | — |

## 功能特性 (v3.1)

- **多 Provider LLM 管理** — 支持 OpenAI / Anthropic / Google 三种 API 格式，Provider 连通性检测与阶段配置
- **对话式需求澄清** — Claude 风格内联对话，逐步细化用户需求
- **实时生成预览** — SSE 流式推送 + 打字机效果
- **任务中心管理** — 任务列表、状态筛选、进度跟踪、断点续跑
- **多格式导出** — LaTeX / DOCX / PDF / Markdown 统一管道
- **IEEE paper mode** — `paper_format_to_paper` 生成 IEEEtran TeX/PDF/DOCX/BibTeX/audit/source bundle；显式 IEEE 是硬约束，上传样张不会静默覆盖
- **章节局部重写** — 用户反馈 + diff 对比
- **字数控制** — 默认 2-3 万字，可配置
- **压缩包项目分析** — 上传压缩包自动解析项目资料
- **提示词管理** — YAML 模板 + Jinja2 渲染 + 管理页面
- **用户个人中心** — 作者信息存档
- **模板管理** — CCF 默认模板（中国计算机学报格式）
- **多源学术检索** — Crossref / OpenAlex / ArXiv / Semantic Scholar / Google Scholar / Perplexity Sonar
- **可信引用系统** — 引用注册、去重、无效引用清理、参考文献自动构建

## 快速开始

### 方式一：Docker Compose（推荐）

一条命令启动所有服务：

```bash
# 1. 复制环境变量模板并填入 LLM API Key
cp .env.example .env
# 编辑 .env，至少配置 OPENROUTER_API_KEY

# 2. 启动全部服务
docker compose up -d

# 3. 查看启动日志
docker compose logs -f

# 4. 访问
#   前端：http://localhost:9991
#   API：http://localhost:9992/swagger-ui.html
#   引擎：http://localhost:9993/health
```

首次启动后访问 http://localhost:9991，按照初始化向导设置管理员账号和模型配置。

> **停止服务：**`docker compose down`
> **清除数据：**`docker compose down -v`（删除数据库和缓存）

### 方式二：本地开发

#### 前置要求

- Python 3.11+
- Node.js 18+
- PostgreSQL 15 + Redis 7（可用 Docker 运行基础设施）

#### 1. 启动基础设施（PostgreSQL + Redis）

```bash
# 创建 PostgreSQL 容器
docker run -d --name intelligen-postgresql \
  -p 5432:5432 \
  -e POSTGRES_DB=intelligen \
  -e POSTGRES_USER=intelligen \
  -e POSTGRES_PASSWORD=intelligen123 \
  -v intelligen-pgdata:/var/lib/postgresql/data \
  --restart unless-stopped \
  postgres:15-alpine

# 创建 Redis 容器
docker run -d --name intelligen-redis \
  -p 6379:6379 \
  -v intelligen-redisdata:/data \
  --restart unless-stopped \
  redis:7-alpine --appendonly yes
```

> 如果已有 PostgreSQL 和 Redis 实例，跳过此步，直接在 `.env` 中配置连接信息。

#### 2. 启动服务

```bash
# 复制环境变量
cd packages/api
cp .env.example .env        # 编辑填入配置（至少配置 LLM API Key）
pip install -r requirements.txt
python -m app.main          # http://127.0.0.1:9992

# 启动生成引擎
cd packages/engine
pip install -r requirements.txt
python -m intelligen_engine  # http://127.0.0.1:9993

# 启动前端
cd packages/web
cp .env.example .env.development.local  # 可选，默认连接 localhost:9992
npm install
npm run dev                 # http://127.0.0.1:9991
```

### 端口规划

| 服务 | 端口 | 说明 |
| --- | --- | --- |
| PostgreSQL | `5432` | 独立 Docker 容器，持久化数据卷 |
| Redis | `6379` | 独立 Docker 容器，AOF 持久化 |
| API 网关 | `9992` | FastAPI + Uvicorn |
| 生成引擎 | `9993` | FastAPI + Uvicorn（内部服务） |
| 前端 | `9991` | Vite 开发服务器 |
| Swagger UI | `9992` | `http://127.0.0.1:9992/swagger-ui.html` |

## API 概览

### API 网关 (:9992)

| 模块 | 端点 | 说明 |
| --- | --- | --- |
| 认证 | `POST /auth/login`, `POST /auth/register`, `GET /auth/profile` | 用户登录/注册/个人信息 |
| 会话 | `GET/POST /sessions` | 工作区会话管理 |
| 任务 | `POST /sessions/{sessionId}/tasks`, `GET /tasks/{id}/stream` | 任务提交与 SSE 进度流 |
| 文件 | `POST /files/upload` | 文件上传（附件 / 压缩包） |
| LLM | `GET/POST /admin/providers` | Provider 管理与配置 |
| 提示词 | `GET/POST /admin/prompts` | 提示词模板管理 |
| 模板 | `GET/POST /api/templates` | 论文模板管理 |
| 导出 | `GET /tasks/{id}/download?format=...` | 多格式导出与 paper artifacts 下载 |
| Paper mode | `GET /paper/stages`, `POST /paper/format/resolve`, `POST /paper/citations/audit`, `POST /paper/interventions/plan` | 论文工作流阶段、格式冲突、引用审计与介入计划 |
| 管理 | `GET /admin/*` | 管理后台 |
| 初始化 | `POST /setup/*` | 首次部署向导 |

### 生成引擎 (`/engine` — :9993)

| 端点 | 说明 |
| --- | --- |
| `POST /engine/tasks` | 提交生成任务 |
| `GET /engine/tasks/{taskId}/status` | 查询任务状态 |
| `GET /engine/tasks/{taskId}/stream` | SSE 实时进度推送 |
| `POST /engine/tasks/{taskId}/export` | 下载 Engine 产物 |
| `GET /engine/paper/stages` | Paper agent 阶段 contract |
| `POST /engine/paper/*` | Paper mode 格式、引用、研究规划、代码浏览与审计接口 |

## 项目结构

```text
IntelliGen/
├── packages/
│   ├── web/                         # Vue 3 前端
│   │   └── src/
│   │       ├── app/                 # 路由、全局布局
│   │       ├── features/            # 功能模块 (auth, workspace, admin)
│   │       ├── shared/              # 共享组件、工具
│   │       └── assets/              # 静态资源
│   ├── api/                         # FastAPI API 网关
│   │   ├── app/
│   │   │   ├── platform/            # 配置、数据库、日志、安全、中间件
│   │   │   ├── modules/
│   │   │   │   ├── auth/            # 认证
│   │   │   │   ├── admin/           # 管理后台
│   │   │   │   ├── workspace/       # 工作区（会话、任务、文件）
│   │   │   │   ├── llm/             # LLM Provider 管理
│   │   │   │   ├── prompts/         # 提示词管理
│   │   │   │   ├── templates/       # 模板管理
│   │   │   │   ├── setup/           # 初始化向导
│   │   │   │   └── generation/      # 生成相关模型
│   │   │   └── core/                # Redis、限流等核心组件
│   │   ├── alembic/                 # 数据库迁移
│   │   └── tests/
│   └── engine/                      # FastAPI 生成引擎
│       └── intelligen_engine/
│           ├── core/                # 配置、数据库、Redis、LLM 连接池
│           ├── api/                 # 路由
│           ├── pipeline/            # 生成管线（规划、检索、写作、审查、导出）
│           ├── prompts/             # YAML 提示词模板
│           ├── retrieval/           # 多源学术检索
│           ├── tasks/               # 任务管理
│           └── llm/                 # LLM 调用层
├── docs/                            # 文档
├── docker-compose.yml               # Docker Compose 全栈部署（5 服务）
├── CHANGELOG.md
└── README.md
```

## 文档

- [架构总览](docs/current/ARCHITECTURE.md) — 系统架构、生成管线、任务执行模型
- [API 文档](docs/current/API文档.md) — 接口规范
- [数据库设计](docs/current/数据库设计文档.md) — 数据模型
- [前后端交互](docs/current/前后端交互说明文档.md) — 交互协议

## License

MIT

