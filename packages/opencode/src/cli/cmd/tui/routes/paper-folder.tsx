import { TextAttributes } from "@opentui/core"
import { useKeyboard, useTerminalDimensions } from "@opentui/solid"
import { createMemo, createResource, createSignal, For, Show } from "solid-js"
import { readdir, stat } from "fs/promises"
import { existsSync } from "fs"
import os from "os"
import path from "path"
import { useRoute } from "@tui/context/route"
import { useSDK } from "@tui/context/sdk"
import { useTheme } from "@tui/context/theme"
import { useToast } from "@tui/ui/toast"
import { getPaperConversationWorkspace, setPaperConversationWorkspace } from "@tui/util/paper-conversation-workspace"

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
  for (const child of children) {
    if (!child.isDirectory()) continue
    if (child.name === "node_modules" || child.name === ".git") continue
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
  const [entries] = createResource(current, directoryEntries)

  const rows = createMemo(() => entries() ?? [])
  const maxRows = createMemo(() => Math.max(8, dimensions().height - 10))

  function move(delta: number) {
    const count = rows().length
    if (count <= 0) return
    setSelected((index) => (index + delta + count) % count)
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
        <text fg={theme.text}>{current()}</text>
        <text fg={theme.textMuted}>Home：{os.homedir()}</text>
      </box>
      <box border={["top"]} borderColor={theme.border} />
      <box flexDirection="column" maxHeight={maxRows()} minHeight={0}>
        <Show when={rows().length > 0} fallback={<text fg={theme.warning}>无法读取目录。</text>}>
          <For each={rows().slice(0, maxRows())}>
            {(entry, index) => (
              <box backgroundColor={index() === selected() ? theme.primary : undefined} paddingLeft={1} gap={1}>
                <text fg={index() === selected() ? theme.selectedListItemText : theme.textMuted}>
                  {entry.kind === "current" ? "✓" : entry.kind === "parent" ? "↑" : entry.kind === "drive" ? "◆" : "▸"}
                </text>
                <text fg={index() === selected() ? theme.selectedListItemText : theme.text}>{entry.name}</text>
                <text fg={index() === selected() ? theme.selectedListItemText : theme.textMuted}>{entry.path}</text>
              </box>
            )}
          </For>
        </Show>
      </box>
      <box border={["top"]} borderColor={theme.border} />
      <box flexDirection="row" gap={2}>
        <text fg={theme.text}>Enter 进入/选择</text>
        <text fg={theme.text}>Backspace 上级</text>
        <text fg={theme.text}>Ctrl+S 选择当前目录</text>
      </box>
    </box>
  )
}
