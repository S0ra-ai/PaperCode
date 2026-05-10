import { describe, expect, test } from "bun:test"
import {
  approveHarnessCall,
  assignTeamTasks,
  builtinPaperCapabilityPacks,
  completeHarnessCall,
  completeTeamTask,
  createCrawlSourceRecord,
  createHFDatasetRecord,
  createPaperAgentTeam,
  createPaperHarness,
  createResearchCapabilityRegistry,
  createWebCrawlPlan,
  defaultResearchCapabilities,
  enqueueHarnessCall,
  enqueueTeamTask,
  evaluateCrawlCompliance,
  hfRecordsToResearchSources,
  mergeTeamEvidence,
  nextHarnessCall,
  type AgentTeamSourceNode,
} from "../../src/paper"

const permissions = {
  allowed_tool_names: ["opencode.read", "python.web-crawler.scrapling", "hf.datasets", "hf.jobs"],
  allowed_paths: ["."],
  data_egress: "allow_summaries" as const,
  network_allowed: true,
}

function node(input: Partial<AgentTeamSourceNode> & Pick<AgentTeamSourceNode, "agent_id" | "depth" | "role">): AgentTeamSourceNode {
  return {
    parent_agent_id: input.parent_agent_id,
    subagent_role: input.subagent_role,
    provider_id: input.provider_id ?? "deepseek",
    model_id: input.model_id ?? "deepseek-v4-pro",
    capabilities: input.capabilities ?? [],
    budget: input.budget ?? { tier: "deep", usd_cap: 20 },
    input_artifacts: input.input_artifacts ?? [],
    output_artifacts: input.output_artifacts ?? [],
    tool_traces: input.tool_traces ?? [],
    children: input.children ?? [],
    permissions: input.permissions ?? permissions,
    status: input.status ?? "planned",
    agent_id: input.agent_id,
    depth: input.depth,
    role: input.role,
  }
}

