import { describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm } from "fs/promises"
import { setTimeout as sleep } from "node:timers/promises"
import os from "os"
import path from "path"
import {
  normalizeResearchIntake,
  recordResearchIntake,
  type ResearchBrief,
  type ResearchIntakeRequest,
} from "@/paper"
import { createResearchRun, readJsonlFacts, type ResearchRuntimeOptions } from "@/paper/research/runtime"

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

async function clean(dir: string, attempts = 30): Promise<void> {
  Bun.gc(true)
  await sleep(100)
  return rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }).catch((error) => {
    if (attempts <= 1) {
      console.warn(`Could not remove temporary intake test directory ${dir}: ${String(error)}`)
      return
    }
    return clean(dir, attempts - 1)
  })
}

describe("research intake", () => {
  test("normalizes a topic-only request into a Chinese topic-to-paper brief", () => {
    const brief = normalizeResearchIntake({ topic: "  低资源场景下的多智能体论文写作评估  " })

    expect(brief satisfies ResearchBrief).toMatchObject({
      schema_version: "ResearchBrief.v1",
      workflow: "topic_to_paper",
      topic: "低资源场景下的多智能体论文写作评估",
      language: "zh-CN",
      target_profile: "generic-preprint",
    })
    expect(brief.research_questions[0]).toContain("低资源场景下的多智能体论文写作评估")
    expect(brief.contribution_candidates).toContain("Open literature and data discovery for the topic")
    expect(brief.pause_conditions).toEqual(
      expect.arrayContaining(["license_or_source_conflict", "low_confidence_direction"]),
    )
  })

  test("normalizes code-grounded requests and preserves model-role overrides", () => {
    const request: ResearchIntakeRequest = {
      topic: "从一个 TypeScript 研究代理仓库生成论文",
      workspace_path: "E:\\Project\\paper_fucker",
      code_paths: ["packages/opencode/src/paper", "packages/opencode/src/paper/research"],
      target_profile: "nature-paper",
      model_roles: {
        writer: "deepseek/deepseek-v4-pro",
        reviewer: "openrouter/anthropic/claude-3.7-sonnet",
      },
    }

    const brief = normalizeResearchIntake(request)

    expect(brief.workflow).toBe("code_to_paper")
    expect(brief.inputs.workspace_path).toBe("E:/Project/paper_fucker")
    expect(brief.inputs.code_paths).toEqual(["packages/opencode/src/paper", "packages/opencode/src/paper/research"])
    expect(brief.target_profile).toBe("nature-paper")
    expect(brief.model_roles?.reviewer).toBe("openrouter/anthropic/claude-3.7-sonnet")
    expect(brief.needed_evidence).toEqual(
      expect.arrayContaining(["source-range-bound codebase map", "method extraction tied to file paths"]),
    )
  })

  test("normalizes mixed paper material, dataset, and experiment inputs with risk output", () => {
    const brief = normalizeResearchIntake({
      topic: "复现日志驱动的系统论文",
      paper_files: ["draft.md", "related.pdf"],
      dataset_paths: ["data/results.csv"],
      experiment_logs: ["runs/baseline.log", "runs/ablation.log"],
      language: "zh-CN",
    })

    expect(brief.workflow).toBe("materials_to_paper")
    expect(brief.inputs.paper_files).toEqual(["draft.md", "related.pdf"])
    expect(brief.inputs.dataset_paths).toEqual(["data/results.csv"])
    expect(brief.inputs.experiment_logs).toEqual(["runs/baseline.log", "runs/ablation.log"])
    expect(brief.risks.map((risk) => risk.id)).toEqual(
      expect.arrayContaining(["material_consistency", "dataset_license", "experiment_reproduction"]),
    )
  })

  test("resolves journal workbench selection into CJC profile metadata", () => {
    const brief = normalizeResearchIntake({
      topic: "面向中国计算机学报的多智能体论文生成评测",
      target_journal: "中国计算机学报",
      target_journal_url: "https://cjc.ict.ac.cn/",
    })

    expect(brief.target_profile).toBe("cjc-paper")
    expect(brief.target_journal).toBe("中国计算机学报")
    expect(brief.generated_journal_profile).toBeUndefined()
  })

  test("keeps unknown journal profile as a generated draft that still needs official guidance", () => {
    const brief = normalizeResearchIntake({
      topic: "未知期刊格式生成",
      target_journal: "Journal of Unknown Systems",
      target_journal_url: "https://example.org/for-authors",
    })

    expect(brief.target_profile).toBe("custom-journal")
    expect(brief.target_journal).toBe("Journal of Unknown Systems")
    expect(brief.generated_journal_profile).toMatchObject({
      schema_version: "PaperGeneratedJournalProfile.v1",
      status: "needs_official_guidance",
    })
  })

  test("records ResearchBrief.v1 as a run artifact and intake event", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "paper-fucker-intake-test-"))
    try {
      const workspace = path.join(dir, "workspace")
      const home = path.join(dir, "home")
      await mkdir(workspace, { recursive: true })
      await mkdir(home, { recursive: true })
      const options = runtimeOptions(workspace, home)
      const handle = await createResearchRun({ topic: "intake runtime" }, options)

      const result = await recordResearchIntake(
        handle.run_dir,
        { topic: "intake runtime", dataset_paths: ["data.csv"] },
        options,
      )

      expect(result.brief.schema_version).toBe("ResearchBrief.v1")
      expect(result.artifact.metadata?.artifact_schema).toBe("ResearchBrief.v1")
      expect(result.artifact.metadata?.logical_path).toBe("intake/research-brief.json")

      const events = await readJsonlFacts(handle.run_dir, "event")
      expect(events.map((event) => event.type)).toContain("intake.brief.created")
      expect(events.at(-1)?.payload).toMatchObject({
        workflow: "data_to_paper",
        artifact_id: result.artifact.artifact_id,
      })
    } finally {
      await clean(dir)
    }
  })
})
