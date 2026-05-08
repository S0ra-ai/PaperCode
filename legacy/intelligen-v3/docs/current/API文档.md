# API文档

## 1. 概述

本文档描述 IntelliGen 当前版本的对外接口。当前实现以 **单一 FastAPI 后端** 为准，历史双后端 / 外部模型策略服务接口已归档到 `docs/archive/`，不再作为当前实现的一部分。

## 2. 基础信息

### 2.1 服务地址

- 前端开发环境：`http://127.0.0.1:9991`
- 后端 API：`http://127.0.0.1:9992`
- 生成引擎：`http://127.0.0.1:9993`
- 健康检查：`GET /api/health`
- Swagger UI：`/swagger-ui.html`
- OpenAPI：`/openapi.json`

### 2.2 鉴权方式

- 浏览器场景：登录成功后，后端会写入 `access_token` **httpOnly Cookie**。
- 脚本 / 非浏览器客户端：可使用 `Authorization: Bearer <token>` 作为兼容方式。
- 绝大多数业务接口要求：
  1. 已登录；
  2. 账号已通过管理员审核（`authStatus = 1`）。

### 2.3 统一响应格式

除文件流 / SSE 外，普通接口统一返回：

```json
{
  "code": 200,
  "message": "操作成功",
  "data": {}
}
```

分页接口的 `data` 结构为：

```json
{
  "list": [],
  "page": 1,
  "pageSize": 10,
  "total": 0
}
```

## 3. 当前接口清单

### 3.1 认证接口

| 方法 | 路径 | 说明 | 请求体 |
| --- | --- | --- | --- |
| POST | `/auth/register` | 用户注册 | `{"username","password","nickname","email","role"}` |
| POST | `/auth/login` | 登录并写入 Cookie | `{"username","password"}` |
| POST | `/auth/logout` | 退出登录并清理 Cookie | 无 |
| GET | `/auth/userinfo` | 获取当前用户信息 | 无 |
| PUT | `/auth/profile` | 修改昵称 / 邮箱 / 头像 | `{"nickname?","email?","avatar?"}` |
| PUT | `/auth/password` | 修改密码 | `{"oldPassword","newPassword"}` |

说明：

- 注册角色限制为 `student`、`teacher`、`user`。
- 登录成功响应体返回的是用户信息，JWT 由 Cookie 承载，而不是显式返回 token 字段。

### 3.2 会话与工作区接口

| 方法 | 路径 | 说明 | 请求体 |
| --- | --- | --- | --- |
| POST | `/sessions` | 创建研究会话 | `{"title"}` |
| GET | `/sessions` | 获取当前用户的会话列表 | 无 |
| GET | `/sessions/{sessionId}` | 获取单个会话 | 无 |
| GET | `/sessions/{sessionId}/workspace` | 获取工作区聚合数据（会话、任务、附件） | 无 |
| GET | `/sessions/{sessionId}/attachments` | 获取会话附件列表 | 无 |
| POST | `/sessions/{sessionId}/attachments` | 上传附件并挂到会话 | `multipart/form-data`，字段 `file` |
| DELETE | `/sessions/{sessionId}` | 删除会话 | 无 |

### 3.3 文件接口

| 方法 | 路径 | 说明 | 请求体 |
| --- | --- | --- | --- |
| POST | `/files/upload` | 上传文件到用户文件区 | `multipart/form-data`，字段 `file` |
| GET | `/files` | 获取当前用户文件列表 | 无 |
| GET | `/files/{fileId}` | 获取单个文件元数据 | 无 |
| DELETE | `/files/{fileId}` | 删除文件 | 无 |

文件接口返回的核心字段包括：`fileId`、`fileName`、`fileUrl`、`fileSize`、`fileType`、`sourceSessionId`。

### 3.4 任务接口

| 方法 | 路径 | 说明 | 请求体 |
| --- | --- | --- | --- |
| POST | `/sessions/{sessionId}/tasks` | 创建生成任务 | `{"userInput","outline?","templateFileId?","fileIds":[],"requirement?","generationMode?","venueLabel?","venueVariant?","authors?","controlMode?"}` |
| GET | `/sessions/{sessionId}/tasks` | 获取会话任务列表 | 无 |
| GET | `/tasks/{taskId}` | 获取任务状态 | 无 |
| GET | `/tasks/{taskId}/stream` | 订阅任务 SSE 进度流 | 无 |
| POST | `/tasks/{taskId}/retry` | 重试失败任务 | 无 |
| POST | `/tasks/{taskId}/sections/{sectionIndex}/regenerate` | 重生成单个章节 | `{"customPrompt?"}` |
| GET | `/tasks/{taskId}/download?format=md|docx|pdf|latex|tex|bib|bibtex|audit|source` | 下载结果或 paper artifact | 无 |

