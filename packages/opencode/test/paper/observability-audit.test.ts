import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm } from "fs/promises"
import { setTimeout as sleep } from "node:timers/promises"
import os from "os"
import path from "path"
import {
  createPaperRun,
  getPaperRunSnapshot,
  recordPaperCostUsage,
  recordPaperDataEgressAudit,
  recordPaperObservabilityAudit,
  recordPaperToolTrace,
} from "@/paper"
import type { ResearchRuntimeOptions } from "@/paper/research/runtime"

const now = "2026-05-10T00:00:00Z"
const created: string[] = []

async function clean(dir: string, attempts = 80): Promise<void> {
  Bun.gc(true)
  await sleep(150)
  return rm(dir, { recursive: true, force: true }).catch((error) => {
    const retryable =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error.code === "EBUSY" || error.code === "EACCES" || error.code === "EPERM")
    if (!retryable) throw error
    if (attempts <= 1) return
    return clean(dir, attempts - 1)
  })
}

function runtimeOptions(workspace: string, home: string): ResearchRuntimeOptions {
  let index = 0
  return {
    workspace,
    home,
    clock: () => new Date(now),
    idFactory: (kind) => `${kind}-${++index}`,
  }
}

async function newPaperRun() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "paper-fucker-observability-"))
  created.push(dir)
  const workspace = path.join(dir, "workspace")
  const home = path.join(dir, "home")
  await mkdir(workspace, { recursive: true })
  await mkdir(home, { recursive: true })
  const options = runtimeOptions(workspace, home)
  const run = await createPaperRun(
    {
      topic: "Observability audit",
      workspace_path: workspace,
      data_egress_policy: {
        mode: "private_first",
        allowed_paths: ["allowed"],
        denied_patterns: ["**/.env*"],
        external_model_full_text: false,
      },
    },
    options,
  )
  return { ...run, options, workspace }
}

afterEach(async () => {
  while (created.length > 0) await clean(created.pop()!)
})

describe("PaperRun observability audit", () => {
  test("records durable audit, tool trace, cost, and egress diagnostics in snapshots", async () => {
    const run = await newPaperRun()

    await recordPaperObservabilityAudit(
      run.run_dir,
      {
        kind: "capability",
        name: "exa",
        status: "succeeded",
        span_name: "paper_fucker.capability.exa",
        attributes: { stage: "literature", cost: "metered" },
      },
      run.options,
    )
    await recordPaperObservabilityAudit(
      run.run_dir,
      {
        kind: "model_role",
        name: "writer",
        status: "succeeded",
        span_name: "paper_fucker.model.writer",
        attributes: { provider_id: "deepseek", model_id: "deepseek-v4-pro" },
      },
      run.options,
    )
    await recordPaperObservabilityAudit(
      run.run_dir,
      {
        kind: "subagent",
        name: "reviewer-depth-2",
        status: "succeeded",
        span_name: "paper_fucker.agent.reviewer",
        attributes: { parent_agent_id: "root", depth: 2 },
      },
      run.options,
    )
    await recordPaperToolTrace(
      run.run_dir,
      {
        tool_name: "paper.export.renderer.pandoc",
        status: "succeeded",
        input: { format: "latex" },
        output: { path: "exports/bundle/paper.tex" },
      },
      run.options,
    )
    await recordPaperCostUsage(run.run_dir, { llm_usd: 0.02, api_usd: 0.01, reason: "writer smoke" }, run.options)
    await recordPaperDataEgressAudit(
      run.run_dir,
      {
        policy: run.snapshot.data_egress_policy,
        candidates: ["allowed/summary.md", "secrets/.env", "model.bin"],
        stage: "code_analysis",
      },
      run.options,
    )
    await recordPaperObservabilityAudit(
      run.run_dir,
      {
        kind: "export_renderer",
        name: "docx",
        status: "failed",
        span_name: "paper_fucker.export.docx",
        attributes: { diagnostic: "pandoc missing" },
      },
      run.options,
    )

    const snapshot = await getPaperRunSnapshot(run.run_id, run.options)
    const audit = snapshot.diagnostics.audit

    expect(audit.entries.map((entry) => entry.kind)).toContain("stage")
    expect(audit.entries.map((entry) => entry.kind)).toContain("capability")
    expect(audit.entries.map((entry) => entry.kind)).toContain("model_role")
    expect(audit.entries.map((entry) => entry.kind)).toContain("subagent")
    expect(audit.entries.map((entry) => entry.kind)).toContain("tool")
    expect(audit.entries.map((entry) => entry.kind)).toContain("data_egress")
    expect(audit.entries.map((entry) => entry.kind)).toContain("export_renderer")
    expect(audit.coverage.missing_kinds).toEqual([])
    expect(snapshot.diagnostics.tool_traces.map((trace) => trace.tool_name)).toContain("paper.export.renderer.pandoc")
    expect(snapshot.diagnostics.cost).toMatchObject({ llm_usd: 0.02, api_usd: 0.01, total_usd: 0.03 })
    expect(audit.entries.find((entry) => entry.kind === "data_egress")?.attributes.blocked).toBe(2)
  })
})
