import { describe, expect, test } from "bun:test"
import { startPreviewServer } from "@/server"
import { PreviewRenderQueue } from "@/render-queue"
import type { PreviewSnapshot } from "@/protocol"

function snapshot(): PreviewSnapshot {
  const now = "2026-05-08T00:00:00Z"
  return {
    schema_version: "preview.v1",
    run_id: "run-preview",
    title: "Preview Smoke",
    readonly: true,
    updated_at: now,
    artifacts: {
      markdown: {
        kind: "markdown",
        mime_type: "text/markdown",
        content: "# Smoke\n\nReady.",
        updated_at: now,
      },
    },
    annotations: [
      {
        id: "ann-1",
        kind: "claim",
        severity: "info",
        message: "Claim linked to source.",
        source: { label: "draft.md", path: "draft.md", line_start: 1 },
        tui_ref: "run-preview#ann-1",
      },
    ],
    diagnostics: {
      tools: {
        pandoc: { status: "available", path: "pandoc" },
      },
      costs: { llm_usd: 0, api_usd: 0, total_usd: 0 },
      agents: [{ name: "writer", status: "idle" }],
    },
    monitor: {
      stage_graph: [{ id: "drafting", label: "Drafting", status: "running", summary: "Writing draft." }],
      novelty: {
        status: "clear",
        checkpoints: [
          {
            id: "literature:smoke",
            stage: "literature",
            status: "clear",
            conflicts: 0,
            summary: "No blocking overlap.",
          },
        ],
        experiment_gate: { status: "passed", reason: "No blocking overlap.", allowed: true },
      },
      paper_spine: {
        readiness: "ready",
        central_claim: "Smoke claim.",
        motivation_chain: ["Problem", "Gap"],
        contribution_chain: ["Contribution"],
      },
      global_figure: {
        status: "ready",
        title: "Overview",
        panels: [{ id: "A", title: "Problem", purpose: "Show context.", evidence_refs: 1 }],
        checks: [{ id: "panel-evidence", status: "passed", message: "Evidence linked." }],
      },
      gate: { status: "passed", failed_checks: [] },
      timeline: [{ type: "stage", label: "drafting", at: now, detail: "Writing draft." }],
    },
    render: {
      state: "idle",
      updated_at: now,
    },
  }
}

describe("preview server", () => {
  test("serves token-protected read-only preview endpoints", async () => {
    const preview = startPreviewServer({ snapshot: snapshot(), token: "test-token" })
    try {
      const denied = await fetch(`http://127.0.0.1:${preview.server.port}/api/snapshot?token=bad`)
      expect(denied.status).toBe(401)

      const write = await fetch(`http://127.0.0.1:${preview.server.port}/api/snapshot?token=test-token`, {
        method: "POST",
      })
      expect(write.status).toBe(405)

      const ok = await fetch(`http://127.0.0.1:${preview.server.port}/api/snapshot?token=test-token`)
      expect(ok.status).toBe(200)
      const body = (await ok.json()) as PreviewSnapshot
      expect(body.readonly).toBe(true)
      expect(body.artifacts.markdown?.content).toContain("Smoke")

      const html = await fetch(preview.url)
      expect(html.status).toBe(200)
      const page = await html.text()
      expect(page).toContain("PaperCode Monitor")
      expect(page).toContain('data-tab="environment"')
      expect(page).toContain('data-tab="experiments"')
      expect(page).toContain('data-tab="models"')
      expect(page).toContain('id="experiment-environment"')
      expect(page).toContain('id="experiment-runs"')
      expect(page).toContain('id="model-routing"')
    } finally {
      preview.stop()
    }
  })

  test("cancels stale render jobs and keeps the newest markdown", async () => {
    const queue = new PreviewRenderQueue(snapshot(), async ({ markdown, signal }) => {
      await Bun.sleep(markdown.includes("first") ? 20 : 1)
      if (signal.aborted) throw new DOMException("cancelled", "AbortError")
      return {
        latex: {
          kind: "latex",
          mime_type: "text/x-tex",
          content: markdown,
          updated_at: new Date().toISOString(),
        },
      }
    })
    const first = queue.enqueueMarkdown("first")
    const second = queue.enqueueMarkdown("second")
    await Promise.all([first, second])
    expect(queue.current().artifacts.markdown?.content).toBe("second")
    expect(queue.current().artifacts.latex?.content).toBe("second")
  })

  test("pushes replacement snapshots to live preview subscribers", async () => {
    const preview = startPreviewServer({ snapshot: snapshot(), token: "test-token" })
    try {
      const events = await fetch(`http://127.0.0.1:${preview.server.port}/events?token=test-token`)
      const reader = events.body!.getReader()
      await reader.read()
      preview.updateSnapshot({
        ...snapshot(),
        title: "Updated Preview",
        updated_at: "2026-05-08T00:01:00Z",
      })
      const next = await reader.read()
      await reader.cancel()
      expect(new TextDecoder().decode(next.value)).toContain("Updated Preview")
    } finally {
      preview.stop()
    }
  })
})
