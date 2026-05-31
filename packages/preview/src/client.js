let token = ""
let currentSnapshot

function el(id) {
  if (typeof document === "undefined") return undefined
  return document.getElementById(id)
}

function text(id, value) {
  const element = el(id)
  if (element) element.textContent = value
}

function html(id, value) {
  const element = el(id)
  if (element) element.innerHTML = value
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}

function badge(value) {
  const normalized = String(value ?? "unknown")
  const tone = /blocked|failed|error|redirect/.test(normalized)
    ? "bad"
    : /warning|review|needs|pending/.test(normalized)
      ? "warn"
      : /passed|ready|succeeded|clear|live/.test(normalized)
        ? "good"
        : "muted"
  return `<span class="badge ${tone}">${escapeHtml(normalized)}</span>`
}

function formatResourceValue(value, suffix) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return "未采集"
  if (numeric === 0) return `0${suffix}`
  return `${numeric.toFixed(4).replace(/\.?0+$/, "")}${suffix}`
}

function experimentRunResources(run) {
  return [
    `mem ${formatResourceValue(run.peak_memory_mb, "MB")}`,
    `gpu ${formatResourceValue(run.gpu_hours, " GPU h")}`,
    Number.isFinite(Number(run.cost_usd)) ? `cost $${Number(run.cost_usd).toFixed(4)}` : undefined,
  ].filter(Boolean).join(" · ")
}

function artifact(snapshot, kind) {
  const item = snapshot.artifacts[kind]
  if (!item) return `<div class="empty">尚未生成 ${kind} artifact。</div>`
  if (item.url) return `<a href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(item.path || item.url)}</a>`
  if (item.path) return `<code>${escapeHtml(item.path)}</code><p>${escapeHtml(item.mime_type)}</p>`
  return `<pre>${escapeHtml(item.content || "Artifact pending.")}</pre>`
}

function renderAnnotations(snapshot) {
  if (!snapshot.annotations.length) return `<div class="empty">暂无 annotation。</div>`
  return snapshot.annotations
    .map(
      (item) => `<section class="annotation ${escapeHtml(item.severity)}">
        <strong>${escapeHtml(item.kind)}</strong>
        <p>${escapeHtml(item.message)}</p>
        <small>${escapeHtml(item.source?.label || "run")}${item.source?.line_start ? `:${item.source.line_start}` : ""}</small>
      </section>`,
    )
    .join("")
}

export function renderLedgerPane(snapshot) {
  const ledger = snapshot.monitor?.ledger
  if (!ledger) return renderAnnotations(snapshot)
  const sources = ledger.sources ?? []
  const claims = ledger.claims ?? []
  if (!sources.length && !claims.length) return `<div class="empty">Source Ledger / Claim Ledger 尚未同步。</div>`
  return `<div class="ledger-board">
    <section class="ledger-column">
      <h3>Source Ledger</h3>
      ${
        sources.length
          ? sources
              .slice(0, 80)
              .map(
                (source) => `<article class="list-row">
                  <div>${badge(source.kind)} <strong>${escapeHtml(source.source_id)}</strong></div>
                  <p>${escapeHtml(source.title)}</p>
                  <small>${escapeHtml(source.locator)} · ${escapeHtml(source.created_at)}</small>
                </article>`,
              )
              .join("")
          : `<div class="empty">暂无 source。</div>`
      }
    </section>
    <section class="ledger-column">
      <h3>Claim Ledger</h3>
      ${
        claims.length
          ? claims
              .slice(0, 80)
              .map(
                (claim) => `<article class="list-row">
                  <div>${badge(claim.status)} <strong>${escapeHtml(claim.claim_id)}</strong></div>
                  <p>${escapeHtml(claim.text)}</p>
                  <small>confidence ${escapeHtml(Number(claim.confidence ?? 0).toFixed(2))} · sources ${escapeHtml(
                    (claim.source_ids ?? []).join(", ") || "none",
                  )} · artifacts ${escapeHtml((claim.artifact_ids ?? []).join(", ") || "none")}</small>
                </article>`,
              )
              .join("")
          : `<div class="empty">暂无 claim。</div>`
      }
    </section>
  </div>`
}

