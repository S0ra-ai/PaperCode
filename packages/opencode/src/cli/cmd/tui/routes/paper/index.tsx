import { createMemo, createSignal, onMount, Show } from "solid-js"
import { useRouteData } from "@tui/context/route"
import { useSDK } from "@tui/context/sdk"
import { useTheme } from "@tui/context/theme"
import type { PaperRunSnapshot } from "@/paper/run"
import { createPaperRunDashboardState, fetchPaperRunSnapshot } from "./workbench"

export function PaperRunDashboard() {
  const route = useRouteData("paper")
  const sdk = useSDK()
  const { theme } = useTheme()
  const [snapshot, setSnapshot] = createSignal<PaperRunSnapshot | undefined>(route.snapshot)
  const [error, setError] = createSignal<string>()

  onMount(() => {
    if (snapshot()) return
    void fetchPaperRunSnapshot({
      baseUrl: sdk.url,
      directory: sdk.directory,
      fetch: sdk.fetch,
      runID: route.runID,
    })
      .then(setSnapshot)
      .catch((cause) => setError(cause instanceof Error ? cause.message : "PaperRun 读取失败"))
  })

  const state = createMemo(() => {
    const value = snapshot()
    if (!value) return
    return createPaperRunDashboardState(value)
  })

  return (
    <box flexDirection="column" width="100%" height="100%" paddingX={2} paddingY={1} gap={1}>
      <box flexDirection="row" justifyContent="space-between">
        <box flexDirection="column">
          <text fg={theme.primary}>
            <span style={{ bold: true }}>PaperRun 论文工作台</span>
          </text>
          <text fg={theme.textMuted}>{route.runID}</text>
        </box>
        <box flexDirection="row" gap={2}>
          <text fg={theme.textMuted}>Preview</text>
          <text fg={theme.textMuted}>Export</text>
          <text fg={theme.textMuted}>Capabilities</text>
        </box>
      </box>

      <Show when={error()}>{(message) => <text fg={theme.error}>{message()}</text>}</Show>

      <Show when={state()} fallback={<text fg={theme.textMuted}>正在读取 PaperRun...</text>}>
        {(view) => (
          <>
            <box flexDirection="column" gap={1}>
              <text>
                <span style={{ bold: true }}>{view().title}</span>
              </text>
              <box flexDirection="row" gap={2} flexWrap="wrap">
                {view().controls.map((control) => (
                  <text fg={theme.accent}>{control.label}</text>
                ))}
              </box>
            </box>

            <box flexDirection="row" gap={2} flexWrap="wrap">
              {view().panels.map((panel) => (
                <box border={["left"]} borderColor={theme.border} paddingX={1} paddingY={0}>
                  <text>
                    {panel.label}
                    {panel.count === undefined ? "" : ` ${panel.count}`}
                  </text>
                </box>
              ))}
            </box>

            <box flexDirection="column" gap={0}>
              <text fg={theme.textMuted}>Stage Graph</text>
              {view().stage_graph.map((stage) => (
                <box flexDirection="row" gap={2}>
                  <text fg={stage.status === "blocked" ? theme.error : theme.text}>{stage.status_label}</text>
                  <text>{stage.label}</text>
                </box>
              ))}
            </box>

            <Show when={view().pause_questions.length > 0}>
              <box flexDirection="column" gap={0}>
                <text fg={theme.warning}>Pause Questions</text>
                {view().pause_questions.map((question) => (
                  <text>{question.message}</text>
                ))}
              </box>
            </Show>
          </>
        )}
      </Show>
    </box>
  )
}
