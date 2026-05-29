import { TextAttributes } from "@opentui/core"
import { useKeyboard, useTerminalDimensions } from "@opentui/solid"
import { createMemo, createSignal, For, onCleanup, Show } from "solid-js"
import { defaultPaperProfiles, type PaperProfile } from "@/paper/profiles"
import { useRoute } from "@tui/context/route"
import { useTheme } from "@tui/context/theme"
import { DialogPrompt } from "@tui/ui/dialog-prompt"
import { useDialog } from "@tui/ui/dialog"
import { useToast } from "@tui/ui/toast"
import { truncateDisplayMiddle } from "@tui/util/text-width"
import {
  getPaperConversationJournal,
  setPaperConversationJournal,
  subscribePaperConversationJournal,
} from "@tui/util/paper-conversation-journal"

type Section = "builtin" | "current" | "capture"

const SECTIONS: Array<{ id: Section; label: string }> = [
  { id: "builtin", label: "内置期刊" },
  { id: "current", label: "当前期刊" },
  { id: "capture", label: "抓取期刊" },
]

function journalDisplayName(profile: PaperProfile) {
  if (profile.id === "cjc-paper") return "中国计算机学报"
  if (profile.id === "generic-preprint") return "通用预印本"
  return profile.title
}

function extractTitle(html: string) {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  return match?.[1]?.replace(/\s+/g, " ").trim()
}

async function probeOfficialUrl(url: string) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 7000)
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "user-agent": "PaperFucker/0.10 journal-profile-probe" },
    })
    const text = await response.text().catch(() => "")
    return {
      ok: response.ok,
      status: response.status,
      title: extractTitle(text),
      bytes: text.length,
    }
  } finally {
    clearTimeout(timeout)
  }
}

