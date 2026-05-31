import { createMemo } from "solid-js"
import { useSync } from "@tui/context/sync"
import { DialogSelect } from "@tui/ui/dialog-select"
import { useSDK } from "@tui/context/sdk"
import { useRoute } from "@tui/context/route"
import * as Clipboard from "@tui/util/clipboard"
import type { PromptInfo } from "@tui/component/prompt/history"
import { strip } from "@tui/component/prompt/part"

export function DialogMessage(props: {
  messageID: string
  sessionID: string
  setPrompt?: (prompt: PromptInfo) => void
}) {
  const sync = useSync()
  const sdk = useSDK()
  const message = createMemo(() => sync.data.message[props.sessionID]?.find((x) => x.id === props.messageID))
  const route = useRoute()

  return (
    <DialogSelect
      title="消息操作"
      options={[
        {
          title: "回退到此消息",
          value: "session.revert",
          description: "撤销此消息之后的消息和文件改动",
          onSelect: (dialog) => {
            const msg = message()
            if (!msg) return

            void sdk.client.session.revert({
              sessionID: props.sessionID,
              messageID: msg.id,
            })

            if (props.setPrompt) {
              const parts = sync.data.part[msg.id]
              const promptInfo = parts.reduce(
                (agg, part) => {
                  if (part.type === "text") {
                    if (!part.synthetic) agg.input += part.text
                  }
                  if (part.type === "file") agg.parts.push(strip(part))
                  return agg
                },
                { input: "", parts: [] as PromptInfo["parts"] },
              )
              props.setPrompt(promptInfo)
            }

            dialog.clear()
          },
        },
        {
          title: "复制消息",
          value: "message.copy",
          description: "复制消息文本到剪贴板",
          onSelect: async (dialog) => {
            const msg = message()
            if (!msg) return

            const parts = sync.data.part[msg.id]
            const text = parts.reduce((agg, part) => {
              if (part.type === "text" && !part.synthetic) {
                agg += part.text
              }
              return agg
            }, "")

            await Clipboard.copy(text)
            dialog.clear()
          },
        },
        {
          title: "创建分支",
          value: "session.fork",
          description: "创建 PaperRun 分支",
          onSelect: async (dialog) => {
            const result = await sdk.client.session.fork({
              sessionID: props.sessionID,
              messageID: props.messageID,
            })
            const msg = message()
            const prompt = msg
              ? sync.data.part[msg.id].reduce(
                  (agg, part) => {
                    if (part.type === "text") {
                      if (!part.synthetic) agg.input += part.text
                    }
                    if (part.type === "file") agg.parts.push(part)
                    return agg
                  },
                  { input: "", parts: [] as PromptInfo["parts"] },
                )
              : undefined
            route.navigate({
              sessionID: result.data!.id,
              type: "session",
              prompt,
            })
            dialog.clear()
          },
        },
      ]}
    />
  )
}
