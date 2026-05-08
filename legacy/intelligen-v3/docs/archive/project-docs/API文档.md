# API文档

## 1. 概述

本文档详细描述了IntelliGen系统的所有API接口，包括接口地址、调用方式、参数说明和返回值规范。

## 2. 基础信息

### 2.1 服务地址

- 前端服务：根据部署环境配置
- 后端服务：根据部署环境配置
- 模型策略服务：http://43.153.41.145:8082/api

### 2.2 鉴权方式

#### 2.2.1 后端API鉴权

所有需要认证的API接口都需要在请求头中添加 `Authorization` 字段，格式为 `Bearer {token}`。

#### 2.2.2 模型策略服务鉴权

所有API接口需要在请求体中添加 `appid` 参数，或在查询参数中添加 `appid` 参数，并在请求头中添加 `Authorization` 字段，格式为 `Bearer {secretKey}`。

说明：模型策略服务仅允许后端调用，前端不直接访问该服务。

**模型凭证来源**：

- `appid` 与 `secretKey` 仅由后端通过环境变量注入，例如 `MODEL_SERVICE_APP_ID`、`MODEL_SERVICE_SECRET`
- 仓库文档不保留明文模型凭证
- 若历史凭证曾经暴露，建议立即轮换

## 3. API接口列表

### 3.1 认证相关API

| API路径 | 方法 | 功能描述 | 请求体 (JSON) | 成功响应 (200 OK) |
|--------|------|----------|----------------|-------------------|
| `/auth/register` | POST | 用户注册 | `{"username": "...", "password": "...", "nickname": "...", "email": "...", "role": "student|teacher|user"}` | `{"code": 200, "message": "注册成功，请等待管理员审核", "data": {...}}` |
| `/auth/login` | POST | 用户登录 | `{"username": "...", "password": "..."}` | `{"code": 200, "message": "登录成功", "data": {"token": "...", "userId": "...", ...}}` |
| `/auth/userinfo` | GET | 获取当前用户信息 | N/A | `{"code": 200, "message": "获取用户信息成功", "data": {...}}` |
| `/auth/profile` | PUT | 修改个人信息 | `{"nickname": "...", "email": "...", "avatar": "..."}` | `{"code": 200, "message": "个人信息更新成功", "data": {...}}` |
| `/auth/password` | PUT | 修改密码 | `{"oldPassword": "...", "newPassword": "..."}` | `{"code": 200, "message": "密码更新成功", "data": null}` |
| `/auth/reset-password` | POST | 密码重置（预留接口，暂不纳入 MVP） | `{}` | `{"code": 200, "message": "重置密码邮件已发送，请查收", "data": null}` |
| `/admin/users/pending` | GET | 获取待审核用户列表 | N/A | `{"code": 200, "message": "获取待审核用户列表成功", "data": {...}}` |
| `/admin/users/{userId}/audit` | PUT | 管理员审核用户 | `{"action": "approve|reject", "reason": "..."}` | `{"code": 200, "message": "用户审核成功", "data": {...}}` |

说明：公开注册接口允许传入的 `role` 仅限 `student`、`teacher`、`user`，`admin` 角色不能通过公开注册接口直接创建。
说明：`/auth/login` 仅允许 `authStatus = 1` 的用户登录；`authStatus = 0` 时返回“管理员还未审核”，`authStatus = 2` 时返回“账号已被禁用”。

#### 3.1.1 获取待审核用户列表

**接口地址**：`/admin/users/pending`

**请求方式**：GET

**权限要求**：

仅管理员可调用。

**查询参数**：

| 参数名 | 类型 | 必填 | 描述 |
|--------|------|------|------|
| page | int | 否 | 页码，默认 `1` |
| pageSize | int | 否 | 每页条数，默认 `10` |
| keyword | string | 否 | 按 `username`、`nickname`、`email` 模糊搜索 |
| role | string | 否 | 角色筛选，取值 `student`、`teacher`、`user` |

**处理规则**：

