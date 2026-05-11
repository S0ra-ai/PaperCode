# Paper Fucker 内部维护文档

这个文档面向维护者和 release 执行者。对外 GitHub 首页只保留用户理解和试用所需内容；架构边界、TaskFlow、release 文件面和验收细节放在这里。

## 文档分层

- `README.md`：对外首页。回答“这是什么、能做什么、怎么开始、是否可信”。
- `docs/internal/README.md`：内部维护入口。记录架构边界、release 流程、TaskFlow 和验收策略。
- `docs/project-structure.md`：目录结构与 release artifact 边界。
- `docs/changelog/README.md`：历史 changelog 归档策略。
- `reports/`：审计、验收、benchmark 证据，不进入 release artifact。

默认文档语言是中文。命令、路径、API、schema、品牌名、协议名和字面量保留原文。

## 架构边界

- `packages/opencode/` 是硬分叉产品核心。OpenCode provider/model、agent/session、tool、MCP、skill、permission、plugin 和 TUI runtime 作为 substrate 保留。
- `packages/opencode/src/paper` 是唯一论文领域 runtime，负责 `PaperRun`、intake、stage graph、capability registry、model role router、recursive agent fabric、ClaimLedger、verification gate、preview/export binding 和 observability。
- `packages/preview/` 是只读实时网页 Preview 包。
- `research-tools/` 是 Python/MCP/tool bridge，用于外部工具发现、文档转换、爬虫/数据辅助和 Pydantic 侧校验。
- `.paper_fucker/` 下的 tracked assets 是产品能力的一部分；`.paper_fucker/local/` 与 `.paper_fucker/runs/` 是 ignored runtime state。

旧 OpenCode chat/session 能力只作为内部 substrate，不再是用户默认产品形态。用户主状态是 `PaperRun`。

## Release 分支规则

当前稳定流程：

1. `develop` 完成 readiness。
2. 创建 `release/0.8.5` 进入手测和 RC 前稳定。
3. 用户在 release 分支重新初始化多个 provider/key/model role。
4. 发现问题就在 release 分支修复。
5. 测试通过后，由用户明确确认是否打 RC tag 或进入正式 release。

在用户确认前：

- 不打 tag。
- 不合并 `main`。
- 不调用正式 `finish_release`。
- 不发布 npm、Docker、Homebrew 或 GitHub release artifact。

## TaskFlow 约束

- 所有普通 TaskFlow 调用使用 `project_id="paper_fucker"`。
- 写任务前必须先 `validate_project_binding` 和 `get_runtime_info`。
- 修改任务前必须 `claim_task`，结束后必须 `release_task`。
- `CHANGELOG` 是 colon DSL，不是 Markdown。
- 代码/文档变更必须写真实 commit id；没有真实 commit id 时不能把 changelog 当最终状态。

## Release 文件面

仓库保留审计证据，release artifact 只携带产品运行和用户验证必要文件。

- GitHub source archive：由 `.gitattributes` 的 `export-ignore` 排除 `.plan/`、`reports/`、`legacy/`、`upstream/`、历史 changelog、测试树、spec、本地 runtime 和上游营销素材。
- npm/pack：由 package-level `files` 白名单控制。
- 二进制 wrapper：`packages/opencode/script/publish.ts` 应只组装 `bin`、`postinstall.mjs`、`LICENSE` 和 `package.json`。
- 审计入口：`scripts/check-release-files.ps1`，报告写入 `reports/release-file-audit.md`。

## 验收命令

最小 release 文档/文件面检查：

```powershell
.\scripts\check-readme-version.ps1
.\scripts\check-changelog-format.ps1
.\scripts\check-release-files.ps1
```

基础 smoke：

```powershell
npx --yes bun@1.3.13 --cwd packages/opencode test test/paper/strict-acceptance.test.ts
npx --yes bun@1.3.13 run --cwd packages/opencode typecheck
npx --yes bun@1.3.13 --cwd packages/preview test
$env:PYTHONPATH = 'research-tools/src'; python -m unittest discover -s research-tools/tests
```

完整验收按需运行：

```powershell
.\scripts\strict-acceptance.ps1 -CheckTimeoutSeconds 300
.\scripts\strict-acceptance.ps1 -FullWorkspaceSuite -CheckTimeoutSeconds 600 -FullWorkspaceTimeoutSeconds 2700
```

## README 写作规则

对外 README 的首屏必须避免内部术语堆叠。优先顺序：

1. 一句话说明产品价值。
2. 核心能力。
3. 快速开始。
4. 典型流程。
5. Provider/模型配置。
6. Preview/export。
7. 隐私与数据外传。
8. 内部文档链接。

不要把 TaskFlow、release 文件面、上游迁移细节、长验证日志放在 README 首屏。
