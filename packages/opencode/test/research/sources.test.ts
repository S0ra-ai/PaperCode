import { describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm } from "fs/promises"
import { setTimeout as sleep } from "node:timers/promises"
import os from "os"
import path from "path"
import { createResearchRun, getResearchRunStatus, readJsonlFacts, type ResearchRuntimeOptions } from "@/paper/research/runtime"
import {
  assessDirectionFeasibility,
  discoverAndRecordLiteratureData,
  discoverDatasets,
  discoverLiterature,
  type DatasetCandidate,
  type SourceCandidate,
} from "@/paper/research/sources"

const now = "2026-05-09T00:00:00Z"

async function clean(dir: string, attempts = 30): Promise<void> {
  Bun.gc(true)
  await sleep(100)
  return rm(dir, { recursive: true, force: true }).catch((error) => {
    if (attempts <= 1) throw error
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

function paper(id: string, title: string, topics: string[] = ["retrieval", "llm"]): SourceCandidate {
  return {
    source_id: id,
    kind: "paper",
    title,
    url: `https://example.org/${id}`,
    provider: "fixture-openalex",
    license: { status: "clear", expression: "CC-BY-4.0" },
    version: { value: "v1", retrieved_at: now },
    verification: { status: "verified", method: "fixture", checked_at: now },
    topics,
  }
}

function dataset(id: string, title: string, overrides: Partial<DatasetCandidate> = {}): DatasetCandidate {
  return {
    dataset_id: id,
    title,
    url: `https://huggingface.co/datasets/${id}`,
    provider: "fixture-huggingface",
    license: { status: "clear", expression: "apache-2.0" },
    version: { value: "2026-05-09", retrieved_at: now },
    verification: { status: "verified", method: "fixture", checked_at: now },
    topics: ["retrieval", "llm"],
    access: "open",
    task_fit: 0.82,
    ...overrides,
  }
}

describe("literature and data discovery", () => {
  test("records sufficient open literature and datasets as feasible run facts", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "paper-fucker-sources-test-"))
    try {
      const workspace = path.join(dir, "workspace")
      const home = path.join(dir, "home")
      await mkdir(workspace, { recursive: true })
      await mkdir(home, { recursive: true })
      const options = runtimeOptions(workspace, home)
      const handle = await createResearchRun({ topic: "LLM retrieval evaluation" }, options)

      const result = await discoverAndRecordLiteratureData(
        handle.run_dir,
        {
          topic: "LLM retrieval evaluation",
          full_access: true,
          literature_candidates: [
            paper("paper-a", "Retrieval augmented generation evaluation"),
            paper("paper-b", "Open benchmarks for LLM retrieval"),
            paper("paper-c", "Citation grounded answer verification"),
          ],
          dataset_candidates: [dataset("ms-marco-fixture", "MS MARCO fixture")],
        },
        options,
      )

      expect(result.feasibility.status).toBe("feasible")
      expect(result.literature.clusters.length).toBeGreaterThan(0)
      expect(result.data_plan.datasets).toHaveLength(1)

      const status = await getResearchRunStatus(handle.run_dir)
      expect(status.counts.sources).toBe(4)
      expect(status.artifact_versions.map((item) => item.logical_path).sort()).toContain("sources/literature-map.json")

      const sources = await readJsonlFacts(handle.run_dir, "source")
      expect(sources.every((source) => source.metadata?.verification_status === "verified")).toBe(true)
    } finally {
      await clean(dir)
    }
  })

  test("turns to a nearby feasible direction when the original topic lacks open data", () => {
    const literature = discoverLiterature({
      topic: "private medical dialogue retrieval",
      candidates: [
        paper("paper-a", "Medical dialogue retrieval"),
        paper("paper-b", "Clinical RAG evaluation"),
        paper("paper-c", "Privacy preserving medical QA"),
      ],
      now,
    })
    const dataPlan = discoverDatasets({
      topic: "private medical dialogue retrieval",
      candidates: [],
      now,
    })

    const feasibility = assessDirectionFeasibility({
      topic: "private medical dialogue retrieval",
      literature,
      data_plan: dataPlan,
      full_access: true,
      nearby_directions: [
        {
          topic: "open medical QA retrieval with PubMedQA",
          rationale: "PubMedQA provides an open benchmark and keeps the retrieval evaluation objective.",
          dataset_candidates: [dataset("pubmedqa-fixture", "PubMedQA fixture")],
        },
      ],
      now,
    })

    expect(feasibility.status).toBe("turned")
    expect(feasibility.selected_direction).toBe("open medical QA retrieval with PubMedQA")
    expect(feasibility.rollback.original_topic).toBe("private medical dialogue retrieval")
  })

  test("pauses when dataset licenses conflict with reproducible publication", () => {
    const literature = discoverLiterature({
      topic: "LLM retrieval evaluation",
      candidates: [paper("paper-a", "A"), paper("paper-b", "B"), paper("paper-c", "C")],
      now,
    })
    const dataPlan = discoverDatasets({
      topic: "LLM retrieval evaluation",
      candidates: [
        dataset("restricted-benchmark", "Restricted benchmark", {
          license: { status: "restricted", expression: "research-only-no-redistribution" },
        }),
      ],
      now,
    })

    const feasibility = assessDirectionFeasibility({
      topic: "LLM retrieval evaluation",
      literature,
      data_plan: dataPlan,
      full_access: true,
      now,
    })

    expect(feasibility.status).toBe("pause")
    expect(feasibility.blockers).toContain("dataset_license_conflict")
    expect(dataPlan.license_conflicts).toHaveLength(1)
  })

  test("keeps verification failures in diagnostics and excludes them from sufficiency counts", () => {
    const literature = discoverLiterature({
      topic: "LLM retrieval evaluation",
      candidates: [
        paper("paper-a", "Verified paper"),
        {
          ...paper("paper-failed", "Broken DOI mirror"),
          verification: { status: "failed", method: "fixture", checked_at: now, diagnostics: ["404 from mirror"] },
        },
      ],
      now,
    })

    expect(literature.summary.verified_sources).toBe(1)
    expect(literature.diagnostics.verification_failures).toEqual([
      { source_id: "paper-failed", reason: "404 from mirror" },
    ])
  })
})
