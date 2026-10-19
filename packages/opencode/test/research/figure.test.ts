import { describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm } from "fs/promises"
import { setTimeout as sleep } from "node:timers/promises"
import os from "os"
import path from "path"
import { figureSpecFromReport, ablationFigureSpec, renderMetricChartPng } from "@/paper/research/export"
import { renderPaperExportPipeline, type PaperExportCommandRunner } from "@/paper/export-pipeline"
import { createResearchRun, type ResearchRuntimeOptions } from "@/paper/research/runtime"
import { composeClaimLedger, composeDraftPaper } from "@/paper/research/writing"

const now = "2026-10-19T00:00:00Z"
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

async function clean(dir: string) {
  Bun.gc(true)
  await sleep(50)
  await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
}

function runtimeOptions(workspace: string, home: string): ResearchRuntimeOptions {
  let index = 0
  return { workspace, home, clock: () => new Date(now), idFactory: (kind) => `${kind}-${++index}` }
}

describe("paper figure", () => {
  test("builds the series from the result report", () => {
    const spec = figureSpecFromReport({
      primary_metric: "accuracy",
      proposed: { experiment_id: "proposed", value: 0.91 },
      best_baseline: { experiment_id: "baseline-rag", value: 0.88 },
      statistics: [
        { experiment_id: "proposed", environment: "host", metric: "accuracy", n: 5, mean: 0.91, std: 0.004 },
        { experiment_id: "baseline-rag", environment: "host", metric: "accuracy", n: 5, mean: 0.88, std: 0.003 },
      ],
    })
    expect(spec?.series).toEqual([
      { label: "Proposed", value: 0.91, std: 0.004 },
      { label: "Baseline Rag", value: 0.88, std: 0.003 },
    ])
    expect(spec?.caption).toContain("Proposed, Baseline Rag")
    expect(figureSpecFromReport({ primary_metric: "accuracy" })).toBeUndefined()
  })

  test("builds the ablation chart from the run records", () => {
    const run = (experiment_id: string, role: string, value: number) => ({
      experiment_id,
      role,
      environment: { mode: "host" },
      metrics: [{ name: "accuracy", value }],
    })
    const spec = ablationFigureSpec({
      metric: "accuracy",
      runs: [
        run("proposed", "proposed", 0.91),
        run("ablation-no-gate", "ablation", 0.88),
        run("ablation-no-ledger", "ablation", 0.86),
      ],
      statistics: [
        { experiment_id: "proposed", environment: "host", metric: "accuracy", std: 0.004 },
        { experiment_id: "ablation-no-gate", environment: "host", metric: "accuracy", std: 0.006 },
      ],
    })
    expect(spec?.series.map((item) => item.label)).toEqual(["Proposed", "Ablation No Gate", "Ablation No Ledger"])
    expect(spec?.series[0]?.std).toBe(0.004)
    expect(ablationFigureSpec({ metric: "accuracy", runs: [run("proposed", "proposed", 0.91)] })).toBeUndefined()
  })

  test("encodes a real PNG with the expected dimensions", () => {
    const png = renderMetricChartPng({
      caption: "accuracy",
      metric: "accuracy",
      series: [
        { label: "proposed", value: 0.91, std: 0.004 },
        { label: "baseline-rag", value: 0.88 },
      ],
    })
    expect(Array.from(png.slice(0, 8))).toEqual(PNG_SIGNATURE)
    const view = new DataView(png.buffer, png.byteOffset, png.byteLength)
    expect(view.getUint32(16)).toBe(900)
    expect(view.getUint32(20)).toBe(520)
    // IDAT is deflated: a few kilobytes, not an uncompressed 1.8 MB bitmap.
    expect(png.byteLength).toBeGreaterThan(1000)
    expect(png.byteLength).toBeLessThan(900 * 520 * 4)
  })

  test("the draft references the ablation chart when ablations were recorded", () => {
    const ledger = composeClaimLedger({ topic: "Ablation", claims: [], now })
    const run = (experiment_id: string, role: "proposed" | "baseline" | "ablation", value: number) => ({
      experiment_run_id: `host:${experiment_id}`,
      plan_id: "plan-1",
      experiment_id,
      role,
      status: "succeeded" as const,
      command: { argv: ["bun", "test"] },
      environment: { mode: "host" as const, platform: "darwin" as const },
      metrics: [{ name: "accuracy", value, direction: "higher_better" as const }],
      stdout: "fixture",
      stderr: "",
      exit_code: 0,
      resource_usage: { wall_time_seconds: 0 },
    })
    const draft = composeDraftPaper({
      title: "Ablation",
      ledger,
      experiment_runs: {
        host_runs: [run("proposed", "proposed", 0.91), run("ablation-a", "ablation", 0.88)],
        container_runs: [],
      },
      result_report: {
        primary_metric: "accuracy",
        proposed: { experiment_id: "proposed", value: 0.91 },
        best_baseline: { experiment_id: "baseline", value: 0.88 },
        blockers: [],
        recommendation: "accept",
        reproduction: { status: "passed", container_run_ids: [] },
        final_claims_allowed: true,
      },
      now,
    })
    const results = draft.sections.find((section) => section.section_id === "results")?.markdown ?? ""
    expect(results).toContain("figures/ablation.png")
    expect(results).toContain("Accuracy ablation")
  })

  test("the export pipeline writes the figure next to the bundle", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "papercode-figure-test-"))
    try {
      const workspace = path.join(dir, "workspace")
      const home = path.join(dir, "home")
      await mkdir(workspace, { recursive: true })
      await mkdir(home, { recursive: true })
      const options = runtimeOptions(workspace, home)
      const handle = await createResearchRun({ topic: "Figure" }, options)
      const ledger = composeClaimLedger({ topic: "Figure", claims: [], now })
      const figure = {
        caption: "accuracy across methods (left to right: proposed)",
        metric: "accuracy",
        series: [{ label: "proposed", value: 0.91, std: 0.004 }],
      }
      const ablation = {
        caption: "accuracy ablation (left to right: proposed, ablation-a)",
        metric: "accuracy",
        series: [
          { label: "proposed", value: 0.91 },
          { label: "ablation-a", value: 0.88 },
        ],
      }
      const draft = composeDraftPaper({ title: "Figure", ledger, figure, now })
      expect(draft.sections.find((section) => section.section_id === "results")?.markdown).toContain(
        "![accuracy across methods (left to right: proposed)](figures/primary-metric.png)",
      )

      const command: PaperExportCommandRunner = async () => ({ exit_code: 1, stdout: "", stderr: "not used" })
      await renderPaperExportPipeline(
        handle.run_dir,
        {
          mode: "forced_draft",
          bundle_id: "bundle-figure",
          draft,
          final_gate: { status: "blocked", blockers: [], updated_at: now },
          source_artifact_ids: [],
          tools: {},
          command,
          figure,
          ablation_figure: ablation,
          now,
        },
        options,
      )

      const png = await Bun.file(
        path.join(handle.run_dir, "exports", "bundle-figure", "figures", "primary-metric.png"),
      ).bytes()
      expect(Array.from(png.slice(0, 8))).toEqual(PNG_SIGNATURE)
      const ablationPng = await Bun.file(
        path.join(handle.run_dir, "exports", "bundle-figure", "figures", "ablation.png"),
      ).bytes()
      expect(Array.from(ablationPng.slice(0, 8))).toEqual(PNG_SIGNATURE)
    } finally {
      await clean(dir)
    }
  })
})
