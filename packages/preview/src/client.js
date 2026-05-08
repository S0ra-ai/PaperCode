const params = new URLSearchParams(location.search)
const token = params.get("token") || ""

function text(id, value) {
  const element = document.getElementById(id)
  if (element) element.textContent = value
}

function html(id, value) {
  const element = document.getElementById(id)
  if (element) element.innerHTML = value
}

function artifact(snapshot, kind) {
  const item = snapshot.artifacts[kind]
  if (!item) return "No artifact published."
  if (item.url) return `<a href="${item.url}" target="_blank" rel="noreferrer">${item.path || item.url}</a>`
  if (item.path) return `<code>${item.path}</code><p>${item.mime_type}</p>`
  return `<pre>${item.content || "Artifact pending."}</pre>`
}

function renderAnnotations(snapshot) {
  if (!snapshot.annotations.length) return `<div class="empty">No annotations.</div>`
  return snapshot.annotations
    .map(
      (item) => `<section class="annotation ${item.severity}">
        <strong>${item.kind}</strong>
        <p>${item.message}</p>
        <small>${item.source?.label || "run"}${item.source?.line_start ? `:${item.source.line_start}` : ""}</small>
      </section>`,
    )
    .join("")
}

function render(snapshot) {
  text("run-title", snapshot.title)
  text("updated-at", snapshot.updated_at)
  text("render-state", `${snapshot.render.state}${snapshot.render.stage ? ` / ${snapshot.render.stage}` : ""}`)
  text("markdown-content", snapshot.artifacts.markdown?.content || "No markdown yet.")
  text("latex-content", snapshot.artifacts.latex?.content || "No LaTeX yet.")
  html("pdf-content", artifact(snapshot, "pdf"))
  html("docx-content", artifact(snapshot, "docx"))
  html("annotation-list", renderAnnotations(snapshot))
  text("diagnostics-content", JSON.stringify(snapshot.diagnostics, null, 2))
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
    text("render-state", `${payload.render.state}${payload.render.stage ? ` / ${payload.render.stage}` : ""}`)
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
