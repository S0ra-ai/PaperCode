import { TextAttributes } from "@opentui/core"
import { createResource, For, Show } from "solid-js"
import { useKeyboard } from "@opentui/solid"
import { useSDK } from "@tui/context/sdk"
import { useTheme } from "@tui/context/theme"
import { useDialog } from "@tui/ui/dialog"
import { DialogPrompt } from "@tui/ui/dialog-prompt"
import { DialogSelect } from "@tui/ui/dialog-select"
import { useToast } from "@tui/ui/toast"
import { readTuiJsonResponse } from "@tui/util/http"
import { DialogProvider } from "./dialog-provider"

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
  error?: string
}

export function DialogPaperModelRoles() {
  const sdk = useSDK()
  const { theme } = useTheme()
  const dialog = useDialog()
  const toast = useToast()
  const [roles, { refetch }] = createResource(async (): Promise<ModelRolesPayload> => {
    try {
      const response = await sdk.fetch(new URL("paper/model-inventory", sdk.url), {
        headers: {
          ...(sdk.directory ? { "x-opencode-directory": sdk.directory } : {}),
        },
      })
      return await readTuiJsonResponse<ModelRolesPayload>(response, "模型工作台读取失败")
    } catch (error) {
      return {
        roles: {},
        routing: [],
        inventory: { allowlist: [], candidates: [] },
        error: error instanceof Error ? error.message : String(error),
      }
    }
  })

  async function postJson<T>(path: string, payload: unknown): Promise<T> {
    const response = await sdk.fetch(new URL(path, sdk.url), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(sdk.directory ? { "x-opencode-directory": sdk.directory } : {}),
      },
      body: JSON.stringify(payload),
    })
    return await readTuiJsonResponse<T>(response, "模型工作台请求失败")
  }

  function candidateRefs(payload: ModelRolesPayload | undefined) {
    return payload?.inventory?.candidates.map((candidate) => candidate.model_ref) ?? []
  }

  async function allowAllCandidates() {
    const payload = roles()
    const refs = candidateRefs(payload)
    if (refs.length === 0) {
      toast.show({ variant: "warning", message: "还没有候选模型。先添加 provider 并拉取模型列表。" })
      return
    }
    const decision = payload?.inventory?.decision_model && refs.includes(payload.inventory.decision_model)
      ? payload.inventory.decision_model
      : refs[0]
    try {
      await postJson("paper/model-inventory", { allowlist: refs, decision_model: decision })
      await refetch()
      toast.show({ variant: "success", message: `已允许 ${refs.length} 个模型` })
    } catch (error) {
      toast.show({ variant: "error", message: error instanceof Error ? error.message : "模型允许列表更新失败" })
    }
  }

  function chooseDecisionModel() {
    const payload = roles()
    const refs = candidateRefs(payload)
    if (refs.length === 0) {
      toast.show({ variant: "warning", message: "还没有候选模型。先添加 provider 并拉取模型列表。" })
      return
    }
    dialog.replace(() => (
      <DialogSelect
        title="选择主决策模型"
        options={refs.map((ref) => ({
          title: ref,
          value: ref,
          category: payload?.inventory?.allowlist.includes(ref) ? "已允许" : "候选",
          description: payload?.inventory?.decision_model === ref ? "当前主决策模型" : undefined,
          async onSelect(ctx) {
            try {
              const allowlist = Array.from(new Set([...(payload?.inventory?.allowlist ?? []), ref]))
              await postJson("paper/model-inventory", { allowlist, decision_model: ref })
              ctx.replace(() => <DialogPaperModelRoles />)
              toast.show({ variant: "success", message: `主决策模型：${ref}` })
            } catch (error) {
              toast.show({ variant: "error", message: error instanceof Error ? error.message : "主决策模型更新失败" })
            }
          },
        }))}
        current={payload?.inventory?.decision_model}
      />
    ))
  }

  async function addOpenAICompatibleProvider() {
    const providerID = await DialogPrompt.show(dialog, "自定义 provider id", {
      placeholder: "例如 deepseek / openrouter / local-lab",
    })
    if (!providerID) {
      dialog.replace(() => <DialogPaperModelRoles />)
      return
    }
    const baseURL = await DialogPrompt.show(dialog, "Base URL", {
      placeholder: "https://api.example.com/v1",
    })
    if (!baseURL) {
      dialog.replace(() => <DialogPaperModelRoles />)
      return
    }
    const apiKey = await DialogPrompt.show(dialog, "API key（只保存在本机）", {
      placeholder: "sk-...",
      description: () => <text fg={theme.textMuted}>不会写入仓库；用于立即调用 /models 获取候选模型。</text>,
    })
    if (!apiKey) {
      dialog.replace(() => <DialogPaperModelRoles />)
      return
    }
    try {
      const result = await postJson<{ models?: Array<{ id: string }> }>("paper/providers/discover", {
        provider_id: providerID.trim(),
        provider_name: providerID.trim(),
        base_url: baseURL.trim(),
        api_key: apiKey,
        compatibility: "openai-compatible",
        persist: true,
      })
      dialog.replace(() => <DialogPaperModelRoles />)
      toast.show({ variant: "success", message: `已发现 ${result.models?.length ?? 0} 个模型` })
    } catch (error) {
      dialog.replace(() => <DialogPaperModelRoles />)
      toast.show({ variant: "error", message: error instanceof Error ? error.message : "模型发现失败" })
    }
  }

  useKeyboard((evt) => {
    if (evt.ctrl || evt.meta) return
    if (evt.name === "a") {
      evt.preventDefault()
      dialog.replace(() => <DialogProvider />)
    }
    if (evt.name === "c") {
      evt.preventDefault()
      void addOpenAICompatibleProvider()
    }
    if (evt.name === "m") {
      evt.preventDefault()
      void allowAllCandidates()
    }
    if (evt.name === "d") {
      evt.preventDefault()
      chooseDecisionModel()
    }
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
            <Show when={payload().error}>
              {(error) => <text fg={theme.warning}>{error()}</text>}
            </Show>
            <Show when={(payload().inventory?.allowlist.length ?? 0) === 0}>
              <box flexDirection="column" gap={0}>
                <text fg={theme.warning}>尚未配置可用模型。</text>
                <text fg={theme.textMuted}>按 c 添加自定义 endpoint，或按 a 使用内置 provider 授权。</text>
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
            <box flexDirection="column" gap={0} paddingTop={1}>
              <text fg={theme.text}>c 自定义 OpenAI-compatible provider</text>
              <text fg={theme.text}>a 添加内置 provider</text>
              <text fg={theme.text}>m 允许全部候选模型</text>
              <text fg={theme.text}>d 选择主决策模型</text>
            </box>
          </box>
        )}
      </Show>
    </box>
  )
}
