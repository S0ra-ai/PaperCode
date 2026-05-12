# Paper Fucker

当前版本：<!-- version:start -->0.9.2.2-dev<!-- version:end --> ｜ 作者：k1d ([ZhuchenZhong](https://github.com/ZhuchenZhong)) ｜ 状态：开发态 ｜ 许可证：private-first / UNLICENSED

Paper Fucker 是一个中文优先、私有优先的论文研究与产出工作台。你给它研究主题、代码仓库、数据集、实验日志或已有论文材料，它负责把任务推进成可审查论文包：研究规划、资料检索、代码理解、实验复现、证据账本、真实性审查、实时预览和最终导出。

它不是普通聊天界面。OpenCode 只作为模型、agent、tool、MCP、skill、权限和 TUI 底座；Paper Fucker 的主入口是论文工作台和 `PaperRun`。

## 核心能力

- 主题出论文：从研究问题开始，自动规划文献、数据、实验、ClaimLedger、草稿和审稿。
- 代码出论文：读取代码仓库，提取方法、架构、实验入口和 source range，避免无来源描述。
- 材料出论文：整合 PDF、Markdown、LaTeX、DOCX、数据表、实验日志和已有草稿。
- 模型工作台：添加 provider，拉取模型列表，勾选允许模型，选择主决策模型，并按阶段强制指定模型。
- 递归 Agent Team：面向大代码库或复杂研究，agent 可以继续派生子 agent，最终自底向上合并证据。
- 内置能力包：Nature/IEEE/ACM/Springer profile、Exa 等文献检索、爬虫数据获取、Hugging Face 研究能力、实验工具链、写作与真实性 gate。
- 实时 Web 监控：token-protected localhost 只读页面持续显示阶段、草稿、引用、agent、成本、gate 和导出状态。

## 从源码运行

当前仍是开发态。正式安装包可用前，推荐从源码编译；编译完成后，仓库根目录会生成当前平台可执行文件。

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

macOS / Linux 编译后从仓库根目录运行：

```bash
./paper_fucker
```

根目录生成的 `paper_fucker.exe` 或 `paper_fucker` 是本地编译产物，不进入 git。

## TUI 使用流程

启动后默认进入中文论文工作台。你可以直接输入：

- `写一篇关于多智能体代码审查的论文`
- `基于 E:\Project\some-repo 写一篇系统论文`
- `读取 ./paper-draft.md、./data 和 ./logs，补齐实验、引用和最终导出`
- `目标 Nature，生成 submission_candidate 检查包`

工作台会把输入解析为 `PaperRun`，自动推进 stage graph。只有在模型缺失、工具缺失、成本超限、数据外传授权、license/source 冲突、实验不可复现或真实性 gate 阻断时，才会用中文问题暂停。

## 模型工作台

输入 `/models` 打开模型工作台。流程是：

1. 选择内置 provider，或添加自定义 OpenAI-compatible `base_url`。
2. 填写认证信息，系统调用 `/models` 拉取模型列表。
3. 勾选允许 Paper Fucker 使用的模型。
4. 选择主决策模型。
5. 可选：为 planner、literature、code、experiment、writer、reviewer、citation、summarizer、subagent 等阶段强制指定模型。

从零启动时不会显示 GLM、DeepSeek 或任何旧 OpenCode fallback。未配置允许模型时，工作台只显示“未配置模型”，并引导你进入 `/models` 添加 provider、勾选允许模型和选择主决策模型。

## 材料与环境

你可以在输入框中拖入或引用文件和目录，也可以使用工作台命令：

- `/file` 添加论文草稿、PDF、Markdown、LaTeX 或 DOCX。
- `/folder` 添加代码仓库或资料目录。
- `/data` 添加数据集。
- `/log` 添加实验日志。
- `/status` 查看模型、MCP、Skill、Pandoc、LaTeX、Docker、Python、浏览器 Preview 和 Nature skill 状态。

Pandoc、LaTeX、Docker、Python 等是按能力启用的工具。缺失时系统会说明受影响功能：例如没有 LaTeX 仍可写作和导出 Markdown；没有 Docker 仍可做本地实验规划，但不能完成容器复现 gate。

## Preview 与导出

PaperRun 运行时可以打开实时 Preview。页面只读、仅监听本机 localhost，并通过 token 保护；草稿、引用检查、审稿意见、agent 调用、成本/token、gate 和导出状态会持续更新。

导出分两类：

- `reviewable_bundle`：默认输出，包含论文草稿、证据账本、引用、实验/复现记录、审稿报告和导出文件。
- `submission_candidate`：面向目标 profile 的更严格候选包，需要通过投稿材料和真实性检查。

final export 必须通过真实性 gate。forced draft 可以输出，但会显著标记失败检查，不能伪装成最终稿。

## 隐私

Paper Fucker 默认 private-first：

- 本地代码、数据和论文材料不会默认全文发给外部模型或 MCP。
- 首次 run 会要求确认可外传的路径、摘要、片段和文件类型。
- secrets、ignored files、大二进制和敏感配置会自动排除。
- 外部模型、MCP、Skill 和工具调用会写入 audit/tool trace。

## 项目状态

当前处于开发态，TUI、模型工作台、实时监控和导出闭环仍在快速迭代。目标是把“主题/代码/材料到可审查论文包”的完整流程稳定下来，再进入候选发布流程。

版本历史见 `CHANGELOG`。

## License

本项目当前是 private-first，除非后续书面修改许可证，否则保留所有权利。

第三方快照保留其原始许可证。OpenCode 上游来源与许可证边界记录在 `NOTICE.md`。

