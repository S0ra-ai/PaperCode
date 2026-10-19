# PaperCode

当前版本：<!-- version:start -->0.13.0.185-dev<!-- version:end --> ｜ 状态：开发态 ｜ 许可证：MPL-2.0

PaperCode 是一个中文优先、私有优先的论文研究工作台。你输入主题，或拖入论文、代码、数据和实验日志，它会把任务组织成可恢复、可审查的 `PaperRun`：研究规划、资料检索、代码理解、实验设计、复现记录、证据账本、真实性审查、实时预览和导出。

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
git clone https://github.com/S0ra-ai/PaperCode.git
cd papercode
bun install
bun run build
.\papercode.exe
```

macOS / Linux：

```bash
git clone https://github.com/S0ra-ai/PaperCode.git
cd papercode
bun install
bun run build
./papercode
```

初始化与诊断：

```bash
papercode init
papercode init doctor
papercode runs list
papercode resume <run-id>
```

## TUI 工作流

启动后第一屏就是论文工作台。输入提示为“输入主题，或拖入论文、代码、数据”。

常用命令：

- `/models` 配置 provider、允许模型、主决策模型和阶段模型。
- `/folder` 选择当前 TUI 对话工作区；只有选择后，新 run 才会写入该工作区。
- `/file` 添加论文草稿、PDF、Markdown、LaTeX 或 DOCX。
- `/data` 添加数据集。
- `/log` 添加实验日志。
- `/status` 查看模型、MCP、Skill 和工具链状态。
- `/resume` 打开历史 `PaperRun` 选择器。

默认情况下，`PaperRun` 保存在用户目录。选择工作区或显式传入 `storage_scope: "workspace"` 后，才写入对应项目工作区。

运行中会自动打开本地只读 Monitor。它通过 SSE 持续显示阶段图、查新结果、论文脊梁、全局图、草稿、证据账本、agent、成本和 gate 状态；没有 token 的请求会被拒绝，写请求会被阻断。

## 模型与订阅

`/models` 是唯一的模型配置入口。PaperCode 中的 provider 指已经完成授权、实际可调用的模型入口。注册方式有两类：

- 订阅登录：ChatGPT Plus/Pro、GitHub Copilot。
- 自定义 endpoint：填写 provider id、base URL 和 API key，自动拉取 `/models`。

所有模型都会先进入“所有模型”列表；只有你勾选的模型才会进入候选池。主决策模型、备用决策模型和阶段模型都只能从候选池中选择。运行时的 Agent Team 和递归子 agent 也只能通过这个候选池路由模型，不会回退到未授权模型。

## 论文能力

- 论文格式：当前启用中国计算机学报 profile；其他期刊格式与发现流程暂不作为用户入口开放。
- 导出质量：final benchmark 已能生成 Markdown、LaTeX、PDF、DOCX 四类可审查论文包；当前重点继续打磨中国计算机学报模板细节。
- 查新流程：从资料检索、实验设计到 ClaimLedger 前持续生成 `NoveltyCheckpoint`，发现重复研究时先改道或收窄贡献。
- 论文脊梁：`PaperSpine` 在正文前检查中心论点、动机链、贡献链和证据链，避免无证据草稿伪装成终稿。
- 全局图：`GlobalFigureSpec` 生成期刊适配 overview figure，panel 必须绑定 claim、source 或 artifact。
- 图示能力：内置 `architecture-diagram` 和 `paper-framework-figure-studio-pro`，用于系统架构图、方法流程图和 framework figure。
- 网页采集：`bb-browser` 作为 PaperCode 托管能力诊断和安装，不要求用户手工准备浏览器采集栈。
- 机器环境：侧边栏显示 OS、CPU、内存、磁盘、GPU/CUDA/ROCm、编译器、Python/uv/pip/conda、Node/Bun、Docker、WSL 和虚拟化工具状态。
- 历史恢复：全局 run index 可列出 home/workspace 两类 run，CLI 和 TUI 都支持恢复。

## 当前验收状态

- 最新 final benchmark 使用中国计算机学报目标 profile，14 个 PaperRun 阶段全部成功，final gate 通过，`failed_checks=[]`。
- 生成稿包含中文摘要、关键词、英文摘要、引言、研究问题、贡献、相关工作、方法、实验设置、结果、可复现性、讨论、效度威胁、结论、声明、参考文献和附录。
- CJC 表格已加入 CJK-aware 列宽提示，长文本列在 PDF 中不会再和短编号列均分宽度。
- CJC 参考文献已改为正式条目样式：`[序号] 作者. 题名[文献类型/OL]. 日期[引用日期]. DOI/arXiv/URL.`。
- 仍处于开发态：作者/单位元数据、参考文献细节、整页 PDF 视觉验收和官方模板完全对齐还会继续迭代。

## 隐私

PaperCode 默认 private-first：

- 配置、密钥和运行记录保存在 PaperCode 本机状态目录。
- 默认运行记录保存在用户目录；选择工作区后，该项目的中间产物和恢复记录保存在工作区状态目录。
- 本地代码、数据和论文材料不会默认全文发给外部模型或 MCP。
- secrets、ignored files、大二进制和敏感配置会被排除。
- 外部模型、MCP、Skill 和工具调用写入 audit/tool trace。

## 系统要求

- Bun 1.3.x
- Git
- 终端尺寸最低 `96x28`，推荐 `120x34`
- 可选：Python、uv、Pandoc、LaTeX、Docker、CUDA/ROCm、Node、编译器工具链

缺少可选工具不会阻止基础论文工作台启动；doctor 和右侧栏会说明缺失项影响哪些实验、导出或复现能力。

## 开发文档

多页开发手册位于 `docs/development/index.html`。手册按 ReadTheDocs 风格组织，主线是开发指南、架构、接口契约、PaperRun 流程、关键函数、模型工作台、实验执行、Preview/export 和常见修改路径；使用指南保留完整产品路径，便于用户和维护者按同一条流程验收。

## FAQ

**没有模型能启动吗？**  
可以启动，但 `PaperRun` 会暂停并引导你进入 `/models` 添加 provider、勾选允许模型并选择主决策模型。

**默认会污染当前仓库吗？**  
不会。默认 run 保存在用户目录。只有你选择当前目录作为工作区，才会把该任务的中间产物写入当前项目。

**可以恢复历史任务吗？**  
可以。TUI 使用 `/resume`，CLI 使用 `papercode runs list` 和 `papercode resume <run-id>`。

**第三方来源在哪里？**  
第三方快照、skills 和托管能力边界记录在 `NOTICE.md`。内部维护说明放在 `docs/internal/`。

## License

PaperCode 原创项目代码使用 Mozilla Public License 2.0（MPL-2.0）。第三方快照、skills 和工具链组件保留其各自许可证，详见 `NOTICE.md`。
