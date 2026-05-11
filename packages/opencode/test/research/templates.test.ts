import { describe, expect, test } from "bun:test"
import { existsSync } from "fs"
import { mkdir, mkdtemp, rm } from "fs/promises"
import { setTimeout as sleep } from "node:timers/promises"
import os from "os"
import path from "path"
import { createResearchRun, type ResearchRuntimeOptions } from "@/paper/research/runtime"
import {
  applyTemplateToMarkdown,
  createFallbackCjcTemplate,
  resolveAndRecordTemplate,
  resolveTemplateCandidates,
  type TemplateSpec,
} from "@/paper/research/templates"

const now = "2026-05-09T00:00:00Z"

async function clean(dir: string, attempts = 30): Promise<void> {
  Bun.gc(true)
  await sleep(250)
  return rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }).catch((error) => {
    if (attempts <= 1) {
      console.warn(`Could not remove temporary templates test directory ${dir}: ${String(error)}`)
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

function candidate(overrides: Partial<TemplateSpec>): TemplateSpec {
  return {
    ...createFallbackCjcTemplate(now),
    template_id: "candidate",
    venue: "Candidate",
    confidence: 0.9,
    fallback: false,
    ...overrides,
  }
}

describe("template resolution", () => {
  test("adopts a trusted official source", async () => {
    const resolution = resolveTemplateCandidates({ run_id: "run:test", venue: "IEEE" }, runtimeOptions(".", "."))
    expect(resolution.action).toBe("adopt")
    if (resolution.action === "adopt") {
      expect(resolution.spec.template_id).toBe("ieee-official")
      expect(resolution.spec.evidence[0]?.trust).toBe("official")
    }
  })

  test("pauses on conflicts, unclear licenses, and low confidence", () => {
    expect(
      resolveTemplateCandidates({
        run_id: "run:test",
        candidates: [candidate({ conflicts: ["official and mirror disagree"] })],
      }).action,
    ).toBe("pause")
    expect(
      resolveTemplateCandidates({
        run_id: "run:test",
        candidates: [candidate({ license: { status: "unclear" }, evidence: [] })],
      }).action,
    ).toBe("pause")
    expect(
      resolveTemplateCandidates({
        run_id: "run:test",
        candidates: [candidate({ confidence: 0.4 })],
      }).action,
    ).toBe("pause")
  })

  test("falls back to CJC default when no venue is known", () => {
    const resolution = resolveTemplateCandidates({ run_id: "run:test" }, runtimeOptions(".", "."))
    expect(resolution.action).toBe("adopt")
    if (resolution.action === "adopt") {
      expect(resolution.spec.template_id).toBe("cjc-default")
      expect(resolution.spec.fallback).toBe(true)
    }
  })

  test("records TemplateSpec and applies Markdown to LaTeX through Python bridge", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "paper-fucker-template-test-"))
    try {
      const workspace = path.join(dir, "workspace")
      const home = path.join(dir, "home")
      await mkdir(workspace, { recursive: true })
      await mkdir(home, { recursive: true })
      const options = runtimeOptions(workspace, home)
      const handle = await createResearchRun({ topic: "template fixture" }, options)
      const recorded = await resolveAndRecordTemplate(handle.run_dir, { run_id: handle.run.run_id, venue: "IEEE" }, options)
      expect(recorded.resolution.action).toBe("adopt")
      if (recorded.resolution.action !== "adopt") throw new Error("expected adoption")

      const applied = await applyTemplateToMarkdown(
        handle.run_dir,
        { markdown: "# Fixture\n\nBody.", spec: recorded.resolution.spec },
        { ...options, cwd: path.resolve(".") },
      )
      expect(existsSync(applied.latex_path)).toBe(true)
      expect(applied.diagnostics).toEqual([])
    } finally {
      await clean(dir)
    }
  })
})
