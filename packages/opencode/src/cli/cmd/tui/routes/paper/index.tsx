import { createMemo, createSignal, onMount, Show } from "solid-js"
import { useRouteData } from "@tui/context/route"
import { useSDK } from "@tui/context/sdk"
import { useTheme } from "@tui/context/theme"
import type { PaperRunSnapshot } from "@/paper/run"
import type { ResearchCapability } from "@/paper/capabilities"
import {
  createPaperRunDashboardState,
  fetchPaperRunSnapshot,
  fetchPaperWorkbenchCapabilities,
  fetchPaperWorkbenchDoctor,
  paperWorkbenchHealthFromDoctor,
  type PaperWorkbenchHealthInput,
} from "./workbench"

export function PaperRunDashboard() {
  const route = useRouteData("paper")
  const sdk = useSDK()
  const { theme } = useTheme()
  const [snapshot, setSnapshot] = createSignal<PaperRunSnapshot | undefined>(route.snapshot)
  const [capabilities, setCapabilities] = createSignal<ResearchCapability[]>([])
  const [health, setHealth] = createSignal<PaperWorkbenchHealthInput>({})
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

  onMount(() => {
    void fetchPaperWorkbenchCapabilities({
      baseUrl: sdk.url,
      directory: sdk.directory,
      fetch: sdk.fetch,
    })
      .then((payload) => setCapabilities(payload.capabilities))
      .catch(() => setCapabilities([]))

    void fetchPaperWorkbenchDoctor({
      baseUrl: sdk.url,
      directory: sdk.directory,
      fetch: sdk.fetch,
    })
      .then((payload) => setHealth(paperWorkbenchHealthFromDoctor(payload)))
      .catch(() => setHealth({}))
  })

  const state = createMemo(() => {
    const value = snapshot()
    if (!value) return
    return createPaperRunDashboardState(value, {
      capabilities: capabilities(),
      health: health(),
    })
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
          <text fg={theme.textMuted}>MCP/Skills</text>
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
                <text fg={theme.textMuted}>控制器</text>
                <text fg={theme.primary}>{view().controller_status.label}</text>
                <text fg={theme.textMuted}>待处理指导 {view().controller_status.pending_guidance}</text>
              </box>
              <box flexDirection="row" gap={2} flexWrap="wrap">
                {view().controls.map((control) => (
                  <text fg={control.enabled ? (control.danger ? theme.error : theme.accent) : theme.textMuted}>
                    {control.label}
                  </text>
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

            <box flexDirection="column" gap={0}>
              <text fg={theme.textMuted}>模型角色</text>
              {view().model_roles.map((role) => (
                <box flexDirection="row" gap={2}>
                  <text>{role.label}</text>
                  <text fg={theme.textMuted}>{role.provider_model}</text>
                </box>
              ))}
            </box>

            <Show when={view().capability_health.length > 0}>
              <box flexDirection="column" gap={0}>
                <text fg={theme.textMuted}>MCP / Skill / 工具链健康</text>
                {view().capability_health.map((item) => (
                  <box flexDirection="row" gap={2}>
                    <text>{item.label}</text>
                    <text fg={item.status === "missing" || item.status === "disabled" ? theme.warning : theme.textMuted}>
                      {item.status_label}
                    </text>
                  </box>
                ))}
              </box>
            </Show>

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
