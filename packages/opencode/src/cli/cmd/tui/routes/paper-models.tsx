import { TextAttributes } from "@opentui/core"
import { useKeyboard, useTerminalDimensions } from "@opentui/solid"
import { createEffect, createMemo, createResource, createSignal, For, Match, Show, Switch, on } from "solid-js"
import { PAPER_MODEL_ROLES, type PaperModelRole } from "@/paper/model-router"
import { useRoute } from "@tui/context/route"
import { useSDK } from "@tui/context/sdk"
import { useTheme } from "@tui/context/theme"
import { useDialog } from "@tui/ui/dialog"
import { DialogPrompt } from "@tui/ui/dialog-prompt"
import { useToast } from "@tui/ui/toast"
import { readTuiJsonResponse } from "@tui/util/http"
import { notifyPaperModelInventoryChanged } from "@tui/util/paper-model-inventory-events"
import { DialogProvider } from "../component/dialog-provider"

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

type ModelInventoryPayload = {
  inventory?: {
    decision_model?: string
    allowlist: string[]
    role_overrides?: Partial<Record<PaperModelRole, string>>
    candidates: PaperCandidate[]
  }
  routing?: Array<{ role: PaperModelRole; selected_model?: string; source: string; reason: string }>
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

const TABS = ["Provider", "候选模型", "可用模型", "主决策模型", "阶段模型", "诊断"] as const
type Tab = (typeof TABS)[number]

function truncateMiddle(value: string, max = 72) {
  if (value.length <= max) return value
  const head = Math.max(16, Math.floor((max - 1) * 0.58))
  const tail = Math.max(10, max - head - 1)
  return `${value.slice(0, head)}…${value.slice(value.length - tail)}`
}

function providerLabel(providerID: string | undefined) {
  if (!providerID) return "unknown"
  if (providerID === "github-copilot") return "GitHub Copilot"
  return providerID
}

function includesQuery(candidate: PaperCandidate, query: string) {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return true
  return [candidate.model_ref, candidate.display_name, candidate.provider_id, candidate.source]
    .filter(Boolean)
    .some((value) => value!.toLowerCase().includes(normalized))
}

export function PaperModelWorkbenchPage() {
  const sdk = useSDK()
  const router = useRoute()
  const dialog = useDialog()
  const toast = useToast()
  const { theme } = useTheme()
  const dimensions = useTerminalDimensions()
  const [tabIndex, setTabIndex] = createSignal(0)
  const [selected, setSelected] = createSignal(0)
  const [filter, setFilter] = createSignal("")
  const [draftAllowlist, setDraftAllowlist] = createSignal<Set<string>>(new Set())
  const [draftDecision, setDraftDecision] = createSignal<string | undefined>()
  const [draftRoles, setDraftRoles] = createSignal<Partial<Record<PaperModelRole, string>>>({})
  const [editingRole, setEditingRole] = createSignal<PaperModelRole>()

  const [payload, { refetch }] = createResource(async (): Promise<ModelInventoryPayload> => {
    try {
      const response = await sdk.fetch(new URL("paper/model-inventory", sdk.url), {
        headers: {
          ...(sdk.directory ? { "x-opencode-directory": sdk.directory } : {}),
        },
      })
      return await readTuiJsonResponse<ModelInventoryPayload>(response, "模型工作台读取失败")
    } catch (error) {
      return {
        inventory: { allowlist: [], candidates: [] },
        routing: [],
        error: error instanceof Error ? error.message : String(error),
      }
    }
  })

  const inventory = createMemo(() => payload()?.inventory ?? { allowlist: [], candidates: [] })
  const candidates = createMemo(() => inventory().candidates ?? [])
  const storedAllowlist = createMemo(() => inventory().allowlist ?? [])
  const storedDecision = createMemo(() => {
    const decision = inventory().decision_model
    return decision && storedAllowlist().includes(decision) ? decision : undefined
  })
  const dirty = createMemo(() => {
    const draft = Array.from(draftAllowlist()).sort().join("\n")
    const stored = [...storedAllowlist()].sort().join("\n")
    return draft !== stored || draftDecision() !== storedDecision() || JSON.stringify(draftRoles()) !== JSON.stringify(inventory().role_overrides ?? {})
  })
  const currentTab = createMemo<Tab>(() => TABS[tabIndex()]!)

  createEffect(
    on(
      () => payload(),
      (value) => {
        const next = value?.inventory
        if (!next) return
        setDraftAllowlist(new Set(next.allowlist ?? []))
        setDraftDecision(next.decision_model && (next.allowlist ?? []).includes(next.decision_model) ? next.decision_model : undefined)
        setDraftRoles(next.role_overrides ?? {})
      },
    ),
  )

  const allowedCandidates = createMemo(() => candidates().filter((candidate) => draftAllowlist().has(candidate.model_ref)))
  const providerSummaries = createMemo(() => {
    const stats = new Map<string, { id: string; total: number; allowed: number; custom: boolean }>()
    for (const candidate of candidates()) {
      const id = candidate.provider_id ?? "unknown"
      const current = stats.get(id) ?? { id, total: 0, allowed: 0, custom: candidate.source === "openai_compatible" }
      current.total += 1
      if (draftAllowlist().has(candidate.model_ref)) current.allowed += 1
      if (candidate.source === "openai_compatible") current.custom = true
      stats.set(id, current)
    }
    return Array.from(stats.values()).sort((left, right) => right.allowed - left.allowed || right.total - left.total)
  })

  const visibleCandidates = createMemo(() => {
    const tab = currentTab()
    const query = filter()
    const base =
      tab === "可用模型" || tab === "主决策模型"
        ? allowedCandidates()
        : tab === "候选模型"
          ? candidates()
          : []
    return base.filter((candidate) => includesQuery(candidate, query))
  })

  const visibleRows = createMemo(() => {
    if (editingRole()) return allowedCandidates().filter((candidate) => includesQuery(candidate, filter()))
    if (currentTab() === "阶段模型") return PAPER_MODEL_ROLES
    if (currentTab() === "Provider") return providerSummaries()
    if (currentTab() === "诊断") return []
    return visibleCandidates()
  })

  createEffect(
    on([currentTab, filter, editingRole], () => {
      setSelected(0)
    }),
  )

  async function postJson<T>(path: string, body: unknown): Promise<T> {
    const response = await sdk.fetch(new URL(path, sdk.url), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(sdk.directory ? { "x-opencode-directory": sdk.directory } : {}),
      },
      body: JSON.stringify(body),
    })
    return readTuiJsonResponse<T>(response, "模型工作台请求失败")
  }

  async function save() {
    const allowlist = Array.from(draftAllowlist())
    const decision = draftDecision()
    if (decision && !draftAllowlist().has(decision)) {
      toast.show({ variant: "warning", message: "主决策模型必须先加入可用模型。" })
      return
    }
    await postJson("paper/model-inventory", {
      allowlist,
      decision_model: decision,
      roles: draftRoles(),
    })
    await refetch()
    notifyPaperModelInventoryChanged()
    toast.show({ variant: "success", message: "模型配置已保存。" })
  }

  function toggle(ref: string) {
    setDraftAllowlist((current) => {
      const next = new Set(current)
      if (next.has(ref)) next.delete(ref)
      else next.add(ref)
      if (draftDecision() === ref && !next.has(ref)) setDraftDecision(undefined)
      setDraftRoles((roles) => Object.fromEntries(Object.entries(roles).filter(([, value]) => value !== ref)))
      return next
    })
  }

  function selectAllVisible() {
    const refs = visibleCandidates().map((candidate) => candidate.model_ref)
    setDraftAllowlist((current) => new Set([...current, ...refs]))
  }

  function clearVisible() {
    const refs = new Set(visibleCandidates().map((candidate) => candidate.model_ref))
    setDraftAllowlist((current) => {
      const next = new Set([...current].filter((ref) => !refs.has(ref)))
      if (draftDecision() && !next.has(draftDecision()!)) setDraftDecision(undefined)
      setDraftRoles((roles) => Object.fromEntries(Object.entries(roles).filter(([, value]) => !refs.has(value))))
      return next
    })
  }

  async function addOpenAICompatibleProvider() {
    const providerID = await DialogPrompt.show(dialog, "自定义 provider id", {
      placeholder: "例如 deepseek / openrouter / local-lab",
    })
    if (!providerID) return
    const baseURL = await DialogPrompt.show(dialog, "Base URL", {
      placeholder: "https://api.example.com/v1",
    })
    if (!baseURL) return
    const apiKey = await DialogPrompt.show(dialog, "API key（只保存在本机）", {
      placeholder: "sk-...",
      description: () => <text fg={theme.textMuted}>只写入本机 secret store，不进入仓库或报告。</text>,
    })
    if (!apiKey) return
    const result = await postJson<{ models?: Array<{ id: string }> }>("paper/providers/discover", {
      provider_id: providerID.trim(),
      provider_name: providerID.trim(),
      base_url: baseURL.trim(),
      api_key: apiKey,
      compatibility: "openai-compatible",
      persist: true,
    })
    await refetch()
    notifyPaperModelInventoryChanged()
    setTabIndex(1)
    toast.show({ variant: "success", message: `已发现 ${result.models?.length ?? 0} 个模型。` })
  }

  function move(delta: number) {
    const count = visibleRows().length
    if (count <= 0) return
    const next = (selected() + delta + count) % count
    setSelected(next)
  }

  function selectedCandidate() {
    return visibleCandidates()[selected()]
  }

  function activate() {
    const tab = currentTab()
    if (editingRole()) {
      const candidate = selectedCandidate()
      if (!candidate) return
      setDraftRoles((roles) => ({ ...roles, [editingRole()!]: candidate.model_ref }))
      setEditingRole(undefined)
      setFilter("")
      return
    }
    if (tab === "候选模型" || tab === "可用模型") {
      const candidate = selectedCandidate()
      if (candidate) toggle(candidate.model_ref)
      return
    }
    if (tab === "主决策模型") {
      const candidate = selectedCandidate()
      if (candidate) setDraftDecision(candidate.model_ref)
      return
    }
    if (tab === "阶段模型") {
      const role = PAPER_MODEL_ROLES[selected()]
      if (role) {
        setEditingRole(role)
        setFilter("")
      }
    }
  }

  useKeyboard((evt) => {
    if (evt.name === "escape") {
      if (editingRole()) {
        setEditingRole(undefined)
        setFilter("")
        evt.preventDefault()
        return
      }
      router.navigate({ type: "home" })
      evt.preventDefault()
      return
    }
    if (evt.name === "tab" && !evt.shift) {
      setTabIndex((index) => (index + 1) % TABS.length)
      evt.preventDefault()
      return
    }
    if (evt.name === "tab" && evt.shift) {
      setTabIndex((index) => (index - 1 + TABS.length) % TABS.length)
      evt.preventDefault()
      return
    }
    if (evt.name === "up" || (evt.ctrl && evt.name === "p")) move(-1)
    if (evt.name === "down" || (evt.ctrl && evt.name === "n")) move(1)
    if (evt.name === "return") {
      activate()
      evt.preventDefault()
      return
    }
    if ((evt.name === "space" || evt.name === " ") && (currentTab() === "候选模型" || currentTab() === "可用模型")) {
      activate()
      evt.preventDefault()
      return
    }
    if (evt.ctrl && evt.name === "s") {
      void save()
      evt.preventDefault()
      return
    }
    if (!evt.ctrl && evt.name === "a" && (currentTab() === "候选模型" || currentTab() === "可用模型")) {
      selectAllVisible()
      evt.preventDefault()
      return
    }
    if (!evt.ctrl && evt.name === "n" && (currentTab() === "候选模型" || currentTab() === "可用模型")) {
      clearVisible()
      evt.preventDefault()
      return
    }
    if (!evt.ctrl && evt.name === "c") {
      void addOpenAICompatibleProvider().catch((error) =>
        toast.show({ variant: "error", message: error instanceof Error ? error.message : "添加 provider 失败" }),
      )
      evt.preventDefault()
      return
    }
    if (!evt.ctrl && evt.name === "b") {
      dialog.replace(() => <DialogProvider />)
      evt.preventDefault()
      return
    }
    const number = Number(evt.name)
    if (Number.isInteger(number) && number >= 1 && number <= TABS.length) {
      setTabIndex(number - 1)
      evt.preventDefault()
    }
  })

  const bodyHeight = createMemo(() => Math.max(8, dimensions().height - 11))
  const summary = createMemo(() => ({
    decision: draftDecision(),
    allowed: draftAllowlist().size,
    candidates: candidates().length,
    providers: providerSummaries().length,
  }))

  return (
    <box width="100%" height="100%" paddingLeft={3} paddingRight={3} paddingTop={2} paddingBottom={1} flexDirection="column" gap={1}>
      <box flexDirection="row" justifyContent="space-between">
        <box flexDirection="column">
          <text fg={theme.text} attributes={TextAttributes.BOLD}>模型工作台</text>
          <text fg={theme.textMuted}>配置 provider、候选模型、可用模型、主决策模型与阶段模型。</text>
        </box>
        <text fg={dirty() ? theme.warning : theme.textMuted}>{dirty() ? "有未保存修改 Ctrl+S 保存" : "Esc 返回首页"}</text>
      </box>

      <box flexDirection="row" gap={2}>
        <For each={TABS}>
          {(tab, index) => (
            <text fg={index() === tabIndex() ? theme.accent : theme.textMuted} attributes={index() === tabIndex() ? TextAttributes.BOLD : undefined}>
              {index() + 1} {tab}
            </text>
          )}
        </For>
      </box>

      <box flexDirection="row" gap={2}>
        <text fg={summary().decision ? theme.text : theme.warning}>主决策模型：{summary().decision ?? "未选择"}</text>
        <text fg={theme.textMuted}>可用 {summary().allowed}</text>
        <text fg={theme.textMuted}>候选 {summary().candidates}</text>
        <text fg={theme.textMuted}>Provider {summary().providers}</text>
      </box>

      <box border={["top"]} borderColor={theme.border} />

      <box flexDirection="row" gap={2} flexGrow={1} minHeight={0}>
        <box width={24} flexShrink={0} flexDirection="column" gap={1}>
          <For each={TABS}>
            {(tab, index) => (
              <box paddingLeft={1} paddingRight={1} backgroundColor={index() === tabIndex() ? theme.backgroundPanel : undefined}>
                <text fg={index() === tabIndex() ? theme.accent : theme.textMuted}>{index() + 1}. {tab}</text>
              </box>
            )}
          </For>
          <box paddingTop={1} flexDirection="column">
            <text fg={theme.textMuted}>c 自定义 provider</text>
            <text fg={theme.textMuted}>b 内置 provider 授权</text>
            <text fg={theme.textMuted}>Ctrl+S 保存</text>
          </box>
        </box>

        <box flexDirection="column" flexGrow={1} minWidth={0} gap={1}>
          <Show when={payload()?.error}>
            {(error) => <text fg={theme.warning}>{error()}</text>}
          </Show>
          <Show when={["候选模型", "可用模型", "主决策模型"].includes(currentTab()) || editingRole()}>
            <input
              placeholder="搜索 provider、模型名或来源"
              cursorColor={theme.primary}
              focusedBackgroundColor={theme.backgroundPanel}
              focusedTextColor={theme.text}
              onInput={(value) => setFilter(value)}
            />
          </Show>

          <box flexDirection="column" maxHeight={bodyHeight()} minHeight={0}>
            <Switch>
              <Match when={currentTab() === "Provider"}>
                <For each={providerSummaries().slice(0, bodyHeight())}>
                  {(provider, index) => (
                    <box backgroundColor={index() === selected() ? theme.primary : undefined} paddingLeft={1} gap={1}>
                      <text fg={index() === selected() ? theme.selectedListItemText : theme.text}>{providerLabel(provider.id)}</text>
                      <text fg={index() === selected() ? theme.selectedListItemText : theme.textMuted}>{provider.allowed}/{provider.total}</text>
                      <text fg={index() === selected() ? theme.selectedListItemText : theme.textMuted}>{provider.custom ? "custom" : "built-in"}</text>
                    </box>
                  )}
                </For>
                <Show when={providerSummaries().length === 0}>
                  <text fg={theme.warning}>尚未发现 provider。按 c 添加自定义 endpoint，或按 b 使用内置 provider 授权。</text>
                </Show>
              </Match>

              <Match when={currentTab() === "候选模型" || currentTab() === "可用模型" || currentTab() === "主决策模型" || editingRole()}>
                <Show when={editingRole()}>
                  {(role) => (
                    <box flexDirection="row" gap={2}>
                      <text fg={theme.accent}>{ROLE_LABELS[role()]}</text>
                      <text fg={theme.textMuted}>Enter 指定模型，Esc 返回阶段列表。</text>
                    </box>
                  )}
                </Show>
                <For each={visibleCandidates().slice(0, bodyHeight() - 1)}>
                  {(candidate, index) => {
                    const active = createMemo(() => index() === selected())
                    const allowed = createMemo(() => draftAllowlist().has(candidate.model_ref))
                    return (
                      <box backgroundColor={active() ? theme.primary : undefined} paddingLeft={1} gap={1}>
                        <text fg={active() ? theme.selectedListItemText : allowed() ? theme.accent : theme.textMuted}>
                          {allowed() ? "✓" : "·"}
                        </text>
                        <text fg={active() ? theme.selectedListItemText : theme.text}>{truncateMiddle(candidate.model_ref, 78)}</text>
                        <text fg={active() ? theme.selectedListItemText : theme.textMuted}>{candidate.smoke_status}</text>
                      </box>
                    )
                  }}
                </For>
                <Show when={visibleCandidates().length === 0}>
                  <text fg={theme.warning}>
                    {currentTab() === "可用模型" || currentTab() === "主决策模型" || editingRole()
                      ? "还没有可用模型。先到“候选模型”勾选后保存。"
                      : "没有匹配的候选模型。"}
                  </text>
                </Show>
              </Match>

              <Match when={currentTab() === "阶段模型"}>
                <For each={PAPER_MODEL_ROLES}>
                  {(role, index) => (
                    <box backgroundColor={index() === selected() ? theme.primary : undefined} paddingLeft={1} gap={1}>
                      <text fg={index() === selected() ? theme.selectedListItemText : theme.text}>{ROLE_LABELS[role]}</text>
                      <text fg={index() === selected() ? theme.selectedListItemText : theme.textMuted}>
                        {draftRoles()[role] ?? "自动选择"}
                      </text>
                    </box>
                  )}
                </For>
                <text fg={theme.textMuted}>Enter 为当前阶段指定模型；指定后仍只能从可用模型池选择。</text>
              </Match>

              <Match when={currentTab() === "诊断"}>
                <box flexDirection="column" gap={1}>
                  <text fg={theme.text}>库存路径：~/.paper_fucker/model-inventory.json</text>
                  <text fg={theme.text}>候选模型是发现结果；可用模型只来自 allowlist。</text>
                  <text fg={theme.text}>未配置主决策模型或可用模型时，PaperRun 会阻断并提示进入 /models。</text>
                  <For each={payload()?.routing ?? []}>
                    {(item) => (
                      <text fg={item.source === "blocked" ? theme.warning : theme.textMuted}>
                        {ROLE_LABELS[item.role]}：{item.selected_model ?? item.reason}
                      </text>
                    )}
                  </For>
                </box>
              </Match>
            </Switch>
          </box>

          <box border={["top"]} borderColor={theme.border} />
          <box flexDirection="row" gap={2}>
            <text fg={theme.text}>Tab 切换</text>
            <text fg={theme.text}>Enter/Space 选择</text>
            <text fg={theme.text}>A 全选筛选</text>
            <text fg={theme.text}>N 清空筛选</text>
            <text fg={theme.text}>Ctrl+S 保存</text>
          </box>
        </box>
      </box>
    </box>
  )
}
