# Paper Fucker

当前版本：<!-- version:start -->0.8.5-dev<!-- version:end --> ｜ 作者：k1d ([ZhuchenZhong](https://github.com/ZhuchenZhong)) ｜ 状态：开发预览版 ｜ 许可证：private-first / UNLICENSED

Paper Fucker 是一个中文优先、私有优先的可验证论文工作台。你可以给它一个研究主题、代码仓库、数据集、实验日志或已有论文材料，它会自动完成研究规划、资料检索、代码理解、实验复现、证据账本写作、真实性审查、实时预览和最终导出。

它不是“套壳聊天机器人”。OpenCode 只作为 provider/model、agent、tool、MCP、skill、权限和 TUI 底座；Paper Fucker 负责论文研究与产出闭环。

## 能做什么

- **主题出论文**：从研究主题开始，检索资料、规划实验、生成 ClaimLedger 和可审查论文包。
- **代码出论文**：读取指定仓库，提取方法、架构、实验入口和 source range，避免凭空描述代码。
- **材料出论文**：整合 PDF、Markdown、LaTeX、DOCX、数据集和实验日志。
- **多模型协作**：planner、literature、code、experiment、writer、reviewer、citation、summarizer、subagent 等角色可以使用不同 provider/model。
- **递归 Agent Team**：面向大代码库和复杂研究任务，agent 可以继续派生子 agent，最终自底向上合并带证据的结论。
- **实时网页 Preview**：写作、引用、审稿、成本、agent 和导出状态可以在 token-protected localhost 页面实时查看。
- **真实性 Gate**：无证据 claim、引用缺失、license/source 冲突或复现失败会阻断 final export；forced draft 会显著标记失败项。

## 安装

当前版本仍是开发预览版。正式发布包可用后，Windows 用户会直接获得 `paper_fucker` 命令；在此之前，推荐先从源码运行。

### Windows 源码预览

前置要求：

- Windows 10 1809 或更高版本。
- Git for Windows。
- Bun。Windows 安装方式见 [Bun 官方安装文档](https://bun.sh/docs/installation)。

在 PowerShell 中执行：

```powershell
winget install --id Git.Git -e
powershell -c "irm bun.sh/install.ps1 | iex"
bun --version

git clone https://github.com/S0ra-ai/paper_fucker.git
cd paper_fucker
bun install
bun run build
```

编译完成后，项目根目录会生成当前平台可执行文件。Windows 上是：

```powershell
.\paper_fucker.exe --help
.\paper_fucker.exe init --yes
.\paper_fucker.exe init doctor
.\paper_fucker.exe
```

macOS / Linux 上是 `./paper_fucker`。生成的根目录可执行文件是本地编译产物，不进入 git。

### 可选外部工具

基础 TUI 只需要 Git 和 Bun。以下工具按能力启用，缺失时 `paper_fucker init doctor` 会提示：

- Pandoc：Markdown、LaTeX、DOCX 转换。
- LaTeX 引擎：TeX Live、MiKTeX 或 Tectonic，用于 PDF 生成。
- Docker Desktop：容器复现实验。
- Python 3.11+：爬虫、数据处理和部分 research tools。

## 推荐使用方式：TUI 论文工作台

```powershell
.\paper_fucker.exe init --yes
.\paper_fucker.exe init doctor
.\paper_fucker.exe
```

`paper_fucker` 默认打开中文 TUI 论文工作台。Windows 源码编译用户从仓库根目录运行 `.\paper_fucker.exe`；正式安装版会直接提供 `paper_fucker` 命令。你不需要手动输入 tool 命令，也不需要自己串联 MCP、skills 或子 agent；系统会从你的自然语言输入中解析 `PaperRun`，自动编排 stage graph、Agent Team、能力调用和 Gate。

TUI 首页可以直接输入：

- `写一篇关于小样本代码智能体评测方法的论文`
- `基于 E:\Project\some-repo 写一篇系统论文`
- `读取 ./paper-draft.md、./data 和 ./logs，补齐实验、引用和最终导出`
- `目标 Nature，使用 submission_candidate 模式审查这篇论文`

Run 页面会展示：

- stage graph 与当前状态
- Agent Tree / Agent Team
- 成本、token/context、论文大纲
- Source Ledger、Claim Ledger、实验/复现状态
- MCP、skills、toolchain、provider/model role 健康状态
- Preview 与 Export 控制
- 需要你决策的中文 pause questions

如果你要重新配置 provider、模型角色或本地工具链，重新运行 `.\paper_fucker.exe init --yes` 即可刷新本地配置；`.\paper_fucker.exe init doctor` 会检查当前配置和工具状态。

## 非交互模式

CLI 适合脚本、自动化检查或你明确想绕过 TUI 的场景。它不是主交互入口。

**主题出论文**

```powershell
.\paper_fucker.exe run "基于多智能体协作的软件工程论文生成系统"
```

**代码仓库出论文**

```powershell
.\paper_fucker.exe run --code E:\Project\some-repo "把这个项目整理成一篇系统论文"
```

**混合材料出论文**

```powershell
.\paper_fucker.exe run --code . --paper-files .\paper-draft.md --dataset-paths .\data "补齐实验、引用和最终导出"
```

运行过程中，TUI 会显示 stage graph、Agent Tree、成本/token、论文大纲、source ledger、claim ledger、实验状态、Gate 和阻塞项。需要人工决策时，系统会用中文 pause question 询问；不需要你持续输入命令。

## 内置 MCP、Skills 与能力包

Paper Fucker 把常用论文研究能力作为内置 capability packs 融合进产品，不要求用户逐个手工安装后才能开始。

| 能力包 | 默认状态 | 包含能力 |
| --- | --- | --- |
| `paper-profile-skills` | 内置启用 | `nature-paper`、IEEE、ACM 等投稿 profile skill，用于结构、声明、模板和导出检查 |
| `literature-mcp` | 自动链接 | Exa remote MCP、Crossref、Semantic Scholar、arXiv，用于文献、数据和 source verification |
| `crawler-data` | 内置启用 | Scrapling-first crawler、可选 Scrapling MCP，用于网页数据获取、抽取和 license/source 诊断 |
| `huggingface-research` | 默认可用，按需配置 secret | Hugging Face docs、papers、datasets、models、Spaces、Jobs、Trackio，用于 ML 研究和实验闭环 |
| `code-experiment-core` | 内置启用 | OpenCode read/grep/glob/task/shell、Jupyter skill、Python log parser、dataset metadata probe |
| `writing-verification-export` | 内置启用 | ClaimLedger、SourceLedger、authenticity review gate、export bundle |

仓库已内置 Exa remote MCP 默认配置：

```jsonc
{
  "mcp": {
    "exa": {
      "type": "remote",
      "url": "https://mcp.exa.ai/mcp",
      "enabled": true
    }
  }
}
```

TUI 会在能力健康区显示 MCP、Skill 和 toolchain 状态。缺少 secret、外部工具、网络授权或数据外传授权时，系统会暂停并用中文说明需要你处理什么。

## Provider 与模型

DeepSeek 只是默认样例，不是唯一支持模型。任何 OpenCode substrate 支持的 provider/model 都可以接入，并按角色分配。

```powershell
.\paper_fucker.exe init --yes
.\paper_fucker.exe init doctor
```

Provider public config 存在 `~/.paper_fucker/providers/`，secret 存在 `~/.paper_fucker/local/provider-secrets.json`。API key 不应进入 git。

## Preview 与导出

PaperRun 会为草稿、引用、审稿意见、导出文件、成本、agent 和 tool diagnostics 生成只读 snapshot。TUI 中打开 Preview 后，会启动 token-protected localhost 服务并自动打开浏览器页面。

导出分两类：

- `reviewable_bundle`：默认输出，包含论文草稿、证据账本、引用、实验/复现记录、审稿报告和导出文件。
- `submission_candidate`：面向 Nature/IEEE/ACM/Springer 等 profile 的更严格候选包，必须通过 profile 与真实性检查。

## 隐私与数据外传

Paper Fucker 默认 private-first：

- 本地代码、数据和论文材料不会默认全文发给外部模型或 MCP。
- 首次 run 会要求确认可外传的路径、摘要、片段和文件类型。
- secrets、ignored files、大二进制和敏感配置会自动排除。
- 所有外部 tool/model/MCP 调用都会写入 audit/tool trace。

## 项目状态

Paper Fucker 仍处于开发预览阶段，接口、TUI 布局和内置能力包可能继续调整。当前目标是让“主题/代码/材料到可审查论文包”的闭环先稳定下来，再进入更稳定的试用版本。

版本历史见 `CHANGELOG`。发布包只包含安装、运行和用户验证所需内容，不包含开发、测试或本地运行资产。

## License

本项目当前是 private-first，除非后续书面修改许可证，否则保留所有权利。

第三方快照保留其原始许可证。OpenCode 上游来源与许可证边界记录在 `NOTICE.md`。
