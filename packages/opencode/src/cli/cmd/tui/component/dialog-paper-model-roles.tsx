import { TextAttributes } from "@opentui/core"
import { createMemo, createResource, For, Show } from "solid-js"
import { useKeyboard } from "@opentui/solid"
import { PAPER_MODEL_ROLES, type PaperModelRole } from "@/paper/model-router"
import { useSDK } from "@tui/context/sdk"
import { useTheme } from "@tui/context/theme"
import { useDialog, type DialogContext } from "@tui/ui/dialog"
import { DialogPrompt } from "@tui/ui/dialog-prompt"
import { DialogSelect, type DialogSelectOption } from "@tui/ui/dialog-select"
import { useToast } from "@tui/ui/toast"
import { readTuiJsonResponse } from "@tui/util/http"
import { notifyPaperModelInventoryChanged } from "@tui/util/paper-model-inventory-events"
import { DialogProvider } from "./dialog-provider"

type PaperCandidate = {
  provider_id?: string
  model_ref: string
  display_name: string
  allowed: boolean
  smoke_status: string
  source?: string
  cost_hint?: string
  context_hint?: string
  capabilities?: string[]
}

type ModelRolesPayload = {
  inventory?: {
    decision_model?: string
    allowlist: string[]
    role_overrides?: Partial<Record<PaperModelRole, string>>
    candidates: PaperCandidate[]
  }
  roles: Record<string, { provider_id: string; model_id: string }>
  routing?: Array<{
    role: PaperModelRole
    selected_model?: string
    source: string
    reason: string
  }>
  error?: string
}

const ROLE_LABELS: Record<PaperModelRole, string> = {
  planner: "研究规划",
  literature_researcher: "文献检索",
  code_analyst: "代码分析",
  experiment_designer: "实验设计",
  writer: "论文写作",
  reviewer: "审稿检查",
  citation_checker: "引用核验",
  cheap_summarizer: "低成本摘要",
  subagent: "子 Agent",
}

function truncateMiddle(value: string, max = 58) {
  if (value.length <= max) return value
  const head = Math.max(12, Math.floor((max - 1) * 0.58))
  const tail = Math.max(8, max - head - 1)
  return `${value.slice(0, head)}…${value.slice(value.length - tail)}`
}

