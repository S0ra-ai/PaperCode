import { createMemo, For } from "solid-js"
import { DEFAULT_THEMES, useTheme } from "@tui/context/theme"

const themeCount = Object.keys(DEFAULT_THEMES).length
const themeTip = `Use {highlight}/themes{/highlight} or {highlight}Ctrl+X T{/highlight} to switch between ${themeCount} built-in themes`

type TipPart = { text: string; highlight: boolean }

function parse(tip: string): TipPart[] {
  const parts: TipPart[] = []
  const regex = /\{highlight\}(.*?)\{\/highlight\}/g
  const found = Array.from(tip.matchAll(regex))
  const state = found.reduce(
    (acc, match) => {
      const start = match.index ?? 0
      if (start > acc.index) {
        acc.parts.push({ text: tip.slice(acc.index, start), highlight: false })
      }
      acc.parts.push({ text: match[1], highlight: true })
      acc.index = start + match[0].length
      return acc
    },
    { parts, index: 0 },
  )

  if (state.index < tip.length) {
    parts.push({ text: tip.slice(state.index), highlight: false })
  }

  return parts
}

const NO_MODELS_TIP = "运行 {highlight}/connect{/highlight} 添加模型 provider，然后启动论文研究工作流"

export function Tips(props: { connected?: boolean }) {
  const theme = useTheme().theme
  const randomTip = TIPS[Math.floor(Math.random() * TIPS.length)]
  const parts = createMemo(() => parse(props.connected === false ? NO_MODELS_TIP : randomTip))

  return (
    <box flexDirection="row" maxWidth="100%">
      <text flexShrink={0} style={{ fg: theme.warning }}>
        ● Tip{" "}
      </text>
      <text flexShrink={1}>
        <For each={parts()}>
          {(part) => <span style={{ fg: part.highlight ? theme.text : theme.textMuted }}>{part.text}</span>}
        </For>
      </text>
    </box>
  )
}

const TIPS = [
  "输入主题即可创建 PaperRun，系统会自动规划文献、实验、写作、审稿和导出",
  "输入 {highlight}--code <path>{/highlight} 和主题，可以从代码仓库生成有源码依据的论文草稿",
  "输入 {highlight}--paper{/highlight}、{highlight}--data{/highlight}、{highlight}--log{/highlight} 可把论文材料、数据和实验日志纳入证据账本",
  "使用 {highlight}@{/highlight} 后接文件名可以快速附加代码、PDF、Markdown、LaTeX 或实验记录",
  "运行 {highlight}/paper{/highlight} 打开当前 PaperRun 的阶段图、Source Ledger 和 Claim Ledger",
  "运行 {highlight}/models{/highlight} 或 {highlight}Ctrl+X M{/highlight} 查看并切换可用模型",
  "在模型角色面板中为 planner、writer、reviewer、citation_checker 分配不同 provider/model",
  "使用 {highlight}/connect{/highlight} 添加 OpenAI-compatible、DeepSeek 或其他 OpenCode provider",
  "运行 {highlight}/doctor{/highlight} 检查 MCP、skills、pandoc、LaTeX、Python 和容器工具链",
  "运行 {highlight}/skills{/highlight} 查看 Nature、IEEE、ACM、Springer 等论文 profile skill",
  "使用 Nature profile 时，系统会抓取并缓存最新官方作者指南，而不是依赖过期常量",
  "Source Ledger 中的每条文献、代码片段和数据记录都会绑定来源范围或外部证据",
  "Claim Ledger 先于正文生成；无证据 claim 会阻断 final export",
  "实验结果必须通过复现 gate，未复现内容只会标记为 exploratory",
  "final export 失败时仍可生成 forced draft，但会显著标记失败检查",
  "默认私有优先：未授权的代码、数据和论文材料不会全文发给外部模型或 MCP",
  "预算档 quick、standard、deep、submission 会控制子 agent 深度、并发、检索和成本上限",
  "多层子 agent 会写入 Agent Tree，方便追踪每个 artifact 的来源和模型",
  "MCP 与 skills 是论文能力总线；文献检索、模板检查、实验和导出都会记录 tool trace",
  "运行 {highlight}paper_fucker run \"主题\"{/highlight} 可在非交互模式下启动论文工作流",
  "运行 {highlight}paper_fucker run \"基于 <path> 写一篇系统论文\"{/highlight} 可在 CLI 中提交代码出论文意图",
  "在 PaperRun 页面打开 {highlight}Preview{/highlight} 面板可查看只读预览",
  "运行 {highlight}paper_fucker export <run-id>{/highlight} 导出可审查论文 bundle",
  themeTip,
  "使用 {highlight}Ctrl+P{/highlight} 打开命令面板",
  "使用 {highlight}F2{/highlight} 快速切换最近使用的模型",
  "使用 {highlight}Ctrl+X B{/highlight} 显示或隐藏侧边栏",
  "使用 {highlight}Shift+Enter{/highlight} 或 {highlight}Ctrl+J{/highlight} 在输入框换行",
  "使用 {highlight}Escape{/highlight} 暂停当前自动推进，系统会把暂停原因写入 diagnostics",
  "在 {highlight}~/.paper_fucker/config/tui.json{/highlight} 中保存全局 TUI 设置",
  "在 {highlight}paper_fucker.json{/highlight} 中配置 MCP、skills、预算档和默认质量模式",
  "在 {highlight}.paper_fucker/skills/{/highlight} 中安装团队私有论文 skill",
  "在 {highlight}.paper_fucker/tools/{/highlight} 中添加 Python、R 或 shell 研究工具桥接",
  "使用 {highlight}{env:VAR_NAME}{/highlight} 或 {highlight}{file:path}{/highlight} 引用本地配置值",
  '设置 {highlight}"tools": {"bash": false}{/highlight} 可禁用指定工具',
  '设置 {highlight}"mcp_*": false{/highlight} 可禁用某个 MCP server 的全部工具',
  "权限 {highlight}external_directory{/highlight} 会保护项目外文件，防止未授权外传",
  "权限 {highlight}doom_loop{/highlight} 会阻止无限工具调用循环",
  "运行 {highlight}paper_fucker debug config{/highlight} 排查配置加载问题",
  "使用 {highlight}--print-logs{/highlight} 在 stderr 查看详细诊断日志",
  "创建 JSON theme 文件到 {highlight}.paper_fucker/themes/{/highlight} 可自定义论文工作台主题",
  "运行 {highlight}docker run -it --rm ghcr.io/s0ra-ai/paper_fucker{/highlight} 可使用容器化工作台",
  "运行 {highlight}/help{/highlight} 或 {highlight}Ctrl+X H{/highlight} 查看帮助",
  ...(process.platform === "win32"
    ? ["使用 {highlight}Ctrl+Z{/highlight} 撤销输入框中的改动"]
    : ["使用 {highlight}Ctrl+Z{/highlight} 暂停终端并返回 shell"]),
]