function renderStageGraph(monitor) {
  const stages = monitor?.stage_graph ?? []
  if (!stages.length) return `<div class="empty">Stage graph 尚未同步。</div>`
  return stages
    .map(
      (stage) => `<section class="stage ${escapeHtml(stage.status)}">
        <div>${badge(stage.status)}</div>
        <strong>${escapeHtml(stage.label || stage.id)}</strong>
        <small>${escapeHtml(stage.summary || stage.id)}</small>
      </section>`,
    )
    .join("")
}

function renderTimeline(monitor) {
  const timeline = monitor?.timeline ?? []
  if (!timeline.length) return `<div class="empty">暂无事件。</div>`
  return timeline
    .map(
      (item) => `<div class="timeline-item">
        <time>${escapeHtml(item.at)}</time>
        <strong>${escapeHtml(item.label || item.type)}</strong>
        <span>${escapeHtml(item.detail || item.type)}</span>
      </div>`,
    )
    .join("")
}

function renderNovelty(monitor) {
  const checkpoints = monitor?.novelty?.checkpoints ?? []
  if (!checkpoints.length) return `<div class="empty">查新检查点尚未生成。</div>`
  return checkpoints
    .map(
      (item) => `<section class="list-row">
        <div>${badge(item.status)} <strong>${escapeHtml(item.stage)}</strong></div>
        <p>${escapeHtml(item.summary)}</p>
        <small>conflicts ${item.conflicts} · ${escapeHtml(item.id)}</small>
      </section>`,
    )
    .join("")
}

function renderNoveltyGate(monitor) {
  const gate = monitor?.novelty?.experiment_gate
  if (!gate) return `<div class="empty">实验查新 gate 尚未执行。</div>`
  return `<div class="metric-stack">
    ${badge(gate.status)}
    <p>${escapeHtml(gate.reason)}</p>
    <small>expensive experiments: ${gate.allowed ? "allowed" : "blocked/review"}</small>
  </div>`
}

function renderSpine(monitor) {
  const spine = monitor?.paper_spine
  if (!spine) return `<div class="empty">PaperSpine 尚未生成。</div>`
  return `<div class="spine">
    <p>${badge(spine.readiness)}</p>
    <h3>${escapeHtml(spine.central_claim)}</h3>
    <div class="columns">
      <section><h4>Motivation</h4>${spine.motivation_chain.map((item) => `<p>${escapeHtml(item)}</p>`).join("")}</section>
      <section><h4>Contribution</h4>${spine.contribution_chain.map((item) => `<p>${escapeHtml(item)}</p>`).join("")}</section>
    </div>
  </div>`
}

function renderFigure(monitor) {
  const figure = monitor?.global_figure
  if (!figure) return `<div class="empty">全局图计划尚未生成。</div>`
  return `<div class="figure-board">
    <p>${badge(figure.status)} ${escapeHtml(figure.title)}</p>
    <div class="panel-grid">
      ${figure.panels
        .map(
          (panel) => `<section class="figure-panel">
            <strong>${escapeHtml(panel.id)} · ${escapeHtml(panel.title)}</strong>
            <p>${escapeHtml(panel.purpose)}</p>
            <small>evidence refs ${panel.evidence_refs}</small>
          </section>`,
        )
        .join("")}
    </div>
  </div>`
}

function renderFigureChecks(monitor) {
  const checks = monitor?.global_figure?.checks ?? []
  if (!checks.length) return `<div class="empty">暂无图表检查。</div>`
  return checks
    .map(
      (check) => `<section class="list-row">
        ${badge(check.status)}
        <p>${escapeHtml(check.message)}</p>
        <small>${escapeHtml(check.id)}</small>
      </section>`,
    )
    .join("")
}

