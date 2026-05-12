import { TextAttributes } from "@opentui/core"
import { createResource, For, Show } from "solid-js"
import { useSDK } from "@tui/context/sdk"
import { useTheme } from "@tui/context/theme"
import { useDialog } from "@tui/ui/dialog"

type ModelRolesPayload = {
  inventory?: {
    decision_model?: string
    allowlist: string[]
    candidates: Array<{
      model_ref: string
      display_name: string
      allowed: boolean
      smoke_status: string
    }>
  }
  roles: Record<string, { provider_id: string; model_id: string }>
  routing?: Array<{
    role: string
    selected_model?: string
    source: string
    reason: string
  }>
}

export function DialogPaperModelRoles() {
  const sdk = useSDK()
  const { theme } = useTheme()
  const dialog = useDialog()
  const [roles] = createResource(async () => {
    const response = await sdk.fetch(new URL("paper/model-inventory", sdk.url), {
      headers: {
        ...(sdk.directory ? { "x-opencode-directory": sdk.directory } : {}),
      },
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return (await response.json()) as ModelRolesPayload
  })

  return (
    <box paddingLeft={2} paddingRight={2} gap={1} paddingBottom={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text fg={theme.text} attributes={TextAttributes.BOLD}>
          模型工作台
        </text>
        <text fg={theme.textMuted} onMouseUp={() => dialog.clear()}>
          esc
        </text>
      </box>
      <Show when={roles()} fallback={<text fg={theme.textMuted}>读取中...</text>}>
        {(payload) => (
          <box flexDirection="column" gap={1}>
            <text fg={theme.text}>模型工作台</text>
            <text fg={theme.textMuted}>主决策模型 {payload().inventory?.decision_model ?? "未配置"}</text>
            <text fg={theme.textMuted}>
              允许模型 {payload().inventory?.allowlist.length ?? 0}/{payload().inventory?.candidates.length ?? 0}
            </text>
            <Show when={(payload().inventory?.allowlist.length ?? 0) === 0}>
              <box flexDirection="column" gap={0}>
                <text fg={theme.warning}>尚未配置可用模型。</text>
                <text fg={theme.textMuted}>请添加 provider，拉取 /models，勾选允许模型，并选择主决策模型。</text>
              </box>
            </Show>
            <Show when={(payload().inventory?.candidates.length ?? 0) > 0}>
              <box flexDirection="column" gap={0}>
                <text fg={theme.textMuted}>候选模型</text>
                <For each={(payload().inventory?.candidates ?? []).slice(0, 12)}>
                  {(candidate) => (
                    <box flexDirection="row" gap={1}>
                      <text fg={candidate.allowed ? theme.accent : theme.textMuted}>{candidate.allowed ? "✓" : "·"}</text>
                      <text fg={theme.text}>{candidate.model_ref}</text>
                      <text fg={theme.textMuted}>{candidate.smoke_status}</text>
                    </box>
                  )}
                </For>
              </box>
            </Show>
            <Show when={(payload().routing?.length ?? 0) > 0}>
              <box flexDirection="column" gap={0}>
                <text fg={theme.textMuted}>动态路由预览</text>
                <For each={payload().routing ?? []}>
                  {(decision) => (
                    <box flexDirection="row" gap={1}>
                      <text fg={theme.textMuted}>{decision.role}</text>
                      <text fg={decision.source === "blocked" ? theme.warning : theme.text}>
                        {decision.selected_model ?? decision.reason}
                      </text>
                    </box>
                  )}
                </For>
              </box>
            </Show>
            <For each={Object.entries(payload().roles)}>
              {([role, model]) => (
                <box flexDirection="row" gap={1}>
                  <text fg={theme.textMuted}>{role}</text>
                  <text fg={theme.text}>
                    {model.provider_id}/{model.model_id}
                  </text>
                </box>
              )}
            </For>
          </box>
        )}
      </Show>
    </box>
  )
}
