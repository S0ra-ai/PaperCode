import { describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm } from "fs/promises"
import { setTimeout as sleep } from "node:timers/promises"
import os from "os"
import path from "path"
import { createResearchRun, getResearchRunStatus, readJsonlFacts, type ResearchRuntimeOptions } from "@/paper/research/runtime"
import {
  applyCheckpointGuidance,
  composeClaimLedger,
  composeDraftPaper,
  createDraftRevision,
  recordDraftWriting,
  rollbackDraftRevision,
  streamMarkdownDraft,
} from "@/paper/research/writing"

const now = "2026-05-09T00:00:00Z"

async function clean(dir: string, attempts = 30): Promise<void> {
  Bun.gc(true)
  await sleep(100)
  return rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }).catch((error) => {
    if (attempts <= 1) {
      console.warn(`Could not remove temporary writing test directory ${dir}: ${String(error)}`)
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

describe("writing and claim ledger", () => {
  test("creates a claim ledger before draft sections and binds citations", () => {
    const ledger = composeClaimLedger({
      topic: "LLM retrieval evaluation",
      claims: [
        {
          text: "The claim-aware reranker improves retrieval accuracy over BM25.",
          section_id: "results",
          confidence: 0.84,
          source_ids: ["paper-a", "dataset-msmarco"],
          artifact_ids: ["artifact-result-report"],
        },
      ],
      now,
    })

    expect(ledger.entries).toHaveLength(1)
    expect(ledger.entries[0]?.status).toBe("supported")
    expect(ledger.entries[0]?.citations).toEqual([
      { citation_id: "cite:paper-a", source_id: "paper-a" },
      { citation_id: "cite:dataset-msmarco", source_id: "dataset-msmarco" },
    ])
  })

  test("records streamed Markdown draft, claim facts, and draft facts", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "paper-fucker-writing-test-"))
    try {
      const workspace = path.join(dir, "workspace")
      const home = path.join(dir, "home")
      await mkdir(workspace, { recursive: true })
      await mkdir(home, { recursive: true })
      const options = runtimeOptions(workspace, home)
      const handle = await createResearchRun({ topic: "LLM retrieval evaluation" }, options)
      const ledger = composeClaimLedger({
        topic: "LLM retrieval evaluation",
        claims: [
          {
            text: "The proposed method improves retrieval accuracy.",
            section_id: "results",
            confidence: 0.82,
            source_ids: ["paper-a"],
            artifact_ids: ["artifact-result-report"],
          },
        ],
        now,
      })
      const draft = composeDraftPaper({ title: "Claim-aware Retrieval Evaluation", ledger, now })
      const chunks = [...streamMarkdownDraft(draft)]

      const recorded = await recordDraftWriting(handle.run_dir, { ledger, draft, chunks }, options)
      expect(recorded.draft.markdown).toContain("The proposed method improves retrieval accuracy.")
      expect(chunks.length).toBeGreaterThanOrEqual(2)

      const claims = await readJsonlFacts(handle.run_dir, "claim")
      const drafts = await readJsonlFacts(handle.run_dir, "draft")
      expect(claims).toHaveLength(1)
      expect(drafts).toHaveLength(1)

      const status = await getResearchRunStatus(handle.run_dir)
      expect(status.artifact_versions.map((item) => item.logical_path)).toContain("writing/draft.md")
      expect(status.artifact_versions.map((item) => item.logical_path)).toContain("writing/claim-ledger.json")
    } finally {
      await clean(dir)
    }
  })

  test("annotates unsupported claims with required action in Markdown", () => {
    const ledger = composeClaimLedger({
      topic: "LLM retrieval evaluation",
      claims: [
        {
          text: "The method is universally best on all retrieval benchmarks.",
          section_id: "discussion",
          confidence: 0.35,
          source_ids: [],
          artifact_ids: [],
        },
      ],
      now,
    })
    const draft = composeDraftPaper({ title: "Draft", ledger, now })

    expect(ledger.unsupported_claim_ids).toEqual(["claim:discussion:1"])
    expect(draft.markdown).toContain("<!-- unsupported-claim: claim:discussion:1 needs evidence before final export -->")
  })

  test("applies checkpoint guidance to the next draft revision", () => {
    const ledger = composeClaimLedger({
      topic: "LLM retrieval evaluation",
      claims: [
        {
          text: "The method improves retrieval accuracy.",
          section_id: "results",
          confidence: 0.8,
          source_ids: ["paper-a"],
          artifact_ids: ["artifact-result-report"],
        },
      ],
      now,
    })
    const draft = composeDraftPaper({ title: "Draft", ledger, now })
    const guided = applyCheckpointGuidance(draft, {
      guidance_id: "guidance-1",
      target_section_id: "results",
      instruction: "Make the result claim more conservative.",
      replacement_markdown: "The method improves retrieval accuracy on the recorded fixture benchmark.",
      created_at: now,
    })

    expect(guided.applied_guidance_ids).toEqual(["guidance-1"])
    expect(guided.markdown).toContain("recorded fixture benchmark")
  })

  test("records a diff and can roll back to the previous Markdown", () => {
    const previous = "# Draft\n\nOld result."
    const next = "# Draft\n\nUpdated result."
    const revision = createDraftRevision({ previous_markdown: previous, next_markdown: next, now })

    expect(revision.diff).toContain("-Old result.")
    expect(revision.diff).toContain("+Updated result.")
    expect(rollbackDraftRevision(revision)).toBe(previous)
  })
})
