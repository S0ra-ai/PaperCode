import { createMemo, For } from "solid-js"
import { DEFAULT_THEMES, useTheme } from "@tui/context/theme"

const themeCount = Object.keys(DEFAULT_THEMES).length
const themeTip = `使用 {highlight}/themes{/highlight} 或 {highlight}Ctrl+X T{/highlight} 在 ${themeCount} 个内置主题之间切换`

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

const NO_MODELS_TIP = "打开 {highlight}/models{/highlight} 配置模型 provider，然后启动论文研究工作流"

export function Tips(props: { connected?: boolean }) {
  const theme = useTheme().theme
  const randomTip = TIPS[Math.floor(Math.random() * TIPS.length)]
  const parts = createMemo(() => parse(props.connected === false ? NO_MODELS_TIP : randomTip))

  return (
    <box flexDirection="row" maxWidth="100%">
      <text flexShrink={0} style={{ fg: theme.warning }}>
        ● 提示{" "}
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
  "把代码目录拖入输入框并说明主题，可以从代码仓库生成有源码依据的论文草稿",
  "把 PDF、Markdown、LaTeX、DOCX、数据表或实验日志拖入输入框，系统会纳入证据账本",
  "在输入中说明目标期刊或投稿候选，系统会切换到更严格的 submission_candidate 检查",
  "默认输出 {highlight}reviewable_bundle{/highlight}，包含证据账本、审稿报告、复现记录和导出文件",
  "使用 {highlight}@{/highlight} 后接文件名可以快速附加代码、PDF、Markdown、LaTeX 或实验记录",
  "PaperRun 页面右侧栏会显示 cost、token/context、大纲、Agent Tree、Gate 和最近调用",
  "PaperRun 页面会打开阶段图、Source Ledger、Claim Ledger 和右侧诊断栏",
  "打开 {highlight}/models{/highlight} 查看 provider、允许模型和主决策模型",
  "在模型角色面板中为 planner、writer、reviewer、citation_checker 分配不同 provider/model",
  "模型工作台支持内置 provider 和自定义 OpenAI-compatible provider",
  "环境与能力区会检查 MCP、Skill、Pandoc、LaTeX、Python、Docker 和浏览器 Preview",
  "内置 Nature、IEEE、ACM、Springer 等论文 profile skill 能力",
  "使用 Nature profile 时，系统会抓取并缓存最新官方作者指南，而不是依赖过期常量",
  "Source Ledger 中的每条文献、代码片段和数据记录都会绑定来源范围或外部证据",
  "Claim Ledger 先于正文生成；无证据 claim 会阻断 final export",
  "实验结果必须通过复现 gate，未复现内容只会标记为 exploratory",
  "final export 失败时仍可生成 forced draft，但会显著标记失败检查",
  "默认私有优先：未授权的代码、数据和论文材料不会全文发给外部模型或 MCP",
  "预算档 quick、standard、deep、submission 会控制并发、检索、容器复现和成本上限；子 agent 深度由运行态条件停止",
  "多层子 agent 会写入 Agent Tree，方便追踪每个 artifact 的来源和模型",
  "MCP 与 skills 是论文能力总线；文献检索、模板检查、实验和导出都会记录 tool trace",
  "默认使用 TUI 创建 PaperRun；CLI 仅作为自动化入口",
  "输入代码路径和论文目标后，系统会自动识别 code-to-paper 意图",
  "在 PaperRun 页面打开 {highlight}Preview{/highlight} 面板可查看只读预览",
  "在 PaperRun 页面使用 {highlight}Export{/highlight} 生成可审查论文 bundle",
  "使用 {highlight}/file{/highlight}、{highlight}/folder{/highlight}、{highlight}/data{/highlight} 或 {highlight}/log{/highlight} 补充材料",
  "使用 {highlight}/status{/highlight} 查看模型、工具链、MCP、Skill 和 Preview 健康状态",
  themeTip,
  "使用 {highlight}Ctrl+P{/highlight} 打开 Paper Fucker 命令面板",
  "使用 {highlight}/models{/highlight} 管理允许模型池",
  "使用 {highlight}Ctrl+X B{/highlight} 显示或隐藏侧边栏",
  "使用 {highlight}Shift+Enter{/highlight} 或 {highlight}Ctrl+J{/highlight} 在输入框换行",
  "使用 {highlight}Escape{/highlight} 暂停当前自动推进，系统会把暂停原因写入 diagnostics",
  "缺少 Pandoc、LaTeX 或 Docker 时，系统会说明受影响能力，而不是阻断所有工作流",
  "实时 Preview 是只读 localhost 页面，写作、审稿、引用和导出状态会持续更新",
  "运行 {highlight}/help{/highlight} 或 {highlight}Ctrl+X H{/highlight} 查看帮助",
  ...(process.platform === "win32"
    ? ["使用 {highlight}Ctrl+Z{/highlight} 撤销输入框中的改动"]
    : ["使用 {highlight}Ctrl+Z{/highlight} 暂停终端并返回 shell"]),
]
