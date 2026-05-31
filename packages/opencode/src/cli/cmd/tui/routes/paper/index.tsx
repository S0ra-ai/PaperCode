import { createEffect, createMemo, createSignal, onCleanup, onMount, Show } from "solid-js"
import open from "open"
import { useRouteData } from "@tui/context/route"
import { useSDK } from "@tui/context/sdk"
import { useTheme } from "@tui/context/theme"
import { useExit } from "@tui/context/exit"
import type { PaperRunSnapshot } from "@/paper/run"
import type { ResearchCapability } from "@/paper/capabilities"
import {
  createPaperRunDashboardState,
  fetchPaperRunSnapshot,
  fetchPaperWorkbenchCapabilities,
  fetchPaperWorkbenchDoctor,
  requestPaperWorkbenchExperimentProtocolRun,
  requestPaperWorkbenchExperimentStarterApply,
  requestPaperWorkbenchPreview,
  paperWorkbenchHealthFromDoctor,
  subscribePaperRunLiveMonitor,
  type PaperRunLiveMonitor,
  type PaperRunSidebarState,
  type PaperWorkbenchHealthInput,
} from "./workbench"

function numberRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function formatExitSummary(snapshot: PaperRunSnapshot) {
  const cost = numberRecord(snapshot.diagnostics.cost)
  const total = typeof cost.total_usd === "number" ? cost.total_usd : 0
  const tokens = snapshot.diagnostics.token_usage.total_tokens
  return [
    "PaperRun 退出摘要",
    `run UUID: ${snapshot.run_id}`,
    `状态: ${snapshot.status}`,
    `存储路径: ${snapshot.diagnostics.runtime_root}`,
    `token/cost: ${tokens.toLocaleString()} tokens / $${total.toFixed(4)}`,
    `Preview: ${snapshot.preview_state.status}`,
    `恢复命令: paper_fucker resume ${snapshot.run_id}`,
  ].join("\n")
}

function SidebarSection(props: { title: string; children: unknown }) {
  const { theme } = useTheme()
  return (
    <box flexDirection="column" gap={0} paddingBottom={1}>
      <text fg={theme.textMuted}>{props.title}</text>
      {props.children}
    </box>
  )
}