export function renderModelRoutingPane(monitor) {
  const decisions = monitor?.model_routing ?? []
  if (!decisions.length) return `<div class="empty">模型路由决策尚未同步。</div>`
  return `<div class="model-routing-board">
    ${decisions
      .slice()
      .reverse()
      .map(
        (decision) => `<article class="list-row model-routing-decision">
          <div>${badge(decision.source)} <strong>${escapeHtml(decision.role)}</strong></div>
          <p>${escapeHtml(decision.selected_model || "未选择模型")}</p>
          <small>stage ${escapeHtml(decision.stage || "auto")} · candidates ${escapeHtml(
            decision.candidate_count,
          )} · allowed ${escapeHtml(decision.allowed_model_count)} · ${escapeHtml(decision.created_at)}</small>
          <p>${escapeHtml(decision.reason)}</p>
          ${
            decision.decision_model
              ? `<small>decision model ${escapeHtml(decision.decision_model)}</small>`
              : ""
          }
          ${
            decision.diagnostics?.length
              ? `<small>diagnostics ${decision.diagnostics.map(escapeHtml).join(", ")}</small>`
              : ""
          }
        </article>`,
      )
      .join("")}
  </div>`
}

function renderGate(snapshot) {
  const gate = snapshot.monitor?.gate
  const guidance = snapshot.monitor?.experiment_guidance
  const starter = snapshot.monitor?.experiment_starter_pack
  const machine = snapshot.monitor?.machine_environment
  const experimentEnvironment = snapshot.monitor?.experiment_environment
  return `<div class="metric-stack">
    ${badge(gate?.status || snapshot.render.state)}
    <p>failed checks: ${(gate?.failed_checks ?? []).map(escapeHtml).join(", ") || "none"}</p>
    <p>render: ${escapeHtml(snapshot.render.state)}${snapshot.render.stage ? ` / ${escapeHtml(snapshot.render.stage)}` : ""}</p>
    ${
      experimentEnvironment
        ? renderExperimentEnvironment(experimentEnvironment)
        : ""
    }
    ${
      !experimentEnvironment &&
      machine
        ? `<section class="list-row">
            <div>${badge(machine.status)} <strong>机器与实验环境</strong></div>
            <p>${escapeHtml(machine.os)} · ${escapeHtml(machine.cpu)}</p>
            <small>${escapeHtml(machine.gpu.mode === "gpu" ? "GPU" : "CPU-only")} · optional missing ${escapeHtml(machine.optional_missing)} · blocked ${escapeHtml(machine.blocked)}</small>
          </section>
          ${machine.gpu.devices
            .slice(0, 3)
            .map(
              (device) => `<section class="list-row">
                <strong>${escapeHtml(device.vendor)} · ${escapeHtml(device.name)}</strong>
                <small>${escapeHtml(device.driver || device.status)}${device.memory_mb ? ` · ${escapeHtml(device.memory_mb)} MB` : ""}</small>
              </section>`,
            )
            .join("")}
          ${[...machine.runtimes, ...machine.compilers]
            .filter((item) => item.status === "available")
            .slice(0, 6)
            .map(
              (tool) => `<section class="list-row">
                <strong>${escapeHtml(tool.label)}</strong>
                <p>${escapeHtml(tool.version || tool.path || tool.status)}</p>
              </section>`,
            )
            .join("")}`
        : ""
    }
    ${
      guidance
        ? `<section class="list-row">
            <div>${badge(guidance.status)} <strong>实验协议补齐建议</strong></div>
            <p>${escapeHtml(guidance.summary)}</p>
            <small>${escapeHtml(guidance.gaps.join(", "))}</small>
          </section>
          ${guidance.suggestions
            .slice(0, 4)
            .map(
              (item) => `<section class="annotation ${item.severity === "blocking" ? "blocker" : "warning"}">
                <strong>${escapeHtml(item.recommended_script || item.gap)}</strong>
                <p>${escapeHtml(item.next_action)}</p>
                <small>${escapeHtml(item.gap)}</small>
              </section>`,
            )
            .join("")}`
        : ""
    }
    ${
      starter
        ? `<section class="list-row">
            <div>${badge(starter.status)} <strong>实验协议 Starter Pack</strong></div>
            <p>${escapeHtml(starter.summary)}</p>
            <small>${Object.keys(starter.package_json_scripts || {}).map(escapeHtml).join(", ")}</small>
          </section>
          ${(starter.files ?? [])
            .slice(0, 4)
            .map(
              (file) => `<section class="list-row">
                <strong>${escapeHtml(file.path)}</strong>
                <p>${escapeHtml(file.purpose)}</p>
                <small>${escapeHtml(file.artifact_path || file.artifact_id || "")}</small>
              </section>`,
            )
            .join("")}
          ${starter.apply_endpoint ? `<small>apply: ${escapeHtml(starter.apply_endpoint)}</small>` : ""}`
        : ""
    }
    ${
      snapshot.monitor?.experiment_runs?.length
        ? `<section class="list-row">
            <div>${badge("live")} <strong>实验运行</strong></div>
            <p>${snapshot.monitor.experiment_runs.length} 个 host/container run 已登记。</p>
          </section>
          ${snapshot.monitor.experiment_runs
            .slice(0, 6)
            .map(
              (run) => `<section class="list-row">
                <strong>${escapeHtml(run.environment)} · ${escapeHtml(run.experiment_id)} · ${escapeHtml(run.status)}</strong>
                <p><code>${escapeHtml(run.command)}</code></p>
                <small>exit ${escapeHtml(run.exit_code)} · ${Number(run.wall_time_seconds || 0).toFixed(3)}s · ${escapeHtml(experimentRunResources(run))} · ${run.metrics
                  .map((metric) => `${escapeHtml(metric.name)}=${escapeHtml(metric.value)}${metric.unit ? ` ${escapeHtml(metric.unit)}` : ""}`)
                  .join(", ")}</small>
              </section>`,
            )
            .join("")}`
        : ""
    }
    ${
      snapshot.monitor?.experiment_terminal_traces?.length
        ? `<section class="list-row">
            <div>${badge("trace")} <strong>终端证据</strong></div>
            <p>${snapshot.monitor.experiment_terminal_traces.length} 条命令 trace 已登记。</p>
          </section>
          ${snapshot.monitor.experiment_terminal_traces
            .slice(0, 6)
            .map(
              (trace) => `<section class="list-row">
                <strong>${escapeHtml(trace.environment)} · ${escapeHtml(trace.experiment_id)} · ${escapeHtml(trace.status)}</strong>
                <p><code>${escapeHtml(trace.command)}</code></p>
                <small>exit ${escapeHtml(trace.exit_code)} · ${Number(trace.wall_time_seconds || 0).toFixed(3)}s · stdout ${escapeHtml(
                  trace.stdout_bytes,
                )}B · stderr ${escapeHtml(trace.stderr_bytes)}B${trace.output_truncated ? " · truncated" : ""}</small>
                ${renderTraceExcerpt(trace)}
              </section>`,
            )
            .join("")}`
        : ""
    }
  </div>`
}