- 固定查询 `authStatus = 0` 的用户
- 按 `createdAt DESC` 排序

**请求示例**：

```http
GET /admin/users/pending?page=1&pageSize=10&role=student&keyword=zhang
Authorization: Bearer {token}
```

**成功响应**：

```json
{
  "code": 200,
  "message": "获取待审核用户列表成功",
  "data": {
    "list": [
      {
        "userId": "u123456",
        "username": "zhangsan",
        "nickname": "张三",
        "email": "zhangsan@example.com",
        "role": "student",
        "authStatus": 0,
        "createdAt": "2026-03-16 10:00:00"
      }
    ],
    "page": 1,
    "pageSize": 10,
    "total": 1
  }
}
```

**错误响应**：

```json
{
  "code": 403,
  "message": "无权限访问待审核用户列表",
  "data": null
}
```

#### 3.1.2 管理员审核用户

**接口地址**：`/admin/users/{userId}/audit`

**请求方式**：PUT

**权限要求**：

仅管理员可调用。

**路径参数**：

| 参数名 | 类型 | 必填 | 描述 |
|--------|------|------|------|
| userId | string | 是 | 待审核用户ID |

**请求参数**：

| 参数名 | 类型 | 必填 | 描述 |
|--------|------|------|------|
| action | string | 是 | 审核动作，取值 `approve` 或 `reject` |
| reason | string | 否 | 审核说明，驳回时建议填写 |

**处理规则**：

- `approve`：将 `authStatus` 更新为 `1`
- `reject`：将 `authStatus` 更新为 `2`

**请求示例**：

```json
{
  "action": "approve",
  "reason": "审核通过"
}
```

**成功响应**：

```json
{
  "code": 200,
  "message": "用户审核成功",
  "data": {
    "userId": "u123456",
    "username": "zhangsan",
    "role": "student",
    "authStatus": 1,
    "reason": "审核通过"
  }
}
```

**错误响应**：

```json
{
  "code": 400,
  "message": "审核动作不合法",
  "data": null
}
```

```json
{
  "code": 403,
  "message": "无权限执行该操作",
  "data": null
}
```

```json
{
  "code": 404,
  "message": "用户不存在",
  "data": null
}
```

#### 3.1.3 用户登录状态限制

**处理规则**：

- `authStatus = 1`：允许登录，返回 token 和用户信息
- `authStatus = 0`：不允许登录，提示“管理员还未审核，请耐心等待”
- `authStatus = 2`：不允许登录，提示“账号已被禁用，请联系管理员”

**待审核用户登录响应**：

```json
{
  "code": 403,
  "message": "管理员还未审核，请耐心等待",
  "data": null
}
```

**已禁用用户登录响应**：

```json
{
  "code": 403,
  "message": "账号已被禁用，请联系管理员",
  "data": null
}
```

### 3.2 会话管理API

| API路径 | 方法 | 功能描述 | 请求体 (JSON) | 成功响应 (200 OK) |
|--------|------|----------|----------------|-------------------|
| `/sessions` | POST | 创建会话 | `{"title": "...", "templateFileId": "..."}` | `{"code": 200, "message": "创建会话成功", "data": {...}}` |
| `/sessions` | GET | 获取会话列表 | N/A | `{"code": 200, "message": "获取会话列表成功", "data": [...]}` |
| `/sessions/{sessionId}` | GET | 获取会话详情 | N/A | `{"code": 200, "message": "获取会话详情成功", "data": {...}}` |
| `/sessions/{sessionId}` | DELETE | 删除会话 | N/A | `{"code": 200, "message": "删除会话成功", "data": null}` |
| `/sessions/{sessionId}/tasks` | POST | 提交生成任务 | `{"userInput": "...", "outline": "...", "userFileIds": ["..."]}` | `{"code": 200, "message": "提交生成任务成功", "data": {...}}` |
| `/tasks/{taskId}` | GET | 查询生成任务状态 | N/A | `{"code": 200, "message": "获取任务状态成功", "data": {...}}` |
| `/tasks/{taskId}/download` | GET | 下载任务结果（预留接口，暂不纳入 MVP） | N/A | 文件下载 |

