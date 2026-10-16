import { describe, expect, test } from "bun:test"
import {
  builtinHFResearchLoopCapabilities,
  createHFDatasetRecord,
  createHFJobRecord,
  createHFPaperRecord,
  createHFResearchLoopPlan,
  hfJobToExperimentRun,
  hfLoopDiagnostics,
  hfLoopToolTrace,
  hfRecordsToResearchSources,
} from "../../src/paper"

describe("Hugging Face research loop", () => {
  test("defines ML-Intern-inspired capability plan with remote job approval", () => {
    const capabilities = builtinHFResearchLoopCapabilities()
    const plan = createHFResearchLoopPlan({
      topic: "code-grounded paper generation",
      include_remote_jobs: true,
    })

    expect(capabilities.map((capability) => capability.name)).toEqual([
      "hf.docs",
      "hf.papers",
      "hf.datasets",
      "hf.models",
      "hf.spaces",
      "hf.jobs",
      "hf.trackio",
    ])
    expect(plan.approval_policy.remote_jobs_require_approval).toBe(true)
    expect(plan.trace_policy).toMatchObject({
      replayable: true,
      persist_tool_trace: true,
      persist_source_records: true,
    })
    expect(plan.capabilities.map((capability) => capability.name)).toContain("hf.jobs")
  })

  test("maps HF papers and datasets into source ledger records", () => {
    const paper = createHFPaperRecord({
      paper_id: "2501.00001",
      title: "PaperCode Systems",
      url: "https://huggingface.co/papers/2501.00001",
      authors: ["S0ra"],
    })
    const dataset = createHFDatasetRecord({
      dataset_id: "s0ra/papercode-bench",
      title: "papercode benchmark",
      url: "https://huggingface.co/datasets/s0ra/papercode-bench",
      license: "apache-2.0",
      version: "sha-test",
      splits: ["train", "test"],
      task_categories: ["text-generation"],
    })
    const sources = hfRecordsToResearchSources({
      run_id: "run-hf",
      records: [paper, dataset],
      created_at: "2026-05-11T00:00:00.000Z",
    })

    expect(sources.map((source) => source.kind)).toEqual(["paper", "dataset"])
    expect(sources[1].metadata).toMatchObject({
      artifact_schema: "HFDatasetRecord.v1",
      hf_record_id: "s0ra/papercode-bench",
      source_verified: true,
    })
    expect(hfLoopDiagnostics({ sources })).toMatchObject({
      records: 2,
      verified_sources: 2,
      datasets: 1,
    })
  })

  test("turns approved HF jobs into experiment runs and tool traces", () => {
    const job = createHFJobRecord({
      job_id: "job-001",
      title: "Train baseline",
      status: "succeeded",
      command: ["python", "train.py"],
      metrics: [{ name: "accuracy", value: 0.91, direction: "higher_better" }],
      logs_uri: "hf://jobs/job-001/logs",
      cost_usd: 0.12,
    })
    const run = hfJobToExperimentRun({
      plan_id: "plan-hf",
      job,
      started_at: "2026-05-11T00:00:00.000Z",
      finished_at: "2026-05-11T00:01:00.000Z",
    })
    const capability = builtinHFResearchLoopCapabilities().find((item) => item.name === "hf.jobs")!
    const trace = hfLoopToolTrace({
      run_id: "run-hf",
      trace_id: "trace-hf-job",
      capability,
      payload: { job_id: job.job_id },
      records: [job],
      started_at: "2026-05-11T00:00:00.000Z",
      ended_at: "2026-05-11T00:01:00.000Z",
    })

    expect(run).toMatchObject({
      schema_version: "ExperimentRun.v1",
      experiment_run_id: "hf-job:job-001",
      status: "succeeded",
      execution: { kind: "imported" },
      reproduction: { container_reproduced: false },
    })
    expect(run.environment.image).toBeUndefined()
    expect(run.environment.digest).toBeUndefined()
    expect(run.reproduction.image).toBeUndefined()
    expect(run.reproduction.digest).toBeUndefined()
    expect(trace).toMatchObject({
      tool_name: "hf.jobs",
      status: "succeeded",
      output: { record_count: 1 },
    })
  })
})
