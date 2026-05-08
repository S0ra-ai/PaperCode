# Changelog

All notable changes to the IntelliGen project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [3.1.1] - 2026-04-16

审计修复 + Docker Compose 全栈部署支持。

### 新增

- **Docker Compose 一键部署** — `docker compose up -d` 启动全部 5 个服务（PostgreSQL、Redis、API、Engine、Web）
- **Engine Dockerfile** — 生成引擎容器化，`uvicorn --host 0.0.0.0` 正确绑定
- **psycopg2-binary** — API 网关添加 PostgreSQL 原生驱动

### 修复

- **仪表盘 500 错误** — `t.topic` → `t.userInput`（GenerateTask 模型字段名修正）
- **hardcoded Engine URL** — 集中到 `ENGINE_BASE_URL` 配置项，Docker 环境自动注入
- **alembic.ini** — MySQL 连接串修正为 PostgreSQL
- **前端会话切换** — `syncTaskFormForSession` 遗漏重置引用格式和目标字数
- **401 重定向竞态** — 添加 `_isRedirectingToLogin` 防抖标志
- **nginx.conf** — 上游地址修正为 `api:9992`，新增 `/uploads/` 代理
- **.env 泄漏** — 从 git 追踪中移除 `packages/api/.env` 和 `packages/web/.env.development`

### 改进

- **.env.example 更新** — API 配置从 MySQL 改为 PostgreSQL，Web 端口修正
- **.gitignore 加固** — 新增 `packages/**/.env` 规则
- **.dockerignore** — API 和 Engine 目录添加排除规则

## [3.1.0] - 2025-07-16

三层架构重构 + 多 Provider LLM 管理 + 全链路功能升级。

### 新增

- **多 Provider LLM 管理** — 支持 OpenAI / Anthropic / Google 三种 API 格式
- **Provider 管理页面** — 连通性检测、阶段配置
- **提示词外化** — YAML 模板 + Jinja2 渲染 + 管理页面
- **对话式需求澄清** — Claude 风格内联对话
- **实时生成预览** — SSE 流式推送 + 打字机效果
- **任务中心** — 任务列表、状态筛选、进度跟踪
- **多格式导出** — LaTeX / DOCX / PDF / Markdown 统一管道
- **章节局部重写** — 用户反馈 + diff 对比
- **字数控制** — 默认 2-3 万字，可配置
- **压缩包上传** — 项目资料分析
- **个人中心** — 作者信息存档
- **CCF 默认模板** — 中国计算机学报格式
- **独立生成引擎** — `packages/engine` 作为独立 FastAPI 服务 (:9993)

### 改进

- **三层架构** — Web → API 网关 → 生成引擎，职责清晰分离
- **数据库切换** — SQLite → PostgreSQL 15，支持异步连接池
- **注释统一为中文简洁风格**
- **禁止模拟 LLM 调用**，失败直接报错
- **错误处理改进** — LLM 异常分类 + 前端友好提示

## [2.6.0] - 2026-04-12

Reliability, quality, and UX polish release — LLM retry/timeout hardening, section-level error recovery, post-generation quality checks, evidence expiry, task cancellation, and frontend UX improvements.

### Added

- **LLM Retry with Backoff** — `LLMService` retries 429/502-504/timeout errors up to 3 times with exponential backoff (2s base). Token safety clamping at 85% of model limit.
- **Adaptive Timeout** — Handler-computed timeouts clamped to [60, 600]s. `_MODEL_TOKEN_LIMITS` dict tracks per-model context windows.
- **Section-Level Error Recovery** — Single section LLM failure no longer aborts the entire report. Failed sections get a placeholder; pipeline only fails if ALL writable sections fail.
- **Post-Generation Quality Checker** — `quality_checker.py` runs word-count, citation-presence, and Jaccard duplicate checks on each section. Results attached as metadata.
- **Search Result Dedup** — DOI-based and normalized-title dedup in `search_service.py` before scoring.
- **Score Normalization** — `_SOURCE_TIER_WEIGHTS` tier weighting for evidence scoring in `index_service.py`.
- **Evidence Expiry Filtering** — `EvidenceItem.is_expired()` + filtering at retrieval and cache layers.
- **Task Cancellation** — `POST /tasks/{id}/cancel` endpoint, `threading.Event`-based cooperative cancel, frontend cancel button.
- **Error Classification** — Backend `errorCategory` field on SSE events; frontend `_CATEGORY_MAP` with 5 structured recovery categories.
- **Task State Extensions** — `cancelled`/`retrying` added to `VALID_TASK_STATUSES`. SSE Broker `cleanup()` prevents subscriber memory leaks.
- **Clarification UX** — Loading overlay during check phase, Ctrl+Enter submit / Esc skip keyboard shortcuts.
- **API Retry Interceptor** — Frontend Axios interceptor with exponential backoff for 429/5xx responses.
- **Lazy Routes + 404** — All route imports converted to `() => import(...)`. Catch-all 404 page with `NotFoundView.vue`.
- **Environment Documentation** — `.env.example` fully documented with sections and security warnings.
- **Dependency Pinning** — All backend dependencies pinned to exact versions in `requirements.txt`.