#### 3.2.1 提交生成任务

**接口地址**：`/sessions/{sessionId}/tasks`

**请求方式**：POST

**接口说明**：

前端调用后端接口提交研究需求，由后端根据会话绑定的 `templateFileId` 和上传文件ID组装 `templateUrl`、`userFiles`，再调用模型策略服务创建任务。

**路径参数**：

| 参数名 | 类型 | 必填 | 描述 |
|--------|------|------|------|
| sessionId | string | 是 | 会话ID |

**请求参数**：

| 参数名 | 类型 | 必填 | 描述 |
|--------|------|------|------|
| userInput | string | 是 | 用户原始输入 |
| outline | string | 否 | 报告大纲 |
| userFileIds | array | 否 | 用户上传文件ID列表 |

**请求示例**：

```json
{
  "userInput": "人工智能在医疗领域的应用研究",
  "outline": "1. 技术现状 2. 应用场景 3. 风险与挑战 4. 未来趋势",
  "userFileIds": [
    "f1a2b3c4",
    "f5d6e7f8"
  ]
}
```

**成功响应**：

```json
{
  "code": 200,
  "message": "提交生成任务成功",
  "data": {
    "taskId": "t123456789",
    "sessionId": "s123456789",
    "status": "pending"
  }
}
```

**错误响应**：

```json
{
  "code": 400,
  "message": "用户原始输入不能为空",
  "data": null
}
```

#### 3.2.2 查询生成任务状态

**接口地址**：`/tasks/{taskId}`

**请求方式**：GET

**接口说明**：

前端轮询该接口获取任务最新状态。后端负责查询本地任务记录，并在必要时向模型策略服务同步进度后再返回统一结果。后端对前端统一使用 camelCase 字段，不直接透传模型策略服务的 `current_section`、`total_sections` 等下划线字段。

**路径参数**：

| 参数名 | 类型 | 必填 | 描述 |
|--------|------|------|------|
| taskId | string | 是 | 任务ID |

**返回字段说明**：

| 字段名 | 类型 | 描述 |
|--------|------|------|
| taskId | string | 本地任务ID |
| sessionId | string | 所属会话ID |
| status | string | 任务状态，取值 `pending`、`processing`、`completed`、`failed` |
| progress | number | 任务进度百分比，范围 `0-100` |
| currentSection | int | 当前处理章节序号 |
| totalSections | int | 总章节数 |
| resultMarkdown | string/null | 完成后的 Markdown 报告内容 |
| errorMessage | string/null | 失败原因，未失败时为 `null` |
| updatedAt | string | 最近更新时间 |

**任务完成响应**：

```json
{
  "code": 200,
  "message": "获取任务状态成功",
  "data": {
    "taskId": "t123456789",
    "sessionId": "s123456789",
    "status": "completed",
    "progress": 100,
    "currentSection": 5,
    "totalSections": 5,
    "resultMarkdown": "# 报告标题\n\n这里是最终报告内容",
    "errorMessage": null,
    "updatedAt": "2026-03-17 10:30:00"
  }
}
```

**任务处理中响应**：

```json
{
  "code": 202,
  "message": "任务正在处理中",
  "data": {
    "taskId": "t123456789",
    "sessionId": "s123456789",
    "status": "processing",
    "progress": 45.5,
    "currentSection": 2,
    "totalSections": 5,
    "resultMarkdown": null,
    "errorMessage": null,
    "updatedAt": "2026-03-17 10:10:00"
  }
}
```

**任务失败响应**：

```json
{
  "code": 500,
  "message": "任务生成失败",
  "data": {
    "taskId": "t123456789",
    "sessionId": "s123456789",
    "status": "failed",
    "progress": 45.5,
    "currentSection": 2,
    "totalSections": 5,
    "resultMarkdown": null,
    "errorMessage": "模型策略服务调用失败",
    "updatedAt": "2026-03-17 10:12:00"
  }
}
```

