import { describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm } from "fs/promises"
import { setTimeout as sleep } from "node:timers/promises"
import os from "os"
import path from "path"
import { createResearchRun, getResearchRunStatus, type ResearchFinalGateState, type ResearchRuntimeOptions } from "@/paper/research/runtime"
import { composeClaimLedger, composeDraftPaper } from "@/paper/research/writing"
import {
  FinalExportBlockedError,
  recordExportBundle,
  type ExportRenderer,
} from "@/paper/research/export"

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

function draft() {
  const ledger = composeClaimLedger({
    topic: "LLM retrieval evaluation",
    claims: [
      {
        text: "The method improves retrieval accuracy.",
        section_id: "results",
        confidence: 0.82,
        source_ids: ["paper-a"],
        artifact_ids: ["artifact-result-report"],
      },
    ],
    now,
  })
  return composeDraftPaper({ title: "Claim-aware Retrieval", ledger, now })
}

function gate(status: ResearchFinalGateState["status"], blockers: string[] = []): ResearchFinalGateState {
  return { status, blockers, updated_at: now }
}

const successfulRenderers: ExportRenderer = {
  pdf: async () => ({ status: "written", bytes: new TextEncoder().encode("%PDF fixture"), diagnostics: [] }),
  docx: async () => ({ status: "written", bytes: new TextEncoder().encode("DOCX fixture"), diagnostics: [] }),
}

describe("export bundles", () => {
  test("records final Markdown/LaTeX/PDF/DOCX export when final gate passed", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "paper-fucker-export-test-"))
    try {
      const workspace = path.join(dir, "workspace")
      const home = path.join(dir, "home")
      await mkdir(workspace, { recursive: true })
      await mkdir(home, { recursive: true })
      const options = runtimeOptions(workspace, home)
      const handle = await createResearchRun({ topic: "LLM retrieval evaluation" }, options)

      const recorded = await recordExportBundle(
        handle.run_dir,
        {
          mode: "final",
          draft: draft(),
          final_gate: gate("passed"),
          source_artifact_ids: ["artifact-draft", "artifact-review"],
          renderers: successfulRenderers,
          now,
        },
        options,
      )

      expect(recorded.bundle.status).toBe("final")
      expect(recorded.bundle.files.map((file) => file.format).sort()).toEqual(["docx", "latex", "markdown", "pdf"])
      expect(recorded.bundle.files.every((file) => file.status === "written")).toBe(true)

      const status = await getResearchRunStatus(handle.run_dir)
      expect(status.counts.exports).toBe(4)
      expect(status.artifact_versions.map((item) => item.logical_path)).toContain("exports/export-bundle.json")
    } finally {
      await clean(dir)
    }
  })

  test("blocks final export when final gate failed", async () => {
    await expect(
      recordExportBundle("unused", {
        mode: "final",
        draft: draft(),
        final_gate: gate("blocked", ["unsupported_claim"]),
        source_artifact_ids: [],
        renderers: successfulRenderers,
        now,
      }),
    ).rejects.toThrow(FinalExportBlockedError)
  })

  test("allows forced draft export with visible failed checks", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "paper-fucker-forced-export-test-"))
    try {
      const workspace = path.join(dir, "workspace")
      const home = path.join(dir, "home")
      await mkdir(workspace, { recursive: true })
      await mkdir(home, { recursive: true })
      const options = runtimeOptions(workspace, home)
      const handle = await createResearchRun({ topic: "LLM retrieval evaluation" }, options)
      const recorded = await recordExportBundle(
        handle.run_dir,
        {
          mode: "forced_draft",
          draft: draft(),
          final_gate: gate("blocked", ["unsupported_claim", "reproduction_failure"]),
          source_artifact_ids: ["artifact-draft"],
          now,
        },
        options,
      )

      expect(recorded.bundle.status).toBe("forced_draft")
      expect(recorded.bundle.verification_summary.failed_checks).toEqual(["unsupported_claim", "reproduction_failure"])
      expect(recorded.bundle.files.find((file) => file.format === "markdown")?.preview).toContain("FORCED DRAFT")
    } finally {
      await clean(dir)
    }
  })

  test("records missing external tool diagnostics for PDF and DOCX", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "paper-fucker-export-diagnostics-test-"))
    try {
      const workspace = path.join(dir, "workspace")
      const home = path.join(dir, "home")
      await mkdir(workspace, { recursive: true })
      await mkdir(home, { recursive: true })
      const options = runtimeOptions(workspace, home)
      const handle = await createResearchRun({ topic: "LLM retrieval evaluation" }, options)
      const recorded = await recordExportBundle(
        handle.run_dir,
        {
          mode: "final",
          draft: draft(),
          final_gate: gate("passed"),
          source_artifact_ids: [],
          now,
        },
        options,
      )

      expect(recorded.bundle.files.find((file) => file.format === "pdf")?.diagnostics).toContain("missing external renderer: pdf")
      expect(recorded.bundle.files.find((file) => file.format === "docx")?.diagnostics).toContain("missing external renderer: docx")
    } finally {
      await clean(dir)
    }
  })

  test("includes a complete manifest with source artifact refs", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "paper-fucker-export-manifest-test-"))
    try {
      const workspace = path.join(dir, "workspace")
      const home = path.join(dir, "home")
      await mkdir(workspace, { recursive: true })
      await mkdir(home, { recursive: true })
      const options = runtimeOptions(workspace, home)
      const handle = await createResearchRun({ topic: "LLM retrieval evaluation" }, options)
      const recorded = await recordExportBundle(
        handle.run_dir,
        {
          mode: "final",
          draft: draft(),
          final_gate: gate("passed"),
          source_artifact_ids: ["artifact-draft", "artifact-ledger", "artifact-review"],
          renderers: successfulRenderers,
          now,
        },
        options,
      )

      expect(recorded.bundle.manifest.source_artifact_ids).toEqual(["artifact-draft", "artifact-ledger", "artifact-review"])
      expect(recorded.bundle.manifest.files).toHaveLength(4)
      expect(recorded.bundle.manifest.files.every((file) => file.sha256.length === 64)).toBe(true)
    } finally {
      await clean(dir)
    }
  })
})