export function renderExperimentRunsPane(monitor) {
  const runs = monitor?.experiment_runs ?? []
  const traces = monitor?.experiment_terminal_traces ?? []
  if (!runs.length && !traces.length) return `<div class="empty">实验运行和终端证据尚未同步。</div>`
  return `<div class="metric-stack">
    <section class="list-row">
      <div>${badge(runs.length || traces.length ? "live" : "idle")} <strong>实验运行证据</strong></div>
      <p>${escapeHtml(runs.length)} 个实验 run，${escapeHtml(traces.length)} 条终端 trace。</p>
    </section>
    ${
      runs.length
        ? `<section class="experiment-run-grid">
            ${runs
              .slice(0, 12)
              .map(
                (run) => `<article class="experiment-run">
                  <div>${badge(run.status)} <strong>${escapeHtml(run.environment)} · ${escapeHtml(run.experiment_id)}</strong></div>
                  <p><code>${escapeHtml(run.command)}</code></p>
                  <small>${escapeHtml(run.role)} · exit ${escapeHtml(run.exit_code)} · ${Number(run.wall_time_seconds || 0).toFixed(3)}s · ${escapeHtml(experimentRunResources(run))}</small>
                  <small>${(run.metrics ?? [])
                    .map((metric) => `${escapeHtml(metric.name)}=${escapeHtml(metric.value)}${metric.unit ? ` ${escapeHtml(metric.unit)}` : ""}`)
                    .join(", ")}</small>
                </article>`,
              )
              .join("")}
          </section>`
        : ""
    }
    ${
      traces.length
        ? `<section class="experiment-traces">
            ${traces
              .slice(0, 12)
              .map(
                (trace) => `<article class="list-row">
                  <div>${badge(trace.status)} <strong>${escapeHtml(trace.environment)} · ${escapeHtml(trace.experiment_id)}</strong></div>
                  <p><code>${escapeHtml(trace.command)}</code></p>
                  <small>${escapeHtml(trace.role)} · exit ${escapeHtml(trace.exit_code)} · ${Number(trace.wall_time_seconds || 0).toFixed(3)}s · stdout ${escapeHtml(
                    trace.stdout_bytes,
                  )}B · stderr ${escapeHtml(trace.stderr_bytes)}B${trace.output_truncated ? " · truncated" : ""}</small>
                  ${renderTraceExcerpt(trace)}
                </article>`,
              )
              .join("")}
          </section>`
        : ""
    }
  </div>`
}