function PaperRunSidebar(props: { sidebar: PaperRunSidebarState }) {
  const { theme } = useTheme()
  return (
    <box
      backgroundColor={theme.backgroundPanel}
      width={42}
      height="100%"
      paddingTop={1}
      paddingBottom={1}
      paddingLeft={2}
      paddingRight={2}
      flexShrink={0}
    >
      <scrollbox flexGrow={1}>
        <box flexDirection="column" gap={1} paddingRight={1}>
          <text fg={theme.primary}>
            <span style={{ bold: true }}>运行侧栏</span>
          </text>

          <SidebarSection title="运行概览">
            <text>
              {props.sidebar.overview.current_stage_status} {props.sidebar.overview.current_stage}
            </text>
            <text fg={theme.textMuted}>{props.sidebar.overview.next_action}</text>
            <Show when={props.sidebar.overview.blockers.length > 0}>
              <text fg={theme.warning}>阻塞 {props.sidebar.overview.blockers.length}</text>
            </Show>
          </SidebarSection>

          <SidebarSection title="成本 / 上下文">
            <text>{props.sidebar.cost.formatted_total} spent</text>
            <text fg={theme.textMuted}>
              LLM {props.sidebar.cost.llm_usd.toFixed(4)} / API {props.sidebar.cost.api_usd.toFixed(4)}
            </text>
            <text fg={theme.textMuted}>{props.sidebar.cost.last_call_tokens.toLocaleString()} tokens last call</text>
            <text fg={theme.textMuted}>
              {props.sidebar.cost.total_tokens.toLocaleString()} tokens total
              {props.sidebar.cost.context_percent === undefined ? "" : ` / ${props.sidebar.cost.context_percent}% context`}
            </text>
          </SidebarSection>

          <SidebarSection title="大纲">
            <text fg={theme.textMuted}>source: {props.sidebar.outline.source}</text>
            {props.sidebar.outline.items.slice(0, 5).map((item) => (
              <text>
                {item.status} {item.label}
              </text>
            ))}
            <Show when={props.sidebar.outline.missing_sections.length > 0}>
              <text fg={theme.warning}>缺失 {props.sidebar.outline.missing_sections.join(", ")}</text>
            </Show>
          </SidebarSection>

          <SidebarSection title="Agent Tree">
            <text>
              {props.sidebar.agent_tree.total_agents} agents / depth {props.sidebar.agent_tree.max_depth_observed}
            </text>
            <text fg={theme.textMuted}>
              {props.sidebar.agent_tree.depth_policy}, parallel {props.sidebar.agent_tree.max_parallel}
            </text>
            {props.sidebar.agent_tree.recent_agents.map((agent) => (
              <text fg={agent.status === "blocked" ? theme.warning : theme.textMuted}>
                d{agent.depth} {agent.role} {agent.status}
              </text>
            ))}
          </SidebarSection>

          <SidebarSection title="Agent Team">
            <text>
              {props.sidebar.agent_team.total_members} members / depth {props.sidebar.agent_team.max_member_depth}
            </text>
            <text fg={theme.textMuted}>
              queued {props.sidebar.agent_team.queued_tasks} / active {props.sidebar.agent_team.active_tasks} / unread{" "}
              {props.sidebar.agent_team.unread_messages}
            </text>
            {props.sidebar.agent_team.recent_tasks.map((task) => (
              <text fg={task.status === "blocked" ? theme.warning : theme.textMuted}>
                {task.status} {task.title}
              </text>
            ))}
          </SidebarSection>

          <SidebarSection title="Memory / Code">
            <text>
              memory {props.sidebar.knowledge.memory_entries} / redacted {props.sidebar.knowledge.redacted_memory}
            </text>
            <text fg={theme.textMuted}>
              files {props.sidebar.knowledge.code_files} / symbols {props.sidebar.knowledge.code_symbols} / surfaces{" "}
              {props.sidebar.knowledge.experiment_surfaces}
            </text>
          </SidebarSection>

          <SidebarSection title="机器">
            <text>{props.sidebar.machine.os}</text>
            <text fg={theme.textMuted}>{props.sidebar.machine.cpu}</text>
            <text fg={theme.textMuted}>内存 {props.sidebar.machine.memory}</text>
            <Show when={props.sidebar.machine.disk}>
              {(disk) => <text fg={theme.textMuted}>磁盘 {disk()}</text>}
            </Show>
            <text fg={props.sidebar.machine.gpu_mode === "CPU-only" ? theme.warning : theme.text}>
              GPU {props.sidebar.machine.gpu_mode}
            </text>
            <Show when={props.sidebar.machine.gpu_devices.length > 0}>
              {props.sidebar.machine.gpu_devices.slice(0, 3).map((device) => (
                <text fg={theme.textMuted}>{device}</text>
              ))}
            </Show>
            <Show when={props.sidebar.machine.gpu_tools.length > 0}>
              {props.sidebar.machine.gpu_tools.slice(0, 2).map((tool) => (
                <text fg={tool.includes("缺失") ? theme.warning : theme.textMuted}>{tool}</text>
              ))}
            </Show>
            <Show when={props.sidebar.machine.runtime_tools.length > 0}>
              <text fg={theme.textMuted}>运行时</text>
              {props.sidebar.machine.runtime_tools.slice(0, 4).map((tool) => (
                <text fg={theme.textMuted}>{tool}</text>
              ))}
            </Show>
            <Show when={props.sidebar.machine.compiler_tools.length > 0}>
              <text fg={theme.textMuted}>编译器</text>
              {props.sidebar.machine.compiler_tools.slice(0, 4).map((tool) => (
                <text fg={theme.textMuted}>{tool}</text>
              ))}
            </Show>
            <Show when={props.sidebar.machine.virtualization_tools.length > 0}>
              <text fg={theme.textMuted}>容器 / 虚拟化</text>
              {props.sidebar.machine.virtualization_tools.slice(0, 4).map((tool) => (
                <text fg={tool.includes("缺失") ? theme.warning : theme.textMuted}>{tool}</text>
              ))}
            </Show>
            <Show when={props.sidebar.machine.optional_missing_tools.length > 0}>
              <text fg={theme.warning}>可选缺失 {props.sidebar.machine.optional_missing_tools.slice(0, 5).join(", ")}</text>
            </Show>
            <text fg={theme.textMuted}>run root {props.sidebar.machine.run_root}</text>
            <text fg={theme.textMuted}>
              可用 {props.sidebar.machine.available} / 可选缺失 {props.sidebar.machine.optional_missing} / 阻断{" "}
              {props.sidebar.machine.blocked}
            </text>
          </SidebarSection>

          <SidebarSection title="Gate">
            <text fg={props.sidebar.gate.status === "blocked" ? theme.error : theme.text}>
              {props.sidebar.gate.status_label} / export {props.sidebar.gate.export_status}
            </text>
            <text fg={theme.textMuted}>reproduction {props.sidebar.gate.reproduction_gate}</text>
            {props.sidebar.gate.failed_checks.slice(0, 4).map((check) => (
              <text fg={theme.warning}>{check}</text>
            ))}
            <Show when={props.sidebar.gate.experiment_guidance}>
              {(guidance) => (
                <box flexDirection="column" gap={0}>
                  <text fg={theme.warning}>实验协议待补齐</text>
                  <text fg={theme.textMuted}>{guidance().summary}</text>
                  {guidance()
                    .suggestions.slice(0, 3)
                    .map((item) => (
                      <text fg={item.severity === "blocking" ? theme.error : theme.warning}>
                        {item.recommended_script || item.gap}
                      </text>
                    ))}
                </box>
              )}
            </Show>
            <Show when={props.sidebar.gate.experiment_starter_pack}>
              {(starter) => (
                <box flexDirection="column" gap={0}>
                  <text fg={theme.primary}>Starter Pack</text>
                  <text fg={theme.textMuted}>{starter().summary}</text>
                  {starter()
                    .files.slice(0, 3)
                    .map((file) => (
                      <text fg={theme.textMuted}>{file}</text>
                    ))}
                </box>
              )}
            </Show>
          </SidebarSection>

          <SidebarSection title="调用诊断">
            <Show
              when={props.sidebar.diagnostics.recent_calls.length > 0}
              fallback={<text fg={theme.textMuted}>暂无 tool/model 调用</text>}
            >
              {props.sidebar.diagnostics.recent_calls.map((call) => (
                <text fg={call.status === "failed" ? theme.error : theme.textMuted}>
                  {call.status} {call.name}
                </text>
              ))}
            </Show>
          </SidebarSection>
        </box>
      </scrollbox>
    </box>
  )
}

