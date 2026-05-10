import { describe, expect, test } from "bun:test"
import {
  addCodeFile,
  addCodeSymbol,
  addPaperMemoryEntry,
  attachMemoryToTeamMember,
  codeUnderstandingSummary,
  createAgentRoleRouter,
  createCodeUnderstandingGraph,
  createPaperAgentTeam,
  createPaperAgentTree,
  createPaperMemoryBank,
  memoryBankSummary,
  queryPaperMemory,
} from "../../src/paper"

describe("MemoryBank and code understanding layer", () => {
  test("stores private-first memory with provenance, querying, retention, and redaction", () => {
    const bank = createPaperMemoryBank({
      run_id: "run-memory",
      policy: { max_entries: 2, default_scope: "project", default_share_policy: "summarizable" },
    })

    addPaperMemoryEntry(bank, {
      memory_id: "mem-arch",
      kind: "architecture",
      title: "Paper core owns ledgers",
      summary: "PaperRun state owns ClaimLedger and SourceLedger.",
      tags: ["architecture", "ledger"],
      source_refs: [{ path: "packages/opencode/src/paper/run.ts", source_range: "1-40" }],
      agent_id: "agent-root",
      task_id: "task-arch",
      created_at: "2026-05-11T00:00:00.000Z",
    })
    addPaperMemoryEntry(bank, {
      memory_id: "mem-secret",
      kind: "risk",
      title: "Secret-like file",
      summary: "api_key=secret should not leave local memory",
      tags: ["risk"],
      source_refs: [{ path: ".paper_fucker/local/secrets.env" }],
    })
    addPaperMemoryEntry(bank, {
      memory_id: "mem-codepath",
      kind: "codepath",
      title: "Agent team codepath",
      summary: "Agent team stores task board and mailbox.",
      tags: ["agent-team"],
      source_refs: [{ path: "packages/opencode/src/paper/agent-team.ts" }],
    })

    expect(bank.entries.map((entry) => entry.memory_id)).toEqual(["mem-secret", "mem-codepath"])
    expect(bank.entries[0]).toMatchObject({
      memory_id: "mem-secret",
      redacted: true,
      share_policy: "local_only",
      summary: "[redacted by MemoryBank policy]",
    })
    expect(queryPaperMemory(bank, { tags: ["agent-team"] }).map((entry) => entry.memory_id)).toEqual(["mem-codepath"])
    expect(memoryBankSummary(bank)).toMatchObject({
      total_entries: 2,
      redacted: 1,
      summarizable: 1,
      scopes: { project: 2 },
    })
  })

  test("builds source-range-grounded code understanding graph and experiment surfaces", () => {
    const graph = createCodeUnderstandingGraph({
      run_id: "run-code",
      workspace: "E:/Project/paper_fucker",
      packages: [{ name: "paper-core", root_path: "packages/opencode/src/paper" }],
    })
    addCodeFile(graph, { path: "packages/opencode/src/paper/run.ts", package_name: "paper-core" })
    addCodeSymbol(graph, {
      file_path: "packages/opencode/src/paper/run.ts",
      name: "getPaperRunSnapshot",
      kind: "function",
      start_line: 603,
      end_line: 706,
      exports: true,
    })
    addCodeFile(graph, { path: "packages/opencode/test/paper/memory-code-understanding.test.ts", package_name: "paper-core" })
    addCodeFile(graph, { path: "benchmarks/live-paper-quality-benchmark.ts" })

    expect(graph.files.find((file) => file.path.endsWith("run.ts"))?.source_ranges[0]).toMatchObject({
      start_line: 603,
      end_line: 706,
    })
    expect(graph.experiment_surfaces.map((surface) => surface.kind)).toEqual(expect.arrayContaining(["test", "benchmark"]))
    expect(codeUnderstandingSummary(graph)).toMatchObject({
      packages: 1,
      files: 3,
      symbols: 1,
      experiment_surfaces: 2,
      source_range_files: 1,
    })
  })

  test("attaches memory entries to Agent Team members", () => {
    const tree = createPaperAgentTree({
      run_id: "run-team-memory",
      budget_tier: "quick",
      router: createAgentRoleRouter({ default_model: "deepseek/deepseek-v4-pro" }),
      root_role: "planner",
    })
    const team = createPaperAgentTeam({ run_id: "run-team-memory", tree })
    const member = attachMemoryToTeamMember(team, team.lead_member_id, ["mem-arch", "mem-arch", "mem-risk"])

    expect(member.memory_entry_ids).toEqual(["mem-arch", "mem-risk"])
  })
})
