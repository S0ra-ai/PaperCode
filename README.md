# Paper Fucker

当前版本：<!-- version:start -->0.11.2-dev<!-- version:end --> ｜ 作者：k1d ([ZhuchenZhong](https://github.com/ZhuchenZhong)) ｜ 状态：开发态 ｜ 许可证：private-first / UNLICENSED

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
        +-- 论文图示：architecture-diagram、framework figure studio
        +-- 写作与审查：ClaimLedger、引用检查、真实性 gate、forced draft 标记
        +-- 预览与恢复：只读 Preview、全局 run index、/resume
```

## 快速开始

Windows PowerShell：

```powershell
winget install --id Git.Git -e
powershell -c "irm bun.sh/install.ps1 | iex"
git clone https://github.com/S0ra-ai/paper_fucker.git
cd paper_fucker
bun install
bun run build
.\paper_fucker.exe
```

macOS / Linux：

```bash
git clone https://github.com/S0ra-ai/paper_fucker.git
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

## 论文能力

- 论文 profile：Nature、IEEE、ACM、Springer 等结构与材料检查。
- 图示能力：内置 `architecture-diagram` 和 `paper-framework-figure-studio-pro`，用于系统架构图、方法流程图和 framework figure。
- 网页采集：`bb-browser` 作为 Paper Fucker 托管能力诊断和安装，不要求用户手工准备浏览器采集栈。
- 机器环境：侧边栏显示 OS、CPU、内存、磁盘、GPU/CUDA/ROCm、编译器、Python/uv/pip/conda、Node/Bun、Docker、WSL 和虚拟化工具状态。
- 历史恢复：全局 run index 可列出 home/workspace 两类 run，CLI 和 TUI 都支持恢复。

## 隐私

Paper Fucker 默认 private-first：

- 不读取 `.opencode/`、`~/.config/opencode/` 或旧 auth/config/session/cache。
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

本项目当前是 private-first，除非后续书面修改许可证，否则保留所有权利。