**任务不存在响应**：

```json
{
  "code": 404,
  "message": "任务不存在",
  "data": null
}
```

### 3.3 文件与模板API

| API路径 | 方法 | 功能描述 | 请求体 | 成功响应 (200 OK) |
|--------|------|----------|--------|-------------------|
| `/files/upload` | POST | 上传用户文件 | `multipart/form-data` | `{"code": 200, "message": "文件上传成功", "data": {...}}` |
| `/files` | GET | 获取当前用户文件列表 | N/A | `{"code": 200, "message": "获取文件列表成功", "data": [...]}` |
| `/templates` | GET | 获取模板列表 | N/A | `{"code": 200, "message": "获取模板列表成功", "data": [...]}` |

#### 3.3.1 上传用户文件

**接口地址**：`/files/upload`

**请求方式**：POST

**接口说明**：

前端上传用户资料文件，后端保存文件记录并返回 `fileId`，供 `POST /sessions/{sessionId}/tasks` 的 `userFileIds` 使用。

**请求头**：

```http
Authorization: Bearer {token}
Content-Type: multipart/form-data
```

**表单参数**：

| 参数名 | 类型 | 必填 | 描述 |
|--------|------|------|------|
| file | file | 是 | 用户上传文件 |

**请求示例**：

```bash
curl -X POST http://localhost:8080/files/upload \
  -H "Authorization: Bearer {token}" \
  -F "file=@research.pdf"
```

**成功响应**：

```json
{
  "code": 200,
  "message": "文件上传成功",
  "data": {
    "fileId": "f123456789",
    "fileName": "research.pdf",
    "fileUrl": "https://example.com/uploads/research.pdf",
    "fileType": "pdf",
    "fileSize": 102400
  }
}
```

#### 3.3.2 获取当前用户文件列表

**接口地址**：`/files`

**请求方式**：GET

**接口说明**：

返回当前登录用户已上传文件列表，前端可据此回显已上传文件，并组装 `userFileIds`。

**请求头**：

```http
Authorization: Bearer {token}
```

**成功响应**：

```json
{
  "code": 200,
  "message": "获取文件列表成功",
  "data": [
    {
      "fileId": "f123456789",
      "fileName": "research.pdf",
      "fileUrl": "https://example.com/uploads/research.pdf",
      "fileType": "pdf",
      "fileSize": 102400,
      "createdAt": "2026-03-16 10:00:00"
    }
  ]
}
```

#### 3.3.3 获取模板列表

**接口地址**：`/templates`

**请求方式**：GET

**接口说明**：

返回可选模板列表。由于创建会话接口使用 `templateFileId`，因此模板列表响应中直接返回 `templateFileId`，供前端在创建会话时直接传入。

**请求头**：

```http
Authorization: Bearer {token}
```

**成功响应**：

```json
{
  "code": 200,
  "message": "获取模板列表成功",
  "data": [
    {
      "templateId": "tpl123456",
      "name": "通用研究报告模板",
      "description": "适用于大多数通用研究场景",
      "templateFileId": "f_tpl_001"
    }
  ]
}
```

### 3.4 模型策略API（DeepResearch服务）

#### 3.4.1 创建深入研究任务

**接口地址**：`/api/deep-research/create-task`

**请求方式**：POST

**请求参数**：

| 参数名 | 类型 | 必填 | 描述 |
|--------|------|------|------|
| appid | string | 是 | 应用ID |
| userInput | string | 是 | 用户原始输入 |
| templateUrl | string | 否 | 模板URL（不传就是默认，传就按 URL 的文件来，仅限 docx 和 pdf） |
| userFiles | array | 否 | 用户文件列表（数组，里面是url） |
| outline | string | 否 | 报告大纲 |

