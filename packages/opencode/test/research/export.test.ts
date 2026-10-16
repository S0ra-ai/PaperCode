import { describe, expect, test } from "bun:test"
import { Database } from "bun:sqlite"
import { mkdir, mkdtemp, rm } from "fs/promises"
import { setTimeout as sleep } from "node:timers/promises"
import os from "os"
import path from "path"
import {
  createResearchRun,
  getResearchRunStatus,
  type ResearchFinalGateState,
  type ResearchRuntimeOptions,
} from "@/paper/research/runtime"
import { composeClaimLedger, composeDraftPaper } from "@/paper/research/writing"
import { FinalExportBlockedError, recordExportBundle, type ExportRenderer } from "@/paper/research/export"

const now = "2026-05-09T00:00:00Z"

async function clean(dir: string, attempts = 30): Promise<void> {
  Bun.gc(true)
  await sleep(100)
  return rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }).catch((error) => {
    if (attempts <= 1) {
      console.warn(`Could not remove temporary export test directory ${dir}: ${String(error)}`)
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

function fixturePdf() {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ]
  const stream = "BT /F1 12 Tf 72 720 Td (Export fixture) Tj ET\n"
  objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}endstream`)
  let pdf = "%PDF-1.4\n"
  const offsets = [0]
  for (const [index, object] of objects.entries()) {
    offsets.push(pdf.length)
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`
  }
  const start = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  pdf += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("")
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`
  return new TextEncoder().encode(pdf)
}

// Minimal valid OOXML package: content types, root relationship, and a one-paragraph document.
const fixtureDocx = Buffer.from(
  "UEsDBBQAAAAIALiDTV3MVIwQ4AAAAJwBAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbH2Qy07DMBBFf8XyFsUTukAIJekCyhJYlA+w7Eli4Zc8bil/z6QtXaDC0r6PM7rd+hC82GMhl2Ivb1UrBUaTrItTL9+3z829XA/d9isjCbZG6uVca34AIDNj0KRSxsjKmErQlZ9lgqzNh54QVm17BybFirE2demQQ/eEo975KjYH/j5hC3qS4vFkXFi91Dl7Z3RlHfbR/qI0Z4Li5NFDs8t0wwYJVwmL8jfgnHvlHYqzKN50qS86sAs+U7Fgk9kFTqr/a67cmcbRGbzkl7ZckkEiHjh4dVGCdvHnfjjOPXwDUEsDBBQAAAAIALiDTV02V97cogAAABgBAAALAAAAX3JlbHMvLnJlbHONzzsOwjAMBuCrRN6pCwNCqGkXhNQVlQNEiZtGNA8l4XV7MjBQxMBo+/dnuekedmY3isl4x2Fd1cDISa+M0xzOw3G1g65tTjSLXBJpMiGxsuIShynnsEdMciIrUuUDuTIZfbQilzJqDEJehCbc1PUW46cBS5P1ikPs1RrY8Az0j+3H0Ug6eHm15PKPE1+JIouoKXO4+6hQvdtVYQHbBhcvti9QSwMEFAAAAAgAuINNXSANskycAAAA0QAAABEAAAB3b3JkL2RvY3VtZW50LnhtbEWOuw7CMAxFfyXKTl0YEKr6mGBmgA8oidtGauLISWn5e5IysBzL11dHrrvNzuKNHAy5Rh6LUgp0irRxYyOfj9vhIru2XitNarHookh9F6q1kVOMvgIIakLbh4I8unQbiG0f08ojrMTaMykMIensDKeyPIPtjZNZ+SL9ydNncEZsr5snjmIwW1wYa8hZJu/cmwFVvDPswU8B//faL1BLAQIUABQAAAAIALiDTV3MVIwQ4AAAAJwBAAATAAAAAAAAAAAAAACAAQAAAABbQ29udGVudF9UeXBlc10ueG1sUEsBAhQAFAAAAAgAuINNXTZX3tyiAAAAGAEAAAsAAAAAAAAAAAAAAIABEQEAAF9yZWxzLy5yZWxzUEsBAhQAFAAAAAgAuINNXSANskycAAAA0QAAABEAAAAAAAAAAAAAAIAB3AEAAHdvcmQvZG9jdW1lbnQueG1sUEsFBgAAAAADAAMAuQAAAKcCAAAAAA==",
  "base64",
)

const successfulRenderers: ExportRenderer = {
  pdf: async () => ({ status: "written", bytes: fixturePdf(), diagnostics: [] }),
  docx: async () => ({ status: "written", bytes: fixtureDocx, diagnostics: [] }),
}

// Rendering through the real toolchain (pandoc + a TeX engine) is minutes of work on a cold
// machine, so this case gets an explicit budget instead of the 60s default.
// A full PaperRun renders through the real toolchain (pandoc + a TeX engine) when one is installed,
// which takes minutes on a loaded machine.
const EXPORT_TOOLCHAIN_TIMEOUT = 300_000

const failedRenderers: ExportRenderer = {
  pdf: async () => ({
    status: "failed",
    bytes: new Uint8Array(),
    diagnostics: ["missing external renderer: pdf"],
  }),
  docx: async () => ({
    status: "failed",
    bytes: new Uint8Array(),
    diagnostics: ["missing external renderer: docx"],
  }),
}

describe("export bundles", () => {
  test("records final Markdown/LaTeX/PDF/DOCX export when final gate passed", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "papercode-export-test-"))
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

  test("re-exporting a run rebuilds its index instead of colliding on export ids", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "papercode-reexport-test-"))
    try {
      const workspace = path.join(dir, "workspace")
      const home = path.join(dir, "home")
      await mkdir(workspace, { recursive: true })
      await mkdir(home, { recursive: true })
      const options = runtimeOptions(workspace, home)
      const handle = await createResearchRun({ topic: "LLM retrieval evaluation" }, options)
      const input = {
        mode: "final" as const,
        draft: draft(),
        final_gate: gate("passed"),
        source_artifact_ids: ["artifact-draft"],
        renderers: successfulRenderers,
        now,
      }

      const first = await recordExportBundle(handle.run_dir, input, options)
      // A bundle id is derived from the mode and the draft, so exporting the same run again writes the
      // same export:<bundle>:<format> ids. The fact files are append-only and keep both; the index has
      // to collapse them, otherwise the rebuild fails and the run can never be indexed again.
      const second = await recordExportBundle(handle.run_dir, input, options)
      expect(second.bundle.files.every((file) => file.status === "written")).toBe(true)
      expect((await getResearchRunStatus(handle.run_dir)).counts.exports).toBe(8)

      const db = new Database(path.join(handle.run_dir, "index.sqlite"), { readonly: true })
      try {
        expect((db.query("SELECT COUNT(*) AS count FROM exports").get() as { count: number }).count).toBe(4)
        // The rows must be the second export's: its artifact id is the only thing distinguishing the two
        // generations, and the files on disk are the ones it wrote.
        expect(second.artifact.artifact_id).not.toBe(first.artifact.artifact_id)
        const rows = db.query("SELECT payload_json FROM exports").all() as Array<{ payload_json: string }>
        expect(rows.map((row) => JSON.parse(row.payload_json).artifact_ids[0])).toEqual([
          second.artifact.artifact_id,
          second.artifact.artifact_id,
          second.artifact.artifact_id,
          second.artifact.artifact_id,
        ])
      } finally {
        db.close()
      }
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
    const dir = await mkdtemp(path.join(os.tmpdir(), "papercode-forced-export-test-"))
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
  }, EXPORT_TOOLCHAIN_TIMEOUT)

  test("records renderer diagnostics for failed PDF and DOCX exports", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "papercode-export-diagnostics-test-"))
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
          renderers: failedRenderers,
          now,
        },
        options,
      )

      expect(recorded.bundle.files.find((file) => file.format === "pdf")?.diagnostics).toContain(
        "missing external renderer: pdf",
      )
      expect(recorded.bundle.files.find((file) => file.format === "docx")?.diagnostics).toContain(
        "missing external renderer: docx",
      )
    } finally {
      await clean(dir)
    }
  })

  test("includes a complete manifest with source artifact refs", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "papercode-export-manifest-test-"))
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

      expect(recorded.bundle.manifest.source_artifact_ids).toEqual([
        "artifact-draft",
        "artifact-ledger",
        "artifact-review",
      ])
      expect(recorded.bundle.manifest.files).toHaveLength(4)
      expect(recorded.bundle.manifest.files.every((file) => file.sha256.length === 64)).toBe(true)
    } finally {
      await clean(dir)
    }
  })
})
