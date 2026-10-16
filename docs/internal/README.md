# PaperCode 内部维护文档

这个文档面向维护者和 release 执行者。对外 GitHub 首页只保留用户理解和试用所需内容；架构边界、TaskFlow、release 文件面和验收细节放在这里。

## 文档分层

- `README.md`：对外首页。回答“这是什么、能做什么、怎么开始、是否可信”。
- `docs/internal/README.md`：内部维护入口。记录架构边界、release 流程、TaskFlow 和验收策略。
- `docs/development/index.html`：多文件 HTML 开发手册。采用 ReadTheDocs 风格的左侧分组导航、文档搜索和右侧本页目录；主线是开发指南、架构、接口契约、PaperRun 流程、关键函数、模型工作台、实验执行、Preview/export 和常见修改路径，使用指南保留完整产品路径，便于用户和维护者按同一条流程验收。
- `docs/project-structure.md`：目录结构与 release artifact 边界。
- [实验执行与复现证据](experiment-execution.md)：显式实验协议、指标输出、隔离执行与正式导出验收。
- [模型 provider 配置](model-providers.md)：`providers` 手写方言、密钥来源、论文管线的模型选择与验收命令。
- [导出工具链与字体](export-toolchain.md)：四类产物的生成路径、ctex 的平台字体策略与字体覆盖方式。
- [桌面端发布与自动更新](desktop-release.md)：渠道与产物命名、签名公证凭据、electron-updater 元数据与发布流程。
- `docs/changelog/README.md`：历史 changelog 归档策略。
- `reports/`：审计、验收、benchmark 证据，不进入 release artifact。

默认文档语言是中文。命令、路径、API、schema、品牌名、协议名和字面量保留原文。

## 架构边界

- `packages/opencode/` 是硬分叉产品核心。OpenCode provider/model、agent/session、tool、MCP、skill、permission、plugin 和 TUI runtime 作为 substrate 保留。
- `packages/opencode/src/paper` 是唯一论文领域 runtime，负责 `PaperRun`、intake、stage graph、capability registry、model role router、recursive agent fabric、ClaimLedger、verification gate、preview/export binding 和 observability。
- `packages/preview/` 是只读实时网页 Preview 包。
- `research-tools/` 是 Python/MCP/tool bridge，用于外部工具发现、文档转换、爬虫/数据辅助和 Pydantic 侧校验。
- `.papercode/` 下的 tracked assets 是产品能力的一部分；`.papercode/local/` 与 `.papercode/runs/` 是 ignored runtime state。

旧 OpenCode chat/session 能力只作为内部 substrate，不再是用户默认产品形态。用户主状态是 `PaperRun`。

## 内置能力包

README 必须把 TUI 和内置能力作为主路径，而不是表现成 CLI-only 工具。当前内置 capability packs 来自 `packages/opencode/src/paper/capability-pack.ts`：

- `paper-profile-skills`：保留 Nature 等 first-party profile skill 作为能力底座；当前用户可见期刊入口只启用中国计算机学报。
- `literature-mcp`：Exa、Crossref、Semantic Scholar、arXiv。
- `crawler-data`：Scrapling-first crawler 与可选 Scrapling MCP。
- `huggingface-research`：HF docs、papers、datasets、models、Spaces、Jobs、Trackio。
- `code-experiment-core`：OpenCode read/grep/glob/task/shell、Jupyter skill、Python experiment log parser、dataset metadata probe。
- `writing-verification-export`：ClaimLedger、SourceLedger、review gate、export bundle。

`.papercode/papercode.jsonc` 中 Exa remote MCP 默认启用。README 可以展示该事实，但不要暗示所有外部 MCP 都无需凭据或网络授权。

## Release 分支规则

当前稳定流程：

1. `develop` 完成 readiness。
2. 创建 `release/<version>` 进入手测和 RC 前稳定。
3. 用户在 release 分支重新初始化多个 provider/key/model role。
4. 发现问题就在 release 分支修复。
5. 测试通过后，由用户明确确认是否打 RC tag 或进入正式 release。

在用户确认前：

- 不打 tag。
- 不合并 `main`。
- 不调用正式 `finish_release`。
- 不发布 npm、Docker、Homebrew 或 GitHub release artifact。

## TaskFlow 约束

- 所有普通 TaskFlow 调用使用 `project_id="papercode"`。
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
8. 项目状态和许可证。

不要把 TaskFlow、release 文件面、上游迁移细节、长验证日志放在 README 首屏。

对外 README 不应出现：

- 当前 git 分支、RC/tag/main 操作策略。
- 维护者脚本清单，例如 `check-release-files.ps1` 或 `strict-acceptance.ps1`。
- `.plan/`、`reports/`、`legacy/`、`upstream/` 等内部审计目录清单。
- 内部文档索引、归档策略或 TaskFlow 执行细节。

这些内容留在本文件、`docs/project-structure.md` 或 TaskFlow step log 中。README 只服务外部读者判断“这是什么、能不能用、怎么开始、是否可信”。

## README 安装说明规则

对外 README 必须说明用户如何获得 `papercode` 命令，不能只展示命令用法。

- 尚未发布正式 installer、tag、npm 包或包管理器包时，安装章节必须标为“源码预览”，并提供 Windows 可执行的 Git+Bun+clone+`bun install`+`bun run build` 路径。
- 不得把尚未发布的 release installer、npm 包、Chocolatey、Scoop、Homebrew 或 GitHub release artifact 写成主安装方式。
- 源码编译完成后，仓库根目录必须有当前平台可执行文件；Windows 是 `papercode.exe`，macOS/Linux 是 `papercode`。
- Windows 源码预览示例应使用 `.\papercode.exe`，不要要求用户创建临时 PowerShell function。
- `papercode init` 必须能以 bounded access 安全默认值直接完成；README 示例优先使用 `papercode init`，Full Access 只能通过显式 `--full-access-ack` 启用。
- `papercode init` / `papercode init doctor` 默认必须输出用户可读中文摘要；完整 JSON 只能作为 `--json` 机器接口提供。
- 可选外部工具只列能力影响和发现方式；不要把 Pandoc、LaTeX、Docker、Python 说成基础 TUI 必装项。
