const params = new URLSearchParams(location.search)
const token = params.get("token") || ""
let currentSnapshot

function el(id) {
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

function renderGate(snapshot) {
  const gate = snapshot.monitor?.gate
  return `<div class="metric-stack">
    ${badge(gate?.status || snapshot.render.state)}
    <p>failed checks: ${(gate?.failed_checks ?? []).map(escapeHtml).join(", ") || "none"}</p>
    <p>render: ${escapeHtml(snapshot.render.state)}${snapshot.render.stage ? ` / ${escapeHtml(snapshot.render.stage)}` : ""}</p>
  </div>`
}

function renderCostAgent(snapshot) {
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
  html("annotation-list", renderAnnotations(snapshot))
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

for (const button of document.querySelectorAll(".tabs button")) {
  button.addEventListener("click", () => {
    document.querySelectorAll(".tabs button").forEach((item) => item.classList.toggle("active", item === button))
    document.querySelectorAll(".pane").forEach((item) => item.classList.remove("active"))
    document.getElementById(`tab-${button.dataset.tab}`)?.classList.add("active")
  })
}

loadSnapshot().catch((error) => text("connection-state", error instanceof Error ? error.message : String(error)))
connectEvents()