### 3.4.1 需求澄清接口

| 方法 | 路径 | 说明 | 请求体 |
| --- | --- | --- | --- |
| POST | `/clarify/check` | 检查输入是否需要澄清 | `{"userInput","hasOutline","hasTemplate","hasFiles"}` |
| POST | `/clarify/refine` | 合并澄清回答为结构化需求 | `{"userInput","answers":{"q1":"...","q2":"..."}}` |

**澄清检查响应**：

```json
{
  "needsClarification": true,
  "reason": "too_brief",
  "questions": [
    {"id": "q1", "question": "报告的目标字数大约是多少？", "hint": "", "options": []},
    {"id": "q2", "question": "研究的时间范围是什么？", "hint": "", "options": []}
  ]
}
```

**澄清细化响应**：

```json
{
  "topic": "深度学习在医学影像中的应用",
  "requirements": "...",
  "suggestedOutline": [],
  "targetWords": 5000,
  "language": "zh"
}
```

说明：

- 澄清是可选流程——前端在提交任务前先调用 `/clarify/check`
- 如果 `needsClarification=false`，直接提交任务
- 如果需要澄清，前端展示问题面板，用户回答后调用 `/clarify/refine` 获取结构化需求
- 结构化需求通过 `requirement` 字段传入创建任务接口
- 失败时(LLM不可用)自动降级为静态问题或跳过澄清

### 3.4.2 Paper mode 接口

Paper mode 使用 `generationMode="paper_format_to_paper"`。当前第一版闭环面向 IEEE：

- `venueLabel="IEEE"` 是硬约束；如果上传样张/模板与 IEEE 冲突，自动模式优先 IEEE，交互模式应暂停让用户确认。
- 支持 `venueVariant="conference"` 与 `"journal"`。
- 任务产物包括 `paper.tex`、`paper.pdf`、`paper.docx`、`references.bib`、`audit.json`、`source_bundle.zip`。
- `audit.json` 包含格式审计、引用审计、内容 rubric、字数进度、PDF/DOCX 导出和 repair 记录。
- API Gateway 会将任务提交到独立 Engine，并在读取任务状态时自愈同步 Engine 端状态；即使后台同步线程中断，刷新任务详情也会恢复 `completed`、`resultMarkdown` 与 `artifactPaths`。
- `artifactPaths` 同时支持从 Engine 状态和 `resultMarkdown` 的 Artifacts 段恢复，保证重启后 WebUI 仍能显示 6/6 产物按钮。

| 方法 | 路径 | 说明 | 请求体 |
| --- | --- | --- | --- |
| GET | `/paper/stages` | 获取论文 agent 阶段 contract | 无 |
| POST | `/paper/format/resolve` | 解析 venue 格式并报告样张冲突 | `{"venue_label":"IEEE","venue_variant":"conference","conflict_policy":"ask","sample_spec":{...}}` |
| POST | `/paper/citations/audit` | 审计 BibTeX 来源标识，支持人工 override | `{"bibtex":"...","manual_overrides":["key"]}` |
| POST | `/paper/interventions/plan` | 生成中途介入的影响范围和重审计划 | `{"message":"重写实验部分","available_sections":["Method"]}` |
| POST | `/paper/input/route` | 判断输入是研究主题、资料还是代码入口 | `{"user_input":"...","uploaded_files":[],"code_files":[]}` |
| POST | `/paper/questions/plan` | 按内容动态生成澄清问题包 | `{"user_input":"...","control_mode":"batch_autopilot"}` |
| POST | `/paper/research/plan` | 规划相似工作、可做内容与研究路线 | `{"user_input":"..."}` |
| POST | `/paper/code/browse` | 代码入口的结构摘要与论文方向建议 | `{"code_files":["..."]}` |
| POST | `/paper/experiments/plan` | 规划数据、实验与指标 | `{"user_input":"..."}` |

