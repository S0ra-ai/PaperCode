import { TextAttributes } from "@opentui/core"
import { createResource, For, Show } from "solid-js"
import { useSDK } from "@tui/context/sdk"
import { useTheme } from "@tui/context/theme"
import { useDialog } from "@tui/ui/dialog"

type ModelRolesPayload = {
  default_model: string
  roles: Record<string, { provider_id: string; model_id: string }>
}

export function DialogPaperModelRoles() {
  const sdk = useSDK()
  const { theme } = useTheme()
  const dialog = useDialog()
  const [roles] = createResource(async () => {
    const response = await sdk.fetch(new URL("paper/model-roles", sdk.url), {
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
          模型角色
        </text>
        <text fg={theme.textMuted} onMouseUp={() => dialog.clear()}>
          esc
        </text>
      </box>
      <Show when={roles()} fallback={<text fg={theme.textMuted}>读取中...</text>}>
        {(payload) => (
          <box flexDirection="column" gap={1}>
            <text fg={theme.text}>默认 {payload().default_model}</text>
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
