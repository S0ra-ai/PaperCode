import { TextAttributes } from "@opentui/core"
import { useKeyboard, useTerminalDimensions } from "@opentui/solid"
import { createEffect, createMemo, createResource, createSignal, For, Match, Show, Switch, on } from "solid-js"
import { PAPER_MODEL_ROLES, type PaperModelRole } from "@/paper/model-router"
import { useRoute } from "@tui/context/route"
import { useSDK } from "@tui/context/sdk"
import { useSync } from "@tui/context/sync"
import { useTheme } from "@tui/context/theme"
import { useDialog } from "@tui/ui/dialog"
import { DialogPrompt } from "@tui/ui/dialog-prompt"
import { useToast } from "@tui/ui/toast"
import { readTuiJsonResponse } from "@tui/util/http"
import { notifyPaperModelInventoryChanged } from "@tui/util/paper-model-inventory-events"
import { truncateDisplayMiddle } from "@tui/util/text-width"
import { DialogProvider } from "../component/dialog-provider"

type PaperCandidate = {
  provider_id: string
  provider_name?: string
  model_id: string
  model_ref: string
  display_name: string
  allowed: boolean
  smoke_status: string
  source?: "paper_builtin" | "openai_compatible" | "manual"
  cost_hint?: string
  context_hint?: string
  capabilities?: string[]
}

type ProviderRegistration = {
  provider_id: string
  provider_name?: string
  kind: "builtin" | "chatgpt_subscription" | "copilot_subscription" | "openai_compatible" | "manual"
  status: "registered" | "disabled" | "needs_auth"
  model_count: number
  allowed_count: number
  last_refreshed_at?: string
  diagnostics?: string[]
}

type StagePolicy = {
  role: PaperModelRole
  mode: "auto" | "dynamic" | "forced"
  model_ref?: string
}

type BuiltinProviderSummary = {
  provider_id: string
  provider_name?: string
  model_count: number
  registered: boolean
}

type ModelInventoryPayload = {
  inventory?: {
    decision_model?: string
    backup_decision_model?: string
    allowlist: string[]
    role_overrides?: Partial<Record<PaperModelRole, string>>
    provider_registrations?: Record<string, ProviderRegistration>
    stage_model_policies?: Partial<Record<PaperModelRole, StagePolicy>>
    candidates: PaperCandidate[]
  }
  builtin_providers?: BuiltinProviderSummary[]
  routing?: Array<{ role: PaperModelRole; selected_model?: string; source: string; reason: string }>
  error?: string
}

type Section = "registered" | "models" | "stage"

type ProviderRow = { kind: "registration"; registration: ProviderRegistration }

const SECTIONS: Array<{ id: Section; label: string }> = [
  { id: "registered", label: "已注册" },
  { id: "models", label: "所有模型" },
  { id: "stage", label: "全流程模型" },
]

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

const POLICY_LABELS: Record<StagePolicy["mode"], string> = {
  auto: "自动选择",
  dynamic: "动态选择",
  forced: "强制指定",
}

function nowIso() {
  return new Date().toISOString()
}

function providerLabel(providerID: string | undefined, name?: string) {
  if (!providerID) return "unknown"
  return name ?? providerID
}

function includesQuery(candidate: PaperCandidate, query: string) {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return true
  return [candidate.model_ref, candidate.display_name, candidate.provider_id, candidate.provider_name, candidate.source]
    .filter(Boolean)
    .some((value) => value!.toLowerCase().includes(normalized))
}

function sortCandidates(candidates: PaperCandidate[]) {
  return [...candidates].sort((left, right) => left.model_ref.localeCompare(right.model_ref, "en", { numeric: true }))
}

function defaultPolicy(role: PaperModelRole): StagePolicy {
  return { role, mode: "auto" }
}

function registeredProviderIDs(registrations: Record<string, ProviderRegistration>) {
  return Object.values(registrations)
    .filter((registration) => registration.status === "registered")
    .map((registration) => registration.provider_id)
}

function providerCategory(registration: ProviderRegistration) {
  if (registration.kind === "chatgpt_subscription" || registration.provider_id === "openai") return "ChatGPT 订阅"
  if (registration.kind === "copilot_subscription" || registration.provider_id === "github-copilot") return "Copilot CLI 订阅"
  return "其他 provider"
}

