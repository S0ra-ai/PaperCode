import { Prompt, type PromptRef } from "@tui/component/prompt"
import { createEffect, createSignal, onMount } from "solid-js"
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

let once = false
const placeholder = {
  normal: [
    "输入论文主题，例如：低资源场景下的多智能体研究工作流评估",
    "输入代码路径和主题，例如：--code . 写一篇系统论文",
    "拖入论文材料、数据集或实验日志，生成可审查论文 bundle",
  ],
  shell: ["paper_fucker doctor", "paper_fucker skills list", "paper_fucker mcp add exa --url https://mcp.exa.ai/mcp"],
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
  let sent = false

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
        <box flexDirection="column" alignItems="center" maxWidth={75} paddingTop={1} paddingBottom={1} flexShrink={0}>
          <text>paper_fucker 论文工作台</text>
          <text>主题 / 代码路径 / 论文材料 / 数据集 / 实验日志</text>
          <text>MCP · Skills · Provider Roles · Preview · Export</text>
        </box>
        <box height={1} minHeight={0} flexShrink={1} />
        <box width="100%" maxWidth={75} zIndex={1000} paddingTop={1} flexShrink={0}>
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
                try {
                  const result = await submitPaperWorkbenchPrompt({
                    baseUrl: sdk.url,
                    directory: sdk.directory,
                    fetch: sdk.fetch,
                    prompt,
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