**请求示例**：
```json
{
  "appid": "{MODEL_SERVICE_APP_ID}",
  "userInput": "人工智能技术发展与应用研究",
  "outline": "1. 人工智能核心技术演进：机器学习、深度学习、生成式AI的关键突破。2. 主要应用领域分析：医疗、金融、制造、交通、内容创作等行业的典型场景与案例。3. 当前发展面临的挑战：算力需求、数据隐私、算法偏见、伦理与监管问题。4. 未来趋势展望：通用人工智能（AGI）路径、人机协作模式、技术融合与社会影响评估。",
  "templateUrl": "https://example.com/template.docx",
  "userFiles": [
    "https://example.com/file1.pdf",
    "https://example.com/file2.docx"
  ]
}
```

**返回格式**：
```json
{
  "code": 200,
  "message": "success",
  "data": "task_id"
}
```

**错误返回**：
```json
{
  "code": 400,
  "message": "用户原始输入不能为空",
  "data": ""
}
```

#### 3.4.2 获取研究任务情况

**接口地址**：`/api/deep-research/task/{task_id}`

**请求方式**：GET

**路径参数**：

| 参数名 | 类型 | 必填 | 描述 |
|--------|------|------|------|
| task_id | string | 是 | 任务ID |

**查询参数**：

| 参数名 | 类型 | 必填 | 描述 |
|--------|------|------|------|
| appid | string | 是 | 应用ID |

**返回格式**：

- 成功：
```json
{
  "code": 200,
  "message": "success",
  "data": "报告内容（Markdown格式）"
}
```

- 正在生成：
```json
{
  "code": 202,
  "message": "任务正在处理中",
  "data": {
    "progress": "xx.xx%",
    "current_section": 1,
    "total_sections": 5
  }
}
```

- 失败：
```json
{
  "code": 500,
  "message": "失败原因",
  "data": ""
}
```

- 任务不存在：
```json
{
  "code": 404,
  "message": "任务不存在",
  "data": ""
}
```

#### 3.3.3 获取深入研究可用模型列表

**接口地址**：`/api/deep-research/models`

**请求方式**：GET

**查询参数**：

| 参数名 | 类型 | 必填 | 描述 |
|--------|------|------|------|
| appid | string | 是 | 应用ID |

**返回格式**：
```json
{
  "code": 200,
  "message": "success",
  "data": [
    {
      "label": "Gemini 3.1 Pro",
      "value": "google/gemini-3.1-pro-preview"
    }
  ]
}
```

## 4. 状态码说明

| 状态码 | 描述 |
|--------|------|
| 200 | 成功 |
| 202 | 正在处理中 |
| 400 | 请求参数错误 |
| 401 | 鉴权失败 |
| 404 | 任务不存在 |
| 500 | 服务器内部错误 |

## 5. 调用示例

### 5.1 使用 curl 调用创建深入研究任务接口

```bash
curl -X POST http://43.153.41.145:8082/api/deep-research/create-task \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {MODEL_SERVICE_SECRET}" \
  -d '{
    "appid": "{MODEL_SERVICE_APP_ID}",
    "userInput": "人工智能在医疗领域的应用",
    "templateUrl": "https://example.com/template.docx",
    "userFiles": [
      "https://example.com/file1.pdf",
      "https://example.com/file2.docx"
    ]
  }'
```

### 5.2 使用 curl 调用获取研究任务情况接口

```bash
curl -X GET "http://43.153.41.145:8082/api/deep-research/task/{task_id}?appid={MODEL_SERVICE_APP_ID}" \
  -H "Authorization: Bearer {MODEL_SERVICE_SECRET}"
```

### 5.3 使用 curl 调用获取模型列表接口

```bash
curl -X GET "http://43.153.41.145:8082/api/deep-research/models?appid={MODEL_SERVICE_APP_ID}" \
  -H "Authorization: Bearer {MODEL_SERVICE_SECRET}"
```

## 6. 注意事项

1. 所有需要认证的API接口都需要添加鉴权信息
2. 模板URL仅支持docx、pdf格式的文件
3. 用户文件列表中的URL需要是可访问的文件链接
4. 任务处理可能需要一定时间，建议使用轮询方式获取任务状态
5. 成功返回时，`data`字段直接包含Markdown格式的报告内容