describe("Agent Team capability acceptance", () => {
  test("fuses built-in skills, MCP, Python tools, crawler, HF loop, and harness approvals", () => {
    const capabilities = defaultResearchCapabilities()
    const registry = createResearchCapabilityRegistry(capabilities)
    const packs = builtinPaperCapabilityPacks()

    expect(packs.map((pack) => pack.id)).toEqual([
      "paper-profile-skills",
      "literature-mcp",
      "crawler-data",
      "huggingface-research",
      "code-experiment-core",
      "writing-verification-export",
    ])
    expect(capabilities.map((capability) => capability.name)).toEqual(
      expect.arrayContaining(["skill.nature-paper", "exa", "python.web-crawler.scrapling", "hf.datasets", "hf.jobs", "hf.trackio"]),
    )

    const harness = createPaperHarness({ run_id: "run-acceptance", policy: { max_parallel: 2 } })
    const crawl = enqueueHarnessCall(harness, {
      call_id: "call-crawl",
      stage: "data",
      capability_name: "python.web-crawler.scrapling",
      payload: { url: "https://example.test/data" },
    })
    const job = enqueueHarnessCall(harness, {
      call_id: "call-hf-job",
      stage: "experiment_execution",
      capability_name: "hf.jobs",
      payload: { job_id: "job-fixture" },
    })

    expect(crawl.status).toBe("approval_required")
    expect(job.status).toBe("approval_required")
    approveHarnessCall(harness, "call-crawl")
    expect(nextHarnessCall(harness, registry)).toMatchObject({
      action: "wait_for_approval",
      call: { call_id: "call-hf-job" },
    })
    approveHarnessCall(harness, "call-hf-job")
    expect(nextHarnessCall(harness, registry)).toMatchObject({
      action: "run",
      call: { call_id: "call-crawl", trace: { capability_name: "python.web-crawler.scrapling" } },
    })
    completeHarnessCall(harness, "call-crawl")
    expect(nextHarnessCall(harness, registry)).toMatchObject({
      action: "run",
      call: { call_id: "call-hf-job", trace: { capability_name: "hf.jobs" } },
    })
  })

  test("runs mixed topic/code/web/HF scenario through source-bound Agent Team evidence", () => {
    const team = createPaperAgentTeam({
      run_id: "run-acceptance",
      tree: {
        run_id: "run-acceptance",
        root_agent_id: "root",
        nodes: [
          node({ agent_id: "root", depth: 0, role: "planner", capabilities: ["opencode.task"], children: ["repo"] }),
          node({
            agent_id: "repo",
            parent_agent_id: "root",
            depth: 1,
            role: "code_analyst",
            subagent_role: "code",
            capabilities: ["opencode.read", "opencode.grep"],
            children: ["web"],
          }),
          node({
            agent_id: "web",
            parent_agent_id: "repo",
            depth: 2,
            role: "literature_researcher",
            subagent_role: "crawler",
            capabilities: ["python.web-crawler.scrapling", "hf.datasets"],
            children: ["review"],
          }),
          node({
            agent_id: "review",
            parent_agent_id: "web",
            depth: 3,
            role: "reviewer",
            subagent_role: "verifier",
            capabilities: ["paper.verification-gate", "hf.jobs"],
          }),
        ],
      },
      skills: ["nature-paper"],
      mcp_servers: ["exa", "hf.datasets"],
      memory_scope: "local",
    })

    expect(team.policy.no_product_hard_limit).toBe(true)
    expect(team.coverage.max_member_depth).toBe(3)
    expect(team.members.map((member) => member.model_id)).toContain("deepseek-v4-pro")

    enqueueTeamTask(team, {
      task_id: "task-web-data",
      title: "Collect web and HF data",
      stage: "data",
      description: "Collect verified web and HF dataset evidence.",
      required_capabilities: ["python.web-crawler.scrapling", "hf.datasets"],
      source_requirements: ["tool_trace", "license_check"],
      priority: "critical",
    })
    const assigned = assignTeamTasks(team)
    expect(assigned[0]).toMatchObject({ assigned_member_id: "member:web", status: "assigned" })

    const crawlPlan = createWebCrawlPlan({ urls: ["https://example.test/data"] })
    const crawlRecord = createCrawlSourceRecord({
      url: "https://example.test/data",
      content: "dataset evidence",
      license_status: "compatible",
      tool_trace_id: "trace-crawl",
    })
    const crawlReport = evaluateCrawlCompliance(crawlPlan, [crawlRecord])
    const hfSources = hfRecordsToResearchSources({
      run_id: "run-acceptance",
      records: [
        createHFDatasetRecord({
          dataset_id: "fixture/dataset",
          title: "Fixture dataset",
          url: "https://huggingface.co/datasets/fixture/dataset",
          license: "apache-2.0",
          version: "fixture",
          splits: ["train"],
          task_categories: ["text-generation"],
          trust: "local_fixture",
        }),
      ],
    })

    expect(crawlReport.status).toBe("passed")
    expect(hfSources[0]).toMatchObject({ kind: "dataset", metadata: { artifact_schema: "HFDatasetRecord.v1" } })

    completeTeamTask(team, "task-web-data", { output_artifacts: ["artifact:crawl", "artifact:hf-dataset"] })
    const evidence = mergeTeamEvidence(team, [
      {
        artifact_id: "artifact:crawl",
        originating_agent_id: "web",
        originating_task_id: "task-web-data",
        tool_traces: ["trace-crawl"],
        diagnostics: [],
      },
      {
        artifact_id: "artifact:claim-without-source",
        originating_agent_id: "web",
        originating_task_id: "task-web-data",
      },
    ])

    expect(evidence.accepted.map((item) => item.artifact_id)).toEqual(["artifact:crawl"])
    expect(evidence.rejected).toMatchObject([{ artifact_id: "artifact:claim-without-source", reason: "missing source range or tool trace" }])
    expect(team.coverage).toMatchObject({
      completed_tasks: 1,
      evidence_backed_artifacts: 1,
      rejected_evidence: 1,
    })
  })
})
