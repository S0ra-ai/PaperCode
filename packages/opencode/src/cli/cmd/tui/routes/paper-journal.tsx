import { TextAttributes } from "@opentui/core"
import { useKeyboard, useTerminalDimensions } from "@opentui/solid"
import { createMemo, createSignal, For, onCleanup, Show } from "solid-js"
import { ACTIVE_PAPER_PROFILE_IDS, defaultPaperProfiles, type PaperProfile } from "@/paper/profiles"
import { useRoute } from "@tui/context/route"
import { useTheme } from "@tui/context/theme"
import { useToast } from "@tui/ui/toast"
import { truncateDisplayMiddle } from "@tui/util/text-width"
import {
  getPaperConversationJournal,
  setPaperConversationJournal,
  subscribePaperConversationJournal,
} from "@tui/util/paper-conversation-journal"

const SECTIONS = [{ id: "current", label: "中国计算机学报" }] as const

function journalDisplayName(profile: PaperProfile) {
  if (profile.id === "cjc-paper") return "中国计算机学报"
  return profile.title
}

export function PaperJournalWorkbenchPage() {
  const router = useRoute()
  const toast = useToast()
  const { theme } = useTheme()
  const dimensions = useTerminalDimensions()
  const [selected, setSelected] = createSignal(0)
  const [scrollOffset, setScrollOffset] = createSignal(0)
  const [journalRev, setJournalRev] = createSignal(0)
  const profiles = createMemo(() =>
    defaultPaperProfiles()
      .filter((profile) => ACTIVE_PAPER_PROFILE_IDS.includes(profile.id as (typeof ACTIVE_PAPER_PROFILE_IDS)[number]))
      .sort((left, right) => {
        if (left.id === "cjc-paper") return -1
        if (right.id === "cjc-paper") return 1
        return journalDisplayName(left).localeCompare(journalDisplayName(right), "zh-CN")
      }),
  )
  const currentJournal = createMemo(() => {
    journalRev()
    return getPaperConversationJournal()
  })
  const listHeight = createMemo(() => Math.max(8, dimensions().height - 17))
  const rowCount = createMemo(() => profiles().length)
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
      target_journal: name,
      target_journal_url: profile.official_guidance_sources.find((source) => source.trust === "official")?.url,
    })
    toast.show({ variant: "success", message: `当前期刊：${selectedJournal.journal_name ?? selectedJournal.profile_id}` })
  }

  function activate() {
    const profile = profiles()[selected()]
    if (profile) selectProfile(profile)
  }

  useKeyboard((evt) => {
    if (evt.name === "escape") {
      router.navigate({ type: "home" })
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
    const number = Number(evt.name)
    if (Number.isInteger(number) && number >= 1 && number <= SECTIONS.length) {
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
          <text fg={theme.textMuted}>当前仅启用中国计算机学报格式；其他期刊入口暂不开放。</text>
        </box>
        <text fg={theme.textMuted}>Esc 返回首页</text>
      </box>

      <box flexDirection="row" gap={2}>
        <For each={SECTIONS}>
          {(section, index) => <text fg={theme.accent} attributes={TextAttributes.BOLD}>{index() + 1} {section.label}</text>}
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
              <box paddingLeft={1} paddingRight={1} backgroundColor={theme.backgroundPanel}>
                <text fg={theme.accent}>{index() + 1}. {section.label}</text>
              </box>
            )}
          </For>
          <box paddingTop={1} flexDirection="column">
            <text fg={theme.textMuted}>Enter 设为当前</text>
            <text fg={theme.textMuted}>Esc 返回首页</text>
          </box>
        </box>

        <box flexDirection="column" flexGrow={1} minWidth={0} gap={1}>
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

          <box flexDirection="column" gap={1}>
            <text fg={theme.accent}>当前期刊</text>
            <text fg={theme.text}>{currentJournal().journal_name ?? currentJournal().profile_id}</text>
            <text fg={theme.textMuted}>Profile: {currentJournal().profile_id}</text>
            <Show when={currentJournal().official_url}>
              {(url) => <text fg={theme.textMuted}>官方入口: {truncateDisplayMiddle(url(), Math.max(42, dimensions().width - 38))}</text>}
            </Show>
          </box>

          <box border={["top"]} borderColor={theme.border} />
          <box flexDirection="row" gap={2}>
            <text fg={theme.text}>Enter 设为当前</text>
            <text fg={theme.text}>PageUp/PageDown 滚动</text>
            <text fg={theme.text}>Esc 返回</text>
          </box>
        </box>
      </box>
    </box>
  )
}
