import { describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "fs/promises"
import { setTimeout as sleep } from "node:timers/promises"
import os from "os"
import path from "path"
import {
  analyzeCodebaseForPaper,
  recordCodeToPaperArtifacts,
  type CodeToPaperAnalysis,
} from "@/paper"
import { createResearchRun, readJsonlFacts, writeResearchArtifact, type ResearchRuntimeOptions } from "@/paper/research/runtime"

const now = "2026-05-09T00:00:00Z"

function runtimeOptions(workspace: string, home: string): ResearchRuntimeOptions {
  let index = 0
  return {
    workspace,
    home,
    clock: () => new Date(now),
    idFactory: (kind) => `${kind}-${++index}`,
  }
}

async function clean(dir: string, attempts = 80): Promise<void> {
  Bun.gc(true)
  await sleep(100)
  return rm(dir, { recursive: true, force: true }).catch((error) => {
    if (attempts <= 1) {
      console.warn(`Could not remove temporary code-to-paper test directory ${dir}: ${String(error)}`)
      return
    }
    return clean(dir, attempts - 1)
  })
}

async function fixtureCodebase() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "paper-fucker-code-to-paper-test-"))
  await mkdir(path.join(dir, "src"), { recursive: true })
  await mkdir(path.join(dir, "test"), { recursive: true })
  await writeFile(
    path.join(dir, "src", "ranker.ts"),
    [
      "export interface Paper { title: string; score: number }",
      "",
      "export function rankPapers(papers: Paper[]) {",
      "  return papers.toSorted((left, right) => right.score - left.score)",
      "}",
      "",
      "export class CitationGraph {",
      "  addEdge(source: string, target: string) {",
      "    return `${source}->${target}`",
      "  }",
      "}",
    ].join("\n"),
  )
  await writeFile(
    path.join(dir, "test", "ranker.test.ts"),
    [
      "import { test, expect } from 'bun:test'",
      "import { rankPapers } from '../src/ranker'",
      "",
      "test('ranks papers by score', () => {",
      "  expect(rankPapers([{ title: 'A', score: 1 }, { title: 'B', score: 2 }])[0]?.title).toBe('B')",
      "})",
    ].join("\n"),
  )
  await writeFile(path.join(dir, "package.json"), JSON.stringify({ scripts: { test: "bun test" } }, null, 2))
  return dir
}

async function fixtureProtocolCodebase() {
  const dir = await fixtureCodebase()
  await writeFile(
    path.join(dir, "package.json"),
    JSON.stringify(
      {
        scripts: {
          typecheck: "bun --version",
          "baseline:toy": "bun --version",
          "ablation:toy": "bun --version",
          "repro:container": "bun --version",
          dev: "bun run --watch src/ranker.ts",
          build: "bun build src/ranker.ts",
        },
      },
      null,
      2,
    ),
  )
  return dir
}

describe("code-to-paper analysis", () => {
  test("produces code-grounded artifacts with source ranges", async () => {
    const workspace = await fixtureCodebase()
    try {
      const analysis = await analyzeCodebaseForPaper({
        workspace_path: workspace,
        code_paths: ["src", "test"],
      })

      expect(analysis satisfies CodeToPaperAnalysis).toMatchObject({
        codebase_map: { schema_version: "CodebaseMap.v1" },
        method_extraction: { schema_version: "MethodExtraction.v1" },
        experiment_surface: { schema_version: "ExperimentSurface.v1" },
        reproduction_plan: { schema_version: "ReproductionPlan.v1" },
      })
      expect(analysis.codebase_map.files.map((file) => file.path)).toEqual(["src/ranker.ts", "test/ranker.test.ts"])
      expect(analysis.method_extraction.methods).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: "rankPapers",
            kind: "function",
            summary: expect.stringContaining("returns papers.toSorted((left, right) => right.score - left.score)"),
            source_range: { path: "src/ranker.ts", start_line: 3, end_line: 5 },
          }),
          expect.objectContaining({
            name: "CitationGraph",
            kind: "class",
            source_range: { path: "src/ranker.ts", start_line: 7, end_line: 11 },
          }),
        ]),
      )
      expect(analysis.experiment_surface.tests[0]).toMatchObject({
        path: "test/ranker.test.ts",
        source_range: { path: "test/ranker.test.ts", start_line: 1, end_line: 6 },
      })
      expect(analysis.reproduction_plan.steps[0]).toMatchObject({
        command: "bun run test",
        source_range: { path: "package.json" },
      })
    } finally {
      await clean(workspace)
    }
  })

  test("keeps explicit experiment protocol scripts and filters non-experiment scripts", async () => {
    const workspace = await fixtureProtocolCodebase()
    try {
      const analysis = await analyzeCodebaseForPaper({
        workspace_path: workspace,
        code_paths: ["src", "test"],
      })

      expect(analysis.experiment_surface.runnable_entries.map((entry) => entry.name)).toEqual([
        "typecheck",
        "baseline:toy",
        "ablation:toy",
        "repro:container",
      ])
      expect(analysis.experiment_surface.runnable_entries.map((entry) => entry.name)).not.toContain("dev")
      expect(analysis.experiment_surface.runnable_entries.map((entry) => entry.name)).not.toContain("build")
    } finally {
      await clean(workspace)
    }
  })

  test("records code-to-paper artifacts into a research run", async () => {
    const workspace = await fixtureCodebase()
    const home = await mkdtemp(path.join(os.tmpdir(), "paper-fucker-code-to-paper-home-"))
    try {
      const options = runtimeOptions(workspace, home)
      const handle = await createResearchRun({ topic: "code paper", workspace }, options)
      const analysis = await analyzeCodebaseForPaper({ workspace_path: workspace, code_paths: ["src", "test"] })

      const recorded = await recordCodeToPaperArtifacts(handle.run_dir, analysis, options)

      expect(recorded.map((artifact) => artifact.metadata?.artifact_schema)).toEqual([
        "CodebaseMap.v1",
        "MethodExtraction.v1",
        "ExperimentSurface.v1",
        "ReproductionPlan.v1",
      ])
      const events = await readJsonlFacts(handle.run_dir, "event")
      expect(events.map((event) => event.type)).toContain("codetopaper.artifacts.created")
    } finally {
      await clean(workspace)
      await clean(home)
    }
  })

  test("writes valid JSON artifacts when optional fields are undefined", async () => {
    const workspace = await fixtureCodebase()
    const home = await mkdtemp(path.join(os.tmpdir(), "paper-fucker-code-to-paper-home-"))
    try {
      const options = runtimeOptions(workspace, home)
      const handle = await createResearchRun({ topic: "artifact json", workspace }, options)

      const artifact = await writeResearchArtifact(
        handle.run_dir,
        {
          kind: "log",
          logical_path: "experiments/result-report.json",
          data: {
            schema_version: "ResultReport.v1",
            best_baseline: undefined,
            nested: { value: undefined, kept: true },
            array: [undefined, "ok"],
          },
        },
        options,
      )

      const text = await Bun.file(path.join(handle.run_dir, artifact.path)).text()
      expect(() => JSON.parse(text)).not.toThrow()
      expect(JSON.parse(text)).toEqual({
        array: [null, "ok"],
        nested: { kept: true },
        schema_version: "ResultReport.v1",
      })
    } finally {
      await clean(workspace)
      await clean(home)
    }
  })
})
