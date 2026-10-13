import { describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm } from "fs/promises"
import { setTimeout as sleep } from "node:timers/promises"
import os from "os"
import path from "path"
import { createResearchRun, getResearchRunStatus, type ResearchRuntimeOptions } from "@/paper/research/runtime"
import { composeClaimLedger, composeDraftPaper } from "@/paper/research/writing"
import { discoverDatasets } from "@/paper/research/sources"
import {
  analyzeExperimentResults,
  planExperiments,
  runContainerReproduction,
  runHostExploration,
} from "@/paper/research/experiments"
import { evaluateVerificationGate, recordVerificationGate, type ModelReviewInput } from "@/paper/research/verification"

const now = "2026-05-09T00:00:00Z"

async function clean(dir: string, attempts = 30): Promise<void> {
  Bun.gc(true)
  await sleep(100)
  return rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }).catch((error) => {
    if (attempts <= 1) {
      console.warn(`Could not remove temporary verification test directory ${dir}: ${String(error)}`)
      return
    }
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

function supportedFixture() {
  const ledger = composeClaimLedger({
    topic: "LLM retrieval evaluation",
    claims: [
      {
        text: "The method improves retrieval accuracy on the fixture benchmark.",
        section_id: "results",
        confidence: 0.82,
        source_ids: ["paper-a", "dataset-a"],
        artifact_ids: ["artifact-result-report"],
      },
    ],
    now,
  })
  return {
    ledger,
    draft: composeDraftPaper({ title: "Draft", ledger, now }),
    source_records: sourceRecords(),
  }
}

function dataPlan(status: "clear" | "restricted" = "clear") {
  return discoverDatasets({
    topic: "LLM retrieval evaluation",
    candidates: [
      {
        dataset_id: "dataset-a",
        title: "Dataset A",
        // Simulated workspace-authorized data, rather than a placeholder remote benchmark.
        url: "file:///fixture/dataset-a.json",
        provider: "workspace",
        license: {
          status,
          expression: status === "clear" ? "workspace-authorized local dataset" : "research-only-no-redistribution",
        },
        version: { value: "v1", retrieved_at: now },
        verification: { status: "verified", method: "fixture", checked_at: now },
        access: "open",
        task_fit: 0.8,
      },
    ],
    now,
  })
}

function sourceRecords(
  status: "verified" | "unverified" | "failed" = "verified",
  license: "clear" | "restricted" = "clear",
) {
  return [
    {
      schema_version: "SourceRecord.v1" as const,
      source_id: "paper-a",
      kind: "paper" as const,
      title: "Paper A",
      url: "https://example.org/paper-a",
      provider: "fixture",
      license: { status: license, expression: license === "clear" ? "open" : "restricted" },
      version: { value: "v1", retrieved_at: now },
      verification: { status, method: "fixture", checked_at: now },
      retrieved_at: now,
    },
    {
      schema_version: "SourceRecord.v1" as const,
      source_id: "dataset-a",
      kind: "dataset" as const,
      title: "Dataset A",
      url: "file:///fixture/dataset-a.json",
      provider: "workspace",
      license: { status: "clear" as const, expression: "workspace-authorized local dataset" },
      version: { value: "v1", retrieved_at: now },
      verification: { status: "verified" as const, method: "fixture", checked_at: now },
      retrieved_at: now,
    },
  ]
}

async function resultReport(reproduced = true) {
  const plan = planExperiments({
    topic: "retrieval",
    method_name: "reranker",
    dataset_ids: ["dataset-a"],
    now,
    proposed_command: { argv: ["python", "fixture.py", "proposed"] },
    baseline_specs: [
      {
        experiment_id: "baseline",
        label: "baseline",
        command: { argv: ["python", "fixture.py", "baseline"] },
        rationale: "Explicit fixture control",
      },
    ],
    ablation_specs: [],
  })
  // Explicit simulated process/isolation evidence tests the gate without executing containers.
  const hostRuns = await runHostExploration(
    plan,
    async (spec) => ({
      status: "succeeded",
      execution: { kind: "process", command: spec.command, exit_code: 0 },
      metrics: [{ name: "accuracy", value: 0.8, direction: "higher_better" }],
      stdout: "",
      stderr: "",
      exit_code: 0,
    }),
    { now },
  )
  const containerRuns = await runContainerReproduction(
    plan,
    hostRuns,
    async (spec) => ({
      status: reproduced ? "succeeded" : "failed",
      execution: {
        kind: "process",
        command: spec.command,
        exit_code: reproduced ? 0 : 1,
        container: {
          runtime: "docker",
          container_id: `fixture-${spec.experiment_id}`,
          image_digest: `sha256:${"a".repeat(64)}`,
          isolated: true,
        },
      },
      metrics: reproduced ? [{ name: "accuracy", value: 0.8, direction: "higher_better" }] : [],
      stdout: "",
      stderr: reproduced ? "" : "container failed",
      exit_code: reproduced ? 0 : 1,
    }),
    { now },
  )
  const report = analyzeExperimentResults({ plan, host_runs: hostRuns, container_runs: containerRuns, now })
  expect(report.reproduction.status).toBe(reproduced ? "passed" : "failed")
  expect(report.final_claims_allowed).toBe(reproduced)
  return report
}

function reviews(...items: ModelReviewInput[]): ModelReviewInput[] {
  return items
}

describe("verification final gate", () => {
  test("blocks invalid references", async () => {
    const fixture = supportedFixture()
    const report = await resultReport(true)
    const gate = evaluateVerificationGate({
      ...fixture,
      data_plan: dataPlan("clear"),
      result_report: report,
      available_source_ids: ["paper-a"],
      model_reviews: reviews(
        { model: "deepseek-v4-pro", verdict: "pass" },
        { model: "deepseek-v4-pro-review", verdict: "pass" },
      ),
      now,
    })

    expect(gate.blocking_report.status).toBe("blocked")
    expect(gate.blocking_report.blockers.map((item) => item.category)).toContain("invalid_reference")
  })

  test("blocks unsupported claims", async () => {
    const ledger = composeClaimLedger({
      topic: "LLM retrieval evaluation",
      claims: [
        {
          text: "Unsupported universal claim.",
          section_id: "discussion",
          confidence: 0.2,
          source_ids: [],
          artifact_ids: [],
        },
      ],
      now,
    })
    const gate = evaluateVerificationGate({
      ledger,
      draft: composeDraftPaper({ title: "Draft", ledger, now }),
      source_records: sourceRecords(),
      data_plan: dataPlan("clear"),
      result_report: await resultReport(true),
      available_source_ids: ["paper-a", "dataset-a"],
      model_reviews: reviews(
        { model: "deepseek-v4-pro", verdict: "pass" },
        { model: "deepseek-v4-pro-review", verdict: "pass" },
      ),
      now,
    })
    expect(gate.blocking_report.blockers.map((item) => item.category)).toContain("unsupported_claim")
  })

  test("blocks dataset license failures", async () => {
    const fixture = supportedFixture()
    const gate = evaluateVerificationGate({
      ...fixture,
      data_plan: dataPlan("restricted"),
      result_report: await resultReport(true),
      available_source_ids: ["paper-a", "dataset-a"],
      model_reviews: reviews(
        { model: "deepseek-v4-pro", verdict: "pass" },
        { model: "deepseek-v4-pro-review", verdict: "pass" },
      ),
      now,
    })
    expect(gate.blocking_report.blockers.map((item) => item.category)).toContain("dataset_license_failure")
  })

  test("blocks failed container reproduction", async () => {
    const fixture = supportedFixture()
    const gate = evaluateVerificationGate({
      ...fixture,
      data_plan: dataPlan("clear"),
      result_report: await resultReport(false),
      available_source_ids: ["paper-a", "dataset-a"],
      model_reviews: reviews(
        { model: "deepseek-v4-pro", verdict: "pass" },
        { model: "deepseek-v4-pro-review", verdict: "pass" },
      ),
      now,
    })
    expect(gate.blocking_report.blockers.map((item) => item.category)).toContain("reproduction_failure")
  })

  test("blocks final export when cited sources are not verified", async () => {
    const fixture = supportedFixture()
    const gate = evaluateVerificationGate({
      ...fixture,
      data_plan: dataPlan("clear"),
      result_report: await resultReport(true),
      available_source_ids: ["paper-a", "dataset-a"],
      source_records: sourceRecords("unverified"),
      model_reviews: reviews(
        { model: "deepseek-v4-pro", verdict: "pass" },
        { model: "deepseek-v4-pro-review", verdict: "pass" },
      ),
      now,
    })
    expect(gate.blocking_report.blockers.map((item) => item.category)).toContain("unverified_source")
  })

  test("keeps reviewer warnings non-blocking", async () => {
    const fixture = supportedFixture()
    const gate = evaluateVerificationGate({
      ...fixture,
      data_plan: dataPlan("clear"),
      result_report: await resultReport(true),
      available_source_ids: ["paper-a", "dataset-a"],
      model_reviews: reviews(
        { model: "deepseek-v4-pro", verdict: "pass" },
        { model: "deepseek-v4-pro-review", verdict: "warn", message: "Improve wording in limitations." },
      ),
      now,
    })
    expect(gate.blocking_report.status).toBe("passed")
    expect(gate.review_report.findings.map((item) => item.category)).toContain("reviewer_warning")
  })

  test("records a passed final gate into runtime state", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "paper-fucker-verification-test-"))
    try {
      const workspace = path.join(dir, "workspace")
      const home = path.join(dir, "home")
      await mkdir(workspace, { recursive: true })
      await mkdir(home, { recursive: true })
      const options = runtimeOptions(workspace, home)
      const handle = await createResearchRun({ topic: "LLM retrieval evaluation" }, options)
      const fixture = supportedFixture()

      const recorded = await recordVerificationGate(
        handle.run_dir,
        {
          ...fixture,
          data_plan: dataPlan("clear"),
          result_report: await resultReport(true),
          available_source_ids: ["paper-a", "dataset-a"],
          model_reviews: reviews(
            { model: "deepseek-v4-pro", verdict: "pass" },
            { model: "deepseek-v4-pro-review", verdict: "pass" },
          ),
          now,
        },
        options,
      )

      expect(recorded.blocking_report.final_export_eligible).toBe(true)
      const status = await getResearchRunStatus(handle.run_dir)
      expect(status.state.final_gate.status).toBe("passed")
      expect(status.artifact_versions.map((item) => item.logical_path)).toContain("verification/blocking-report.json")
      expect(status.counts.reviews).toBe(1)
    } finally {
      await clean(dir)
    }
  })
})
