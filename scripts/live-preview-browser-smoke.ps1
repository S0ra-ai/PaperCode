param(
    [string]$ReportPath = "reports/live-preview-browser-smoke.md"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$TmpDir = Join-Path $RepoRoot "tmp/live-preview-browser-smoke"
New-Item -ItemType Directory -Path $TmpDir -Force | Out-Null
$Smoke = Join-Path $TmpDir "smoke.ts"

$Code = @'
import { startPreviewServer } from "../../packages/preview/src/server"
import type { PreviewSnapshot } from "../../packages/preview/src/protocol"

function snapshot(input: { markdown: string; stage: string; agent: string; cost: number; gate: string }): PreviewSnapshot {
  const updated = new Date().toISOString()
  return {
    schema_version: "preview.v1",
    run_id: "browser-smoke-run",
    title: "PaperRun live preview browser smoke",
    readonly: true,
    updated_at: updated,
    artifacts: {
      markdown: {
        kind: "markdown",
        mime_type: "text/markdown",
        content: input.markdown,
        updated_at: updated,
      },
    },
    annotations: [
      { id: `stage:${input.stage}`, kind: "reviewer", severity: "info", message: `stage=${input.stage}` },
      { id: `gate:${input.gate}`, kind: "reviewer", severity: input.gate === "passed" ? "info" : "blocker", message: input.gate },
      { id: `agent:${input.agent}`, kind: "agent", severity: "info", message: input.agent },
    ],
    diagnostics: {
      tools: {},
      costs: { llm_usd: input.cost, api_usd: 0, total_usd: input.cost },
      agents: [{ name: input.agent, status: "running", detail: input.stage }],
    },
    monitor: {
      stage_graph: [{ id: input.stage, label: input.stage, status: "running", summary: input.markdown }],
      novelty: {
        status: input.gate === "passed" ? "clear" : "needs_review",
        checkpoints: [
          {
            id: `novelty:${input.stage}`,
            stage: input.stage,
            status: input.gate === "passed" ? "clear" : "needs_review",
            conflicts: input.gate === "passed" ? 0 : 1,
            summary: `gate=${input.gate}`,
          },
        ],
        experiment_gate: {
          status: input.gate,
          reason: `gate=${input.gate}`,
          allowed: input.gate === "passed",
        },
      },
      paper_spine: {
        readiness: input.gate === "passed" ? "ready" : "needs_evidence",
        central_claim: input.markdown,
        motivation_chain: ["problem", "gap"],
        contribution_chain: ["contribution"],
      },
      global_figure: {
        status: input.gate === "passed" ? "ready" : "needs_evidence",
        title: "Overview",
        panels: [{ id: "A", title: "Problem", purpose: "Show evidence flow.", evidence_refs: 1 }],
        checks: [{ id: "panel-evidence", status: input.gate === "passed" ? "passed" : "warning", message: input.gate }],
      },
      gate: { status: input.gate, failed_checks: input.gate === "passed" ? [] : ["smoke_gate"] },
      timeline: [{ type: "stage", label: input.stage, at: updated, detail: input.agent }],
    },
    render: {
      state: "ready",
      stage: input.stage,
      message: `gate=${input.gate}`,
      updated_at: updated,
    },
  }
}

async function readUntil(reader: ReadableStreamDefaultReader<Uint8Array>, needle: string) {
  const decoder = new TextDecoder()
  let text = ""
  const deadline = Date.now() + 5000
  while (!text.includes(needle) && Date.now() < deadline) {
    const next = await reader.read()
    if (next.done) break
    text += decoder.decode(next.value)
  }
  return text
}

const preview = startPreviewServer({
  token: "browser-smoke-token",
  snapshot: snapshot({ markdown: "No draft has been generated yet.", stage: "planning", agent: "agent-root", cost: 0, gate: "blocked" }),
})

try {
  const base = `http://127.0.0.1:${preview.server.port}`
  const missingToken = await fetch(`${base}/api/snapshot`)
  if (missingToken.status !== 401) throw new Error(`missing token expected 401, got ${missingToken.status}`)
  const badToken = await fetch(`${base}/api/snapshot?token=bad`)
  if (badToken.status !== 401) throw new Error(`bad token expected 401, got ${badToken.status}`)
  const write = await fetch(`${base}/api/snapshot?token=browser-smoke-token`, { method: "POST" })
  if (write.status !== 405) throw new Error(`write expected 405, got ${write.status}`)
  const page = await fetch(`${base}/preview?token=browser-smoke-token`)
  if (page.status !== 200) throw new Error(`preview page expected 200, got ${page.status}`)
  const events = await fetch(`${base}/events?token=browser-smoke-token`)
  if (!events.body || events.status !== 200) throw new Error(`events expected 200 with body, got ${events.status}`)
  const reader = events.body.getReader()
  await readUntil(reader, "planning")
  preview.updateSnapshot(
    snapshot({
      markdown: "# Live updated draft\n\nThis content arrived from an SSE update.",
      stage: "drafting",
      agent: "agent-writer",
      cost: 0.42,
      gate: "passed",
    }),
  )
  const text = await readUntil(reader, "agent-writer")
  await reader.cancel()
  for (const expected of ["Live updated draft", "drafting", "agent-writer", "0.42", "passed"]) {
    if (!text.includes(expected)) throw new Error(`SSE update missing ${expected}`)
  }
  console.log(JSON.stringify({ status: "passed", port: preview.server.port, checks: ["token", "readonly", "sse"] }))
} finally {
  preview.stop()
}
'@

Set-Content -LiteralPath $Smoke -Encoding UTF8 -Value $Code
Push-Location $RepoRoot
try {
    $Output = & npx --yes bun@1.3.13 $Smoke 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "live preview browser smoke failed: $($Output -join ' ')"
    }
    New-Item -ItemType Directory -Path (Split-Path -Parent (Join-Path $RepoRoot $ReportPath)) -Force | Out-Null
    $Now = Get-Date -Format "yyyy-MM-dd HH:mm:ss K"
    $Report = @(
        "# Live Preview Browser Smoke",
        "",
        "- status: passed",
        "- generated_at: $Now",
        "- checks: token rejection, read-only write rejection, SSE snapshot refresh",
        "- output: $($Output -join ' ')"
    ) -join "`n"
    Set-Content -LiteralPath (Join-Path $RepoRoot $ReportPath) -Encoding UTF8 -Value $Report
    Write-Output $Report
} finally {
    Pop-Location
}