export function PaperRunDashboard() {
  const route = useRouteData("paper")
  const sdk = useSDK()
  const { theme } = useTheme()
  const exit = useExit()
  const [snapshot, setSnapshot] = createSignal<PaperRunSnapshot | undefined>(route.snapshot)
  const [capabilities, setCapabilities] = createSignal<ResearchCapability[]>([])
  const [health, setHealth] = createSignal<PaperWorkbenchHealthInput>({})
  const [error, setError] = createSignal<string>()
  const [notice, setNotice] = createSignal<string>()
  const [previewOpened, setPreviewOpened] = createSignal(false)
  let monitor: PaperRunLiveMonitor | undefined

  onMount(() => {
    monitor = subscribePaperRunLiveMonitor({
      baseUrl: sdk.url,
      directory: sdk.directory,
      fetch: sdk.fetch,
      runID: route.runID,
      onSnapshot: setSnapshot,
      onError: (cause) => setError(cause.message),
    })
    if (snapshot()) return
    void fetchPaperRunSnapshot({
      baseUrl: sdk.url,
      directory: sdk.directory,
      fetch: sdk.fetch,
      runID: route.runID,
    })
      .then(setSnapshot)
      .catch((cause) => setError(cause instanceof Error ? cause.message : "PaperRun 读取失败"))
  })

  onCleanup(() => monitor?.close())

  onMount(() => {
    void fetchPaperWorkbenchCapabilities({
      baseUrl: sdk.url,
      directory: sdk.directory,
      fetch: sdk.fetch,
    })
      .then((payload) => setCapabilities(payload.capabilities))
      .catch(() => setCapabilities([]))

    void fetchPaperWorkbenchDoctor({
      baseUrl: sdk.url,
      directory: sdk.directory,
      fetch: sdk.fetch,
    })
      .then((payload) => setHealth(paperWorkbenchHealthFromDoctor(payload)))
      .catch(() => setHealth({}))
  })

  createEffect(() => {
    const value = snapshot()
    if (!value || previewOpened() || value.preview_state.status !== "ready") return
    setPreviewOpened(true)
    void requestPaperWorkbenchPreview({
      baseUrl: sdk.url,
      directory: sdk.directory,
      fetch: sdk.fetch,
      runID: value.run_id,
      openUrl: (url) => {
        void open(url).catch(() => {})
      },
    }).catch((cause) => setError(cause instanceof Error ? cause.message : "PaperRun Preview 打开失败"))
  })

  createEffect(() => {
    const value = snapshot()
    if (!value) return
    const restore = exit.message.set(formatExitSummary(value))
    onCleanup(restore)
  })

  const state = createMemo(() => {
    const value = snapshot()
    if (!value) return
    return createPaperRunDashboardState(value, {
      capabilities: capabilities(),
      health: health(),
    })
  })

  return (
    <box flexDirection="column" width="100%" height="100%" paddingX={2} paddingY={1} gap={1}>
      <box flexDirection="row" justifyContent="space-between">
        <box flexDirection="column">
          <text fg={theme.primary}>
            <span style={{ bold: true }}>PaperRun 论文工作台</span>
          </text>
          <text fg={theme.textMuted}>{route.runID}</text>
        </box>
        <box flexDirection="row" gap={2}>
          <text fg={theme.textMuted}>Preview</text>
          <text fg={theme.textMuted}>Export</text>
          <text fg={theme.textMuted}>MCP/Skills</text>
        </box>
      </box>

      <Show when={error()}>{(message) => <text fg={theme.error}>{message()}</text>}</Show>
      <Show when={notice()}>{(message) => <text fg={theme.accent}>{message()}</text>}</Show>

      <Show when={state()} fallback={<text fg={theme.textMuted}>正在读取 PaperRun...</text>}>
        {(view) => (
          <box flexDirection="row" gap={2} flexGrow={1} minHeight={0}>
            <box flexDirection="column" gap={1} flexGrow={1} minHeight={0}>
              <box flexDirection="column" gap={1}>
                <text>
                  <span style={{ bold: true }}>{view().title}</span>
                </text>
                <box flexDirection="row" gap={2} flexWrap="wrap">
                  <text fg={theme.textMuted}>控制器</text>
                  <text fg={theme.primary}>{view().controller_status.label}</text>
                  <text fg={theme.textMuted}>待处理指导 {view().controller_status.pending_guidance}</text>
                </box>
                <box flexDirection="row" gap={2} flexWrap="wrap">
                  {view().controls.map((control) => (
                    <text
                      fg={control.enabled ? (control.danger ? theme.error : theme.accent) : theme.textMuted}
                      onMouseUp={() => {
                        if (!control.enabled) return
                        const action =
                          control.kind === "experiment_starter"
                            ? requestPaperWorkbenchExperimentStarterApply({
                                baseUrl: sdk.url,
                                directory: sdk.directory,
                                fetch: sdk.fetch,
                                runID: route.runID,
                              })
                            : control.kind === "experiment_run"
                              ? requestPaperWorkbenchExperimentProtocolRun({
                                  baseUrl: sdk.url,
                                  directory: sdk.directory,
                                  fetch: sdk.fetch,
                                  runID: route.runID,
                                })
                              : undefined
                        if (!action) return
                        void action
                          .then((result) => {
                            setError(undefined)
                            setNotice(result.message)
                          })
                          .catch((cause) => {
                            setNotice(undefined)
                            setError(cause instanceof Error ? cause.message : "PaperRun 操作失败")
                          })
                      }}
                    >
                      {control.label}
                    </text>
                  ))}
                </box>
              </box>

              <box flexDirection="row" gap={2} flexWrap="wrap">
                {view().panels.map((panel) => (
                  <box border={["left"]} borderColor={theme.border} paddingX={1} paddingY={0}>
                    <text>
                      {panel.label}
                      {panel.count === undefined ? "" : ` ${panel.count}`}
                    </text>
                  </box>
                ))}
              </box>

              <box flexDirection="column" gap={0}>
                <text fg={theme.textMuted}>研究闭环</text>
                <box flexDirection="row" gap={2} flexWrap="wrap">
                  <text>查新</text>
                  <text fg={view().research_closure.novelty_conflicts > 0 ? theme.warning : theme.textMuted}>
                    {view().research_closure.novelty_status} / conflicts {view().research_closure.novelty_conflicts}
                  </text>
                  <text>论文脊梁</text>
                  <text fg={view().research_closure.spine_readiness === "ready" ? theme.accent : theme.textMuted}>
                    {view().research_closure.spine_readiness}
                  </text>
                  <text>全局图</text>
                  <text fg={view().research_closure.global_figure_status === "ready" ? theme.accent : theme.textMuted}>
                    {view().research_closure.global_figure_status} / panels {view().research_closure.global_figure_panels}
                  </text>
                </box>
              </box>

              <box flexDirection="column" gap={0}>
                <text fg={theme.textMuted}>阶段图</text>
                {view().stage_graph.map((stage) => (
                  <box flexDirection="row" gap={2}>
                    <text fg={stage.status === "blocked" ? theme.error : theme.text}>{stage.status_label}</text>
                    <text>{stage.label}</text>
                  </box>
                ))}
              </box>

              <box flexDirection="column" gap={0}>
                <text fg={theme.textMuted}>模型工作台</text>
                <box flexDirection="row" gap={2}>
                  <text>主决策模型</text>
                  <text fg={theme.textMuted}>{view().model_workbench.decision_model ?? "未配置"}</text>
                </box>
                <box flexDirection="row" gap={2}>
                  <text>允许模型</text>
                  <text fg={theme.textMuted}>
                    {view().model_workbench.allowed_models}/{view().model_workbench.candidates}
                  </text>
                </box>
                <Show when={view().model_workbench.recent_decision}>
                  <box flexDirection="row" gap={2}>
                    <text>最近选择</text>
                    <text fg={theme.textMuted}>{view().model_workbench.recent_decision}</text>
                  </box>
                </Show>
              </box>

              <box flexDirection="column" gap={0}>
                <text fg={theme.textMuted}>阶段模型</text>
                {view().model_roles.map((role) => (
                  <box flexDirection="row" gap={2}>
                    <text>{role.label}</text>
                    <text fg={theme.textMuted}>{role.provider_model}</text>
                  </box>
                ))}
              </box>

              <box flexDirection="column" gap={0}>
                <text fg={theme.textMuted}>环境与能力</text>
                {view().environment_status.map((item) => (
                  <box flexDirection="row" gap={2}>
                    <text>{item.label}</text>
                    <text fg={item.status === "blocked" ? theme.error : item.status === "optional_missing" ? theme.warning : theme.textMuted}>
                      {item.status === "available" ? "可用" : item.status === "blocked" ? "需配置" : "可选缺失"}
                    </text>
                    <text fg={theme.textMuted}>{item.message}</text>
                  </box>
                ))}
              </box>

              <box flexDirection="column" gap={0}>
                <text fg={theme.textMuted}>实验环境</text>
                <box flexDirection="row" gap={2} flexWrap="wrap">
                  <text fg={view().experiment_environment.status === "blocked" ? theme.error : theme.accent}>
                    {view().experiment_environment.status_label}
                  </text>
                  <text fg={theme.textMuted}>{view().experiment_environment.gpu_mode}</text>
                  <text fg={theme.textMuted}>{view().experiment_environment.cpu}</text>
                </box>
                <text fg={theme.textMuted}>工作区 {view().experiment_environment.workspace}</text>
                <box flexDirection="row" gap={2} flexWrap="wrap">
                  {view().experiment_environment.groups.map((group) => (
                    <text fg={group.status === "blocked" || group.status === "missing" ? theme.error : group.status === "optional_missing" ? theme.warning : theme.textMuted}>
                      {group.label} {group.status_label} {group.available}/{group.tools.length}
                    </text>
                  ))}
                </box>
              </box>

              <Show when={view().capability_health.length > 0}>
                <box flexDirection="column" gap={0}>
                  <text fg={theme.textMuted}>MCP / Skill / 工具链健康</text>
                  {view().capability_health.map((item) => (
                    <box flexDirection="row" gap={2}>
                      <text>{item.label}</text>
                      <text fg={item.status === "missing" || item.status === "disabled" ? theme.warning : theme.textMuted}>
                        {item.status_label}
                      </text>
                    </box>
                  ))}
                </box>
              </Show>

              <Show when={view().pause_questions.length > 0}>
                <box flexDirection="column" gap={0}>
                  <text fg={theme.warning}>Pause Questions</text>
                  {view().pause_questions.map((question) => (
                    <text>{question.message}</text>
                  ))}
                </box>
              </Show>
            </box>
            <PaperRunSidebar sidebar={view().sidebar} />
          </box>
        )}
      </Show>
    </box>
  )
}
