import { TextAttributes } from "@opentui/core"
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/solid"
import * as Clipboard from "@tui/util/clipboard"
import { createSignal } from "solid-js"
import { InstallationVersion } from "@opencode-ai/core/installation/version"
import { win32FlushInputBuffer } from "../win32"
import { getScrollAcceleration } from "../util/scroll"

export function ErrorComponent(props: {
  error: Error
  reset: () => void
  onBeforeExit?: () => Promise<void>
  onExit: () => Promise<void>
  mode?: "dark" | "light"
}) {
  const term = useTerminalDimensions()
  const renderer = useRenderer()

  const handleExit = async () => {
    await props.onBeforeExit?.()
    renderer.setTerminalTitle("")
    renderer.destroy()
    win32FlushInputBuffer()
    await props.onExit()
  }

  useKeyboard((evt) => {
    if (evt.ctrl && evt.name === "c") {
      void handleExit()
    }
  })
  const [copied, setCopied] = createSignal(false)

  const issueURL = new URL("https://github.com/S0ra-ai/PaperCode/issues/new?template=bug-report.yml")

  // Choose safe fallback colors per mode since theme context may not be available
  const isLight = props.mode === "light"
  const colors = {
    bg: isLight ? "#ffffff" : "#05070a",
    text: isLight ? "#1a1a1a" : "#f5f1e8",
    muted: isLight ? "#8a8a8a" : "#91a1ad",
    primary: isLight ? "#3b7dd8" : "#e7a33f",
  }

  if (props.error.message) {
    issueURL.searchParams.set("title", `opentui: fatal: ${props.error.message}`)
  }

  if (props.error.stack) {
    issueURL.searchParams.set(
      "description",
      "```\n" + props.error.stack.substring(0, 6000 - issueURL.toString().length) + "...\n```",
    )
  }

  issueURL.searchParams.set("papercode-version", InstallationVersion)

  const copyIssueURL = () => {
    void Clipboard.copy(issueURL.toString()).then(() => {
      setCopied(true)
    })
  }

  return (
    <box flexDirection="column" gap={1} backgroundColor={colors.bg}>
      <box flexDirection="row" gap={1} alignItems="center">
        <text attributes={TextAttributes.BOLD} fg={colors.text}>
          PaperCode 遇到运行错误
        </text>
        <box onMouseUp={copyIssueURL} backgroundColor={colors.primary} padding={1}>
          <text attributes={TextAttributes.BOLD} fg={colors.bg}>
            复制诊断链接
          </text>
        </box>
        {copied() && <text fg={colors.muted}>已复制</text>}
      </box>
      <box flexDirection="row" gap={2} alignItems="center">
        <text fg={colors.text}>TUI 已停止，当前 PaperRun 状态不会被删除。</text>
        <box onMouseUp={props.reset} backgroundColor={colors.primary} padding={1}>
          <text fg={colors.bg}>重置 TUI</text>
        </box>
        <box onMouseUp={handleExit} backgroundColor={colors.primary} padding={1}>
          <text fg={colors.bg}>退出</text>
        </box>
      </box>
      <scrollbox height={Math.floor(term().height * 0.7)} scrollAcceleration={getScrollAcceleration()}>
        <text fg={colors.muted}>{props.error.stack}</text>
      </scrollbox>
      <text fg={colors.text}>{props.error.message}</text>
    </box>
  )
}