function providerKindFor(providerID: string): ProviderRegistration["kind"] {
  if (providerID === "openai") return "chatgpt_subscription"
  if (providerID === "github-copilot") return "copilot_subscription"
  return "builtin"
}

export function PaperModelWorkbenchPage() {
  const sdk = useSDK()
  const sync = useSync()
  const router = useRoute()
  const dialog = useDialog()
  const toast = useToast()
  const { theme } = useTheme()
  const dimensions = useTerminalDimensions()
  const [sectionIndex, setSectionIndex] = createSignal(0)
  const [selected, setSelected] = createSignal(0)
  const [scrollOffset, setScrollOffset] = createSignal(0)
  const [filter, setFilter] = createSignal("")
  const [draftAllowlist, setDraftAllowlist] = createSignal<Set<string>>(new Set())
  const [draftDecision, setDraftDecision] = createSignal<string | undefined>()
  const [draftBackupDecision, setDraftBackupDecision] = createSignal<string | undefined>()
  const [draftRegistrations, setDraftRegistrations] = createSignal<Record<string, ProviderRegistration>>({})
  const [draftStagePolicies, setDraftStagePolicies] = createSignal<Partial<Record<PaperModelRole, StagePolicy>>>({})
  const [editingRole, setEditingRole] = createSignal<PaperModelRole>()

  const [payload, { refetch }] = createResource(async (): Promise<ModelInventoryPayload> => {
    try {
      const response = await sdk.fetch(new URL("paper/model-inventory", sdk.url), {
        headers: {
          ...(sdk.directory ? { "x-paper-fucker-directory": sdk.directory } : {}),
        },
      })
      return await readTuiJsonResponse<ModelInventoryPayload>(response, "模型工作台读取失败")
    } catch (error) {
      return {
        inventory: { allowlist: [], candidates: [], provider_registrations: {}, stage_model_policies: {} },
        builtin_providers: [],
        routing: [],
        error: error instanceof Error ? error.message : String(error),
      }
    }
  })

  const inventory = createMemo(() => payload()?.inventory ?? { allowlist: [], candidates: [], provider_registrations: {}, stage_model_policies: {} })
  const builtinProviders = createMemo(() => payload()?.builtin_providers ?? [])
  const registrations = createMemo(() => draftRegistrations())
  const activeProviderIDs = createMemo(() => new Set(registeredProviderIDs(registrations())))
  const candidates = createMemo(() => sortCandidates((inventory().candidates ?? []).filter((candidate) => activeProviderIDs().has(candidate.provider_id))))
  const allowedCandidates = createMemo(() => sortCandidates(candidates().filter((candidate) => draftAllowlist().has(candidate.model_ref))))
  const currentSection = createMemo(() => SECTIONS[sectionIndex()]!.id)
  const connectedProviders = createMemo(() => new Set(sync.data.provider_next.connected ?? []))

  createEffect(
    on(
      () => payload(),
      (value) => {
        const next = value?.inventory
        if (!next) return
        const allowlist = new Set(next.allowlist ?? [])
        setDraftAllowlist(allowlist)
        setDraftDecision(next.decision_model && allowlist.has(next.decision_model) ? next.decision_model : undefined)
        setDraftBackupDecision(next.backup_decision_model && allowlist.has(next.backup_decision_model) ? next.backup_decision_model : undefined)
        setDraftRegistrations(next.provider_registrations ?? {})
        setDraftStagePolicies(next.stage_model_policies ?? {})
      },
    ),
  )

  const dirty = createMemo(() => {
    const next = payload()?.inventory
    if (!next) return false
    return (
      [...draftAllowlist()].sort().join("\n") !== [...(next.allowlist ?? [])].sort().join("\n") ||
      draftDecision() !== next.decision_model ||
      draftBackupDecision() !== next.backup_decision_model ||
      JSON.stringify(draftRegistrations()) !== JSON.stringify(next.provider_registrations ?? {}) ||
      JSON.stringify(draftStagePolicies()) !== JSON.stringify(next.stage_model_policies ?? {})
    )
  })

  const providerRows = createMemo<ProviderRow[]>(() =>
    Object.values(registrations())
      .filter((registration) => registration.status === "registered")
      .sort((left, right) => {
        const categoryCompare = providerCategory(left).localeCompare(providerCategory(right), "zh-CN")
        return categoryCompare || left.provider_id.localeCompare(right.provider_id, "en", { numeric: true })
      })
      .map((registration) => ({ kind: "registration", registration })),
  )

  const visibleCandidates = createMemo(() => {
    if (editingRole()) return allowedCandidates().filter((candidate) => includesQuery(candidate, filter()))
    if (currentSection() === "models") return candidates().filter((candidate) => includesQuery(candidate, filter()))
    return []
  })

  const rowCount = createMemo(() => {
    if (currentSection() === "registered") return providerRows().length
    if (currentSection() === "stage" && !editingRole()) return PAPER_MODEL_ROLES.length
    return visibleCandidates().length
  })
  const listHeight = createMemo(() => Math.max(8, dimensions().height - 15))
  const visibleStart = createMemo(() => scrollOffset())
  const visibleEnd = createMemo(() => Math.min(scrollOffset() + listHeight(), rowCount()))

  function ensureVisible(index: number) {
    const height = listHeight()
    setScrollOffset((offset) => {
      if (index < offset) return index
      if (index >= offset + height) return Math.max(0, index - height + 1)
      return offset
    })
  }

  function resetList() {
    setSelected(0)
    setScrollOffset(0)
  }

  createEffect(on([currentSection, filter, editingRole], resetList))

  function move(delta: number) {
    const count = rowCount()
    if (count <= 0) return
    const next = (selected() + delta + count) % count
    setSelected(next)
    ensureVisible(next)
  }

  async function postJson<T>(path: string, body: unknown): Promise<T> {
    const response = await sdk.fetch(new URL(path, sdk.url), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(sdk.directory ? { "x-paper-fucker-directory": sdk.directory } : {}),
      },
      body: JSON.stringify(body),
    })
    return readTuiJsonResponse<T>(response, "模型工作台请求失败")
  }

  async function save() {
    const allowlist = Array.from(draftAllowlist()).sort()
    const decision = draftDecision()
    const backupDecision = draftBackupDecision()
    if (decision && !draftAllowlist().has(decision)) {
      toast.show({ variant: "warning", message: "主决策模型必须先加入可用模型。" })
      return
    }
    if (backupDecision && !draftAllowlist().has(backupDecision)) {
      toast.show({ variant: "warning", message: "备用决策模型必须先加入可用模型。" })
      return
    }
    await postJson("paper/model-inventory", {
      allowlist,
      decision_model: decision,
      backup_decision_model: backupDecision,
      roles: {},
      registered_provider_ids: registeredProviderIDs(draftRegistrations()),
      provider_registrations: draftRegistrations(),
      stage_model_policies: draftStagePolicies(),
    })
    await refetch()
    notifyPaperModelInventoryChanged()
    toast.show({ variant: "success", message: "模型配置已保存。" })
  }

  function toggleAllowed(ref: string) {
    setDraftAllowlist((current) => {
      const next = new Set(current)
      if (next.has(ref)) next.delete(ref)
      else next.add(ref)
      if (draftDecision() === ref && !next.has(ref)) setDraftDecision(undefined)
      if (draftBackupDecision() === ref && !next.has(ref)) setDraftBackupDecision(undefined)
      setDraftStagePolicies((policies) =>
        Object.fromEntries(Object.entries(policies).map(([role, policy]) => [role, policy?.model_ref === ref ? { role: role as PaperModelRole, mode: "auto" } : policy])),
      )
      return next
    })
  }

  function selectAllVisible() {
    setDraftAllowlist((current) => new Set([...current, ...visibleCandidates().map((candidate) => candidate.model_ref)]))
  }

  function clearVisible() {
    const refs = new Set(visibleCandidates().map((candidate) => candidate.model_ref))
    setDraftAllowlist((current) => new Set([...current].filter((ref) => !refs.has(ref))))
    if (draftDecision() && refs.has(draftDecision()!)) setDraftDecision(undefined)
    if (draftBackupDecision() && refs.has(draftBackupDecision()!)) setDraftBackupDecision(undefined)
  }

  function registerBuiltin(provider: BuiltinProviderSummary) {
    setDraftRegistrations((current) => ({
      ...current,
      [provider.provider_id]: {
        provider_id: provider.provider_id,
        provider_name: provider.provider_name,
        kind: providerKindFor(provider.provider_id),
        status: "registered",
        model_count: provider.model_count,
        allowed_count: 0,
        last_refreshed_at: nowIso(),
      },
    }))
    toast.show({ variant: "info", message: `已加入 ${provider.provider_name ?? provider.provider_id}，保存后会缓存模型。` })
  }

  function deleteSelectedProvider() {
    const row = providerRows()[selected()]
    if (row?.kind !== "registration") return
    const providerID = row.registration.provider_id
    setDraftRegistrations((current) => Object.fromEntries(Object.entries(current).filter(([id]) => id !== providerID)))
    setDraftAllowlist((current) => new Set([...current].filter((ref) => !ref.startsWith(`${providerID}/`))))
    if (draftDecision()?.startsWith(`${providerID}/`)) setDraftDecision(undefined)
    if (draftBackupDecision()?.startsWith(`${providerID}/`)) setDraftBackupDecision(undefined)
    setDraftStagePolicies((policies) =>
      Object.fromEntries(
        Object.entries(policies).map(([role, policy]) => [
          role,
          policy?.model_ref?.startsWith(`${providerID}/`) ? { role: role as PaperModelRole, mode: "auto" } : policy,
        ]),
      ),
    )
    toast.show({ variant: "warning", message: `已删除 ${providerID}，保存后会清理它的模型。` })
  }

  function registerSubscriptionProvider(providerID: "openai" | "github-copilot") {
    const provider = builtinProviders().find((item) => item.provider_id === providerID) ?? {
      provider_id: providerID,
      provider_name: providerID === "openai" ? "ChatGPT 订阅" : "GitHub Copilot",
      model_count: 0,
      registered: false,
    }
    registerBuiltin(provider)
    if (!connectedProviders().has(providerID)) {
      dialog.replace(() => <DialogProvider />)
      toast.show({
        variant: "info",
        message: providerID === "openai" ? "请在登录面板完成 ChatGPT / OpenAI 授权。" : "请在登录面板完成 GitHub Copilot 授权。",
      })
    }
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
    setSectionIndex(1)
    toast.show({ variant: "success", message: `已发现 ${result.models?.length ?? 0} 个模型。` })
  }

  function cycleStagePolicy(role: PaperModelRole) {
    const current = draftStagePolicies()[role]?.mode ?? "auto"
    const next = current === "auto" ? "dynamic" : current === "dynamic" ? "auto" : "auto"
    setDraftStagePolicies((policies) => ({ ...policies, [role]: { role, mode: next } }))
  }

  function activate() {
    if (editingRole()) {
      const candidate = visibleCandidates()[selected()]
      if (!candidate) return
      const role = editingRole()!
      setDraftStagePolicies((policies) => ({ ...policies, [role]: { role, mode: "forced", model_ref: candidate.model_ref } }))
      setEditingRole(undefined)
      setFilter("")
      return
    }
    const section = currentSection()
    if (section === "models") {
      const candidate = visibleCandidates()[selected()]
      if (candidate) toggleAllowed(candidate.model_ref)
      return
    }
    if (section === "stage") {
      const role = PAPER_MODEL_ROLES[selected()]
      if (role) cycleStagePolicy(role)
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
    if (evt.name === "tab") {
      setSectionIndex((index) => (index + (evt.shift ? -1 : 1) + SECTIONS.length) % SECTIONS.length)
      evt.preventDefault()
      return
    }
    if (evt.name === "up" || (evt.ctrl && evt.name === "p")) move(-1)
    if (evt.name === "down" || (evt.ctrl && evt.name === "n")) move(1)
    if (evt.name === "pageup") move(-listHeight())
    if (evt.name === "pagedown") move(listHeight())
    if (evt.name === "home") {
      setSelected(0)
      setScrollOffset(0)
    }
    if (evt.name === "end") {
      const last = Math.max(0, rowCount() - 1)
      setSelected(last)
      ensureVisible(last)
    }
    if (evt.name === "return" || evt.name === "space" || evt.name === " ") {
      activate()
      evt.preventDefault()
      return
    }
    if (evt.ctrl && evt.name === "s") {
      void save().catch((error) => toast.show({ variant: "error", message: error instanceof Error ? error.message : "保存模型配置失败" }))
      evt.preventDefault()
      return
    }
    if (!evt.ctrl && evt.name === "a" && currentSection() === "models") {
      selectAllVisible()
      evt.preventDefault()
      return
    }
    if (!evt.ctrl && evt.name === "n" && currentSection() === "models") {
      clearVisible()
      evt.preventDefault()
      return
    }
    if (!evt.ctrl && evt.name === "m" && currentSection() === "models") {
      const candidate = visibleCandidates()[selected()]
      if (candidate) {
        if (!draftAllowlist().has(candidate.model_ref)) toggleAllowed(candidate.model_ref)
        setDraftDecision(candidate.model_ref)
      }
      evt.preventDefault()
      return
    }
    if (!evt.ctrl && evt.name === "b" && currentSection() === "models") {
      const candidate = visibleCandidates()[selected()]
      if (candidate) {
        if (!draftAllowlist().has(candidate.model_ref)) toggleAllowed(candidate.model_ref)
        setDraftBackupDecision(candidate.model_ref)
      }
      evt.preventDefault()
      return
    }
    if (!evt.ctrl && evt.name === "f" && currentSection() === "stage") {
      const role = PAPER_MODEL_ROLES[selected()]
      if (role) setEditingRole(role)
      evt.preventDefault()
      return
    }
    if (!evt.ctrl && evt.name === "d" && currentSection() === "registered") {
      deleteSelectedProvider()
      evt.preventDefault()
      return
    }
    if (!evt.ctrl && evt.name === "g" && currentSection() === "registered") {
      registerSubscriptionProvider("openai")
      evt.preventDefault()
      return
    }
    if (!evt.ctrl && evt.name === "p" && currentSection() === "registered") {
      registerSubscriptionProvider("github-copilot")
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
    if (!evt.ctrl && evt.name === "l" && currentSection() === "registered") {
      dialog.replace(() => <DialogProvider />)
      evt.preventDefault()
      return
    }
    const number = Number(evt.name)
    if (Number.isInteger(number) && number >= 1 && number <= SECTIONS.length) {
      setSectionIndex(number - 1)
      evt.preventDefault()
    }
  })

  const summary = createMemo(() => ({
    decision: draftDecision(),
    backup: draftBackupDecision(),
    allowed: draftAllowlist().size,
    candidates: candidates().length,
    providers: Object.values(registrations()).filter((registration) => registration.status === "registered").length,
  }))

  const activeCandidateRows = createMemo(() => visibleCandidates().slice(visibleStart(), visibleEnd()))
  const activeProviderRows = createMemo(() => providerRows().slice(visibleStart(), visibleEnd()))
  const activeRoles = createMemo(() => PAPER_MODEL_ROLES.slice(visibleStart(), visibleEnd()))
  const compact = createMemo(() => dimensions().width < 118)
  const detailWidth = createMemo(() => (compact() ? 0 : 34))

  return (
    <box width="100%" height="100%" paddingLeft={2} paddingRight={2} paddingTop={1} paddingBottom={1} flexDirection="column" gap={1}>
      <box flexDirection="row" justifyContent="space-between" alignItems="center">
        <box flexDirection="column">
          <text fg={theme.text} attributes={TextAttributes.BOLD}>Paper Fucker 模型工作台</text>
          <text fg={theme.textMuted}>管理 provider、候选模型、决策模型和全流程路由。</text>
        </box>
        <text fg={dirty() ? theme.warning : theme.textMuted}>{dirty() ? "有未保存修改 Ctrl+S 保存" : "Esc 返回首页"}</text>
      </box>

      <box flexDirection="row" gap={2}>
        <For each={SECTIONS}>
          {(section, index) => (
            <text fg={index() === sectionIndex() ? theme.accent : theme.textMuted} attributes={index() === sectionIndex() ? TextAttributes.BOLD : undefined}>
              {index() + 1} {section.label}
            </text>
          )}
        </For>
      </box>

      <box flexDirection="row" gap={2}>
        <text fg={summary().decision ? theme.text : theme.warning}>主模型：{summary().decision ? truncateDisplayMiddle(summary().decision!, 36) : "未选择"}</text>
        <text fg={summary().backup ? theme.textMuted : theme.textMuted}>备用：{summary().backup ? truncateDisplayMiddle(summary().backup!, 30) : "未选择"}</text>
        <text fg={theme.textMuted}>可用 {summary().allowed}</text>
        <text fg={theme.textMuted}>候选 {summary().candidates}</text>
        <text fg={theme.textMuted}>Provider {summary().providers}</text>
      </box>

      <box border={["top"]} borderColor={theme.border} />

      <box flexDirection="row" gap={2} flexGrow={1} minHeight={0}>
        <box width={24} flexShrink={0} flexDirection="column" gap={1}>
          <For each={SECTIONS}>
            {(section, index) => (
              <box paddingLeft={1} paddingRight={1} backgroundColor={index() === sectionIndex() ? theme.backgroundPanel : undefined}>
                <text fg={index() === sectionIndex() ? theme.accent : theme.textMuted}>{index() + 1}. {section.label}</text>
              </box>
            )}
          </For>
          <box paddingTop={1} flexDirection="column">
            <text fg={theme.textMuted}>g ChatGPT 订阅</text>
            <text fg={theme.textMuted}>p Copilot CLI 订阅</text>
            <text fg={theme.textMuted}>c 其他 provider</text>
            <text fg={theme.textMuted}>d 删除已注册</text>
            <text fg={theme.textMuted}>Ctrl+S 保存</text>
          </box>
        </box>

        <box flexDirection="column" flexGrow={1} minWidth={0} gap={1}>
          <Show when={payload()?.error}>
            {(error) => <text fg={theme.warning}>{error()}</text>}
          </Show>
          <Show when={currentSection() === "models" || editingRole()}>
            <input
              placeholder="搜索 provider、模型名或来源"
              cursorColor={theme.primary}
              focusedBackgroundColor={theme.backgroundElement}
              focusedTextColor={theme.text}
              onInput={(value) => setFilter(value)}
            />
          </Show>

          <box flexDirection="column" height={listHeight()} minHeight={0} overflow="hidden">
            <Switch>
              <Match when={currentSection() === "registered"}>
                <For each={activeProviderRows()}>
                  {(row, index) => {
                    const active = createMemo(() => index() + scrollOffset() === selected())
                    const connected = createMemo(() =>
                      row.kind === "registration" && (row.registration.kind === "openai_compatible" || row.registration.kind === "manual" || connectedProviders().has(row.registration.provider_id)),
                    )
                    return (
                      <box backgroundColor={active() ? theme.primary : undefined} paddingLeft={1} gap={1}>
                        <text fg={active() ? theme.selectedListItemText : theme.success}>●</text>
                        <text fg={active() ? theme.selectedListItemText : theme.text}>
                          {providerLabel(row.registration.provider_id, row.registration.provider_name)}
                        </text>
                        <text fg={active() ? theme.selectedListItemText : theme.textMuted}>
                          {row.registration.allowed_count}/{row.registration.model_count}
                        </text>
                        <text fg={active() ? theme.selectedListItemText : theme.textMuted}>{providerCategory(row.registration)}</text>
                        <text fg={active() ? theme.selectedListItemText : connected() ? theme.success : theme.warning}>
                          {connected() ? "可用" : "需授权"}
                        </text>
                      </box>
                    )
                  }}
                </For>
                <Show when={providerRows().length === 0}>
                  <box flexDirection="column" gap={1}>
                    <text fg={theme.warning}>还没有注册 provider。</text>
                    <text fg={theme.textMuted}>按 g 添加 ChatGPT 订阅，按 p 添加 Copilot CLI 订阅，按 c 添加其他 OpenAI-compatible provider。</text>
                  </box>
                </Show>
              </Match>

              <Match when={currentSection() === "models" || editingRole()}>
                <Show when={editingRole()}>
                  {(role) => <text fg={theme.accent}>为 {ROLE_LABELS[role()]} 选择强制模型；Esc 返回阶段列表。</text>}
                </Show>
                <For each={activeCandidateRows()}>
                  {(candidate, index) => {
                    const active = createMemo(() => index() + scrollOffset() === selected())
                    const allowed = createMemo(() => draftAllowlist().has(candidate.model_ref))
                    return (
                      <box backgroundColor={active() ? theme.primary : undefined} paddingLeft={1} gap={1}>
                        <text fg={active() ? theme.selectedListItemText : allowed() ? theme.success : theme.textMuted}>
                          {allowed() ? "✓" : "·"}
                        </text>
                        <text fg={active() ? theme.selectedListItemText : theme.text}>
                          {truncateDisplayMiddle(candidate.model_ref, Math.max(34, dimensions().width - detailWidth() - 42))}
                        </text>
                        <text fg={active() ? theme.selectedListItemText : theme.textMuted}>{candidate.smoke_status}</text>
                        <text fg={active() ? theme.selectedListItemText : theme.textMuted}>{candidate.context_hint ?? "context?"}</text>
                        <Show when={draftDecision() === candidate.model_ref}>
                          <text fg={active() ? theme.selectedListItemText : theme.accent}>主决策</text>
                        </Show>
                        <Show when={draftBackupDecision() === candidate.model_ref}>
                          <text fg={active() ? theme.selectedListItemText : theme.secondary}>备用</text>
                        </Show>
                      </box>
                    )
                  }}
                </For>
                <Show when={visibleCandidates().length === 0}>
                  <text fg={theme.warning}>
                    {editingRole()
                      ? "还没有可用模型。先在“所有模型”中勾选候选模型并保存。"
                      : "没有模型。先在“已注册”中添加 provider 并刷新模型列表。"}
                  </text>
                </Show>
              </Match>

              <Match when={currentSection() === "stage" && !editingRole()}>
                <For each={activeRoles()}>
                  {(role, index) => {
                    const policy = createMemo(() => draftStagePolicies()[role] ?? defaultPolicy(role))
                    const active = createMemo(() => index() + scrollOffset() === selected())
                    return (
                      <box backgroundColor={active() ? theme.primary : undefined} paddingLeft={1} gap={1}>
                        <text fg={active() ? theme.selectedListItemText : theme.text}>{ROLE_LABELS[role]}</text>
                        <text fg={active() ? theme.selectedListItemText : theme.accent}>{POLICY_LABELS[policy().mode]}</text>
                        <text fg={active() ? theme.selectedListItemText : theme.textMuted}>
                          {policy().model_ref ? truncateDisplayMiddle(policy().model_ref!, Math.max(24, dimensions().width - detailWidth() - 48)) : "由决策模型按任务动态路由"}
                        </text>
                      </box>
                    )
                  }}
                </For>
                <text fg={theme.textMuted}>Enter 在自动/动态之间切换；F 从可用模型池强制指定。</text>
              </Match>
            </Switch>
          </box>

          <Show when={rowCount() > listHeight()}>
            <text fg={theme.textMuted}>
              {visibleStart() + 1}-{visibleEnd()}/{rowCount()}  PageUp/PageDown 滚动  Home/End 到首尾
            </text>
          </Show>

          <box border={["top"]} borderColor={theme.border} />
          <box flexDirection="row" gap={2}>
            <text fg={theme.text}>Tab 切换</text>
            <text fg={theme.text}>Enter/Space 选择</text>
            <text fg={theme.text}>A 全选</text>
            <text fg={theme.text}>N 清空</text>
            <text fg={theme.text}>M 主模型</text>
            <text fg={theme.text}>B 设备用</text>
            <text fg={theme.text}>D 删除 provider</text>
            <text fg={theme.text}>Ctrl+S 保存</text>
          </box>
        </box>

        <Show when={!compact()}>
          <box width={detailWidth()} flexShrink={0} flexDirection="column" gap={1} paddingLeft={1} border={["left"]} borderColor={theme.borderSubtle}>
            <text fg={theme.accent} attributes={TextAttributes.BOLD}>说明</text>
            <text fg={theme.textMuted}>已注册只显示用户配置过的 provider。</text>
            <text fg={theme.textMuted}>所有模型只来自已注册 provider；勾选后才进入候选池。</text>
            <text fg={theme.textMuted}>主/备用决策模型必须来自候选池。</text>
            <text fg={theme.textMuted}>动态阶段模型允许运行中按质量和成本切换候选模型。</text>
          </box>
        </Show>
      </box>
    </box>
  )
}
