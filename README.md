# Paper Fucker

当前版本：<!-- version:start -->0.13.0.22-dev<!-- version:end --> ｜ 作者：k1d ([ZhuchenZhong](https://github.com/ZhuchenZhong)) ｜ 状态：开发态 ｜ 许可证：MPL-2.0

Paper Fucker 是一个中文优先、私有优先的论文研究工作台。你输入主题，或拖入论文、代码、数据和实验日志，它会把任务组织成可恢复、可审查的 `PaperRun`：研究规划、资料检索、代码理解、实验设计、复现记录、证据账本、真实性审查、实时预览和导出。

## 能力图

```text
主题 / 论文 / 代码 / 数据 / 日志
        |
        v
    PaperRun
        |
        +-- 模型工作台：provider、allowlist、主决策模型、阶段模型
        +-- 资料与网页：文献 MCP、托管浏览器采集、source ledger
        +-- 代码与实验：代码图谱、机器/GPU/工具链诊断、复现 gate
        +-- 查新与转向：NoveltyCheckpoint、PriorWorkMap、ExperimentNoveltyGate
        +-- 论文脊梁：PaperSpine、动机链、贡献链、章节意图、revision matrix
        +-- 论文图示：architecture-diagram、framework figure studio
        +-- 写作与审查：ClaimLedger、引用检查、真实性 gate、forced draft 标记
        +-- 监控与恢复：实时只读 Monitor、全局 run index、/resume
```

## 快速开始

Windows PowerShell：

```powershell
winget install --id Git.Git -e
powershell -c "irm bun.sh/install.ps1 | iex"
git clone https://github.com/ZhuchenZhong/paper_fucker.git
cd paper_fucker
bun install
bun run build
.\paper_fucker.exe
```

macOS / Linux：

```bash
git clone https://github.com/ZhuchenZhong/paper_fucker.git
cd paper_fucker
bun install
bun run build
./paper_fucker
```

初始化与诊断：

```bash
paper_fucker init
paper_fucker init doctor
paper_fucker runs list
paper_fucker resume <run-id>
```

## TUI 工作流

启动后第一屏就是论文工作台。输入提示为“输入主题，或拖入论文、代码、数据”。

常用命令：

- `/models` 配置 provider、允许模型、主决策模型和阶段模型。
- `/folder` 选择当前 TUI 对话工作区；只有选择后，新 run 才会写入该工作区的 `.paper_fucker/runs`。
- `/file` 添加论文草稿、PDF、Markdown、LaTeX 或 DOCX。
- `/data` 添加数据集。
- `/log` 添加实验日志。
- `/status` 查看模型、MCP、Skill 和工具链状态。
- `/resume` 打开历史 `PaperRun` 选择器。

默认情况下，`PaperRun` 写入 `~/.paper_fucker/runs/<run-id>`。选择工作区或显式传入 `storage_scope: "workspace"` 后，才写入 `<workspace>/.paper_fucker/runs/<run-id>`。

运行中会自动打开本地只读 Monitor。它通过 SSE 持续显示阶段图、查新结果、论文脊梁、全局图、草稿、证据账本、agent、成本和 gate 状态；没有 token 的请求会被拒绝，写请求会被阻断。

## 模型与订阅

`/models` 是唯一的模型配置入口。Paper Fucker 中的 provider 指已经完成授权、实际可调用的模型入口。注册方式有两类：

- 订阅登录：ChatGPT Plus/Pro、GitHub Copilot。
- 自定义 endpoint：填写 provider id、base URL 和 API key，自动拉取 `/models`。

所有模型都会先进入“所有模型”列表；只有你勾选的模型才会进入候选池。主决策模型、备用决策模型和阶段模型都只能从候选池中选择。运行时的 Agent Team 和递归子 agent 也只能通过这个候选池路由模型，不会回退到未授权模型。

## 论文能力

- 论文 profile：Nature、IEEE、ACM、Springer 等结构与材料检查。
- 查新流程：从资料检索、实验设计到 ClaimLedger 前持续生成 `NoveltyCheckpoint`，发现重复研究时先改道或收窄贡献。
- 论文脊梁：`PaperSpine` 在正文前检查中心论点、动机链、贡献链和证据链，避免无证据草稿伪装成终稿。
- 全局图：`GlobalFigureSpec` 生成期刊适配 overview figure，panel 必须绑定 claim、source 或 artifact。
- 图示能力：内置 `architecture-diagram` 和 `paper-framework-figure-studio-pro`，用于系统架构图、方法流程图和 framework figure。
- 网页采集：`bb-browser` 作为 Paper Fucker 托管能力诊断和安装，不要求用户手工准备浏览器采集栈。
- 机器环境：侧边栏显示 OS、CPU、内存、磁盘、GPU/CUDA/ROCm、编译器、Python/uv/pip/conda、Node/Bun、Docker、WSL 和虚拟化工具状态。
- 历史恢复：全局 run index 可列出 home/workspace 两类 run，CLI 和 TUI 都支持恢复。

## 隐私

Paper Fucker 默认 private-first：

- 配置、密钥和运行记录保存在 Paper Fucker 本机状态目录。
- 只使用 `~/.paper_fucker/`、项目 `.paper_fucker/` 和 `PAPER_FUCKER_*` 环境变量。
- 本地代码、数据和论文材料不会默认全文发给外部模型或 MCP。
- secrets、ignored files、大二进制和敏感配置会被排除。
- 外部模型、MCP、Skill 和工具调用写入 audit/tool trace。

## 系统要求

- Bun 1.3.x
- Git
- 终端尺寸最低 `96x28`，推荐 `120x34`
- 可选：Python、uv、Pandoc、LaTeX、Docker、CUDA/ROCm、Node、编译器工具链

缺少可选工具不会阻止基础论文工作台启动；doctor 和右侧栏会说明缺失项影响哪些实验、导出或复现能力。

## FAQ

**没有模型能启动吗？**  
可以启动，但 `PaperRun` 会暂停并引导你进入 `/models` 添加 provider、勾选允许模型并选择主决策模型。

**默认会污染当前仓库吗？**  
不会。默认 run 存在用户 home 的 `~/.paper_fucker/runs`。只有你选择当前目录作为工作区，才会写入工作区 `.paper_fucker/runs`。

**可以恢复历史任务吗？**  
可以。TUI 使用 `/resume`，CLI 使用 `paper_fucker runs list` 和 `paper_fucker resume <run-id>`。

**第三方来源在哪里？**  
第三方快照、skills 和托管能力边界记录在 `NOTICE.md`。内部维护说明放在 `docs/internal/`。

## License

Paper Fucker 原创项目代码使用 Mozilla Public License 2.0（MPL-2.0）。第三方快照、skills 和工具链组件保留其各自许可证，详见 `NOTICE.md`。
