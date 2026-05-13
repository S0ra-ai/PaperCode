import { Prompt, type PromptRef } from "@tui/component/prompt"
import { createEffect, createMemo, createSignal, onMount } from "solid-js"
import { useTerminalDimensions } from "@opentui/solid"
import { Logo } from "../component/logo"
import { useProject } from "../context/project"
import { useSync } from "../context/sync"
import { Toast } from "../ui/toast"
import { useArgs } from "../context/args"
import { useRoute, useRouteData } from "@tui/context/route"
import { usePromptRef } from "../context/prompt"
import { useLocal } from "../context/local"
import { TuiPluginRuntime } from "@/cli/cmd/tui/plugin/runtime"
import { useEditorContext } from "@tui/context/editor"
import { useSDK } from "@tui/context/sdk"
import { useToast } from "@tui/ui/toast"
import { submitPaperWorkbenchPrompt } from "./paper/workbench"
import { getPaperConversationWorkspace } from "@tui/util/paper-conversation-workspace"

let once = false
const placeholder = {
  normal: ["输入主题，或拖入论文、代码、数据"],
  shell: ["打开模型工作台", "检查环境与能力", "打开实时 Preview"],
}

export function Home() {
  const sync = useSync()
  const project = useProject()
  const route = useRouteData("home")
  const router = useRoute()
  const promptRef = usePromptRef()
  const [ref, setRef] = createSignal<PromptRef | undefined>()
  const args = useArgs()
  const local = useLocal()
  const editor = useEditorContext()
  const sdk = useSDK()
  const toast = useToast()
  const dimensions = useTerminalDimensions()
  let sent = false
  const panelWidth = createMemo(() => Math.min(Math.max(78, dimensions().width - 36), 96))

  onMount(() => {
    editor.clearSelection()
  })

  const bind = (r: PromptRef | undefined) => {
    setRef(r)
    promptRef.set(r)
    if (once || !r) return
    if (route.prompt) {
      r.set(route.prompt)
      once = true
      return
    }
    if (!args.prompt) return
    r.set({ input: args.prompt, parts: [] })
    once = true
  }

  // Wait for sync and model store to be ready before auto-submitting --prompt
  createEffect(() => {
    const r = ref()
    if (sent) return
    if (!r) return
    if (!sync.ready || !local.model.ready) return
    if (!args.prompt) return
    if (r.current.input !== args.prompt) return
    sent = true
    r.submit()
  })

  return (
    <>
      <box flexGrow={1} alignItems="center" paddingLeft={2} paddingRight={2}>
        <box flexGrow={1} minHeight={0} />
        <box height={4} minHeight={0} flexShrink={1} />
        <box flexShrink={0}>
          <TuiPluginRuntime.Slot name="home_logo" mode="replace">
            <Logo />
          </TuiPluginRuntime.Slot>
        </box>
        <box flexDirection="column" alignItems="center" maxWidth={panelWidth()} paddingTop={1} paddingBottom={1} flexShrink={0}>
          <text>你的私人专属研究助手</text>
        </box>
        <box height={1} minHeight={0} flexShrink={1} />
        <box width="100%" maxWidth={panelWidth()} zIndex={1000} paddingTop={1} flexShrink={0}>
          <TuiPluginRuntime.Slot
            name="home_prompt"
            mode="replace"
            workspace_id={project.workspace.current()}
            ref={bind}
          >
            <Prompt
              ref={bind}
              workspaceID={project.workspace.current()}
              right={<TuiPluginRuntime.Slot name="home_prompt_right" workspace_id={project.workspace.current()} />}
              placeholders={placeholder}
              onSubmitPrompt={async (prompt) => {
                const command = prompt.input.trim().split(/\s+/)[0]?.toLowerCase()
                if (command === "/models" || command === "/connect") {
                  router.navigate({ type: "paper-models" })
                  return true
                }
                if (command === "/folder" || command === "/workspace" || command === "/cwd") {
                  router.navigate({ type: "paper-folder" })
                  return true
                }
                if (command === "/resume") {
                  router.navigate({ type: "paper-resume" })
                  return true
                }
                try {
                  const conversationWorkspace = getPaperConversationWorkspace()
                  const result = await submitPaperWorkbenchPrompt({
                    baseUrl: sdk.url,
                    directory: sdk.directory,
                    fetch: sdk.fetch,
                    prompt: {
                      ...prompt,
                      workspace_path: conversationWorkspace ?? prompt.workspace_path ?? sdk.directory,
                      storage_scope: conversationWorkspace ? "workspace" : "home",
                    },
                  })
                  router.navigate({
                    type: "paper",
                    runID: result.runID,
                    snapshot: result.snapshot,
                  })
                  return true
                } catch (error) {
                  toast.show({
                    variant: "error",
                    message: error instanceof Error ? error.message : "PaperRun 创建失败",
                    duration: 5000,
                  })
                  return false
                }
              }}
            />
          </TuiPluginRuntime.Slot>
        </box>
        <TuiPluginRuntime.Slot name="home_bottom" />
        <box flexGrow={1} minHeight={0} />
        <Toast />
      </box>
      <box width="100%" flexShrink={0}>
        <TuiPluginRuntime.Slot name="home_footer" mode="single_winner" />
      </box>
    </>
  )
}
