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
import { existsSync } from "node:fs"

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
      experiment_runs: [
        {
          run_id: "host:proposed",
          experiment_id: "proposed",
          role: "proposed",
          environment: "host",
          status: input.gate === "passed" ? "succeeded" : "failed",
          command: "bun run typecheck",
          exit_code: input.gate === "passed" ? 0 : 1,
          wall_time_seconds: 0.123,
          metrics: [{ name: "typecheck_pass", value: input.gate === "passed" ? 1 : 0, unit: "ratio" }],
          stdout_excerpt: "typecheck smoke stdout",
          stderr_excerpt: input.gate === "passed" ? "" : "typecheck smoke stderr",
        },
        {
          run_id: "container:proposed",
          experiment_id: "proposed",
          role: "proposed",
          environment: "container",
          status: input.gate === "passed" ? "succeeded" : "environment_failed",
          command: "bun run repro:container",
          exit_code: input.gate === "passed" ? 0 : 127,
          wall_time_seconds: 0.456,
          metrics: [{ name: "typecheck_pass", value: input.gate === "passed" ? 1 : 0, unit: "ratio" }],
          stdout_excerpt: "container smoke stdout",
          stderr_excerpt: input.gate === "passed" ? "" : "container smoke stderr",
        },
      ],
      experiment_terminal_traces: [
        {
          trace_id: "trace-host-proposed",
          artifact_id: "artifact-trace-host-proposed",
          experiment_id: "proposed",
          role: "proposed",
          environment: "host",
          command: "bun run typecheck",
          cwd: "E:/Project/papercode",
          status: input.gate === "passed" ? "succeeded" : "failed",
          exit_code: input.gate === "passed" ? 0 : 1,
          wall_time_seconds: 0.123,
          timed_out: false,
          stdout_bytes: 128,
          stderr_bytes: input.gate === "passed" ? 0 : 64,
          output_truncated: false,
          stdout_excerpt: "typecheck terminal trace stdout",
          stderr_excerpt: input.gate === "passed" ? "" : "typecheck terminal trace stderr",
        },
        {
          trace_id: "trace-container-proposed",
          artifact_id: "artifact-trace-container-proposed",
          experiment_id: "proposed",
          role: "proposed",
          environment: "container",
          command: "bun run repro:container",
          cwd: "E:/Project/papercode",
          status: input.gate === "passed" ? "succeeded" : "environment_failed",
          exit_code: input.gate === "passed" ? 0 : 127,
          wall_time_seconds: 0.456,
          timed_out: false,
          stdout_bytes: 256,
          stderr_bytes: input.gate === "passed" ? 0 : 96,
          output_truncated: false,
          stdout_excerpt: "container terminal trace stdout",
          stderr_excerpt: input.gate === "passed" ? "" : "container terminal trace stderr",
        },
      ],
      machine_environment: {
        status: "available",
        workspace: "E:/Project/papercode",
        default_run_root: "C:/Users/13750/.papercode/runs",
        os: "win32 smoke x64",
        cpu: "smoke cpu / 16 cores",
        memory: { total_bytes: 32000000000, free_bytes: 16000000000 },
        disk: { path: "E:/Project/papercode", total_bytes: 1000000000000, free_bytes: 500000000000 },
        gpu: {
          mode: "cpu-only",
          devices: [],
          cuda_status: "optional_missing",
          rocm_status: "optional_missing",
        },
        runtimes: [{ id: "bun", label: "Bun", status: "available", version: "bun smoke" }],
        compilers: [{ id: "gcc", label: "gcc", status: "optional_missing" }],
        optional_missing: 3,
        blocked: 0,
        notes: ["browser smoke machine environment"],
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

async function withTimeout<T>(label: string, promise: Promise<T>, ms = 20000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

function localBrowserExecutable() {
  const candidates = [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  ]
  return candidates.find((item) => existsSync(item))
}

type CdpClient = {
  send: (method: string, params?: Record<string, unknown>) => Promise<any>
  close: () => void
}

async function connectCdp(wsUrl: string): Promise<CdpClient> {
  const socket = new WebSocket(wsUrl)
  let id = 0
  const pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>()
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data))
    if (!message.id) return
    const item = pending.get(message.id)
    if (!item) return
    pending.delete(message.id)
    if (message.error || message.result?.exceptionDetails) item.reject(new Error(JSON.stringify(message.error ?? message.result.exceptionDetails)))
    else item.resolve(message.result)
  })
  await withTimeout(
    "CDP websocket open",
    new Promise<void>((resolve, reject) => {
      socket.addEventListener("open", () => resolve(), { once: true })
      socket.addEventListener("error", () => reject(new Error("CDP websocket failed to open")), { once: true })
    }),
    10000,
  )
  return {
    send(method, params = {}) {
      const callID = ++id
      socket.send(JSON.stringify({ id: callID, method, params }))
      return new Promise((resolve, reject) => pending.set(callID, { resolve, reject }))
    },
    close() {
      socket.close()
    },
  }
}

