import { TextAttributes } from "@opentui/core"
import { useKeyboard, useTerminalDimensions } from "@opentui/solid"
import { createEffect, createMemo, createResource, createSignal, For, onMount, Show } from "solid-js"
import { readdir, stat } from "fs/promises"
import { existsSync } from "fs"
import os from "os"
import path from "path"
import { useRoute } from "@tui/context/route"
import { useSDK } from "@tui/context/sdk"
import { useTheme } from "@tui/context/theme"
import { useToast } from "@tui/ui/toast"
import { getPaperConversationWorkspace, setPaperConversationWorkspace } from "@tui/util/paper-conversation-workspace"
import { openPaperNativePicker } from "@tui/util/paper-native-picker"
import { truncateDisplayMiddle } from "@tui/util/text-width"

type DirectoryEntry = {
  name: string
  path: string
  kind: "current" | "parent" | "directory" | "drive"
}

function initialDirectory(fallback?: string) {
  const current = getPaperConversationWorkspace() ?? fallback ?? process.cwd()
  return path.resolve(current)
}

function windowsDrives(): DirectoryEntry[] {
  if (process.platform !== "win32") return []
  const output: DirectoryEntry[] = []
  for (let code = 67; code <= 90; code++) {
    const drive = `${String.fromCharCode(code)}:\\`
    if (existsSync(drive)) output.push({ name: drive, path: drive, kind: "drive" })
  }
  return output
}

async function directoryEntries(current: string): Promise<DirectoryEntry[]> {
  const resolved = path.resolve(current)
  const roots = windowsDrives()
  const entries: DirectoryEntry[] = [
    { name: "选择当前目录", path: resolved, kind: "current" },
    { name: "..", path: path.dirname(resolved), kind: "parent" },
  ]
  if (process.platform === "win32") entries.push(...roots.filter((drive) => drive.path.toLowerCase() !== resolved.toLowerCase()))
  const children = await readdir(resolved, { withFileTypes: true }).catch(() => [])
  const directories = children
    .filter((child) => child.isDirectory() && child.name !== "node_modules" && child.name !== ".git")
    .sort((left, right) => left.name.localeCompare(right.name, "zh-Hans-CN", { numeric: true, sensitivity: "base" }))
  for (const child of directories) {
    if (!child.isDirectory()) continue
    const childPath = path.join(resolved, child.name)
    entries.push({ name: child.name, path: childPath, kind: "directory" })
  }
  return entries
}