### Changed

- **Test Count** — Backend: 201 pytest cases (up from 142). Frontend: 112 Vitest cases.
- **Error Handling Flow** — Pipeline `write()` catch-continue replaces catch-reraise per section.

## [2.3.0] - 2026-04-10

Project structure refactor release: repository layout modernization, backend modularization, frontend feature-first reorganization, and current-documentation sync.

### Added

- **Current vs Archived Docs** — Added a clear split between `docs/current` and `docs/archive` so active manuals and historical materials no longer mix.
- **Backend Modular Layout** — Added `app/platform` plus `app/modules/{auth,admin,workspace,generation}` as the active FastAPI code organization, with generation further grouped by subdomain.
- **Frontend Feature Layout** — Added `src/app`, `src/features`, `src/shared`, and `src/assets` as the active Vue code organization.

### Changed

- **Repository Root** — Active services now live under `apps/`; archived Java / Flask code moved under `legacy/`; repo-level docs and infra paths were normalized.
- **Generation Code Placement** — Planning, retrieval, writing, review, regeneration, export, and shared LLM logic were regrouped under a single generation module tree.
- **Infra Path Sync** — Docker Compose, GitHub Actions, Alembic imports, README, and ignore rules were updated to the new layout.
- **Documentation Baseline** — README plus current API / interaction / database docs now describe the single FastAPI backend and the `packages/api` + `packages/web` structure.
- **Regression Baseline** — Current automated coverage stands at 142 backend pytest tests and 112 frontend Vitest tests after the refactor.

---

## [2.2.0] - 2026-04-10

Generation/runtime/retrieval upgrade release: grounded planning, hybrid retrieval, model routing, live progress streaming, evidence UX, multi-pass writing, and safer runtime control.

### Added

- **Grounded Outline Planning** — Added evidence-before-planning and deterministic outline refinement to reduce weak or underspecified outlines.
- **Dynamic Model Routing** — Added metadata-aware route profiles so planning, drafting, review, and retry flows can use different LLM settings.
- **Hybrid Retrieval** — Added weighted fusion, near-duplicate collapsing, canonical source selection, and configurable search-result caching.
- **Live Task Streaming** — Added `GET /tasks/{task_id}/stream` as an SSE endpoint for real-time progress updates.
- **Evidence UX** — Added clickable citations and an evidence/reference side panel in the workspace preview flow.
- **Rubric Review + Grounded Regeneration** — Added structured review results and citation-aware section regeneration.

### Changed

- **Section Writing** — Replaced single-shot section generation with a multi-pass `claim plan -> draft -> optional polish/review` flow.
- **Runtime Control** — Replaced raw background thread launches with a managed in-process task runtime controller.
- **Error Handling** — Task failures now expose sanitized `errorMessage` plus `errorCategory` instead of leaking raw low-level exceptions.
- **Retrieval Quality** — Improved local-RAG integration, source deduplication, reranking, and search query handling across the pipeline.

---

## [2.1.0] - 2026-04-10

Rebuild hardening release: trusted citations, section-aware retrieval, service-layer extraction, structured logging, Alembic baseline, and expanded automated coverage.

### Added

- **Trusted Citation System** — Added `CitationRegistry`, `CitationValidator`, and `ReferenceBuilder` so references are registered before use, deduplicated by title/URL, and rebuilt from actually cited sources (`70194e0`, `85bfbf8`)
- **Section-Level Retrieval** — Added section-specific Crossref enrichment and keyword reranking to improve per-section evidence selection without inventing references (`85bfbf8`, `82ce3cb`)
- **Alembic Baseline** — Added an initial Alembic baseline migration for the current FastAPI models and operational tables (`d73e0fe`)
- **Automated Coverage** — Backend suite now passes 110 pytest tests across API, citation, pipeline, and core flows; frontend suite currently passes 106 Vitest tests

