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
    expect(draft.markdown).toContain("相关表述应保留为待验证观察")
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
    const dataAvailability = markdownSection(draft.markdown, "数据与代码可用性")
    const experimentalSetup = markdownSection(draft.markdown, "实验设置")
    const discussion = markdownSection(draft.markdown, "讨论")
    const threatsToValidity = markdownSection(draft.markdown, "效度威胁")
    const limitations = markdownSection(draft.markdown, "限制与待修复项")
    const conclusion = markdownSection(draft.markdown, "结论")
    const appendixEvidenceTrace = markdownSection(draft.markdown, "附录 A：证据追踪")
    const appendixReproChecklist = markdownSection(draft.markdown, "附录 B：复现清单")
    const appendixArtifacts = markdownSection(draft.markdown, "附录 F：证据记录索引")
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
    expect(draft.markdown).toContain("复现实验入口")
    expect(draft.markdown).not.toContain("## System Architecture")
    expect(draft.markdown).not.toContain("本文把“能否生成一篇论文”")
    expect(draft.markdown).not.toContain("PaperRun 的架构目标")
    expect(draft.markdown).not.toContain("Paper Fucker 的差异点")
    expect(draft.markdown).not.toContain("Paper Fucker 工作流")
    expect(draft.markdown).not.toContain("container:paper-fucker/research-runner")
    expect(draft.markdown).not.toContain("正式结论")
    expect(draft.markdown).not.toContain("证据充分性检查")
    expect(abstract).toContain("计算机类论文若缺少可追踪代码证据、显式对照和隔离复现")
    expect(abstract).toContain("容易把缺少依据的过程记录误写成研究结论")
    expect(abstract).not.toContain("目标是在写作前")
    expect(abstract).not.toContain("研究流程将材料索引")
    expect(abstract).toContain("源码范围")
    expect(abstract).toContain("实验运行记录")
    expect(abstract).toContain("已声明基线")
    expect(abstract).toContain("证据链已满足本文的结果表述条件")
    expect(abstract).not.toContain("流程产物")
    expect(abstract).not.toContain("证据充分性检查")
    expect(abstract).not.toContain("成稿")
    expect(abstract).not.toContain("终稿检查")
    expect(abstract).not.toContain("当前状态为")
    expect(introduction).toContain("源码范围")
    expect(introduction).toContain("本研究使用 4 个可核验材料来源")
    expect(introduction).toContain("其中代码材料 1 个、已验证论文来源 2 个、数据集来源 1 个")
    expect(introduction).not.toContain("主要包括")
    expect(introduction).not.toContain("主要包括 ")
    expect(introduction).toContain("实验运行记录")
    expect(introduction).toContain("已声明基线")
    expect(introduction).not.toContain("本文报告的是一组")
    expect(introduction).toContain("本文据此将讨论范围限定在已有来源、实验与复现记录能够支撑的结论上")
    expect(introduction).not.toContain("自动写作")
    expect(introduction).not.toContain("本研究的直接动机")
    expect(introduction).not.toContain("结果侧的核心问题")
    expect(introduction).not.toContain("泛化的写作流程")
    expect(introduction).not.toContain("本文只讨论已绑定证据的结论")
    expect(researchQuestions).toContain("本文将研究目标拆分为三项可复核问题")
    expect(researchQuestions).toContain("基线=1、消融=1、容器复现=1")
    expect(researchQuestions).not.toContain("正式结论")
    expect(researchQuestions).not.toContain("证据充分性检查")
    expect(researchQuestions).not.toContain("待验证状态")
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
    expect(mainBody).not.toContain("本文结果已绑定来源、断言、引用与复现证据")
    expect(relatedWork).toContain("Toolformer: Language Models Can Teach Themselves to Use Tools")
    expect(relatedWork).toContain("Reproducibility in Machine Learning")
    expect(relatedWork).toContain("已验证")
    expect(relatedWork).toContain("arXiv:2302.04761")
    expect(relatedWork).toContain("https://arxiv.org/abs/2302.04761")
    expect(relatedWork).toContain("doi:10.1145/1234567")
    expect(relatedWork).toContain("https://doi.org/10.1145/1234567")
    expect(relatedWork).toContain("综合来看")
    expect(relatedWork).toContain("相关工作可分为")
    expect(relatedWork).toContain("本文纳入 2 条相关文献记录")
    expect(relatedWork).toContain("主题线索")
    expect(relatedWork).toContain("工具调用与智能体协作")
    expect(relatedWork).toContain("实验复现与验证风险")
    expect(relatedWork).toContain("对比这些方向")
    expect(relatedWork).toContain("而本文的差异在于")
    expect(relatedWork).toContain("工具调用与智能体协作方向以 Toolformer")
    expect(relatedWork).toContain("实验复现与验证风险方向以 Reproducibility in Machine Learning")
    expect(relatedWork).not.toContain("工具使用或智能体自动化")
    expect(relatedWork).not.toContain("多智能体研究自动化（多智能体研究自动化")
    expect(relatedWork).not.toContain("核心参考包括")
    expect(relatedWork).not.toContain("文献图中的 ")
    expect(relatedWork).not.toContain("本次相关工作")
    expect(relatedWork).not.toContain("文献图")
    expect(relatedWork).not.toContain("自动化研究")
    expect(relatedWork).not.toContain("自动化流程")
    expect(relatedWork).not.toContain("自动写作")
    expect(relatedWork).not.toContain("待验证状态")
    expect(relatedWork).not.toContain("包装成正式结论")
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
    expect(studyDesign).toContain("研究设计由五类证据约束构成")
    expect(studyDesign).toContain("材料边界")
    expect(studyDesign).toContain("4 个代码、数据、论文或日志来源")
    expect(studyDesign).toContain("复现执行")
    expect(studyDesign).toContain("证据链完整性")
    expect(studyDesign).not.toContain("证据充分性")
    expect(studyDesign).not.toContain("生成流畅正文")
    expect(studyDesign).not.toContain("写作阶段")
    expect(studyDesign).not.toContain("在实际使用中")
    expect(studyDesign).not.toContain("用户")
    expect(studyDesign).not.toContain("格式完整误判")
    expect(studyDesign).not.toContain("人工审查")
    expect(studyDesign).not.toContain("审稿人")
    expect(method).toContain("本文的方法由三部分组成")
    expect(method).toContain("材料边界定义、代码证据抽取和可复现实验约束")
    expect(method).not.toContain("本文采用证据优先流程")
    expect(method).not.toContain("每个运行")
    expect(method).not.toContain("阶段图驱动")
    expect(method).not.toContain("本地审查材料")
    expect(mainBody).not.toContain("每个运行")
    expect(mainBody).not.toContain("本节比较")
    expect(evidenceTraceability).toContain("可追踪性")
    expect(evidenceTraceability).toContain("4 个可核验材料来源")
    expect(evidenceTraceability).toContain("其中 1 个来源直接绑定断言")
    expect(evidenceTraceability).toContain("本文采用证据链约束实验结论")
    expect(evidenceTraceability).not.toContain("正式结果")
    expect(evidenceTraceability).not.toContain("写作阶段只把")
    expect(evidenceTraceability).not.toContain("正式正文的候选内容")
    expect(evidenceTraceability).not.toContain("能写出段落")
    expect(evidenceTraceability).not.toContain("人工审稿")
    expect(evidenceTraceability).not.toContain("审稿记录")
    expect(evidenceTraceability).not.toContain("审稿可追踪性")
    expect(evidenceTraceability).not.toContain("traceability")
    expect(dataAvailability).toContain("本研究使用 1 个开放数据集")
    expect(dataAvailability).not.toContain("已登记 1 个候选数据集")
    expect(dataAvailability).not.toContain("访问=开放")
    expect(dataAvailability).not.toContain("验证=已验证")
    expect(dataAvailability).not.toContain("验证状态")
    expect(dataAvailability).not.toContain("数据格式=")
    expect(experimentalSetup).toContain("实验协议围绕评价对象、主指标、基线和消融展开")
    expect(experimentalSetup).toContain("本文方法的评价对象为")
    expect(experimentalSetup).toContain("为结论性表述提供可复现的评价依据")
    expect(experimentalSetup).not.toContain("允许正式结论前")
    expect(experimentalSetup).not.toContain("本节定义评价问题")
    expect(experimentalSetup).not.toContain("目标是：")
    expect(experimentalSetup).not.toContain("被评估方法为")
    expect(experimentalSetup).not.toContain("主观测指标为")
    expect(experimentalSetup).not.toContain("实验协议来自 package.json 脚本")
    expect(experimentalSetup).not.toContain("记录 4 个入口；缺口")
    expect(discussion).toContain("结果解释必须与证据边界保持一致")
    expect(discussion).toContain("代码证据、显式对照和容器复现")
    expect(discussion).not.toContain("本节的重点")
    expect(discussion).not.toContain("自动化系统")
    expect(discussion).not.toContain("不能替")
    expect(discussion).not.toContain("后续投稿前")
    expect(threatsToValidity).toContain("构念效度")
    expect(threatsToValidity).toContain("解释效度")
    expect(threatsToValidity).not.toContain("本文当前使用")
    expect(threatsToValidity).not.toContain("真实学术贡献")
    expect(threatsToValidity).not.toContain("当前结论")
    expect(threatsToValidity).not.toContain("自动化效度")
    expect(threatsToValidity).not.toContain("自动写作链路")
    expect(threatsToValidity).not.toContain("人工审查")
    expect(threatsToValidity).not.toContain("真实投稿")
    expect(limitations).toContain("在当前证据边界内")
    expect(limitations).not.toContain("在本次证据边界内")
    expect(limitations).not.toContain("当前没有未支持断言")
    expect(conclusion).toContain("材料来源、代码证据、显式对照和容器复现")
    expect(conclusion).not.toContain("正式审查对象")
    expect(conclusion).not.toContain("示例协议")
    expect(conclusion).not.toContain("真实投稿")
    expect(appendixEvidenceTrace).toContain("证据追踪表汇总来源、断言和复核记录")
    expect(appendixEvidenceTrace).not.toContain("实现层面")
    expect(appendixEvidenceTrace).not.toContain("内部运行日志")
    expect(appendixEvidenceTrace).not.toContain("结构化产物")
    expect(appendixEvidenceTrace).not.toContain("审稿记录")
    expect(appendixReproChecklist).toContain("复现清单汇总结论性表述所需的最小证据条件")
    expect(appendixReproChecklist).not.toContain("正式结果")
    expect(appendixReproChecklist).not.toContain("进入运行记录")
    expect(appendixReproChecklist).not.toContain("命令登记的作用")
    expect(appendixReproChecklist).not.toContain("系统只把")
    expect(appendixReproChecklist).not.toContain("用户最关心")
    expect(appendixReproChecklist).not.toContain("当前产物")
    expect(appendixReproChecklist).not.toContain("可交付论文")
    expect(appendixReproChecklist).not.toContain("待补实验")
    expect(appendixReproChecklist).not.toContain("界面")
    expect(appendixReproChecklist).not.toContain("TUI")
    expect(appendixReproChecklist).not.toContain("实时预览")
    expect(appendixArtifacts).toContain("证据记录索引用于定位复核材料")
    expect(appendixArtifacts).not.toContain("本次运行")
    expect(appendixArtifacts).not.toContain("导出清单")
    expect(appendixArtifacts).not.toContain("导出记录")
    expect(appendixArtifacts).not.toContain("Markdown")
    expect(appendixArtifacts).not.toContain("LaTeX")
    expect(appendixArtifacts).not.toContain("PDF")
    expect(appendixArtifacts).not.toContain("DOCX")
    expect(appendixArtifacts).not.toContain("运行目录")
    expect(appendixArtifacts).not.toContain("完整复核材料")
    expect(appendixArtifacts).not.toContain("结构化证据记录")
    expect(appendixArtifacts).not.toContain("人工复核")
    expect(appendixArtifacts).not.toContain("实时监控台")
    expect(appendixArtifacts).not.toContain("这份摘要")
    expect(appendixArtifacts).not.toContain("机器可追踪性")
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
    expect(reproducibility).toContain("| 环境 | 实验 | 角色 | 状态 | 指标 | 耗时 |")
    expect(reproducibility).not.toContain("| 环境 | 实验 | 角色 | 状态 | 指标 | 耗时 | 命令 | 输出 |")
    expect(reproducibility).not.toContain("见运行日志")
    expect(reproducibility).not.toContain("审查材料")
    expect(reproducibility).not.toContain("容器命令")
    expect(reproducibility).not.toContain("本机 win32")
    expect(reproducibility).toContain("类型检查通过状态=通过")
    expect(reproducibility).toContain("可复现性分析比较本机与容器结果")
    expect(reproducibility).toContain("### 实验执行摘要")
    expect(reproducibility).not.toContain("### 实验运行记录")
    expect(results).toContain("表 1 汇总本文方法、基线和消融在主指标、运行状态和容器复现上的结果。")
    expect(reproducibility).toContain("表 2 汇总本机与容器主指标差异，用于检查复现一致性。")
    expect(reproducibility).toContain("表 3 汇总本机与容器实验的状态、主指标和耗时")
    expect(reproducibility).not.toContain("表 1 汇总本机与容器实验")
    expect(reproducibility).toContain("本机与容器比较没有发现状态或主指标差异")
    expect(reproducibility).not.toContain("本节比较")
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

    expect(relatedWork).toContain("工具调用与智能体协作方向以 Agent Workflow A、Agent Workflow B 为代表")
    expect(relatedWork).toContain("实验复现与验证风险方向以 Paper-to-Code Execution 为代表")
  })

  test("renders ranking benchmark experiment names as paper-readable labels", () => {
    const ledger = composeClaimLedger({
      topic: "Agent team paper ranking",
      claims: [
        {
          text: "The code analysis found source ranges for rankAgentTeamPapers(src/agent-team-paper.ts:3) and scorePaper(src/agent-team-paper.ts:7). function scorePaper is exported from src/agent-team-paper.ts and returns item.relevance * 0.62 + item.claim_coverage * 0.28 + item.recency * 0.10. Experiment entrypoints include baseline:ranking-lexical, ablation:ranking-no-coverage, repro:container, and test:ranking.",
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
      title: "带显式基线、消融与容器复现脚本的代码论文",
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
      experiment_protocol: {
        discovered_from: "package_scripts",
        gaps: [],
        entries: [
          {
            protocol_id: "proposed",
            role: "proposed",
            label: "test:ranking",
            command: { argv: ["bun", "run", "test:ranking"] },
            expected_metric: "ranking_ndcg_at_3",
            rationale: "Ranking evaluation.",
          },
          {
            protocol_id: "baseline:ranking-lexical",
            role: "baseline",
            label: "baseline:ranking-lexical",
            command: { argv: ["bun", "run", "baseline:ranking-lexical"] },
            expected_metric: "ranking_ndcg_at_3",
            rationale: "Lexical baseline.",
          },
          {
            protocol_id: "ablation:ranking-no-coverage",
            role: "ablation",
            label: "ablation:ranking-no-coverage",
            command: { argv: ["bun", "run", "ablation:ranking-no-coverage"] },
            expected_metric: "ranking_ndcg_at_3",
            rationale: "Coverage ablation.",
          },
          {
            protocol_id: "container:repro",
            role: "container_reproduction",
            label: "repro:container",
            command: { argv: ["bun", "run", "repro:container"] },
            expected_metric: "container_reproduction_pass",
            rationale: "Container reproduction.",
          },
        ],
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
      data_plan: {
        datasets: [
          {
            schema_version: "DatasetCard.v1",
            dataset_id: "dataset-live-arxiv-ranking",
            source_id: "source-live-arxiv-ranking",
            title: "agent-ranking-dataset.json",
            url: "file://agent-ranking-dataset.json",
            provider: "workspace",
            license: { status: "clear", expression: "workspace-authorized local dataset" },
            version: { value: "v1", retrieved_at: now },
            verification: {
              status: "verified",
              method: "unit-test",
              checked_at: now,
              diagnostics: [
                "schema_version:LiveArxivRankingDataset.v1",
                "provenance:live-arxiv-search+abs-page",
                "label_policy:Deterministic validation labels derived from live arXiv search rank, paper-ranking topic fit, source metadata completeness, and publication recency; not human relevance ground truth.",
                "candidate_count:5",
              ],
            },
            access: "open",
            task_fit: 0.9,
            created_at: now,
          },
        ],
        license_conflicts: [],
        access_constraints: [],
        diagnostics: { verification_failures: [], gaps: [] },
        recommendation: "use",
      },
      literature_map: {
        schema_version: "LiteratureMap.v1",
        topic: "Agent Team Paper Ranking",
        created_at: now,
        sources: [
          {
            schema_version: "SourceRecord.v1",
            source_id: "paper:ranking-agent-workflow",
            kind: "paper",
            title: "Agent Workflow Ranking",
            url: "https://example.org/ranking-agent-workflow",
            provider: "unit-test",
            license: { status: "clear", expression: "CC BY 4.0" },
            version: { value: "v1", retrieved_at: now },
            verification: { status: "verified", method: "unit-test", checked_at: now },
            topics: ["agent", "ranking", "reproducibility"],
            abstract: "Studies agent workflow ranking with reproducible baselines and ablations.",
            authors: ["Ada Zhang", "Bo Chen"],
            retrieved_at: now,
          },
        ],
        clusters: [
          {
            cluster_id: "cluster:ranking-code-paper",
            label: "多智能体研究自动化",
            source_ids: ["paper:ranking-agent-workflow"],
            keywords: ["可复现代码论文", "基线", "消融", "容器复现"],
            confidence: 0.9,
          },
        ],
        summary: { total_sources: 1, verified_sources: 1, open_license_sources: 1 },
        diagnostics: { verification_failures: [], gaps: [] },
      },
      now,
    })
    const contributions = markdownSection(draft.markdown, "主要贡献")
    const authorInfo = markdownSection(draft.markdown, "作者信息")
    const abstract = markdownSection(draft.markdown, "摘要")
    const keywords = markdownSection(draft.markdown, "关键词")
    const introduction = markdownSection(draft.markdown, "引言")
    const researchQuestions = markdownSection(draft.markdown, "研究问题")
    const relatedWork = markdownSection(draft.markdown, "相关工作")
    const method = markdownSection(draft.markdown, "方法")
    const experimentalSetup = markdownSection(draft.markdown, "实验设置")
    const results = markdownSection(draft.markdown, "结果")
    const reproducibility = markdownSection(draft.markdown, "可复现性")
    const discussion = markdownSection(draft.markdown, "讨论")
    const threatsToValidity = markdownSection(draft.markdown, "效度威胁")
    const limitations = markdownSection(draft.markdown, "限制")
    const conclusion = markdownSection(draft.markdown, "结论")
    const declarations = markdownSection(draft.markdown, "声明")
    const references = markdownSection(draft.markdown, "参考文献")
    const appendixMaterials = markdownSection(draft.markdown, "附录 A：材料与实现定位")
    const appendixReproduction = markdownSection(draft.markdown, "附录 B：复现实验入口")
    const dataAvailability = markdownSection(draft.markdown, "数据与代码可用性")

    expect(draft.markdown.startsWith("# 证据约束的候选论文排序方法：显式基线、消融与容器复现")).toBe(true)
    expect(draft.markdown.indexOf("## 作者信息")).toBeGreaterThan(draft.markdown.indexOf("# 证据约束"))
    expect(draft.markdown.indexOf("## 作者信息")).toBeLessThan(draft.markdown.indexOf("## 摘要"))
    expect(authorInfo).toContain("作者：未登记")
    expect(authorInfo).toContain("机构：未登记")
    expect(authorInfo).toContain("通信作者：未登记")
    expect(authorInfo).not.toContain("进入投稿前")
    expect(authorInfo).not.toContain("系统不会")
    expect(authorInfo).not.toContain("Paper Fucker")
    expect(authorInfo).not.toContain("OpenCode")
    expect(draft.markdown).toContain("词项匹配基线")
    expect(draft.markdown).toContain("无证据覆盖消融")
    expect(draft.markdown).toContain("容器复现")
    expect(draft.markdown).toContain("排名测试")
    expect(abstract).toContain("本文研究候选论文排序任务")
    expect(abstract).toContain("rankAgentTeamPapers 和 scorePaper")
    expect(abstract).not.toContain("计算机类论文若缺少")
    expect(abstract).not.toContain("过程记录")
    expect(abstract).not.toContain("代码论文")
    expect(abstract).toContain("rankAgentTeamPapers 和 scorePaper")
    expect(abstract).toContain("候选论文排序接口")
    expect(abstract).toContain("排名测试、词项匹配基线、无证据覆盖消融和容器复现")
    expect(draft.markdown.indexOf("## 摘要")).toBeLessThan(draft.markdown.indexOf("## 关键词"))
    expect(draft.markdown.indexOf("## 关键词")).toBeLessThan(draft.markdown.indexOf("## 引言"))
    expect(keywords).toContain("候选论文排序")
    expect(keywords).toContain("证据覆盖")
    expect(keywords).toContain("排序 nDCG@3")
    expect(keywords).toContain("词项匹配基线")
    expect(keywords).toContain("容器复现")
    expect(introduction).toContain("候选论文排序接口")
    expect(introduction).toContain("排名测试")
    expect(introduction).toContain("文献检索、综述准备和研究选题")
    expect(introduction).toContain("仅依赖词项匹配")
    expect(introduction).not.toContain("面向计算机类论文，正文完整性")
    expect(introduction).not.toContain("结果部分需要解释的是")
    expect(introduction).not.toContain("当前结果显示：以排序 nDCG@3 作为主指标")
    expect(researchQuestions).toContain("本文围绕候选论文排序任务提出三项研究问题")
    expect(researchQuestions).toContain("RQ1 排序机制：relevance、claim_coverage 和 recency 的组合能否形成明确的候选论文排序规则？")
    expect(researchQuestions).toContain("RQ2 特征贡献：引入 claim_coverage 后，相比词项匹配基线和无证据覆盖消融，在排序 nDCG@3 上是否改善前三位排序？")
    expect(researchQuestions).toContain("RQ3 环境一致性：本机和容器环境能否得到一致的排序 nDCG@3 结果？")
    expect(researchQuestions).toContain("方法章节回答 RQ1，结果章节回答 RQ2，可复现性章节回答 RQ3")
    expect(relatedWork).toContain("候选论文排序任务")
    expect(relatedWork).toContain("rankAgentTeamPapers")
    expect(relatedWork).toContain("排序解释研究")
    expect(relatedWork).toContain("检索与推荐评测研究")
    expect(relatedWork).toContain("复现与验证研究")
    expect(relatedWork).not.toContain("工具调用与智能体协作研究")
    expect(relatedWork).not.toContain("论文到代码执行研究")
    expect(relatedWork).not.toContain("本文纳入")
    expect(relatedWork).not.toContain("这些文献形成")
    expect(relatedWork).not.toContain("当前相关工作没有登记阻断性缺口")
    expect(relatedWork).not.toContain("验证状态")
    expect(relatedWork).not.toContain("定位信息")
    expect(relatedWork).not.toContain("已核验英文摘要；作用")
    expect(relatedWork).not.toContain("| 相关工作 |")
    expect(relatedWork).not.toContain("等工作 为代表")
    expect(relatedWork).not.toContain("以 检索与推荐评测研究 为代表")
    expect(relatedWork).not.toContain("以 复现与验证研究 为代表")
    expect(draft.markdown).not.toContain("## 研究设计与证据流")
    expect(draft.markdown).not.toContain("## 证据与可追踪性")
    expect(draft.markdown).not.toContain("下表展示研究设计与证据流")
    expect(draft.markdown).not.toContain("证据链完整性")
    expect(contributions).toContain("rankAgentTeamPapers")
    expect(contributions).toContain("排序接口")
    expect(contributions).toContain("提出由 relevance、claim_coverage 和 recency 组成的候选论文排序评分")
    expect(contributions).toContain("构造词项匹配基线和无证据覆盖消融")
    expect(contributions).not.toContain("可审查链路")
    expect(contributions).not.toContain("实验记录统一为可审查证据")
    expect(contributions).not.toContain("正文表述")
    expect(method).toContain("候选论文排序方法由 rankAgentTeamPapers 和 scorePaper 两个核心接口组成")
    expect(method).toContain("rankAgentTeamPapers 接收候选论文集合，并按 scorePaper 输出的得分进行降序排列")
    expect(method).toContain("scorePaper 把 relevance、claim_coverage 和 recency 压缩为可比较分数")
    expect(method).toContain("评分公式为：score(p) = 0.62 * relevance(p) + 0.28 * claim_coverage(p) + 0.10 * recency(p)")
    expect(method).toContain("三个权重来自 scorePaper 的当前实现")
    expect(method).toContain("其中 p 表示待排序候选论文")
    expect(method).toContain("三项特征均按候选论文逐项计算")
    expect(method).toContain("relevance 衡量候选论文与研究主题的匹配程度")
    expect(method).toContain("claim_coverage 衡量候选论文对当前研究问题关键断言的覆盖")
    expect(method).toContain("recency 作为发表时间相关的弱排序信号")
    expect(method).toContain("排名测试、词项匹配基线、无证据覆盖消融和容器复现分别约束本文方法、词项基线、证据覆盖贡献和环境可重复性")
    expect(method).toContain("rankAgentTeamPapers(src/agent-team-paper.ts:3)、scorePaper(src/agent-team-paper.ts:7)")
    expect(method).toContain("排名测试、词项匹配基线、无证据覆盖消融和容器复现用于比较完整排序、词项基线、证据覆盖消融和环境一致性")
    expect(method).toContain("具体实现位置见附录 A")
    expect(method).not.toContain("源码证据记录")
    expect(method).not.toContain("正文结论绑定")
    expect(method).not.toContain("复核材料")
    expect(method).not.toContain("[来源")
    expect(experimentalSetup).toContain("本文方法的评价对象为“证据约束的论文排序方法”")
    expect(experimentalSetup).toContain("实验协议围绕评价对象、主指标、基线和消融展开，目的是比较排序规则在同一候选集上的表现")
    expect(experimentalSetup).toContain("词项匹配基线用于只依赖查询词重合的排序对照")
    expect(experimentalSetup).toContain("无证据覆盖消融用于移除 claim_coverage 对排序得分的贡献")
    expect(experimentalSetup).not.toContain("结论性表述")
    expect(experimentalSetup).not.toContain("足以支撑")
    expect(experimentalSetup).not.toContain("阻断")
    expect(dataAvailability).toContain("标签由实时 arXiv 检索排序、论文排序主题匹配、来源元数据完整度和发表时间确定，不是人工相关性标注")
    expect(dataAvailability).not.toContain("Deterministic validation labels")
    expect(dataAvailability).not.toContain("not human relevance ground truth")
    expect(draft.markdown).toContain("以排序 nDCG@3 作为主指标")
    expect(draft.markdown).toContain("在“排序 nDCG@3”这一主指标上")
    expect(results).toContain("| 证据约束的论文排序方法 | 本文方法 | 1.0000 |")
    expect(results).toContain("表 1 汇总本文方法、基线和消融在主指标、运行状态和容器复现上的结果。")
    expect(results).toContain("消融分析显示，无证据覆盖消融低于本文方法 0.2682")
    expect(results).toContain("claim_coverage 特征在当前候选集上提供了可观测贡献")
    expect(results).not.toContain("结论性表述")
    expect(results).not.toContain("支撑证据")
    expect(reproducibility).toContain("| 环境 | 实验 | 角色 | 状态 | 指标 | 耗时 |")
    expect(reproducibility).toContain("表 2 汇总本机与容器主指标差异，用于检查复现一致性。")
    expect(reproducibility).toContain("表 3 汇总本机与容器实验的状态、主指标和耗时")
    expect(reproducibility).not.toContain("表 1 汇总本机与容器实验")
    expect(reproducibility).toContain("该比较用于检查同一协议在两个环境中的稳定性")
    expect(reproducibility).not.toContain("命令")
    expect(reproducibility).not.toContain("输出")
    expect(reproducibility).not.toContain("见运行日志")
    expect(reproducibility).not.toContain("审查材料")
    expect(reproducibility).not.toContain("容器命令")
    expect(reproducibility).not.toContain("结论性表述")
    expect(reproducibility).not.toContain("支撑证据")
    expect(discussion).toContain("候选论文排序任务")
    expect(discussion).toContain("前三位排序")
    expect(discussion).toContain("完整排序同时高于词项匹配基线和无证据覆盖消融")
    expect(discussion).toContain("claim_coverage 对前三位排序产生直接影响")
    expect(discussion).toContain("候选数 5")
    expect(discussion).not.toContain("结果解释必须与证据边界保持一致")
    expect(discussion).not.toContain("类型检查通过、单一数据集通过或单次脚本通过")
    expect(threatsToValidity).toContain("候选数 5")
    expect(threatsToValidity).toContain("不是人工相关性标注")
    expect(threatsToValidity).toContain("词项匹配基线偏弱")
    expect(threatsToValidity).not.toContain("流程完整性")
    expect(threatsToValidity).not.toContain("复核材料需要保存命令")
    expect(threatsToValidity).not.toContain("证据范围")
    expect(limitations).toContain("候选数 5")
    expect(limitations).toContain("不是人工相关性标注")
    expect(limitations).toContain("词项匹配基线偏弱")
    expect(limitations).toContain("跨主题验证")
    expect(limitations).not.toContain("未发现阻断项")
    expect(limitations).not.toContain("待修复")
    expect(conclusion).toContain("rankAgentTeamPapers 和 scorePaper")
    expect(conclusion).toContain("候选论文排序方法")
    expect(conclusion).not.toContain("降低计算机类论文中结果断言与实验依据脱节")
    expect(draft.markdown.indexOf("## 结论")).toBeLessThan(draft.markdown.indexOf("## 声明"))
    expect(draft.markdown.indexOf("## 声明")).toBeLessThan(draft.markdown.indexOf("## 参考文献"))
    expect(declarations).toContain("基金项目：未登记")
    expect(declarations).toContain("作者贡献：未登记")
    expect(declarations).toContain("利益冲突：未登记")
    expect(declarations).toContain("伦理审批：未登记")
    expect(declarations).not.toContain("Paper Fucker")
    expect(declarations).not.toContain("OpenCode")
    expect(declarations).not.toContain("系统")
    expect(references).toContain("Ada Zhang; Bo Chen. Agent Workflow Ranking.")
    expect(references).toContain("https://example.org/ranking-agent-workflow")
    expect(references).not.toContain("1. Agent Workflow Ranking. https://example.org/ranking-agent-workflow")
    expect(draft.markdown).not.toContain("代码证据驱动工作流")
    expect(draft.markdown).not.toContain("证据驱动工作流")
    expect(draft.markdown).not.toContain("带显式基线、消融与容器复现脚本的代码论文")
    expect(draft.markdown).not.toContain("代码论文")
    expect(draft.markdown).not.toContain("验证状态")
    expect(draft.markdown).not.toContain("package.json 脚本")
    expect(draft.markdown).not.toContain("可追踪来源")
    expect(draft.markdown).not.toContain("提交代码库")
    expect(draft.markdown).not.toContain("登记命令")
    expect(draft.markdown).not.toContain("仓库提供")
    expect(researchQuestions).not.toContain("结论性表述")
    expect(researchQuestions).not.toContain("完整复核材料")
    expect(researchQuestions).not.toContain("足以支撑")
    expect(draft.markdown).not.toContain("项目声明的实验入口")
    expect(draft.markdown).not.toContain("方法证据显示：对提交代码库")
    expect(draft.markdown).not.toContain("方法部分的证据边界为：对提交代码库")
    expect(draft.markdown).not.toContain("把相关工作边界放在代码证据上：对提交代码库")
    expect(researchQuestions).not.toContain("RQ1 证据边界")
    expect(researchQuestions).not.toContain("提交的代码、方法描述和源码范围")
    expect(contributions).not.toContain("把rank")
    expect(contributions).not.toContain("核心方法断言为：对提交代码库")
    expect(method).not.toContain("代码理解阶段抽取的方法接口、源码范围和可运行入口如下")
    expect(method).not.toContain("scorePaper(right)")
    expect(method).not.toContain("toSorted((left")
    expect(method).not.toContain("并登记 排名测试")
    expect(draft.markdown).not.toContain("bun run 排名测试")
    expect(draft.markdown).not.toContain("bun run 词项匹配基线")
    expect(draft.markdown).not.toContain("主指标 排序")
    expect(draft.markdown).not.toContain("在 排序")
    expect(draft.markdown).not.toContain("类型检查通过状态可以证明代码可运行")
    expect(draft.markdown).not.toContain("最佳基线（ranking lexical）")
    expect(draft.markdown).not.toContain("baseline ranking lexical")
    expect(draft.markdown).not.toContain("ablation ranking no coverage")
    expect(draft.markdown).not.toContain("| ranking lexical |")
    expect(draft.markdown).not.toContain("| ranking no coverage |")
    expect(draft.markdown).not.toContain("## 附录 E：断言证据表")
    expect(draft.markdown).not.toContain("## 附录 F：证据记录索引")
    expect(draft.markdown).not.toContain("## 附录 A：证据追踪")
    expect(draft.markdown).not.toContain("## 附录 B：复现清单")
    expect(draft.markdown).not.toContain("断言证据表")
    expect(draft.markdown).not.toContain("证据记录索引")
    expect(draft.markdown).not.toContain("结构化证据")
    expect(draft.markdown).not.toContain("处理 | 来源类型")
    expect(draft.markdown).not.toContain("## 限制与待修复项")
    expect(draft.markdown).not.toContain("待修复")
    expect(appendixMaterials).toContain("材料类型")
    expect(appendixMaterials).toContain("排序方法实现")
    expect(appendixMaterials).toContain("代码材料")
    expect(appendixMaterials).not.toContain("断言 1")
    expect(appendixMaterials).not.toContain("断言状态")
    expect(appendixMaterials).not.toContain("证据追踪表")
    expect(appendixReproduction).toContain("本文方法")
    expect(appendixReproduction).toContain("词项匹配基线")
    expect(appendixReproduction).toContain("无证据覆盖消融")
    expect(appendixReproduction).not.toContain("研究简报")
    expect(appendixReproduction).not.toContain("就绪")
    expect(appendixReproduction).not.toContain("结论表述条件")
    expect(appendixReproduction).not.toContain("项目声明的实验入口")
  })

  test("renders ranking related work with ranking and retrieval representatives", () => {
    const ledger = composeClaimLedger({
      topic: "Agent team paper ranking",
      claims: [
        {
          text: "The ranking method compares rankAgentTeamPapers against lexical and coverage ablations.",
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
      result_report: { ...resultReport(), primary_metric: "ranking_ndcg_at_3" },
      experiment_plan: {
        objective: "Evaluate paper ranking.",
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
        baselines: [],
        ablations: [],
        resource_budget: { max_wall_time_seconds: 3600, max_memory_mb: 8192, max_gpu_hours: 0 },
        downgrade_policy: [],
      },
      literature_map: {
        schema_version: "LiteratureMap.v1",
        topic: "paper recommendation ranking",
        created_at: now,
        sources: [
          {
            schema_version: "SourceRecord.v1",
            source_id: "paper:ranking-hidden-bonus",
            kind: "paper",
            title: "Explaining Rankings with Hidden Group Bonuses",
            url: "https://arxiv.org/abs/2605.29444",
            provider: "arxiv",
            license: { status: "clear", expression: "CC BY 4.0" },
            version: { value: "v1", retrieved_at: now, published_at: "2026-05-28" },
            verification: { status: "verified", method: "unit-test", checked_at: now },
            topics: ["ranking", "explanation", "evaluation"],
            abstract: "Studies how hidden group bonuses change ranking outcomes and ranking explanations.",
            retrieved_at: now,
            arxiv_id: "2605.29444",
          },
          {
            schema_version: "SourceRecord.v1",
            source_id: "paper:same-ranking",
            kind: "paper",
            title: "Same Ranking, Different Winner: How Scoring Targets Shape LLM Memory Benchmarks",
            url: "https://arxiv.org/abs/2605.24060",
            provider: "arxiv",
            license: { status: "clear", expression: "CC BY 4.0" },
            version: { value: "v1", retrieved_at: now, published_at: "2026-05-22" },
            verification: { status: "verified", method: "unit-test", checked_at: now },
            topics: ["ranking", "benchmark", "evaluation"],
            abstract: "Compares scoring targets in ranking benchmarks and shows that evaluation choices can change winners.",
            retrieved_at: now,
            arxiv_id: "2605.24060",
          },
          {
            schema_version: "SourceRecord.v1",
            source_id: "paper:ranking-retrieval",
            kind: "paper",
            title: "Discrimination Is Generation: Unifying Ranking and Retrieval from a Tokenizer Perspective",
            url: "https://arxiv.org/abs/2605.14853",
            provider: "arxiv",
            license: { status: "clear", expression: "CC BY 4.0" },
            version: { value: "v1", retrieved_at: now, published_at: "2026-05-14" },
            verification: { status: "verified", method: "unit-test", checked_at: now },
            topics: ["ranking", "retrieval", "recommendation"],
            abstract: "Unifies ranking and retrieval and discusses ranking from a retrieval perspective.",
            retrieved_at: now,
            arxiv_id: "2605.14853",
          },
        ],
        clusters: [],
        summary: { total_sources: 3, verified_sources: 3, open_license_sources: 3 },
        diagnostics: { verification_failures: [], gaps: [] },
      },
      now,
    })
    const relatedWork = markdownSection(draft.markdown, "相关工作")

    expect(relatedWork).toContain("排序解释研究以 Explaining Rankings with Hidden Group Bonuses [1]")
    expect(relatedWork).toContain("检索与推荐评测研究以 Discrimination Is Generation: Unifying Ranking and Retrieval from a Tokenizer Perspective [3]")
    expect(relatedWork).toContain("复现与验证研究以 Same Ranking, Different Winner: How Scoring Targets Shape LLM Memory Benchmarks [2]")
    expect(relatedWork).not.toContain("多智能体和工具调用研究")
    expect(relatedWork).not.toContain("工具调用与智能体协作研究")
    expect(relatedWork).not.toContain("论文到代码执行研究")
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
      expect(result.revision.next_markdown).toContain("数据可用性：已登记 1 个数据集")
      expect(result.revision.next_markdown).toContain("代码可用性：已登记 1 个代码证据记录")
      expect(result.revision.next_markdown).toContain("导出条件：已满足当前导出条件。")
      expect(result.revision.next_markdown).not.toContain("本次运行")
      expect(result.revision.next_markdown).not.toContain("终稿检查")
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
      expect(result.revision.next_markdown).not.toContain("## 附录 G：投稿准备度")
      expect(result.revision.next_markdown).not.toContain("通用预印本")
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
