## Paper Fucker 项目模型

Paper Fucker 的用户级项目状态围绕 `PaperRun` 展开，而不是旧 OpenCode 普通 chat/session 入口。

### 关系

- `Workspace`：用户当前工作目录，可能包含代码、数据、论文材料、实验日志和 `.paper_fucker/` 本地状态。
- `PaperRun`：一次论文研究与产出流程，包含 intake、stage graph、events、source ledger、claim ledger、experiment status、agent tree、diagnostics、pause questions、preview/export state。
- `Internal Session`：OpenCode substrate 的内部会话，只服务于 model/tool/agent 执行。它可以被 `PaperRun.internal_sessions[]` 引用，但不作为用户主入口暴露。
- `Provider/Model Role`：由 Paper Fucker model role router 解析，支持不同角色使用不同 provider/model。
- `Preview`：绑定 `PaperRun` snapshot 的只读网页视图，通过 token-protected localhost 服务展示实时写作和渲染状态。

### 用户入口

```text
paper_fucker
paper_fucker init
paper_fucker init doctor
paper_fucker init reset --scope all --backup --yes
paper_fucker run "<topic>"
paper_fucker run --code <path> "<topic>"
paper_fucker preview <run-id>
paper_fucker export <run-id>
paper_fucker skills list
paper_fucker mcp add <name> --url <url>
```

### PaperRun API

PaperRun 是对外稳定语义，旧 project/session API 只作为内部兼容层保留。

```text
POST /paper/runs
GET  /paper/runs/:id
GET  /paper/runs/:id/events
POST /paper/runs/:id/guidance
POST /paper/runs/:id/control
GET  /paper/runs/:id/preview
POST /paper/runs/:id/export
GET  /paper/capabilities
GET  /paper/doctor
POST /paper/providers/discover
GET  /paper/model-roles
```

### 旧 project/session substrate

OpenCode 的 project/session 形态仍可在内部用于 worktree、tool execution、model call 和权限桥接，但不能重新成为用户默认产品入口。任何旧 API 暴露都必须满足：

- 用户可见品牌仍是 `Paper Fucker`。
- 论文任务状态回写到 `PaperRun`。
- tool/model/cost/source artifacts 进入 PaperRun diagnostics 或 ledger。
- 子 agent 不能绕过父级数据外传授权、license/source gate 或真实性 gate。