export function renderExperimentEnvironmentPane(monitor) {
  if (monitor?.experiment_environment) return renderExperimentEnvironment(monitor.experiment_environment)
  const machine = monitor?.machine_environment
  if (!machine) return `<div class="empty">实验环境尚未同步。</div>`
  return `<section class="list-row experiment-environment">
    <div>${badge(machine.status)} <strong>机器与实验环境</strong></div>
    <p>${escapeHtml(machine.os)} · ${escapeHtml(machine.cpu)}</p>
    <small>${escapeHtml(machine.gpu.mode === "gpu" ? "GPU" : "CPU-only")} · optional missing ${escapeHtml(machine.optional_missing)} · blocked ${escapeHtml(machine.blocked)}</small>
    ${machine.gpu.devices
      .slice(0, 3)
      .map(
        (device) => `<section class="list-row">
          <strong>${escapeHtml(device.vendor)} · ${escapeHtml(device.name)}</strong>
          <small>${escapeHtml(device.driver || device.status)}${device.memory_mb ? ` · ${escapeHtml(device.memory_mb)} MB` : ""}</small>
        </section>`,
      )
      .join("")}
    ${[...machine.runtimes, ...machine.compilers]
      .filter((item) => item.status === "available")
      .slice(0, 8)
      .map(
        (tool) => `<section class="list-row">
          <strong>${escapeHtml(tool.label)}</strong>
          <p>${escapeHtml(tool.version || tool.path || tool.status)}</p>
        </section>`,
      )
      .join("")}
  </section>`
}

function formatBytes(value) {
  const bytes = Number(value || 0)
  if (!bytes) return "unknown"
  const units = ["B", "KB", "MB", "GB", "TB"]
  let amount = bytes
  let index = 0
  while (amount >= 1024 && index < units.length - 1) {
    amount /= 1024
    index++
  }
  return `${amount.toFixed(index === 0 ? 0 : 1)} ${units[index]}`
}

export function renderExperimentEnvironment(environment) {
  return `<section class="list-row experiment-environment">
    <div>${badge(environment.status_label || environment.status)} <strong>机器与实验环境</strong></div>
    <p>${escapeHtml(environment.os)} · ${escapeHtml(environment.cpu)}</p>
    <small>${escapeHtml(environment.gpu_mode === "gpu" ? "GPU" : "CPU-only")} · 内存 ${escapeHtml(
      formatBytes(environment.memory?.free_bytes),
    )} / ${escapeHtml(formatBytes(environment.memory?.total_bytes))}</small>
    <small>工作区 ${escapeHtml(environment.workspace)}</small>
    <div class="environment-groups">
      ${(environment.groups ?? [])
        .map(
          (group) => `<section class="environment-group">
            <div>${badge(group.status_label || group.status)} <strong>${escapeHtml(group.label)}</strong></div>
            <small>可用 ${escapeHtml(group.available)} / 可选缺失 ${escapeHtml(group.optional_missing)} / 阻断 ${escapeHtml(group.blocked)}</small>
            ${(group.tools ?? [])
              .slice(0, 6)
              .map(
                (tool) => `<div class="tool-row">
                  <span>${escapeHtml(tool.label)}</span>
                  <span>${badge(tool.status_label || tool.status)}</span>
                  <small>${escapeHtml(tool.version || tool.path || tool.impact || "")}</small>
                </div>`,
              )
              .join("")}
          </section>`,
        )
        .join("")}
    </div>
    ${(environment.notes ?? []).map((note) => `<small>${escapeHtml(note)}</small>`).join("")}
  </section>`
}