### Changed

- **RAG + Citation Integration** — Local knowledge-base hits now register into the same citation registry as web results, with stable numbering and document-level deduplication (`85bfbf8`)
- **Service Layer Refactor** — Route handlers now delegate session, task, file, and generation orchestration to dedicated services (`6adbe75`)
- **Structured Logging** — Backend startup, middleware, and standard library loggers now flow through `structlog` with request, trace, and user context (`85bfbf8`)
- **Report Normalization** — Final report assembly validates citations, removes duplicate long paragraphs, and auto-builds the references section from used citations only (`70194e0`, `82ce3cb`)
- **Engineering Hardening** — Added specific exception handlers, typed enums, and stricter backend typing around the rebuilt API surface (`6988f31`)

---

## [2.0.0] - 2026-04-10

Major architecture refactoring: unified Python backend replacing Java + Flask dual-service.

### Changed

- **Architecture** — Replaced Java/Spring Boot backend + Flask model service with a single FastAPI (Python 3.11) backend. Reduced from 4 services to 3 (MySQL + Python backend + Nginx frontend)
- **Backend Framework** — Spring Boot 3.5 + JPA/Hibernate → FastAPI + SQLAlchemy 2.0 + Pydantic
- **Authentication** — Spring Security JWT → python-jose JWT (same cookie-based auth, fully compatible)
- **Database Migrations** — Flyway → Alembic (SQLAlchemy native)
- **AI Engine** — Flask model_strategy service integrated directly into backend as Python modules (no more HTTP forwarding between services)
- **Docker Compose** — Simplified from 4 services to 3; model-service container eliminated

### Added

- **Audit Logging Middleware** — Automatic operation logging via FastAPI middleware with route-to-action mapping
- **Checkpoint Save/Resume** — Report generation can resume from last completed section on retry
- **Content Safety Check** — Sensitive lexicon filter runs before report generation
- **OpenAPI Documentation** — Auto-generated Swagger UI at /swagger-ui.html
- **Structured Model Routing** — Task-type-specific LLM parameter selection via model_config.yaml

### Removed

- legacy/intelligen-backend/ — Archived Java/Spring Boot backend (active runtime replaced by packages/api/)
- legacy/model_strategy/ — Archived Flask model service (active generation stack now lives under packages/api/app/modules/generation/)

### Migration Notes

- **Frontend**: Zero changes required — all API paths, request/response formats preserved
- **Database**: Schema fully compatible — same table/column names (camelCase)
- **Auth**: BCrypt password hashes cross-compatible ($ ↔ $)
- **Environment**: Update .env from packages/api/.env.example; MODEL_SERVICE_* vars removed

---

## [1.1.0] - 2026-04-08

New features: PDF export, section regeneration, task retry, and UX polish.

### Added

- **PDF Export** — Download reports as PDF with CJK font support, table of contents, title page, code blocks, tables, blockquotes, and page numbers. Uses OpenPDF 2.0.3 (`616e110`)
- **Section Regeneration** — Regenerate individual report sections with custom prompts. Full-stack: model service endpoint, backend validation, frontend edit mode with regeneration dialog (`5388538`)
- **Task Failure Retry** — Retry failed tasks from the UI with retry count tracking. Backend `POST /tasks/{taskId}/retry` endpoint with model re-invocation (`c474b2b`)
- **Section Copy Button** — Hover over any report section to copy its markdown content to clipboard (`c474b2b`)

### Changed

- **Expanded Reading Mode** — Report viewer uses 800px max-width, 16px base font, 1.8 line-height for better readability (`c474b2b`)
- **Download Options** — PDF button added alongside existing Word and Markdown download options in all report views (`616e110`)

### Fixed

- **WorkspacePreviewPanel** — Fixed pre-existing incomplete `watch()` syntax error (`c474b2b`)

---

## [1.0.0] - 2026-04-08

Full-stack modernization on the `rebuild` branch — Docker-first infrastructure, LLM integration, security hardening, architecture refactoring, comprehensive testing, and CI/CD.

### Added

