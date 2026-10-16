import { TextAttributes } from "@opentui/core"
import { useKeyboard, useTerminalDimensions } from "@opentui/solid"
import { createMemo, createResource, createSignal, For, Show } from "solid-js"
import type { PaperRunHistoryEntry, PaperRunSnapshot } from "@/paper/run"
import { useRoute } from "@tui/context/route"
import { useSDK } from "@tui/context/sdk"
import { useTheme } from "@tui/context/theme"
import { useToast } from "@tui/ui/toast"
import { readTuiJsonResponse } from "@tui/util/http"
import { truncateDisplayMiddle } from "@tui/util/text-width"

function apiUrl(baseUrl: string, path: string) {
  return new URL(path, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).toString()
}

function paperHeaders(directory?: string, json = false) {
  return {
    ...(json ? { "content-type": "application/json" } : {}),
    ...(directory ? { "x-papercode-directory": directory } : {}),
  }
}

function statusLabel(status: PaperRunHistoryEntry["status"]) {
  switch (status) {
    case "running":
      return "运行中"
    case "succeeded":
      return "已完成"
    case "blocked":
      return "已暂停"
    case "failed":
      return "失败"
    case "cancelled":
      return "已取消"
    default:
      return "已初始化"
  }
}

export function PaperResumePage() {
  const sdk = useSDK()
  const router = useRoute()
  const toast = useToast()
  const { theme } = useTheme()
  const dimensions = useTerminalDimensions()
  const [filter, setFilter] = createSignal("")
  const [selected, setSelected] = createSignal(0)

  const [runs, { refetch }] = createResource(async () => {
    const response = await sdk.fetch(apiUrl(sdk.url, "paper/runs"), {
      headers: paperHeaders(sdk.directory),
    })
    const payload = await readTuiJsonResponse<{ runs?: PaperRunHistoryEntry[] }>(response, "PaperRun 历史读取失败")
    return payload.runs ?? []
  })

  const filtered = createMemo(() => {
    const query = filter().trim().toLowerCase()
    const list = runs() ?? []
    if (!query) return list
    return list.filter((run) =>
      [run.run_id, run.topic, run.workspace, run.status, run.storage_scope].some((value) =>
        value.toLowerCase().includes(query),
      ),
    )
  })

  const visibleRuns = createMemo(() => filtered().slice(0, Math.max(1, dimensions().height - 10)))

  function move(delta: number) {
    const max = Math.max(0, visibleRuns().length - 1)
    setSelected((value) => Math.min(max, Math.max(0, value + delta)))
  }

  async function resumeSelected() {
    const run = visibleRuns()[selected()]
    if (!run) return
    try {
      const response = await sdk.fetch(apiUrl(sdk.url, `paper/runs/${encodeURIComponent(run.run_id)}/resume`), {
        method: "POST",
        headers: paperHeaders(sdk.directory, true),
      })
      const payload = await readTuiJsonResponse<{ run?: PaperRunSnapshot }>(response, "PaperRun 恢复失败")
      if (!payload.run?.run_id) throw new Error("PaperRun 恢复响应缺少 run_id。")
      router.navigate({ type: "paper", runID: payload.run.run_id, snapshot: payload.run })
    } catch (error) {
      toast.show({
        variant: "error",
        message: error instanceof Error ? error.message : "PaperRun 恢复失败",
        duration: 5000,
      })
    }
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
      void resumeSelected()
      evt.preventDefault()
      return
    }
    if (evt.ctrl && evt.name === "r") {
      void refetch()
      evt.preventDefault()
      return
    }
    if (evt.name === "backspace") {
      setFilter((value) => value.slice(0, -1))
      setSelected(0)
      evt.preventDefault()
      return
    }
    if (!evt.ctrl && evt.name.length === 1) {
      setFilter((value) => `${value}${evt.name}`)
      setSelected(0)
      evt.preventDefault()
    }
  })

  return (
    <box width="100%" height="100%" paddingLeft={3} paddingRight={3} paddingTop={2} paddingBottom={1} flexDirection="column" gap={1}>
      <box flexDirection="row" justifyContent="space-between">
        <box flexDirection="column">
          <text fg={theme.text} attributes={TextAttributes.BOLD}>恢复 PaperRun</text>
          <text fg={theme.textMuted}>按 run id、主题、状态或工作区筛选。</text>
        </box>
        <text fg={theme.textMuted}>Enter 恢复 · Ctrl+R 刷新 · Esc 返回</text>
      </box>
      <box border={["top"]} borderColor={theme.border} />
      <box flexDirection="row" gap={1}>
        <text fg={theme.accent}>筛选</text>
        <text fg={theme.text}>{filter() || "无"}</text>
      </box>
      <box flexDirection="column" minHeight={0} flexGrow={1} overflow="hidden">
        <Show when={!runs.loading} fallback={<text fg={theme.textMuted}>正在读取 PaperRun 历史...</text>}>
          <Show when={visibleRuns().length > 0} fallback={<text fg={theme.warning}>没有匹配的 PaperRun。</text>}>
            <For each={visibleRuns()}>
              {(run, index) => (
                <box flexDirection="column" paddingLeft={1} paddingRight={1} paddingTop={1} backgroundColor={index() === selected() ? theme.primary : undefined}>
                  <box flexDirection="row" gap={1}>
                    <text fg={index() === selected() ? theme.selectedListItemText : theme.textMuted}>{index() === selected() ? ">" : " "}</text>
                    <text fg={index() === selected() ? theme.selectedListItemText : theme.text}>{run.run_id}</text>
                    <text fg={index() === selected() ? theme.selectedListItemText : theme.textMuted}>{statusLabel(run.status)}</text>
                    <text fg={index() === selected() ? theme.selectedListItemText : theme.textMuted}>{run.updated_at}</text>
                  </box>
                  <text fg={index() === selected() ? theme.selectedListItemText : theme.text}>
                    {truncateDisplayMiddle(run.topic, Math.max(24, dimensions().width - 12))}
                  </text>
                  <text fg={index() === selected() ? theme.selectedListItemText : theme.textMuted}>
                    {run.storage_scope} · {truncateDisplayMiddle(run.workspace, Math.max(24, dimensions().width - 12))}
                  </text>
                </box>
              )}
            </For>
          </Show>
        </Show>
      </box>
    </box>
  )
}