function providerLabel(providerID: string | undefined) {
  if (!providerID) return "unknown"
  if (providerID === "github-copilot") return "GitHub Copilot"
  return providerID
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

  const inventory = createMemo(() => roles()?.inventory ?? { allowlist: [], candidates: [] })
  const candidates = createMemo(() => inventory().candidates ?? [])
  const allowlist = createMemo(() => inventory().allowlist ?? [])
  const allowed = createMemo(() => new Set(allowlist()))
  const decisionModel = createMemo(() => inventory().decision_model)
  const roleOverrides = createMemo(() => inventory().role_overrides ?? {})
  const allowedCandidates = createMemo(() => candidates().filter((candidate) => allowed().has(candidate.model_ref)))
  const providerSummaries = createMemo(() => {
    const stats = new Map<string, { provider_id: string; total: number; allowed: number; custom: boolean }>()
    for (const candidate of candidates()) {
      const id = candidate.provider_id ?? "unknown"
      const current = stats.get(id) ?? { provider_id: id, total: 0, allowed: 0, custom: candidate.source === "openai_compatible" }
      current.total += 1
      if (allowed().has(candidate.model_ref)) current.allowed += 1
      if (candidate.source === "openai_compatible") current.custom = true
      stats.set(id, current)
    }
    return Array.from(stats.values()).sort((left, right) => right.allowed - left.allowed || right.total - left.total)
  })
  const routePreview = createMemo(() => roles()?.routing ?? [])

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

  async function saveInventory(input: {
    allowlist?: string[]
    decision_model?: string
    roles?: Partial<Record<PaperModelRole, string>>
    message?: string
  }) {
    const nextAllowlist = input.allowlist ?? allowlist()
    const nextDecision = Object.prototype.hasOwnProperty.call(input, "decision_model")
      ? input.decision_model
      : decisionModel()
    await postJson("paper/model-inventory", {
      allowlist: nextAllowlist,
      decision_model: nextDecision,
      roles: input.roles ?? roleOverrides(),
    })
    await refetch()
    notifyPaperModelInventoryChanged()
    if (input.message) toast.show({ variant: "success", message: input.message })
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
      description: () => <text fg={theme.textMuted}>只写入本机 secret store，不进入仓库或报告。</text>,
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
      notifyPaperModelInventoryChanged()
      toast.show({ variant: "success", message: `已发现 ${result.models?.length ?? 0} 个模型` })
    } catch (error) {
      dialog.replace(() => <DialogPaperModelRoles />)
      toast.show({ variant: "error", message: error instanceof Error ? error.message : "模型发现失败" })
    }
  }

  function openProviderMenu() {
    const options: DialogSelectOption<string>[] = [
      {
        title: "添加自定义 OpenAI-compatible provider",
        value: "__custom__",
        category: "添加 provider",
        description: "填写 provider id、base_url 和 API key，立即调用 /models 获取候选模型。",
        onSelect() {
          void addOpenAICompatibleProvider()
        },
      },
      {
        title: "添加/授权内置 provider",
        value: "__builtin__",
        category: "添加 provider",
        description: "使用 OpenCode substrate 已支持的 provider，例如 GitHub Copilot、OpenAI、Anthropic、Google。",
        onSelect(ctx) {
          ctx.replace(() => <DialogProvider />)
        },
      },
      ...providerSummaries().map((provider) => ({
        title: providerLabel(provider.provider_id),
        value: provider.provider_id,
        category: provider.custom ? "自定义 provider" : "内置 provider",
        description: `${provider.allowed}/${provider.total} 个模型已允许`,
        onSelect() {
          openProviderModels(provider.provider_id)
        },
      })),
    ]
    dialog.replace(() => <DialogSelect title="Provider 管理" placeholder="搜索 provider" options={options} />)
  }

  function openProviderModels(providerID: string) {
    const filtered = candidates().filter((candidate) => (candidate.provider_id ?? "unknown") === providerID)
    if (filtered.length === 0) {
      toast.show({ variant: "warning", message: "这个 provider 还没有模型候选。请先完成授权或模型发现。" })
      dialog.replace(() => <DialogPaperModelRoles />)
      return
    }
    dialog.replace(() => (
      <DialogSelect
        title={`${providerLabel(providerID)} 模型`}
        placeholder="搜索模型，回车加入/移出可用模型"
        options={modelToggleOptions(filtered)}
      />
    ))
  }

  function modelToggleOptions(items = candidates()): DialogSelectOption<string>[] {
    return items.map((candidate) => {
      const isAllowed = allowed().has(candidate.model_ref)
      return {
        title: truncateMiddle(candidate.model_ref, 68),
        value: candidate.model_ref,
        category: providerLabel(candidate.provider_id),
        description: [
          isAllowed ? "已允许" : "未允许",
          candidate.smoke_status,
          candidate.context_hint && candidate.context_hint !== "unknown" ? candidate.context_hint : undefined,
          candidate.cost_hint && candidate.cost_hint !== "unknown" ? candidate.cost_hint : undefined,
        ]
          .filter(Boolean)
          .join(" · "),
        gutter: () => <text fg={isAllowed ? theme.accent : theme.textMuted}>{isAllowed ? "✓" : "·"}</text>,
        async onSelect(ctx: DialogContext) {
          const next = new Set(allowlist())
          if (isAllowed) next.delete(candidate.model_ref)
          else next.add(candidate.model_ref)
          let nextDecision = decisionModel()
          if (nextDecision === candidate.model_ref && !next.has(candidate.model_ref)) nextDecision = Array.from(next)[0]
          try {
            await saveInventory({
              allowlist: Array.from(next),
              decision_model: nextDecision,
              message: isAllowed ? `已移出 ${candidate.model_ref}` : `已允许 ${candidate.model_ref}`,
            })
            ctx.replace(() => <DialogSelect title="选择可用模型" placeholder="搜索模型，回车加入/移出" options={modelToggleOptions()} />)
          } catch (error) {
            toast.show({ variant: "error", message: error instanceof Error ? error.message : "可用模型更新失败" })
          }
        },
      }
    })
  }

  function openAllowlistSelector() {
    const options: DialogSelectOption<string>[] = [
      {
        title: "只保留主决策模型",
        value: "__decision_only__",
        category: "批量操作",
        description: decisionModel() ? decisionModel() : "需要先选择主决策模型",
        disabled: !decisionModel(),
        async onSelect(ctx: DialogContext) {
          const decision = decisionModel()
          if (!decision) return
          await saveInventory({ allowlist: [decision], decision_model: decision, message: "已只保留主决策模型" })
          ctx.replace(() => <DialogPaperModelRoles />)
        },
      },
      {
        title: "清空可用模型",
        value: "__clear__",
        category: "批量操作",
        description: "不会删除 provider，只清空 Paper Fucker allowlist 和主决策模型。",
        async onSelect(ctx: DialogContext) {
          await saveInventory({ allowlist: [], decision_model: undefined, roles: {}, message: "已清空可用模型" })
          ctx.replace(() => <DialogPaperModelRoles />)
        },
      },
      ...modelToggleOptions(),
    ]
    dialog.replace(() => <DialogSelect title="选择可用模型" placeholder="搜索模型，回车加入/移出" options={options} />)
  }

  function openDecisionModelSelector() {
    const refs = candidates()
    if (refs.length === 0) {
      toast.show({ variant: "warning", message: "还没有候选模型。请先添加 provider 或完成内置 provider 授权。" })
      return
    }
    dialog.replace(() => (
      <DialogSelect
        title="选择主决策模型"
        placeholder="搜索模型"
        options={refs.map((candidate) => ({
          title: truncateMiddle(candidate.model_ref, 68),
          value: candidate.model_ref,
          category: allowed().has(candidate.model_ref) ? "已允许" : providerLabel(candidate.provider_id),
          description: candidate.model_ref === decisionModel() ? "当前主决策模型" : candidate.display_name,
          async onSelect(ctx: DialogContext) {
            try {
              const next = new Set(allowlist())
              next.add(candidate.model_ref)
              await saveInventory({
                allowlist: Array.from(next),
                decision_model: candidate.model_ref,
                message: `主决策模型：${candidate.model_ref}`,
              })
              ctx.replace(() => <DialogPaperModelRoles />)
            } catch (error) {
              toast.show({ variant: "error", message: error instanceof Error ? error.message : "主决策模型更新失败" })
            }
          },
        }))}
        current={decisionModel()}
      />
    ))
  }

  function openRoleSelector() {
    dialog.replace(() => (
      <DialogSelect
        title="阶段模型"
        placeholder="选择阶段"
        options={PAPER_MODEL_ROLES.map((role) => {
          const override = roleOverrides()[role]
          const routed = routePreview().find((item) => item.role === role)
          return {
            title: ROLE_LABELS[role],
            value: role,
            category: override ? "强制指定" : "自动选择",
            description: override ?? routed?.selected_model ?? "由主决策模型按任务动态选择",
            onSelect() {
              openRoleModelSelector(role)
            },
          }
        })}
      />
    ))
  }

  function openRoleModelSelector(role: PaperModelRole) {
    const allowedItems = allowedCandidates()
    const options: DialogSelectOption<string>[] = [
      {
        title: "自动选择",
        value: "__auto__",
        category: ROLE_LABELS[role],
        description: "由主决策模型根据阶段、任务规模、预算和能力标签动态选择。",
        async onSelect(ctx: DialogContext) {
          const nextRoles = { ...roleOverrides() }
          delete nextRoles[role]
          await saveInventory({ roles: nextRoles, message: `${ROLE_LABELS[role]} 已改为自动选择` })
          ctx.replace(() => <DialogPaperModelRoles />)
        },
      },
      ...allowedItems.map((candidate) => ({
        title: truncateMiddle(candidate.model_ref, 68),
        value: candidate.model_ref,
        category: providerLabel(candidate.provider_id),
        description: candidate.display_name,
        async onSelect(ctx: DialogContext) {
          const nextRoles = { ...roleOverrides(), [role]: candidate.model_ref }
          await saveInventory({ roles: nextRoles, message: `${ROLE_LABELS[role]} 使用 ${candidate.model_ref}` })
          ctx.replace(() => <DialogPaperModelRoles />)
        },
      })),
    ]
    dialog.replace(() => (
      <DialogSelect
        title={`${ROLE_LABELS[role]} 用什么模型`}
        placeholder="搜索已允许模型"
        options={options}
        current={roleOverrides()[role] ?? "__auto__"}
      />
    ))
  }

  useKeyboard((evt) => {
    if (evt.ctrl || evt.meta) return
    if (evt.name === "1" || evt.name === "p") {
      evt.preventDefault()
      openProviderMenu()
    }
    if (evt.name === "2" || evt.name === "d") {
      evt.preventDefault()
      openDecisionModelSelector()
    }
    if (evt.name === "3" || evt.name === "a") {
      evt.preventDefault()
      openAllowlistSelector()
    }
    if (evt.name === "4" || evt.name === "r") {
      evt.preventDefault()
      openRoleSelector()
    }
    if (evt.name === "c") {
      evt.preventDefault()
      void addOpenAICompatibleProvider()
    }
  })

  return (
    <box paddingLeft={2} paddingRight={2} gap={1} paddingBottom={1} maxWidth={86}>
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
            <box flexDirection="column" gap={0}>
              <text fg={theme.text}>主决策模型 {decisionModel() ?? "未配置"}</text>
              <text fg={theme.textMuted}>
                可用模型 {allowlist().length} · 候选模型 {candidates().length} · Provider {providerSummaries().length}
              </text>
              <Show when={payload().error}>
                {(error) => <text fg={theme.warning}>{error()}</text>}
              </Show>
            </box>

            <Show when={allowlist().length === 0 || !decisionModel()}>
              <box flexDirection="column" gap={0}>
                <text fg={theme.warning}>尚未完成模型配置。</text>
                <text fg={theme.textMuted}>先添加 provider，再选择主决策模型和可用模型。</text>
              </box>
            </Show>

            <box flexDirection="column" gap={0}>
              <text fg={theme.accent} attributes={TextAttributes.BOLD}>1 Provider 管理</text>
              <For each={providerSummaries().slice(0, 4)}>
                {(provider) => (
                  <text fg={theme.textMuted}>
                    {providerLabel(provider.provider_id)} {provider.allowed}/{provider.total}
                  </text>
                )}
              </For>
              <Show when={providerSummaries().length > 4}>
                <text fg={theme.textMuted}>还有 {providerSummaries().length - 4} 个 provider，按 1 搜索管理。</text>
              </Show>
            </box>

            <box flexDirection="column" gap={0}>
              <text fg={theme.accent} attributes={TextAttributes.BOLD}>2 主模型</text>
              <text fg={decisionModel() ? theme.text : theme.warning}>{decisionModel() ?? "未选择"}</text>
            </box>

            <box flexDirection="column" gap={0}>
              <text fg={theme.accent} attributes={TextAttributes.BOLD}>3 可用模型</text>
              <Show when={allowedCandidates().length > 0} fallback={<text fg={theme.textMuted}>未选择可用模型。</text>}>
                <For each={allowedCandidates().slice(0, 6)}>
                  {(candidate) => (
                    <box flexDirection="row" gap={1}>
                      <text fg={theme.accent}>✓</text>
                      <text fg={theme.text}>{truncateMiddle(candidate.model_ref, 64)}</text>
                      <text fg={theme.textMuted}>{candidate.smoke_status}</text>
                    </box>
                  )}
                </For>
              </Show>
              <Show when={allowedCandidates().length > 6}>
                <text fg={theme.textMuted}>已允许 {allowedCandidates().length} 个模型，按 3 搜索、移除或收缩列表。</text>
              </Show>
            </box>

            <box flexDirection="column" gap={0}>
              <text fg={theme.accent} attributes={TextAttributes.BOLD}>4 阶段模型</text>
              <For each={PAPER_MODEL_ROLES.slice(0, 5)}>
                {(role) => {
                  const routed = createMemo(() => routePreview().find((item) => item.role === role))
                  return (
                    <box flexDirection="row" gap={1}>
                      <text fg={theme.textMuted}>{ROLE_LABELS[role]}</text>
                      <text fg={roleOverrides()[role] ? theme.text : theme.textMuted}>
                        {roleOverrides()[role] ?? routed()?.selected_model ?? "自动选择"}
                      </text>
                    </box>
                  )
                }}
              </For>
              <text fg={theme.textMuted}>按 4 配置每个阶段：自动选择或强制指定模型。</text>
            </box>

            <box flexDirection="row" gap={2} paddingTop={1}>
              <text fg={theme.text}>1/p provider</text>
              <text fg={theme.text}>2/d 主模型</text>
              <text fg={theme.text}>3/a 可用模型</text>
              <text fg={theme.text}>4/r 阶段模型</text>
              <text fg={theme.text}>c 自定义</text>
            </box>
          </box>
        )}
      </Show>
    </box>
  )
}
