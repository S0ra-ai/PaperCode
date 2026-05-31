import { TextAttributes } from "@opentui/core"
import { useTheme } from "../context/theme"
import { useDialog } from "../ui/dialog"
import { createStore } from "solid-js/store"
import { For } from "solid-js"
import { useKeyboard } from "@opentui/solid"

export function DialogSessionDeleteFailed(props: {
  session: string
  workspace: string
  onDelete?: () => boolean | void | Promise<boolean | void>
  onRestore?: () => boolean | void | Promise<boolean | void>
  onDone?: () => void
}) {
  const dialog = useDialog()
  const { theme } = useTheme()
  const [store, setStore] = createStore({
    active: "delete" as "delete" | "restore",
  })

  const options = [
    {
      id: "delete" as const,
      title: "删除工作区",
      description: "删除该工作区以及关联的 PaperRun。",
      run: props.onDelete,
    },
    {
      id: "restore" as const,
      title: "恢复到新工作区",
      description: "尝试将这个 PaperRun 恢复到新工作区。",
      run: props.onRestore,
    },
  ]

  async function confirm() {
    const result = await options.find((item) => item.id === store.active)?.run?.()
    if (result === false) return
    props.onDone?.()
    if (!props.onDone) dialog.clear()
  }

  useKeyboard((evt) => {
    if (evt.name === "return") {
      evt.preventDefault()
      evt.stopPropagation()
      void confirm()
    }
    if (evt.name === "left" || evt.name === "up") {
      setStore("active", "delete")
    }
    if (evt.name === "right" || evt.name === "down") {
      setStore("active", "restore")
    }
  })

  return (
    <box paddingLeft={2} paddingRight={2} gap={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text attributes={TextAttributes.BOLD} fg={theme.text}>
          PaperRun 删除失败
        </text>
        <text fg={theme.textMuted} onMouseUp={() => dialog.clear()}>
          esc
        </text>
      </box>
      <text fg={theme.textMuted} wrapMode="word">
        {`PaperRun "${props.session}" 无法删除，因为工作区 "${props.workspace}" 当前不可用。`}
      </text>
      <text fg={theme.textMuted} wrapMode="word">
        选择如何处理这个工作区恢复问题。
      </text>
      <box flexDirection="column" paddingBottom={1} gap={1}>
        <For each={options}>
          {(item) => (
            <box
              flexDirection="column"
              paddingLeft={1}
              paddingRight={1}
              paddingTop={1}
              paddingBottom={1}
              backgroundColor={item.id === store.active ? theme.primary : undefined}
              onMouseUp={() => {
                setStore("active", item.id)
                void confirm()
              }}
            >
              <text
                attributes={TextAttributes.BOLD}
                fg={item.id === store.active ? theme.selectedListItemText : theme.text}
              >
                {item.title}
              </text>
              <text fg={item.id === store.active ? theme.selectedListItemText : theme.textMuted} wrapMode="word">
                {item.description}
              </text>
            </box>
          )}
        </For>
      </box>
    </box>
  )
}