async function browserDomSession(url: string) {
  const executable = localBrowserExecutable()
  if (!executable) throw new Error("No local Chrome or Edge executable found for browser smoke.")
  const port = 19000 + Math.floor(Math.random() * 1000)
  const userDataDir = `${process.cwd().replace(/\\/g, "/")}/tmp/live-preview-browser-smoke/browser-profile-${Date.now()}`
  const proc = Bun.spawn(
    [
      executable,
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--disable-extensions",
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${userDataDir}`,
      "about:blank",
    ],
    {
      stdout: "ignore",
      stderr: "ignore",
    },
  )
  let cdp: CdpClient | undefined
  try {
    const deadline = Date.now() + 10000
    let wsUrl = ""
    while (!wsUrl && Date.now() < deadline) {
      await Bun.sleep(150)
      const tabs = await fetch(`http://127.0.0.1:${port}/json/list`)
        .then((response) => (response.ok ? response.json() : undefined))
        .catch(() => undefined)
      wsUrl = Array.isArray(tabs) ? tabs.find((tab) => tab.type === "page")?.webSocketDebuggerUrl ?? "" : ""
    }
    if (!wsUrl) throw new Error("Could not open browser DevTools endpoint.")
    cdp = await connectCdp(wsUrl)
    await cdp.send("Page.enable")
    await cdp.send("Runtime.enable")
    await cdp.send("Page.navigate", { url })
    const navigateDeadline = Date.now() + 5000
    while (Date.now() < navigateDeadline) {
      const locationResult = await cdp.send("Runtime.evaluate", {
        expression: "location.href + '|' + document.readyState",
        returnByValue: true,
      })
      const state = String(locationResult?.result?.value ?? "")
      if (state.includes("/preview?token=") && !state.endsWith("|loading")) break
      await Bun.sleep(100)
    }
    return {
      async evaluate(expression: string) {
        const result = await cdp!.send("Runtime.evaluate", {
          expression,
          awaitPromise: true,
          returnByValue: true,
        })
        return String(result?.result?.value ?? "")
      },
      async text() {
        const result = await cdp!.send("Runtime.evaluate", {
          expression: "document.body.innerText",
          returnByValue: true,
        })
        return String(result?.result?.value ?? "")
      },
      close() {
        cdp?.close()
        proc.kill()
      },
    }
  } catch (error) {
    cdp?.close()
    proc.kill()
    throw error
  }
}

async function waitForBrowserText(reader: { text: () => Promise<string> }, expected: string[]) {
  const deadline = Date.now() + 10000
  let text = ""
  while (Date.now() < deadline) {
    text = await reader.text()
    if (expected.every((item) => text.includes(item))) return text
    await Bun.sleep(200)
  }
  await Bun.write("tmp/live-preview-browser-smoke/browser-dom-failure.txt", text)
  throw new Error(`browser DOM missing ${expected.filter((item) => !text.includes(item)).join(", ")}`)
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
  const browserDom = await browserDomSession(`${base}/preview?token=browser-smoke-token`)
  try {
    await waitForBrowserText(browserDom, [
      "PAPERCODE LOCALHOST READ-ONLY MONITOR",
      "STAGE GRAPH",
      "GATE",
      "\u7ec8\u7aef\u8bc1\u636e",
      "typecheck terminal trace stdout",
      "container terminal trace stdout",
    ])
    const browserSnapshot = await browserDom.evaluate(
      "fetch('/api/snapshot?token=browser-smoke-token').then((response) => response.json()).then((snapshot) => JSON.stringify({ title: snapshot.title, runs: snapshot.monitor?.experiment_runs, traces: snapshot.monitor?.experiment_terminal_traces, machine: snapshot.monitor?.machine_environment }))",
    )
    for (const expected of ["PaperRun live preview browser smoke", "bun run typecheck", "bun run repro:container", "terminal trace stdout", "cpu-only", "bun smoke"]) {
      if (!browserSnapshot.includes(expected)) throw new Error(`browser snapshot missing ${expected}`)
    }
    const clientSource = await browserDom.evaluate("fetch('/assets/client.js').then((response) => response.text())")
    for (const expected of ["experiment_runs", "experiment_terminal_traces", "machine_environment", "stdout_excerpt", "stderr_excerpt", "terminal-excerpt", "\u5b9e\u9a8c\u8fd0\u884c", "\u7ec8\u7aef\u8bc1\u636e", "\u673a\u5668\u4e0e\u5b9e\u9a8c\u73af\u5883", "wall_time_seconds"]) {
      if (!clientSource.includes(expected)) throw new Error(`browser client bundle missing ${expected}`)
    }
    preview.updateSnapshot(
      snapshot({
        markdown: "# Browser DOM updated draft\n\nThis content rendered in the browser.",
        stage: "revision",
        agent: "agent-browser",
        cost: 0.84,
        gate: "passed",
      }),
    )
    const updatedSnapshot = await browserDom.evaluate(
      "fetch('/api/snapshot?token=browser-smoke-token').then((response) => response.json()).then((snapshot) => JSON.stringify({ title: snapshot.title, stage: snapshot.render.stage, agent: snapshot.diagnostics.agents?.[0]?.name }))",
    )
    for (const expected of ["revision", "agent-browser"]) {
      if (!updatedSnapshot.includes(expected)) throw new Error(`browser updated snapshot missing ${expected}`)
    }
  } finally {
    browserDom.close()
  }
  console.log(JSON.stringify({ status: "passed", port: preview.server.port, checks: ["token", "readonly", "sse", "browser-dom", "experiment-runs", "terminal-traces", "machine-environment"] }))
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
        "- checks: token rejection, read-only write rejection, SSE snapshot refresh, browser shell render, browser snapshot read, experiment run summary, terminal trace summary, machine environment summary",
        "- output: $($Output -join ' ')"
    ) -join "`n"
    Set-Content -LiteralPath (Join-Path $RepoRoot $ReportPath) -Encoding UTF8 -Value $Report
    Write-Output $Report
} finally {
    Pop-Location
}