function renderTraceExcerpt(trace) {
  const stdout = trace.stdout_excerpt ? `<pre class="terminal-excerpt">${escapeHtml(trace.stdout_excerpt)}</pre>` : ""
  const stderr = trace.stderr_excerpt ? `<pre class="terminal-excerpt stderr">${escapeHtml(trace.stderr_excerpt)}</pre>` : ""
  if (!stdout && !stderr) return ""
  return `<details open>
    <summary>查看 stdout / stderr 摘要</summary>
    ${stdout ? `<strong>stdout</strong>${stdout}` : ""}
    ${stderr ? `<strong>stderr</strong>${stderr}` : ""}
  </details>`
}

export function renderCostAgent(snapshot) {
  const monitor = snapshot.monitor?.cost_agent
  if (monitor) {
    const costs = monitor.costs
    const tokens = monitor.tokens
    const tree = monitor.agent_tree
    const team = monitor.agent_team
    return `<div class="metric-stack">
      <section class="list-row">
        <div>${badge(costs.alerts.length ? "warning" : "ready")} <strong>$${Number(costs.total_usd || 0).toFixed(4)}</strong></div>
        <p>LLM $${Number(costs.llm_usd || 0).toFixed(4)} · API $${Number(costs.api_usd || 0).toFixed(4)}${
          costs.budget_total_usd === undefined ? "" : ` · budget $${Number(costs.budget_total_usd).toFixed(2)}`
        }</p>
        <small>${escapeHtml(tokens.total_tokens.toLocaleString())} tokens · input ${escapeHtml(
          tokens.input_tokens.toLocaleString(),
        )} / output ${escapeHtml(tokens.output_tokens.toLocaleString())}${tokens.estimated ? " · estimated" : ""}</small>
      </section>
      ${
        costs.alerts.length
          ? costs.alerts
              .slice(0, 4)
              .map(
                (alert) => `<section class="annotation warning">
                  <strong>${escapeHtml(alert.category)} cost alert</strong>
                  <p>${escapeHtml(alert.observed_usd)} / ${escapeHtml(alert.threshold_usd)} USD</p>
                  <small>${escapeHtml(alert.id)}</small>
                </section>`,
              )
              .join("")
          : ""
      }
      <section class="list-row">
        <div>${badge(tree.blocked_agents ? "blocked" : "ready")} <strong>Agent Tree</strong></div>
        <p>${escapeHtml(tree.total_agents)} agents · active ${escapeHtml(tree.active_agents)} · blocked ${escapeHtml(
          tree.blocked_agents,
        )} · depth ${escapeHtml(tree.max_depth)} · parallel ${escapeHtml(tree.max_parallel)}</p>
      </section>
      ${(tree.recent ?? [])
        .slice(0, 8)
        .map(
          (agent) => `<section class="list-row">
            <div>${badge(agent.status)} <strong>d${escapeHtml(agent.depth)} · ${escapeHtml(agent.role)}</strong></div>
            <p>${escapeHtml(agent.model)}</p>
            <small>${escapeHtml(agent.agent_id)}</small>
          </section>`,
        )
        .join("")}
      <section class="list-row">
        <div>${badge(team.blocked_tasks ? "blocked" : "ready")} <strong>Agent Team</strong></div>
        <p>${escapeHtml(team.members)} members · active ${escapeHtml(team.active_members)} · queued ${escapeHtml(
          team.queued_tasks,
        )} · running ${escapeHtml(team.active_tasks)} · done ${escapeHtml(team.completed_tasks)} · blocked ${escapeHtml(
          team.blocked_tasks,
        )}</p>
        <small>unread ${escapeHtml(team.unread_messages)}</small>
      </section>
      ${(team.recent_tasks ?? [])
        .slice(0, 6)
        .map(
          (task) => `<section class="list-row">
            <div>${badge(task.status)} <strong>${escapeHtml(task.title)}</strong></div>
            <small>${escapeHtml(task.task_id)}</small>
          </section>`,
        )
        .join("")}
    </div>`
  }
  const costs = snapshot.diagnostics.costs
  return `<div class="metric-stack">
    <strong>$${Number(costs.total_usd || 0).toFixed(4)}</strong>
    <p>LLM $${Number(costs.llm_usd || 0).toFixed(4)} · API $${Number(costs.api_usd || 0).toFixed(4)}</p>
    <p>${snapshot.diagnostics.agents.length} recent agents</p>
  </div>`
}