- **Docker Containerization** — Full `docker-compose.yml` orchestration for all 4 services (frontend, backend, model-service, MySQL 8.4) with multi-stage builds and Nginx reverse proxy (`64e5b3d`)
- **LLM Integration** — OpenRouter API with Google Gemma 4 (`google/gemma-4-31b-it`) for report generation and Perplexity Sonar (`perplexity/sonar-pro`) for real-time academic search (`af729cf`)
- **Multi-Source Academic Search** — Parallel ensemble search across 6 sources: Crossref, OpenAlex, ArXiv, Semantic Scholar, Google Scholar, and Perplexity Sonar with unified retry logic
- **httpOnly Cookie Authentication** — JWT tokens stored as httpOnly cookies instead of localStorage, with backend logout endpoint and CSRF protection via SameSite=Lax (`5aeaee6`)
- **Secrets Management** — `.env` / `.env.example` pattern for all sensitive config; `docker-compose.yml` uses `${VAR}` references (`3f1e595`)
- **Nginx Security Headers** — `X-Content-Type-Options`, `X-Frame-Options`, `X-XSS-Protection`, `Content-Security-Policy`, `Strict-Transport-Security`, gzip compression, and static asset caching (`3f1e595`)
- **File Upload Validation** — Extension whitelist, MIME type verification, and filename sanitization (`3f1e595`)
- **BaseReportGenerator** — Shared base class for `ReportGenerator` and `ReportGeneratorWithMemory`, eliminating ~150 lines of duplication (`4520760`)
- **Pinia Workspace Store** — Centralized state management for sessions, tasks, and forms, replacing 29-prop prop-drilling (`4520760`)
- **Flask Factory Pattern** — `create_app()` factory for better testability and configuration (`4520760`)
- **Backend Unit Tests** — 46 tests covering JwtTokenService, AuthService, StoredFileService, and ModelStrategyClient with Mockito + JUnit 5 (`1f8de8e`)
- **Model Service Tests** — 31 pytest tests covering search service, LLM service, and API endpoints (`1f8de8e`)
- **Frontend Tests** — 106 Vitest tests across 12 files covering stores, API helpers, components, router guards, and utilities (`985f6bd`)
- **CI/CD Pipeline** — GitHub Actions workflow (`.github/workflows/ci.yml`) with 3 parallel jobs: backend-test, model-service-test, frontend-lint (`1f8de8e`)
- **Docker Healthchecks** — All service Dockerfiles include health checks with startup periods and retry logic (`1f8de8e`)
- **OpenAPI/Swagger Documentation** — SpringDoc with Swagger UI at `/swagger-ui.html` for backend; static OpenAPI 3.0.3 spec at `/openapi.yml` for model service (`985f6bd`)
- **ESLint** — Flat config with `eslint-plugin-vue` for frontend static analysis (`985f6bd`)

### Changed

- **Error Handling** — Replaced broad `catch (Exception)` / `except:` with specific exception types across backend and model service (`4520760`)
- **Search Service** — Unified retry logic via `_search_with_retry()` and `_http_get()` helpers, removing per-source duplication (`4520760`)
- **JwtAuthenticationFilter** — Now reads token from cookie first, falls back to Authorization header (`5aeaee6`)
- **SecurityConfig** — Swagger UI and OpenAPI endpoints added to permit list (`985f6bd`)
- **README.md** — Complete rewrite with architecture diagram, tech stack, quickstart guide, and project structure (`1f8de8e`)

### Fixed

- **JWT Secret Decoding** — Catch `DecodingException` (not just `IllegalArgumentException`) when JWT secret contains special characters (`4520760`)
- **ModelStrategyClient** — Catch `RestClientException` (not `IOException`) matching Spring RestClient API (`4520760`)
- **Circular Import** — `local_doc_service.py` now uses `flask.current_app` instead of importing `app.app` directly (`4520760`)

### Security

- MySQL port no longer exposed externally (internal Docker network only)
- `allowPublicKeyRetrieval=true` removed from database connection
- JWT stored in httpOnly cookie (XSS mitigation)
- File upload restricted to safe extensions with MIME validation
- All sensitive config externalized to `.env` (not committed)

---

## [0.x] - Pre-Rebuild

Development history on `backend-frontend` branch before the rebuild modernization.

### Features (cumulative)

- DOCX report preview and export with cover, TOC, headers/footers
- Prohibited word filtering (content safety) with jieba tokenization
- Custom report template upload and management
- Local document knowledge base (RAG with FAISS)
- Multi-session workspace with real-time task progress
- User registration with admin approval workflow
- Admin audit logging (operations + admin access)
- File/citation upload and management
- Frontend navigation and UI polish
- Sensitive word library integration

### Infrastructure

- Spring Boot 3.5 backend with JPA/Hibernate and Flyway migrations
- Vue 3 + Vite frontend with Element Plus
- Flask model service with LangChain and HuggingFace Transformers
- MySQL database with role-based access control