export function PaperFolderPickerPage() {
  const sdk = useSDK()
  const router = useRoute()
  const toast = useToast()
  const { theme } = useTheme()
  const dimensions = useTerminalDimensions()
  const [current, setCurrent] = createSignal(initialDirectory(sdk.directory))
  const [selected, setSelected] = createSignal(0)
  const [scrollOffset, setScrollOffset] = createSignal(0)
  const [nativeStatus, setNativeStatus] = createSignal("正在打开系统目录选择器；取消后会回到 TUI 选择器。")
  const [entries] = createResource(current, directoryEntries)

  const rows = createMemo(() => entries() ?? [])
  const maxRows = createMemo(() => Math.max(8, dimensions().height - 10))
  const visibleRows = createMemo(() => rows().slice(scrollOffset(), scrollOffset() + maxRows()))
  const canScroll = createMemo(() => rows().length > maxRows())

  function ensureVisible(index: number) {
    const height = maxRows()
    setScrollOffset((offset) => {
      if (index < offset) return index
      if (index >= offset + height) return Math.max(0, index - height + 1)
      return offset
    })
  }

  function move(delta: number) {
    const count = rows().length
    if (count <= 0) return
    const next = (selected() + delta + count) % count
    setSelected(next)
    ensureVisible(next)
  }

  async function choose(value = current()) {
    const resolved = path.resolve(value)
    const info = await stat(resolved).catch(() => undefined)
    if (!info?.isDirectory()) {
      toast.show({ variant: "error", message: `目录不可用：${resolved}` })
      return
    }
    setPaperConversationWorkspace(resolved)
    toast.show({ variant: "success", message: `当前工作目录：${resolved}` })
    router.navigate({ type: "home" })
  }

  function activate() {
    const entry = rows()[selected()]
    if (!entry) return
    if (entry.kind === "current") {
      void choose(entry.path)
      return
    }
    setCurrent(entry.path)
    setSelected(0)
    setScrollOffset(0)
  }

  onMount(() => {
    void openPaperNativePicker({
      mode: "folder",
      title: "PaperCode 选择当前对话工作目录",
      initialPath: current(),
    })
      .then((result) => {
        if (result?.paths[0]) return choose(result.paths[0])
        setNativeStatus("已取消系统目录选择器。你可以继续使用下面的 TUI 目录选择器。")
      })
      .catch((error) => {
        setNativeStatus(`系统目录选择器不可用，已回退到 TUI 选择器：${error instanceof Error ? error.message : String(error)}`)
      })
  })

  createEffect(() => {
    if (selected() >= rows().length) {
      setSelected(Math.max(0, rows().length - 1))
      ensureVisible(Math.max(0, rows().length - 1))
    }
  })

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
      move(maxRows())
      evt.preventDefault()
      return
    }
    if (evt.name === "pageup") {
      move(-maxRows())
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
      const last = Math.max(0, rows().length - 1)
      setSelected(last)
      ensureVisible(last)
      evt.preventDefault()
      return
    }
    if (evt.name === "return") {
      activate()
      evt.preventDefault()
      return
    }
    if (evt.ctrl && evt.name === "s") {
      void choose()
      evt.preventDefault()
      return
    }
    if (evt.name === "backspace") {
      setCurrent(path.dirname(current()))
      setSelected(0)
      evt.preventDefault()
    }
  })

  return (
    <box width="100%" height="100%" paddingLeft={3} paddingRight={3} paddingTop={2} paddingBottom={1} flexDirection="column" gap={1}>
      <box flexDirection="row" justifyContent="space-between">
        <box flexDirection="column">
          <text fg={theme.text} attributes={TextAttributes.BOLD}>选择工作目录</text>
          <text fg={theme.textMuted}>当前选择只影响本次 TUI 对话里的新 PaperRun。</text>
        </box>
        <text fg={theme.textMuted}>Esc 返回首页</text>
      </box>
      <box flexDirection="column">
        <text fg={theme.accent}>当前目录</text>
        <text fg={theme.text}>{truncateDisplayMiddle(current(), Math.max(42, dimensions().width - 12))}</text>
        <text fg={theme.textMuted}>Home：{os.homedir()}</text>
        <text fg={theme.textMuted}>{nativeStatus()}</text>
      </box>
      <box border={["top"]} borderColor={theme.border} />
      <box flexDirection="column" height={maxRows()} minHeight={0} overflow="hidden">
        <Show when={rows().length > 0} fallback={<text fg={theme.warning}>无法读取目录。</text>}>
          <For each={visibleRows()}>
            {(entry, index) => (
              <box backgroundColor={index() + scrollOffset() === selected() ? theme.primary : undefined} paddingLeft={1} gap={1}>
                <text fg={index() + scrollOffset() === selected() ? theme.selectedListItemText : theme.textMuted}>
                  {entry.kind === "current" ? "✓" : entry.kind === "parent" ? "↑" : entry.kind === "drive" ? "◆" : "▸"}
                </text>
                <text fg={index() + scrollOffset() === selected() ? theme.selectedListItemText : theme.text}>{entry.name}</text>
                <text fg={index() + scrollOffset() === selected() ? theme.selectedListItemText : theme.textMuted}>
                  {truncateDisplayMiddle(entry.path, Math.max(28, dimensions().width - 36))}
                </text>
              </box>
            )}
          </For>
        </Show>
      </box>
      <Show when={canScroll()}>
        <text fg={theme.textMuted}>
          {scrollOffset() + 1}-{Math.min(scrollOffset() + maxRows(), rows().length)}/{rows().length}，PageUp/PageDown 滚动。
        </text>
      </Show>
      <box border={["top"]} borderColor={theme.border} />
      <box flexDirection="row" gap={2}>
        <text fg={theme.text}>Enter 进入/选择</text>
        <text fg={theme.text}>Backspace 上级</text>
        <text fg={theme.text}>PageUp/PageDown 滚动</text>
        <text fg={theme.text}>Ctrl+S 选择当前目录</text>
      </box>
    </box>
  )
}