export function PaperJournalWorkbenchPage() {
  const router = useRoute()
  const dialog = useDialog()
  const toast = useToast()
  const { theme } = useTheme()
  const dimensions = useTerminalDimensions()
  const [sectionIndex, setSectionIndex] = createSignal(0)
  const [selected, setSelected] = createSignal(0)
  const [scrollOffset, setScrollOffset] = createSignal(0)
  const [journalRev, setJournalRev] = createSignal(0)
  const [captureStatus, setCaptureStatus] = createSignal("输入期刊名和官方入口后，Paper Fucker 会先生成草案 profile。")
  const profiles = createMemo(() =>
    defaultPaperProfiles()
      .filter((profile) => profile.id !== "custom-journal")
      .sort((left, right) => {
        if (left.id === "cjc-paper") return -1
        if (right.id === "cjc-paper") return 1
        return journalDisplayName(left).localeCompare(journalDisplayName(right), "zh-CN")
      }),
  )
  const currentSection = createMemo(() => SECTIONS[sectionIndex()]!.id)
  const currentJournal = createMemo(() => {
    journalRev()
    return getPaperConversationJournal()
  })
  const listHeight = createMemo(() => Math.max(8, dimensions().height - 17))
  const rowCount = createMemo(() => (currentSection() === "builtin" ? profiles().length : 0))
  const visibleStart = createMemo(() => scrollOffset())
  const visibleEnd = createMemo(() => Math.min(scrollOffset() + listHeight(), rowCount()))
  const visibleProfiles = createMemo(() => profiles().slice(visibleStart(), visibleEnd()))
  const rowWidth = createMemo(() => Math.max(34, dimensions().width - 52))

  const unsubscribeJournal = subscribePaperConversationJournal(() => setJournalRev((value) => value + 1))
  onCleanup(unsubscribeJournal)

  function ensureVisible(index: number) {
    const height = listHeight()
    setScrollOffset((offset) => {
      if (index < offset) return index
      if (index >= offset + height) return Math.max(0, index - height + 1)
      return offset
    })
  }

  function move(delta: number) {
    const count = rowCount()
    if (count <= 0) return
    const next = (selected() + delta + count) % count
    setSelected(next)
    ensureVisible(next)
  }

  function selectProfile(profile: PaperProfile) {
    const name = journalDisplayName(profile)
    const selectedJournal = setPaperConversationJournal({
      target_profile: profile.id,
      target_journal: profile.id === "generic-preprint" ? undefined : name,
      target_journal_url: profile.official_guidance_sources.find((source) => source.trust === "official")?.url,
    })
    toast.show({ variant: "success", message: `当前期刊：${selectedJournal.journal_name ?? selectedJournal.profile_id}` })
  }

  async function captureCustomJournal() {
    const name = await DialogPrompt.show(dialog, "期刊名称", {
      placeholder: "例如 Journal of Example Systems",
    })
    if (!name?.trim()) return
    const url = await DialogPrompt.show(dialog, "官方作者指南或期刊官网 URL", {
      placeholder: "https://journal.example.org/for-authors",
      description: () => <text fg={theme.textMuted}>可以留空；留空时只生成待抓取草案，不写入任何猜测规则。</text>,
    })
    const trimmedUrl = url?.trim()
    if (trimmedUrl) {
      try {
        new URL(trimmedUrl)
      } catch {
        toast.show({ variant: "error", message: "URL 格式无效，已取消。" })
        return
      }
    }
    const selectedJournal = setPaperConversationJournal({
      target_journal: name.trim(),
      target_journal_url: trimmedUrl,
    })
    setSectionIndex(1)
    setSelected(0)
    if (!trimmedUrl) {
      setCaptureStatus("已生成自定义期刊草案；下一步需要提供官方作者指南或模板入口。")
      toast.show({ variant: "warning", message: "已保存期刊草案，尚未抓取官方入口。" })
      return
    }
    try {
      const result = await probeOfficialUrl(trimmedUrl)
      setCaptureStatus(
        result.ok
          ? `抓取成功：HTTP ${result.status}${result.title ? ` · ${result.title}` : ""} · ${result.bytes.toLocaleString()} bytes`
          : `已保存草案，但官方入口返回 HTTP ${result.status}，运行时会继续阻断 profile 合规。`,
      )
      toast.show({
        variant: result.ok ? "success" : "warning",
        message: result.ok ? `已抓取 ${selectedJournal.journal_name}` : "期刊入口返回非 2xx，已保留为待确认草案。",
      })
    } catch (error) {
      setCaptureStatus(`已保存草案，但抓取失败：${error instanceof Error ? error.message : String(error)}`)
      toast.show({ variant: "warning", message: "抓取失败，已保留为待确认草案。" })
    }
  }

  function activate() {
    if (currentSection() !== "builtin") return
    const profile = profiles()[selected()]
    if (profile) selectProfile(profile)
  }

  useKeyboard((evt) => {
    if (evt.name === "escape") {
      router.navigate({ type: "home" })
      evt.preventDefault()
      return
    }
    if (evt.name === "tab") {
      setSectionIndex((index) => (index + (evt.shift ? -1 : 1) + SECTIONS.length) % SECTIONS.length)
      setSelected(0)
      setScrollOffset(0)
      evt.preventDefault()
      return
    }
    if (evt.name === "up" || (evt.ctrl && evt.name === "p")) {
      move(-1)
      evt.preventDefault()
      return
    }
    if (evt.name === "down" || (evt.ctrl && evt.name === "n")) {
      move(1)
      evt.preventDefault()
      return
    }
    if (evt.name === "pagedown") {
      move(listHeight())
      evt.preventDefault()
      return
    }
    if (evt.name === "pageup") {
      move(-listHeight())
      evt.preventDefault()
      return
    }
    if (evt.name === "home") {
      setSelected(0)
      setScrollOffset(0)
      evt.preventDefault()
      return
    }
    if (evt.name === "end") {
      const last = Math.max(0, rowCount() - 1)
      setSelected(last)
      ensureVisible(last)
      evt.preventDefault()
      return
    }
    if (evt.name === "return" || evt.name === "space" || evt.name === " ") {
      activate()
      evt.preventDefault()
      return
    }
    if (!evt.ctrl && evt.name === "n") {
      void captureCustomJournal()
      evt.preventDefault()
      return
    }
    const number = Number(evt.name)
    if (Number.isInteger(number) && number >= 1 && number <= SECTIONS.length) {
      setSectionIndex(number - 1)
      setSelected(0)
      setScrollOffset(0)
      evt.preventDefault()
    }
  })

  return (
    <box width="100%" height="100%" paddingLeft={3} paddingRight={3} paddingTop={1} paddingBottom={1} flexDirection="column" gap={1}>
      <box flexDirection="row" justifyContent="space-between">
        <box flexDirection="column">
          <text fg={theme.text} attributes={TextAttributes.BOLD}>Paper Fucker 期刊工作台</text>
          <text fg={theme.textMuted}>选择内置期刊，或抓取未知期刊并生成 profile 草案。</text>
        </box>
        <text fg={theme.textMuted}>Esc 返回首页</text>
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

      <box flexDirection="row" gap={3} paddingLeft={1} paddingRight={1} backgroundColor={theme.backgroundPanel}>
        <text fg={theme.text}>当前 {currentJournal().journal_name ?? currentJournal().profile_id}</text>
        <text fg={theme.textMuted}>profile {currentJournal().profile_id}</text>
        <text fg={currentJournal().source === "generated" ? theme.warning : theme.success}>
          {currentJournal().source === "generated" ? "待官方确认" : "已选择"}
        </text>
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
            <text fg={theme.textMuted}>Enter 选择内置</text>
            <text fg={theme.textMuted}>N 抓取未知期刊</text>
            <text fg={theme.textMuted}>Tab 切换页面</text>
          </box>
        </box>

        <box flexDirection="column" flexGrow={1} minWidth={0} gap={1}>
          <Show when={currentSection() === "builtin"}>
            <box flexDirection="column" height={listHeight()} minHeight={0} overflow="hidden">
              <For each={visibleProfiles()}>
                {(profile, index) => {
                  const active = createMemo(() => index() + scrollOffset() === selected())
                  const official = profile.official_guidance_sources.find((source) => source.trust === "official")
                  return (
                    <box backgroundColor={active() ? theme.primary : undefined} paddingLeft={1} gap={2}>
                      <text fg={active() ? theme.selectedListItemText : theme.text}>{journalDisplayName(profile)}</text>
                      <text fg={active() ? theme.selectedListItemText : theme.textMuted}>{profile.id}</text>
                      <text fg={active() ? theme.selectedListItemText : theme.textMuted}>
                        {truncateDisplayMiddle(official?.url ?? "local", rowWidth())}
                      </text>
                    </box>
                  )
                }}
              </For>
            </box>
            <Show when={rowCount() > listHeight()}>
              <text fg={theme.textMuted}>{visibleStart() + 1}-{visibleEnd()}/{rowCount()} PageUp/PageDown 滚动</text>
            </Show>
          </Show>

          <Show when={currentSection() === "current"}>
            <box flexDirection="column" gap={1}>
              <text fg={theme.accent}>当前期刊</text>
              <text fg={theme.text}>{currentJournal().journal_name ?? currentJournal().profile_id}</text>
              <text fg={theme.textMuted}>Profile: {currentJournal().profile_id}</text>
              <Show when={currentJournal().official_url}>
                {(url) => <text fg={theme.textMuted}>官方入口: {truncateDisplayMiddle(url(), Math.max(42, dimensions().width - 38))}</text>}
              </Show>
              <Show when={currentJournal().generated_profile}>
                {(draft) => (
                  <box flexDirection="column" gap={1} paddingTop={1}>
                    <text fg={theme.warning}>未知期刊 profile 草案不会写入猜测规则。</text>
                    <For each={draft().required_actions}>
                      {(action) => <text fg={theme.textMuted}>- {action}</text>}
                    </For>
                  </box>
                )}
              </Show>
            </box>
          </Show>

          <Show when={currentSection() === "capture"}>
            <box flexDirection="column" gap={1}>
              <text fg={theme.accent}>抓取未知期刊</text>
              <text fg={theme.textMuted}>按 N 输入期刊名和官方入口。抓取成功只记录来源状态；格式规则必须来自后续官方模板解析。</text>
              <text fg={theme.warning}>{captureStatus()}</text>
            </box>
          </Show>

          <box border={["top"]} borderColor={theme.border} />
          <box flexDirection="row" gap={2}>
            <text fg={theme.text}>Enter 选择</text>
            <text fg={theme.text}>N 抓取期刊</text>
            <text fg={theme.text}>PageUp/PageDown 滚动</text>
            <text fg={theme.text}>Esc 返回</text>
          </box>
        </box>
      </box>
    </box>
  )
}
