# Paper Fucker

<!-- version:start -->0.8.5-dev<!-- version:end -->

当前版本：0.8.5-dev

Paper Fucker 是一个私有优先、可验证的论文研究与产出工作台。它基于 OpenCode 深度硬分叉：OpenCode 作为模型、agent、session、tool、MCP、skill、权限和 TUI 底座保留；Paper Fucker 负责论文领域状态、研究任务图、证据账本、实验闭环、真实性 gate、实时预览和最终导出。

默认交互语言是中文。命令、路径、API 名、schema 名、品牌名和协议名保持原文，例如 `paper_fucker`、`PaperRun`、`MCP`、`ClaimLedger`、`OpenCode substrate`。

## 产品边界

- `Paper Fucker` 是用户可见品牌，出现在启动、help、TUI、doctor、preview、报告和文档中。
- `paper_fucker` 是命令、包名、配置标识和本地目录名。
- DeepSeek 只是默认样例 provider，不是唯一模型。所有 OpenCode substrate 支持的 provider/model 都可以分配给 planner、literature、code、experiment、writer、reviewer、citation、summarizer、subagent 等角色。
- 用户入口是中文论文工作台，不是 OpenCode 普通聊天界面。聊天能力只作为对 `PaperRun` 的指导和干预通道。

## 当前能力

- `packages/opencode/src/paper` 是唯一论文领域 runtime。
- `PaperRun` 是一等状态，包含 intake、stage graph、events、source ledger、claim ledger、experiment status、agent tree、diagnostics、pause questions、preview/export state。
- TUI 默认解析中文自然语言、主题、代码路径、论文材料、数据集和实验日志，并自动推进 stage graph。
- 递归 Agent Fabric 没有产品硬上限；实际扩展由预算、时间、并发、context、权限、数据外传授权、license/source gate、authenticity gate 和完成度约束。
- 右侧栏保留 cost、token/context、大纲价值信息，并加入 Agent Tree、Agent Team、Gate、阻塞项、工具/模型诊断、MemoryBank 和 code understanding 状态。
- 实时网页 Preview 已接入：PaperRun preview 会启动 token-protected localhost 预览服务，绑定 draft、export、claim/citation/reviewer annotations、cost、agent 和 tool diagnostics，并由 TUI dashboard 打开。
- Final export 必须通过真实性 gate；forced draft 可以输出，但必须显著标记 failed checks，不能伪装成最终稿。

## 使用流程

1. 运行 `paper_fucker` 进入中文论文工作台。
2. 通过 `paper_fucker init` 配置 provider、model role、本地工具、MCP 和 skill。
3. 输入主题、代码路径、数据集、实验日志、PDF、Markdown、LaTeX、DOCX 或混合材料。
4. Paper Fucker 创建 `PaperRun`，自动规划论文、派发 agent、调用 MCP/skills/tools、构建证据账本、检查 claim/source/citation/license/reproduction gate。
5. 在 TUI 中查看 stage graph、右侧栏诊断和阻塞项；需要时回答 pause question。
6. 打开 Preview 实时查看写作与渲染进度。
7. 导出 `reviewable_bundle`；只有目标 profile 更严格检查通过后才输出 `submission_candidate`。

系统只在必要时暂停：缺少 provider/tool/MCP/skill、成本超预算、数据外传未授权、license/source 冲突、研究方向低置信度、实验不可复现、claim 无证据、final export gate 阻断。

## 初始化与多模型测试

在 release 分支上从零手测前，可以先备份并清理本地状态：

```powershell
paper_fucker init reset --scope all --backup --yes
paper_fucker init
paper_fucker init doctor
.\scripts\provider-matrix-smoke.ps1
```

`reset` 只处理全局 `~/.paper_fucker`、工作区 ignored 的 `.paper_fucker/local/` 和 `.paper_fucker/runs/`。它不会删除 tracked 的 `.paper_fucker/skills/`、commands、themes、glossary 或配置模板。

`scripts/provider-matrix-smoke.ps1` 会读取 `~/.paper_fucker/providers/` 的公开配置和 `~/.paper_fucker/local/provider-secrets.json` 的 secret，逐 provider 调用 `/models` 和最小 chat completion。没有配置 provider 时，它生成 `pending_config` 报告而不是失败。

## 项目结构

详细目录说明见 `docs/project-structure.md`。

- `packages/opencode/`：硬分叉后的 Paper Fucker 产品核心和 OpenCode substrate。
- `packages/preview/`：只读实时网页 Preview。
- `research-tools/`：Python MCP/CLI research tools、外部工具发现、爬虫/数据辅助和 Pydantic 侧校验。
- `schemas/`：研究事实、事件、artifact、source、tool trace、claim、draft、review、export、checkpoint 的 JSON Schema。
- `.paper_fucker/`：tracked 项目资产，例如 first-party skills、commands、themes、glossary 和配置模板。
- `.paper_fucker/local/`、`.paper_fucker/runs/`：ignored 的本地 secret、provider key、runtime state 和 PaperRun 输出。
- `.plan/`：TaskFlow 执行计划和历史任务证据。
- `reports/`：验收、审计和 benchmark 证据。
- `legacy/`、`upstream/`：参考项目和上游来源，不是活跃产品入口。

## Release 文件策略

仓库会保留 `.plan/`、`reports/`、`legacy/`、`upstream/` 等审计和来源证据，但 release artifact 不携带这些内容。

- GitHub source archive 由 `.gitattributes` 的 `export-ignore` 控制。
- npm/pack 内容由各 package 的 `files` 白名单控制。
- 二进制 release wrapper 只应包含 `bin`、`postinstall.mjs`、`LICENSE` 和 `package.json`。
- `scripts/check-release-files.ps1` 会审计 GitHub source archive、`packages/opencode` npm pack、`packages/preview` npm pack 和二进制 publish manifest。

release 文件面检查：

```powershell
.\scripts\check-release-files.ps1
```

## Release 流程

当前流程分两段：

- `pre-release readiness`：在 `develop` 上完成普通 `feature/*` 收口，不打 tag，不进 `main`。
- `release branch stabilization`：从干净 `develop` 创建 `release/0.8.5`，用于多 provider 手测、RC 修复和最终确认。

测试通过前不打 tag、不合并 `main`。RC tag 或正式 release 只在你明确确认后执行。

## 验证

文档、版本、品牌、release 文件面或 readiness 相关改动后运行：

```powershell
.\scripts\check-readme-version.ps1
.\scripts\check-changelog-format.ps1
.\scripts\check-release-files.ps1
.\scripts\strict-acceptance.ps1 -CheckTimeoutSeconds 300
```

完整工作区套件耗时更长，需要时再运行：

```powershell
.\scripts\strict-acceptance.ps1 -FullWorkspaceSuite -CheckTimeoutSeconds 600 -FullWorkspaceTimeoutSeconds 2700
```

## 版本策略

`CHANGELOG` 是唯一当前版本源。README 中的版本 marker 必须等于根 `CHANGELOG` 最新 history entry。`docs/changelog/` 下的历史归档只保留旧版本证据，不驱动当前版本。

## 许可证

本项目当前是 private-first，除非后续书面修改许可证，否则保留所有权利。

第三方快照保留其原始许可证。OpenCode 上游来源与许可证边界记录在 `NOTICE.md`。
