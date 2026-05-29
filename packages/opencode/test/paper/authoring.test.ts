import { describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm } from "fs/promises"
import { setTimeout as sleep } from "node:timers/promises"
import os from "os"
import path from "path"
import {
  createRunBoundPreviewSnapshot,
  runPaperAuthoringLoop,
  type PaperAvailabilityBundle,
  type PaperSupplementaryBundle,
} from "@/paper"
import { type ExportRenderer } from "@/paper/research/export"
import { createResearchRun, type ResearchRuntimeOptions } from "@/paper/research/runtime"
import { discoverLiterature, type DataPlan } from "@/paper/research/sources"
import { type ResultReport } from "@/paper/research/experiments"
import { checkReferences } from "@/paper/research/verification"
import { composeClaimLedger, composeDraftPaper } from "@/paper/research/writing"

const now = "2026-05-09T00:00:00Z"

async function clean(dir: string, attempts = 80): Promise<void> {
  Bun.gc(true)
  await sleep(150)
  return rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }).catch((error) => {
    const retryable =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error.code === "EBUSY" || error.code === "EACCES" || error.code === "EPERM")
    if (!retryable) throw error
    if (attempts <= 1) {
      console.warn(`Could not remove temporary authoring test directory ${dir}: ${String(error)}`)
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

function dataPlan(): DataPlan {
  return {
    schema_version: "DataPlan.v1",
    topic: "Claim-aware retrieval",
    created_at: now,
    datasets: [
      {
        schema_version: "DatasetCard.v1",
        dataset_id: "dataset-open-retrieval",
        source_id: "source-dataset-open-retrieval",
        title: "Open Retrieval Dataset",
        url: "https://example.org/dataset",
        provider: "fixture",
        license: { status: "clear", expression: "CC-BY-4.0" },
        version: { value: "v1", retrieved_at: now },
        verification: { status: "verified", method: "fixture", checked_at: now },
        access: "open",
        task_fit: 0.9,
        created_at: now,
      },
    ],
    license_conflicts: [],
    access_constraints: [],
    diagnostics: { verification_failures: [], gaps: [] },
    recommendation: "use",
  }
}

function resultReport(): ResultReport {
  return {
    schema_version: "ResultReport.v1",
    plan_id: "plan-1",
    created_at: now,
    primary_metric: "accuracy",
    best_baseline: { experiment_id: "baseline", value: 0.71 },
    proposed: { experiment_id: "proposed", value: 0.83 },
    findings: [],
    blockers: [],
    recommendation: "accept",
    reproduction: { status: "passed", container_run_ids: ["run-container-1"] },
    final_claims_allowed: true,
  }
}

function markdownSection(markdown: string, title: string) {
  const heading = `## ${title}`
  const start = markdown.indexOf(heading)
  if (start < 0) return ""
  const bodyStart = start + heading.length
  const next = markdown.slice(bodyStart).search(/\n## /)
  return next < 0 ? markdown.slice(bodyStart).trim() : markdown.slice(bodyStart, bodyStart + next).trim()
}

const renderers: ExportRenderer = {
  pdf: async () => ({ status: "written", bytes: new TextEncoder().encode("%PDF-1.7\n% authoring test renderer\n"), diagnostics: [] }),
  docx: async () => ({ status: "written", bytes: new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]), diagnostics: [] }),
}

describe("paper authoring loop", () => {
  test("creates a run-bound preview snapshot with claim, citation, reviewer, cost, and agent annotations", () => {
    const ledger = composeClaimLedger({
      topic: "Claim-aware retrieval",
      claims: [
        {
          text: "The method improves retrieval accuracy on the open benchmark.",
          section_id: "results",
          confidence: 0.82,
          source_ids: ["paper-a"],
          artifact_ids: ["artifact-result-report"],
        },
      ],
      now,
    })
    const draft = composeDraftPaper({ title: "Claim-aware Retrieval", ledger, now })

    const snapshot = createRunBoundPreviewSnapshot({
      run_id: "run-1",
      title: draft.title,
      draft,
      ledger,
      review_report: {
        schema_version: "ReviewReport.v1",
        created_at: now,
        reviewers: [{ model: "deepseek-v4-pro", verdict: "warn", message: "Needs clearer limitation." }],
        findings: [
          {
            finding_id: "reviewer_warning:limitations",
            category: "reviewer_warning",
            severity: "warning",
            message: "Clarify limitations.",
            claim_ids: [],
            source_ids: [],
            artifact_ids: [],
            required_action: "Add limitations paragraph.",
          },
        ],
        consensus: "warn",
        escalated: false,
      },
      costs: { llm_usd: 0.12, api_usd: 0.03, total_usd: 0.15 },
      agents: [{ name: "writer", status: "ready", detail: "deepseek/deepseek-v4-pro" }],
      now,
    })

    expect(snapshot.readonly).toBe(true)
    expect(snapshot.artifacts.markdown?.content).toContain("Claim-aware Retrieval")
    expect(snapshot.annotations.map((annotation) => annotation.kind)).toContain("claim")
    expect(snapshot.annotations.map((annotation) => annotation.kind)).toContain("citation")
    expect(snapshot.annotations.map((annotation) => annotation.kind)).toContain("reviewer")
    expect(snapshot.annotations.map((annotation) => annotation.kind)).toContain("cost")
    expect(snapshot.annotations.map((annotation) => annotation.kind)).toContain("agent")
    expect(snapshot.diagnostics.costs.total_usd).toBe(0.15)
  })

  test("composes a reviewable scaffold instead of a one-section placeholder", () => {
    const ledger = composeClaimLedger({
      topic: "Verifiable paper automation",
      claims: [
        {
          text: "The method needs verified evidence before final export.",
          section_id: "method",
          confidence: 0.35,
          source_ids: [],
          artifact_ids: ["artifact-plan"],
        },
      ],
      now,
    })
    const draft = composeDraftPaper({ title: "Verifiable Paper Automation", ledger, now })

    expect(draft.markdown).toContain("## 摘要")
    expect(draft.markdown).toContain("## 相关工作")
    expect(draft.markdown).toContain("## 可复现性")
    expect(draft.markdown).toContain("## 附录 B：复现清单")
    expect(draft.markdown).toContain("## 附录 E：断言证据表")
    expect(draft.markdown).toContain("终稿输出必须保持阻断")
    expect(draft.markdown).toContain("结构化证据 1 条")
    expect(draft.markdown).not.toContain("artifact-plan")
  })

  test("composes a complete code-paper manuscript when experiment evidence is available", () => {
    const ledger = composeClaimLedger({
      topic: "Code experiment paper",
      claims: [
        {
          text: "The workflow links source ranges, experiment runs, and export gates before final paper generation.",
          section_id: "method",
          confidence: 0.86,
          source_ids: ["material:code:paper-workflow"],
          artifact_ids: ["artifact-codebase-map", "artifact-experiment-runs"],
        },
        {
          text: "The proposed workflow matches the declared baseline on the primary reproducibility metric.",
          section_id: "results",
          confidence: 0.8,
          source_ids: ["material:code:paper-workflow"],
          artifact_ids: ["artifact-result-report", "artifact-experiment-runs"],
        },
      ],
      now,
    })

    const run = (experiment_id: string, role: "proposed" | "baseline" | "ablation", mode: "host" | "container") => ({
      experiment_id,
      role,
      status: "succeeded" as const,
      command: { argv: ["bun", "run", mode === "container" ? "repro:container" : experiment_id === "proposed" ? "typecheck" : experiment_id] },
      environment:
        mode === "container"
          ? ({ mode: "container" as const, image: "paper-fucker/research-runner:test", platform: "container" as const })
          : ({ mode: "host" as const, platform: process.platform }),
      metrics: [{ name: "typecheck_pass", value: 1, direction: "higher_better" as const, unit: "ratio" }],
      stdout: "ok",
      stderr: "",
      exit_code: 0,
      resource_usage: { wall_time_seconds: 0.2 },
    })

    const draft = composeDraftPaper({
      title: "Code Experiment Paper",
      ledger,
      data_plan: dataPlan(),
      experiment_plan: {
        objective: "Create a reproducible evaluation plan before allowing final paper claims.",
        metrics: [{ name: "typecheck_pass", direction: "higher_better", primary: true }],
        proposed: {
          experiment_id: "proposed",
          label: "Code-grounded paper_fucker workflow",
          role: "proposed",
          dataset_ids: [],
          command: { argv: ["bun", "run", "typecheck"] },
          expected_metric: "typecheck_pass",
          rationale: "Main workflow under evaluation.",
        },
        baselines: [
          {
            experiment_id: "baseline:toy",
            label: "baseline:toy",
            role: "baseline",
            dataset_ids: [],
            command: { argv: ["bun", "run", "baseline:toy"] },
            expected_metric: "typecheck_pass",
            rationale: "Baseline runner declared by package script.",
          },
        ],
        ablations: [
          {
            experiment_id: "ablation:toy",
            label: "ablation:toy",
            role: "ablation",
            dataset_ids: [],
            command: { argv: ["bun", "run", "ablation:toy"] },
            expected_metric: "typecheck_pass",
            rationale: "Ablation runner declared by package script.",
          },
        ],
        resource_budget: { max_wall_time_seconds: 3600, max_memory_mb: 8192, max_gpu_hours: 0 },
        downgrade_policy: ["If container reproduction fails, block final paper claims."],
      },
      experiment_protocol: {
        discovered_from: "package_scripts",
        gaps: [],
        entries: [
          {
            protocol_id: "protocol-proposed",
            role: "proposed",
            label: "proposed",
            command: { argv: ["bun", "run", "typecheck"] },
            expected_metric: "typecheck_pass",
            rationale: "main check",
          },
          {
            protocol_id: "container:repro-container",
            role: "container_reproduction",
            label: "repro:container",
            command: { argv: ["bun", "run", "repro:container"] },
            expected_metric: "container_reproduction_pass",
            rationale: "container check",
          },
        ],
      },
      literature_map: {
        schema_version: "LiteratureMap.v1",
        topic: "Code experiment paper",
        created_at: now,
        sources: [
          {
            schema_version: "SourceRecord.v1",
            source_id: "paper:toolformer",
            kind: "paper",
            title: "Toolformer: Language Models Can Teach Themselves to Use Tools",
            url: "https://arxiv.org/abs/2302.04761",
            provider: "arxiv",
            license: { status: "clear", expression: "arXiv non-exclusive distribution" },
            version: { value: "v1", retrieved_at: now, published_at: "2023-02-09" },
            verification: { status: "verified", method: "fixture-arxiv", checked_at: now },
            topics: ["tool use", "language models"],
            abstract: "Demonstrates language models learning API/tool use from self-supervised signals.",
            arxiv_id: "2302.04761",
            retrieved_at: now,
          },
          {
            schema_version: "SourceRecord.v1",
            source_id: "paper:reproducibility-crisis",
            kind: "paper",
            title: "Reproducibility in Machine Learning",
            url: "https://doi.org/10.1145/1234567",
            provider: "doi",
            license: { status: "clear", expression: "publisher metadata" },
            version: { value: "metadata", retrieved_at: now, published_at: "2021-01-01" },
            verification: { status: "verified", method: "fixture-doi", checked_at: now },
            topics: ["reproducibility", "machine learning"],
            abstract: "Surveys empirical reproducibility risks in machine learning experiments.",
            doi: "10.1145/1234567",
            retrieved_at: now,
          },
        ],
        clusters: [
          {
            cluster_id: "cluster:tool-use",
            label: "Tool-use agents",
            keywords: ["tool use", "agents"],
            source_ids: ["paper:toolformer"],
            confidence: 0.83,
          },
        ],
        summary: { total_sources: 2, verified_sources: 2, open_license_sources: 2 },
        diagnostics: { verification_failures: [], gaps: [] },
      },
      experiment_runs: {
        host_runs: [run("proposed", "proposed", "host"), run("baseline:toy", "baseline", "host"), run("ablation:toy", "ablation", "host")],
        container_runs: [
          run("proposed", "proposed", "container"),
          run("baseline:toy", "baseline", "container"),
          run("ablation:toy", "ablation", "container"),
        ],
      },
      result_report: {
        ...resultReport(),
        primary_metric: "typecheck_pass",
        best_baseline: { experiment_id: "baseline:toy", value: 1 },
        proposed: { experiment_id: "proposed", value: 1 },
      },
      now,
    })

    const abstract = markdownSection(draft.markdown, "摘要")
    const introduction = markdownSection(draft.markdown, "引言")
    const researchQuestions = markdownSection(draft.markdown, "研究问题")
    const contributions = markdownSection(draft.markdown, "主要贡献")
    const relatedWork = markdownSection(draft.markdown, "相关工作")
    const studyDesign = markdownSection(draft.markdown, "研究设计与证据流")
    const method = markdownSection(draft.markdown, "方法")
    const evidenceTraceability = markdownSection(draft.markdown, "证据与可追踪性")
    const discussion = markdownSection(draft.markdown, "讨论")
    const results = markdownSection(draft.markdown, "结果")
    const reproducibility = markdownSection(draft.markdown, "可复现性")
    const references = markdownSection(draft.markdown, "参考文献")
    const mainBody = draft.markdown.slice(0, draft.markdown.indexOf("## 附录 A：证据追踪"))
    expect(draft.markdown.length).toBeGreaterThanOrEqual(8500)
    expect(draft.markdown).toContain("## 研究问题")
    expect(draft.markdown).toContain("## 主要贡献")
    expect(draft.markdown).toContain("## 研究设计与证据流")
    expect(draft.markdown).toContain("## 证据与可追踪性")
    expect(draft.markdown).not.toContain("## Evidence Model")
    expect(draft.markdown).toContain("## 实验设置")
    expect(draft.markdown).toContain("## 可复现性")
    expect(draft.markdown).toContain("## 参考文献")
    expect(draft.markdown).toContain("## 附录 A：证据追踪")
    expect(draft.markdown).toContain("## 附录 B：复现清单")
    expect(draft.markdown).toContain("## 效度威胁")
    expect(draft.markdown).toContain("登记命令")
    expect(draft.markdown).not.toContain("## System Architecture")
    expect(draft.markdown).not.toContain("本文把“能否生成一篇论文”")
    expect(draft.markdown).not.toContain("PaperRun 的架构目标")
    expect(draft.markdown).not.toContain("Paper Fucker 的差异点")
    expect(draft.markdown).not.toContain("Paper Fucker 工作流")
    expect(draft.markdown).not.toContain("container:paper-fucker/research-runner")
    expect(abstract).toContain("源码范围")
    expect(abstract).toContain("实验运行记录")
    expect(abstract).toContain("已声明基线")
    expect(abstract).toContain("证据充分性检查已通过")
    expect(abstract).not.toContain("终稿检查")
    expect(abstract).not.toContain("当前状态为")
    expect(introduction).toContain("源码范围")
    expect(introduction).toContain("本研究使用 4 个可追踪来源")
    expect(introduction).toContain("其中代码材料 1 个、已验证论文来源 2 个、数据集来源 1 个")
    expect(introduction).not.toContain("主要包括")
    expect(introduction).not.toContain("主要包括 ")
    expect(introduction).toContain("实验运行记录")
    expect(introduction).toContain("已声明基线")
    expect(researchQuestions).toContain("本文把研究目标拆成三项")
    expect(researchQuestions).toContain("基线=1、消融=1、容器复现=1")
    expect(researchQuestions).not.toContain("本文围绕“Code Experiment Paper”提出三个可检验问题")
    expect(contributions).toContain("源码范围")
    expect(contributions).not.toContain("并用 ")
    expect(contributions).toContain("第一项贡献是把源码范围、来源和实验记录统一为可审查证据")
    expect(contributions).toContain("第二项贡献是将本文方法与 1 个基线、1 个消融放入同一评价协议")
    expect(contributions).toContain("并以类型检查通过状态作为主比较指标")
    expect(contributions).not.toContain("围绕“Code Experiment Paper”的证据约束写作框架")
    expect(contributions).toContain("实验运行记录")
    expect(contributions).toContain("已声明基线")
    expect(relatedWork).toContain("源码范围")
    expect(relatedWork).toContain("实验运行记录")
    expect(relatedWork).toContain("已声明基线")
    expect(relatedWork).not.toContain("主要包括 ")
    expect(relatedWork).not.toContain("主要包括")
    expect(mainBody).not.toContain("declared 基线")
    expect(mainBody).not.toContain("experiment runs")
    expect(mainBody).not.toContain("export gates")
    expect(mainBody).not.toContain("final paper generation")
    expect(mainBody).not.toContain("终稿检查")
    expect(mainBody).not.toContain("终稿导出")
    expect(mainBody).not.toContain("导出包")
    expect(mainBody).not.toContain("导出清单")
    expect(mainBody).not.toContain("写作器")
    expect(mainBody).not.toContain("系统应")
    expect(mainBody).not.toContain("本文产物")
    expect(mainBody).not.toContain("本次运行")
    expect(mainBody).toContain("本文结果已绑定来源、断言、引用与复现证据")
    expect(relatedWork).toContain("Toolformer: Language Models Can Teach Themselves to Use Tools")
    expect(relatedWork).toContain("Reproducibility in Machine Learning")
    expect(relatedWork).toContain("已验证")
    expect(relatedWork).toContain("arXiv:2302.04761")
    expect(relatedWork).toContain("https://arxiv.org/abs/2302.04761")
    expect(relatedWork).toContain("doi:10.1145/1234567")
    expect(relatedWork).toContain("https://doi.org/10.1145/1234567")
    expect(relatedWork).toContain("综合来看")
    expect(relatedWork).toContain("相关工作可分为")
    expect(relatedWork).toContain("工具使用或智能体自动化")
    expect(relatedWork).toContain("实验复现与验证风险")
    expect(relatedWork).toContain("对比这些方向")
    expect(relatedWork).toContain("而本文的差异在于")
    expect(relatedWork).toContain("工具使用或智能体自动化方向以 Toolformer")
    expect(relatedWork).toContain("实验复现与验证风险方向以 Reproducibility in Machine Learning")
    expect(relatedWork).not.toContain("核心参考包括")
    expect(relatedWork).not.toContain("文献图中的 ")
    expect(relatedWork).not.toContain("| 已验证 | 2302.04761 |")
    expect(relatedWork).not.toContain("| 已验证 | 10.1145/1234567 |")
    expect(relatedWork).toContain("已核验英文摘要")
    expect(relatedWork).not.toContain("Demonstrates language models")
    expect(relatedWork).not.toContain("Surveys empirical reproducibility risks")
    expect(references).toContain("Toolformer: Language Models Can Teach Themselves to Use Tools")
    expect(references).toContain("arXiv:2302.04761")
    expect(references).toContain("Reproducibility in Machine Learning")
    expect(references).toContain("doi:10.1145/1234567")
    expect(draft.markdown.indexOf("## 参考文献")).toBeLessThan(draft.markdown.indexOf("## 附录 A：证据追踪"))
    expect(studyDesign).not.toContain("图 1")
    expect(studyDesign).toContain("下表展示研究设计与证据流")
    expect(studyDesign).toContain("材料边界")
    expect(studyDesign).toContain("4 个代码、数据、论文或日志来源")
    expect(studyDesign).toContain("复现执行")
    expect(studyDesign).toContain("证据充分性")
    expect(evidenceTraceability).toContain("可追踪性")
    expect(evidenceTraceability).toContain("4 个可追踪来源")
    expect(evidenceTraceability).toContain("其中 1 个来源直接绑定断言")
    expect(evidenceTraceability).not.toContain("traceability")
    for (const section of [abstract, introduction, contributions, relatedWork, method, discussion, studyDesign, evidenceTraceability]) {
      expect(section).not.toContain("ClaimLedger")
      expect(section).not.toContain("artifact")
      expect(section).not.toContain("final export")
      expect(section).not.toContain("PaperRun")
    }
    expect(mainBody).not.toContain("ClaimLedger")
    expect(mainBody).not.toContain("artifact")
    expect(mainBody).not.toContain("final export")
    expect(mainBody).not.toContain("PaperRun")
    expect(mainBody).not.toContain("cite:")
    expect(mainBody).not.toContain("material:code:")
    expect(draft.markdown).not.toContain("artifact-codebase-map")
    expect(draft.markdown).not.toContain("artifact-experiment-runs")
    expect(draft.markdown).not.toContain("material:code:paper-workflow")
    expect(relatedWork).not.toContain("现有自动写作系统通常强调检索、规划或长文生成")
    expect(results).toContain("在“类型检查通过状态”这一主指标上")
    expect(results).toContain("本文方法与最佳基线")
    expect(results).toContain("| 实验 | 角色 | 类型检查通过状态 | 本机状态 | 容器复现 |")
    expect(results).toContain("| 证据驱动工作流 | 本文方法 | 通过 | 通过 | 是 |")
    expect(results).not.toContain("| 本文方法 | 本文方法 |")
    expect(reproducibility).toContain("| 环境 | 实验 | 角色 | 状态 | 指标 | 耗时 | 命令 | 输出 |")
    expect(reproducibility).not.toContain("本机 win32")
    expect(reproducibility).toContain("类型检查通过状态=通过")
    expect(reproducibility).toContain("本机与容器比较没有发现状态或主指标差异")
    expect(reproducibility).not.toContain("本次运行发现 3 个本机/容器差异")
    expect(draft.markdown).toContain("容器复现通过状态")
    expect(draft.markdown).not.toContain("container reproduction pass")
    expect(results).not.toContain("复现实验记录")
    expect(results).not.toContain("当前 proposed")
    expect(results).not.toContain("综合建议")
    expect(results).not.toContain("succeeded")
    expect(results).not.toContain("typecheck_pass")
    expect(reproducibility).not.toContain("typecheck_pass")
    expect(reproducibility).not.toContain(" baseline:baseline-toy ")
    expect(draft.markdown).not.toContain("container:repro container")
    expect(draft.markdown).not.toContain("dataset:local")
    expect(draft.markdown).not.toContain("generic-preprint")
    expect(draft.markdown).not.toContain("导出 manifest")
    expect(draft.markdown).not.toContain("结构化 JSON")
    expect(draft.markdown).not.toContain("被评估方法为 代码")
    expect(draft.markdown).not.toContain("主观测指标为 类型")
    expect(draft.markdown.indexOf("## 方法")).toBeLessThan(draft.markdown.indexOf("## 附录 A：证据追踪"))
    expect(draft.markdown.indexOf("## 结果")).toBeLessThan(draft.markdown.indexOf("## 附录 B：复现清单"))
  })

  test("lifts long method claims into abstract at sentence boundaries", () => {
    const ledger = composeClaimLedger({
      topic: "Agent team paper ranking",
      claims: [
        {
          text: "对提交代码库的 1 个文件进行 source-range-grounded 分析，覆盖 src。系统抽取到 3 个导出方法/类表面，其中包括 rankAgentTeamPapers(src/agent-team-paper.ts:3), buildClaimLedger(src/agent-team-paper.ts:1), claimLedgerCoverage(src/agent-team-paper.ts:7)。实验入口包含 0 个测试文件和 4 个 package script（typecheck, baseline:toy, ablation:toy, repro:container）。这些结论仅绑定本地哈希、文件路径和 source range，不把未执行的性能结果写成最终 claim。",
          section_id: "method",
          confidence: 0.9,
          source_ids: ["material:code:agent-team-paper"],
          artifact_ids: ["artifact-codebase-map"],
        },
      ],
      now,
    })
    const draft = composeDraftPaper({ title: "Agent Team Paper Ranking", ledger, now })
    const abstract = markdownSection(draft.markdown, "摘要")

    expect(draft.markdown).toContain("rankAgentTeamPapers")
    expect(draft.markdown).toContain("agent-team-paper.ts:3")
    expect(draft.markdown).toContain("buildClaimLedger")
    expect(draft.markdown).toContain("baseline:toy")
    expect(draft.markdown).toContain("ablation:toy")
    expect(draft.markdown).not.toContain("build证据台账")
    expect(draft.markdown).not.toContain("基线:toy")
    expect(draft.markdown).not.toContain("消融:toy")
    expect(draft.markdown).not.toContain("最终 claim")
    expect(draft.markdown).not.toContain("和 源码范围")
    expect(abstract).not.toContain("paper. ts")
    expect(draft.markdown).not.toContain("。。")
    expect(draft.markdown).not.toContain("。 系统")
    expect(draft.markdown).not.toContain("。 当前")
    expect(abstract).not.toContain("实验入口包含")
    expect(abstract).not.toContain("测试文…")
    expect(abstract).not.toContain("package script（typecheck")
  })

  test("uses result report evidence when no result claim is present", () => {
    const ledger = composeClaimLedger({
      topic: "Agent team paper ranking",
      claims: [
        {
          text: "The code analysis found source ranges for rankAgentTeamPapers.",
          section_id: "method",
          confidence: 0.9,
          source_ids: ["material:code:agent-team-paper"],
          artifact_ids: ["artifact-codebase-map"],
        },
      ],
      now,
    })
    const draft = composeDraftPaper({ title: "Agent Team Paper Ranking", ledger, result_report: resultReport(), now })
    const introduction = markdownSection(draft.markdown, "引言")
    const relatedWork = markdownSection(draft.markdown, "相关工作")

    expect(introduction).toContain("以 accuracy 作为主指标")
    expect(introduction).toContain("本文方法为 0.8300")
    expect(introduction).toContain("最佳基线（baseline）为 0.7100")
    expect(introduction).not.toContain("本文方法=0.83")
    expect(introduction).toContain("最佳基线")
    expect(relatedWork).toContain("以 accuracy 作为主指标")
    expect(relatedWork).toContain("最佳基线")
    expect(relatedWork).not.toContain("如果没有基线、消融和复现记录")
  })

  test("chooses distinct representatives for related work contrast groups", () => {
    const ledger = composeClaimLedger({
      topic: "Agent workflow validation",
      claims: [
        {
          text: "The code analysis found source ranges for agent workflow validation.",
          section_id: "method",
          confidence: 0.9,
          source_ids: ["material:code:agent-workflow"],
          artifact_ids: ["artifact-codebase-map"],
        },
      ],
      now,
    })
    const draft = composeDraftPaper({
      title: "Agent Workflow Validation",
      ledger,
      literature_map: {
        schema_version: "LiteratureMap.v1",
        topic: "Agent workflow validation",
        created_at: now,
        sources: [
          {
            schema_version: "SourceRecord.v1",
            source_id: "paper:agent-a",
            kind: "paper",
            title: "Agent Workflow A",
            url: "https://example.org/agent-a",
            retrieved_at: now,
            provider: "arxiv",
            license: { status: "clear", expression: "CC BY 4.0" },
            version: { value: "v1", retrieved_at: now },
            verification: { status: "verified", method: "live", checked_at: now },
            topics: ["agent", "workflow", "validation"],
            abstract: "Studies autonomous agent workflow validation benchmarks.",
          },
          {
            schema_version: "SourceRecord.v1",
            source_id: "paper:agent-b",
            kind: "paper",
            title: "Agent Workflow B",
            url: "https://example.org/agent-b",
            retrieved_at: now,
            provider: "arxiv",
            license: { status: "clear", expression: "CC BY 4.0" },
            version: { value: "v1", retrieved_at: now },
            verification: { status: "verified", method: "live", checked_at: now },
            topics: ["agent", "workflow", "validation"],
            abstract: "Reports autonomous agent workflow evaluation.",
          },
          {
            schema_version: "SourceRecord.v1",
            source_id: "paper:paper-code",
            kind: "paper",
            title: "Paper-to-Code Execution",
            url: "https://example.org/paper-code",
            retrieved_at: now,
            provider: "arxiv",
            license: { status: "clear", expression: "CC BY 4.0" },
            version: { value: "v1", retrieved_at: now },
            verification: { status: "verified", method: "live", checked_at: now },
            topics: ["benchmark", "execution", "paper to code"],
            abstract: "Evaluates benchmark execution and paper-to-code validation.",
          },
        ],
        clusters: [],
        summary: { total_sources: 3, verified_sources: 3, open_license_sources: 3 },
        diagnostics: { verification_failures: [], gaps: [] },
      },
      now,
    })
    const relatedWork = markdownSection(draft.markdown, "相关工作")

    expect(relatedWork).toContain("工具使用或智能体自动化方向以 Agent Workflow A、Agent Workflow B 为代表")
    expect(relatedWork).toContain("实验复现与验证风险方向以 Paper-to-Code Execution 为代表")
  })

  test("renders ranking benchmark experiment names as paper-readable labels", () => {
    const ledger = composeClaimLedger({
      topic: "Agent team paper ranking",
      claims: [
        {
          text: "The code analysis found source ranges for rankAgentTeamPapers. Experiment entrypoints include baseline:ranking-lexical, ablation:ranking-no-coverage, repro:container, and test:ranking.",
          section_id: "method",
          confidence: 0.9,
          source_ids: ["material:code:agent-team-paper"],
          artifact_ids: ["artifact-codebase-map"],
        },
      ],
      now,
    })
    const run = (experiment_id: string, role: "proposed" | "baseline" | "ablation", mode: "host" | "container") => ({
      experiment_id,
      role,
      status: "succeeded" as const,
      command: { argv: ["bun", "run", mode === "container" ? "repro:container" : experiment_id.replaceAll(" ", "-")] },
      environment:
        mode === "container"
          ? ({ mode: "container" as const, platform: "container" as const })
          : ({ mode: "host" as const, platform: process.platform }),
      metrics: [{ name: "ranking_ndcg_at_3", value: role === "proposed" ? 1 : role === "baseline" ? 0.8659 : 0.7318, direction: "higher_better" as const, unit: "ratio" }],
      stdout: "ok",
      stderr: "",
      exit_code: 0,
      resource_usage: { wall_time_seconds: 0.2 },
    })
    const draft = composeDraftPaper({
      title: "Agent Team Paper Ranking",
      ledger,
      experiment_plan: {
        objective: "Create a reproducible evaluation plan before allowing final paper claims.",
        metrics: [{ name: "ranking_ndcg_at_3", direction: "higher_better", primary: true }],
        proposed: {
          experiment_id: "proposed",
          label: "Code-grounded paper_fucker workflow",
          role: "proposed",
          dataset_ids: [],
          command: { argv: ["bun", "run", "test:ranking"] },
          expected_metric: "ranking_ndcg_at_3",
          rationale: "Main workflow under evaluation.",
        },
        baselines: [
          {
            experiment_id: "baseline:ranking-lexical",
            label: "baseline:ranking-lexical",
            role: "baseline",
            dataset_ids: [],
            command: { argv: ["bun", "run", "baseline:ranking-lexical"] },
            expected_metric: "ranking_ndcg_at_3",
            rationale: "Baseline runner declared by package script.",
          },
        ],
        ablations: [
          {
            experiment_id: "ablation:ranking-no-coverage",
            label: "ablation:ranking-no-coverage",
            role: "ablation",
            dataset_ids: [],
            command: { argv: ["bun", "run", "ablation:ranking-no-coverage"] },
            expected_metric: "ranking_ndcg_at_3",
            rationale: "Ablation runner declared by package script.",
          },
        ],
        resource_budget: { max_wall_time_seconds: 3600, max_memory_mb: 8192, max_gpu_hours: 0 },
        downgrade_policy: ["If container reproduction fails, block final paper claims."],
      },
      result_report: {
        ...resultReport(),
        primary_metric: "ranking_ndcg_at_3",
        best_baseline: { experiment_id: "baseline ranking lexical", value: 0.8659 },
        proposed: { experiment_id: "proposed", value: 1 },
      },
      experiment_runs: {
        host_runs: [
          run("proposed", "proposed", "host"),
          run("baseline ranking lexical", "baseline", "host"),
          run("ablation ranking no coverage", "ablation", "host"),
        ],
        container_runs: [
          run("proposed", "proposed", "container"),
          run("baseline ranking lexical", "baseline", "container"),
          run("ablation ranking no coverage", "ablation", "container"),
        ],
      },
      now,
    })

    expect(draft.markdown).toContain("词项匹配基线")
    expect(draft.markdown).toContain("无证据覆盖消融")
    expect(draft.markdown).toContain("容器复现")
    expect(draft.markdown).toContain("排名测试")
    expect(draft.markdown).toContain("以排序 nDCG@3 作为主指标")
    expect(draft.markdown).toContain("在“排序 nDCG@3”这一主指标上")
    expect(draft.markdown).not.toContain("主指标 排序")
    expect(draft.markdown).not.toContain("在 排序")
    expect(draft.markdown).not.toContain("类型检查通过状态可以证明代码可运行")
    expect(draft.markdown).not.toContain("最佳基线（ranking lexical）")
    expect(draft.markdown).not.toContain("baseline ranking lexical")
    expect(draft.markdown).not.toContain("ablation ranking no coverage")
    expect(draft.markdown).not.toContain("| ranking lexical |")
    expect(draft.markdown).not.toContain("| ranking no coverage |")
  })

  test("labels unverified literature seeds as candidates rather than prior work", () => {
    const ledger = composeClaimLedger({
      topic: "Agent team paper ranking",
      claims: [
        {
          text: "The code analysis found source ranges for rankAgentTeamPapers.",
          section_id: "method",
          confidence: 0.9,
          source_ids: ["material:code:agent-team-paper"],
          artifact_ids: ["artifact-codebase-map"],
        },
      ],
      now,
    })
    const draft = composeDraftPaper({
      title: "Agent Team Paper Ranking",
      ledger,
      literature_map: {
        schema_version: "LiteratureMap.v1",
        topic: "Agent Team Paper Ranking",
        created_at: now,
        sources: [
          {
            schema_version: "SourceRecord.v1",
            source_id: "paper:agent-team-candidate",
            kind: "paper",
            title: "Agent Team Paper Ranking unverified literature candidate",
            url: "https://arxiv.org/search/?query=agent%20team",
            provider: "paper_fucker-test-literature-candidate",
            license: { status: "unclear", expression: "not verified" },
            version: { value: "candidate", retrieved_at: now },
            verification: {
              status: "unverified",
              method: "unit-test-unverified-candidate",
              checked_at: now,
              diagnostics: ["Live source verification has not been completed."],
            },
            topics: ["Agent Team Paper Ranking"],
            retrieved_at: now,
          },
        ],
        clusters: [],
        summary: { total_sources: 1, verified_sources: 0, open_license_sources: 0 },
        diagnostics: { verification_failures: [], gaps: ["insufficient_verified_literature"] },
      },
      result_report: resultReport(),
      now,
    })
    const relatedWork = markdownSection(draft.markdown, "相关工作")
    const references = markdownSection(draft.markdown, "参考文献")

    expect(relatedWork).toContain("候选文献")
    expect(relatedWork).toContain("尚未完成来源验证")
    expect(relatedWork).not.toContain("Prior work")
    expect(relatedWork).not.toContain("paper_fucker-default-source-discovery")
    expect(references).toContain("当前只有未验证候选文献")
    expect(references).not.toContain("Agent Team Paper Ranking")
    expect(references).not.toContain("paper_fucker-default-source-discovery")
  })

  test("warns when a draft has no verified paper reference for formal References", () => {
    const ledger = composeClaimLedger({
      topic: "Reference readiness",
      claims: [
        {
          text: "The code path is reproducible.",
          section_id: "method",
          confidence: 0.8,
          source_ids: ["material:code:reference-readiness"],
          artifact_ids: ["artifact-codebase-map"],
        },
      ],
      now,
    })
    const draft = composeDraftPaper({ title: "Reference Readiness", ledger, now })
    const findings = checkReferences({
      ledger,
      draft,
      data_plan: dataPlan(),
      result_report: resultReport(),
      available_source_ids: ["material:code:reference-readiness"],
      source_records: [
        {
          schema_version: "SourceRecord.v1",
          source_id: "material:code:reference-readiness",
          kind: "code",
          title: "reference readiness code",
          url: "file:///workspace/src/index.ts",
          provider: "unit-test",
          license: { status: "clear", expression: "workspace-authorized" },
          version: { value: "local", retrieved_at: now },
          verification: { status: "verified", method: "unit-test", checked_at: now },
          retrieved_at: now,
        },
      ],
      model_reviews: [],
      now,
    })

    expect(findings.map((finding) => finding.category)).toContain("missing_verified_reference")
    expect(findings.find((finding) => finding.category === "missing_verified_reference")?.severity).toBe("warning")
  })

  test("runs ClaimLedger-first authoring through final export and supplementary bundles", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "paper-fucker-authoring-"))
    try {
      const workspace = path.join(dir, "workspace")
      const home = path.join(dir, "home")
      await mkdir(workspace, { recursive: true })
      await mkdir(home, { recursive: true })
      const options = runtimeOptions(workspace, home)
      const handle = await createResearchRun({ topic: "Claim-aware retrieval" }, options)
      const ledger = composeClaimLedger({
        topic: "Claim-aware retrieval",
        claims: [
          {
            text: "The method improves retrieval accuracy on the open benchmark.",
            section_id: "results",
            confidence: 0.82,
            source_ids: ["paper-a", "source-dataset-open-retrieval"],
            artifact_ids: ["artifact-result-report"],
          },
        ],
        now,
      })

      const result = await runPaperAuthoringLoop(
        handle.run_dir,
        {
          title: "Claim-aware Retrieval",
          ledger,
          data_plan: dataPlan(),
          result_report: resultReport(),
          available_source_ids: ["paper-a", "source-dataset-open-retrieval"],
          model_reviews: [
            { model: "deepseek-v4-pro", verdict: "pass" },
            { model: "reviewer-model", verdict: "pass" },
          ],
          target_profile: "nature-paper",
          code_artifact_ids: ["artifact-codebase-map"],
          renderers,
          now,
        },
        options,
      )

      expect(result.final_export_blocked).toBe(false)
      expect(result.export.bundle.status).toBe("final")
      expect(result.preview.readonly).toBe(true)
      expect(result.revision.next_markdown).toContain("## 附录 G：投稿准备度")
      expect(result.revision.next_markdown).toContain("目标稿件配置：Nature 投稿配置。")
      expect(result.revision.next_markdown).toContain("数据可用性：本次运行登记 1 个数据集")
      expect(result.revision.next_markdown).toContain("代码可用性：本次运行登记 1 个代码证据记录")
      expect(result.revision.next_markdown).toContain("终稿检查：已满足当前导出条件。")
      expect(result.revision.next_markdown).not.toContain("dataset-open-retrieval")
      expect(result.revision.next_markdown).not.toContain("完整标识")
      expect(result.revision.next_markdown).not.toContain("Submission profile:")
      expect(result.revision.next_markdown).not.toContain("Final gate precheck")
      expect(result.revision.next_markdown).not.toContain("code artifact")
      expect(result.revision.next_markdown).not.toContain("run artifact ledger")
      expect((result.supplementary_bundle satisfies PaperSupplementaryBundle).items.map((item) => item.kind)).toEqual([
        "claim_ledger",
        "review_report",
        "export_manifest",
      ])
      expect((result.availability_bundle satisfies PaperAvailabilityBundle).data.dataset_ids).toEqual([
        "dataset-open-retrieval",
      ])
      expect(result.availability_bundle.code.artifact_ids).toEqual(["artifact-codebase-map"])
    } finally {
      await clean(dir)
    }
  })

  test("blocks final export and produces a clearly marked forced draft", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "paper-fucker-authoring-forced-"))
    try {
      const workspace = path.join(dir, "workspace")
      const home = path.join(dir, "home")
      await mkdir(workspace, { recursive: true })
      await mkdir(home, { recursive: true })
      const options = runtimeOptions(workspace, home)
      const handle = await createResearchRun({ topic: "Unsafe draft" }, options)
      const ledger = composeClaimLedger({
        topic: "Unsafe draft",
        claims: [{ text: "Unsupported claim.", section_id: "discussion", confidence: 0.2, source_ids: [], artifact_ids: [] }],
        now,
      })

      const result = await runPaperAuthoringLoop(
        handle.run_dir,
        {
          title: "Unsafe Draft",
          ledger,
          data_plan: dataPlan(),
          result_report: resultReport(),
          available_source_ids: [],
          model_reviews: [{ model: "reviewer-model", verdict: "fail", message: "Unsupported claims remain." }],
          target_profile: "generic-preprint",
          renderers,
          now,
        },
        options,
      )

      expect(result.final_export_blocked).toBe(true)
      expect(result.export.bundle.status).toBe("forced_draft")
      expect(result.export.bundle.verification_summary.failed_checks).toContain("unsupported_claim")
      expect(result.preview.artifacts.markdown?.content).toContain("FORCED DRAFT")
      expect(result.preview.annotations.some((annotation) => annotation.severity === "blocker")).toBe(true)
    } finally {
      await clean(dir)
    }
  })

  test("does not invent default literature candidates without verified sources", () => {
    const literature = discoverLiterature({
      topic: "Agent team paper generation",
      min_verified_sources: 1,
      now,
    })

    expect(literature.sources).toEqual([])
    expect(literature.summary.total_sources).toBe(0)
    expect(literature.summary.verified_sources).toBe(0)
    expect(literature.diagnostics.gaps).toContain("insufficient_verified_literature")
  })
})