任务状态对象的核心字段包括：

- `status`：`pending` / `processing` / `completed` / `failed`
- `progress`
- `currentSection`
- `totalSections`
- `resultMarkdown`
- `errorMessage`
- `errorCategory`
- `retryCount`
- `files`
- `artifactPaths`：paper mode 产物路径映射，例如 `tex_path`、`pdf_path`、`docx_path`、`audit_path`、`source_bundle_path`

说明：

- `GET /tasks/{taskId}/stream` 返回 `text/event-stream`，浏览器可直接通过 `EventSource` 订阅。
- 任务失败时会返回经过清洗的 `errorMessage` 与 `errorCategory`。
- Legacy report 支持 `md/docx/pdf/latex`；paper mode 额外支持 `tex/bib/audit/source`，且 `docx/pdf` 会优先返回 engine 生成的论文产物。

### 3.4.3 Engine 内部接口

Engine 由 API Gateway 调用，基础地址为 `http://127.0.0.1:9993`，主要接口挂载在 `/engine`：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/health` | Engine 健康检查 |
| POST | `/engine/tasks` | 提交任务；paper mode 使用 `generation_mode="paper_format_to_paper"` |
| GET | `/engine/tasks/{taskId}/status` | 查询 Engine Redis 状态，包含 `result_markdown` 和 `artifact_paths` |
| GET | `/engine/tasks/{taskId}/stream` | Engine SSE 事件流 |
| POST | `/engine/tasks/{taskId}/export?fmt=pdf|tex|docx|bib|audit|source` | 下载 Engine 产物 |
| GET | `/engine/paper/stages` | Paper agent 阶段 contract |
| POST | `/engine/paper/format/resolve` | 格式解析与冲突判断 |
| POST | `/engine/paper/citations/audit` | 引用来源审计 |
| POST | `/engine/paper/interventions/plan` | 预览介入计划 |
| POST | `/engine/paper/*` | 研究规划、材料解析、代码浏览、实验规划、审计等 paper workflow contract |

### 3.5 管理接口

| 方法 | 路径 | 说明 | 请求参数 / 请求体 |
| --- | --- | --- | --- |
| GET | `/admin/users/pending` | 获取待审核 / 用户列表 | 查询参数：`page`、`pageSize`、`keyword`、`role` |
| PUT | `/admin/users/{userId}/audit` | 审核用户 | `{"authStatus": 1\|2}` |
| DELETE | `/admin/sessions/{sessionId}` | 管理员删除会话 | 无 |
| GET | `/admin/audit-logs` | 获取操作审计日志 | 查询参数：`page`、`pageSize`、`keyword`、`actionCode`、`requestId` |

### 3.6 平台接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/health` | 健康检查 |

## 4. SSE 任务进度流

`GET /tasks/{taskId}/stream` 的返回内容是 SSE 事件流，每条事件形如：

```text
data: {"taskId":"...","status":"processing","progress":42.0,"currentSection":2,"totalSections":5}
```

终态包括：

- `completed`
- `failed`

服务端在空闲期间会发送 `: keep-alive` 注释帧维持连接。

## 5. 调用示例

### 5.1 登录并保存 Cookie

```bash
curl -c cookies.txt -X POST http://127.0.0.1:9992/auth/login ^
  -H "Content-Type: application/json" ^
  -d "{\"username\":\"demo\",\"password\":\"secret123\"}"
```

### 5.2 基于 Cookie 创建任务

```bash
curl -b cookies.txt -X POST http://127.0.0.1:9992/sessions/{sessionId}/tasks ^
  -H "Content-Type: application/json" ^
  -d "{\"userInput\":\"人工智能在医疗行业的应用研究\",\"fileIds\":[]}"
```

### 5.3 订阅任务进度

```bash
curl -N -b cookies.txt http://127.0.0.1:9992/tasks/{taskId}/stream
```

## 6. 说明

1. 当前版本 **没有单独暴露模型策略服务 API**；生成、检索、重生成都由 `packages/api` 内部模块统一完成。
2. 若需最准确的字段定义，请以 Swagger UI 或 `/v3/api-docs` 导出的 OpenAPI 为准。
3. 历史外部模型服务文档仅保留在 `docs/archive/` 供迁移回溯，不应作为当前集成依据。

