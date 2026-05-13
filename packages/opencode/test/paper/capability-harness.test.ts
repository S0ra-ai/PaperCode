import { describe, expect, test } from "bun:test"
import {
  approveHarnessCall,
  builtinPaperCapabilityPacks,
  capabilitiesForStage,
  createPaperCapabilityRegistry,
  createPaperHarness,
  defaultResearchCapabilities,
  enqueueHarnessCall,
  failHarnessCall,
  nextHarnessCall,
  snapshotPaperCapabilityRegistry,
} from "../../src/paper"

describe("built-in capability packs and harness scheduler", () => {
  test("fuses skills, MCP, local tools, Python tools, and first-party tools into built-in packs", () => {
    const packs = builtinPaperCapabilityPacks()
    const capabilities = defaultResearchCapabilities()

    expect(packs.map((pack) => pack.id)).toEqual([
      "paper-profile-skills",
      "paper-figure-skills",
      "literature-mcp",
      "crawler-data",
      "huggingface-research",
      "code-experiment-core",
      "writing-verification-export",
    ])
    expect(capabilities.map((capability) => capability.name)).toEqual(
      expect.arrayContaining([
        "skill.nature-paper",
        "skill.architecture-diagram",
        "skill.paper-framework-figure-studio-pro",
        "exa",
        "python.web-crawler.scrapling",
        "hf.datasets",
        "opencode.task",
        "paper.claim-ledger",
      ]),
    )
    expect(capabilities.every((capability) => capability.input_schema.type === "object")).toBe(true)
  })

  test("builds registry snapshots and stage-scoped capability queries", () => {
    const { registry, packs } = createPaperCapabilityRegistry()
    const snapshot = snapshotPaperCapabilityRegistry({ registry, packs })

    expect(snapshot.schema_version).toBe("PaperCapabilityRegistry.v1")
    expect(snapshot.by_stage.literature).toEqual(
      expect.arrayContaining(["exa", "mcp.crossref", "hf.docs", "hf.papers", "python.web-crawler.scrapling"]),
    )
    expect(capabilitiesForStage("experiment_execution", { registry }).capabilities.map((item) => item.name)).toEqual(
      expect.arrayContaining(["opencode.shell", "skill.jupyter-notebook", "python.experiment-log-parse", "hf.jobs"]),
    )
    expect(registry.get("skill.nature-paper")).toMatchObject({
      type: "skill",
      trust: "profile_guidance",
    })
  })

  test("schedules capability calls with approval gates, trace metadata, retry, and doom-loop detection", () => {
    const harness = createPaperHarness({
      run_id: "run-harness",
      policy: { max_parallel: 1, max_retries: 1, duplicate_window: 4, doom_loop_threshold: 2 },
    })

    const crawl = enqueueHarnessCall(harness, {
      call_id: "call-crawl",
      stage: "data",
      capability_name: "python.web-crawler.scrapling",
      payload: { url: "https://example.test/data" },
      priority: "high",
    })
    expect(crawl.status).toBe("approval_required")
    expect(nextHarnessCall(harness)).toMatchObject({ action: "wait_for_approval", call: { call_id: "call-crawl" } })

    approveHarnessCall(harness, "call-crawl")
    const running = nextHarnessCall(harness)
    expect(running).toMatchObject({ action: "run", call: { call_id: "call-crawl", status: "running" } })
    expect(running.call?.trace).toMatchObject({
      capability_name: "python.web-crawler.scrapling",
      otel_span_name: "paper_fucker.capability.python.web-crawler.scrapling",
    })
    failHarnessCall(harness, "call-crawl", "network timeout")
    expect(harness.calls.find((call) => call.call_id === "call-crawl")?.status).toBe("queued")

    enqueueHarnessCall(harness, {
      call_id: "call-1",
      stage: "literature",
      capability_name: "exa",
      payload: { q: "same" },
    })
    enqueueHarnessCall(harness, {
      call_id: "call-2",
      stage: "literature",
      capability_name: "exa",
      payload: { q: "same" },
    })
    const skipped = enqueueHarnessCall(harness, {
      call_id: "call-3",
      stage: "literature",
      capability_name: "exa",
      payload: { q: "same" },
    })
    expect(skipped.status).toBe("skipped")
    expect(skipped.diagnostics.join("\n")).toContain("Doom-loop detector")
  })
})