function render(snapshot) {
  currentSnapshot = snapshot
  text("run-title", snapshot.title)
  text("updated-at", snapshot.updated_at)
  text("render-state", `${snapshot.render.state}${snapshot.render.stage ? ` / ${snapshot.render.stage}` : ""}`)
  text("markdown-content", snapshot.artifacts.markdown?.content || "尚未生成草稿。")
  html("latex-content", artifact(snapshot, "latex"))
  html("pdf-content", artifact(snapshot, "pdf"))
  html("docx-content", artifact(snapshot, "docx"))
  html("annotation-list", renderLedgerPane(snapshot))
  text("diagnostics-content", JSON.stringify(snapshot.diagnostics, null, 2))
  html("stage-graph", renderStageGraph(snapshot.monitor))
  html("timeline-list", renderTimeline(snapshot.monitor))
  html("gate-summary", renderGate(snapshot))
  html("cost-agent-summary", renderCostAgent(snapshot))
  html("novelty-list", renderNovelty(snapshot.monitor))
  html("novelty-gate", renderNoveltyGate(snapshot.monitor))
  html("paper-spine", renderSpine(snapshot.monitor))
  html("global-figure", renderFigure(snapshot.monitor))
  html("figure-checks", renderFigureChecks(snapshot.monitor))
  html("experiment-environment", renderExperimentEnvironmentPane(snapshot.monitor))
  html("experiment-runs", renderExperimentRunsPane(snapshot.monitor))
  html("model-routing", renderModelRoutingPane(snapshot.monitor))
}

async function loadSnapshot() {
  const response = await fetch(`/api/snapshot?token=${encodeURIComponent(token)}`)
  if (!response.ok) throw new Error(`snapshot failed: ${response.status}`)
  render(await response.json())
}

function connectEvents() {
  const events = new EventSource(`/events?token=${encodeURIComponent(token)}`)
  events.onopen = () => text("connection-state", "live")
  events.onerror = () => text("connection-state", "offline")
  events.addEventListener("snapshot", (event) => render(JSON.parse(event.data).snapshot))
  events.addEventListener("render", (event) => {
    const payload = JSON.parse(event.data)
    if (currentSnapshot) {
      render({ ...currentSnapshot, render: payload.render, updated_at: payload.render.updated_at })
    } else {
      text("render-state", `${payload.render.state}${payload.render.stage ? ` / ${payload.render.stage}` : ""}`)
    }
  })
}

export function bootstrapPreviewClient() {
  if (typeof document === "undefined" || typeof location === "undefined") return
  const params = new URLSearchParams(location.search)
  token = params.get("token") || ""
  for (const button of document.querySelectorAll(".tabs button")) {
    button.addEventListener("click", () => {
      document.querySelectorAll(".tabs button").forEach((item) => item.classList.toggle("active", item === button))
      document.querySelectorAll(".pane").forEach((item) => item.classList.remove("active"))
      document.getElementById(`tab-${button.dataset.tab}`)?.classList.add("active")
    })
  }
  loadSnapshot().catch((error) => text("connection-state", error instanceof Error ? error.message : String(error)))
  connectEvents()
}

bootstrapPreviewClient()
