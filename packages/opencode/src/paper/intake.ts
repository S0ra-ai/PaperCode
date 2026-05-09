import {
  appendResearchEvent,
  writeResearchArtifact,
  type ResearchRuntimeOptions,
} from "./research/runtime"
import type { ResearchArtifact, ResearchEvent } from "./research/contracts"
import type { ModelRoleConfig } from "./model-router"
import type { PaperProfileId } from "./profiles"

export type ResearchWorkflow = "topic_to_paper" | "code_to_paper" | "data_to_paper" | "materials_to_paper"

export interface ResearchIntakeRequest {
  topic: string
  workspace_path?: string
  code_paths?: string[]
  paper_files?: string[]
  dataset_paths?: string[]
  experiment_logs?: string[]
  target_profile?: PaperProfileId
  language?: string
  model_roles?: Partial<ModelRoleConfig["roles"]>
}

export interface ResearchBriefRisk {
  id: string
  severity: "low" | "medium" | "high"
  message: string
}

export interface ResearchBrief {
  schema_version: "ResearchBrief.v1"
  workflow: ResearchWorkflow
  topic: string
  language: string
  target_profile: PaperProfileId
  inputs: {
    workspace_path?: string
    code_paths: string[]
    paper_files: string[]
    dataset_paths: string[]
    experiment_logs: string[]
  }
  model_roles?: Partial<ModelRoleConfig["roles"]>
  research_questions: string[]
  contribution_candidates: string[]
  verifiable_hypotheses: string[]
  needed_evidence: string[]
  recommended_profile: PaperProfileId
  risks: ResearchBriefRisk[]
  pause_conditions: string[]
}

export interface RecordResearchIntakeResult {
  brief: ResearchBrief
  artifact: ResearchArtifact
  event: ResearchEvent
}

function normalizeText(input: string) {
  return input.trim().replace(/\s+/g, " ")
}

function normalizePath(input: string) {
  return input.trim().replace(/\\/g, "/")
}

function normalizePaths(inputs?: string[]) {
  return Array.from(new Set((inputs ?? []).map(normalizePath).filter(Boolean)))
}

function inferWorkflow(input: {
  code_paths: string[]
  paper_files: string[]
  dataset_paths: string[]
  experiment_logs: string[]
}): ResearchWorkflow {
  if (input.code_paths.length > 0) return "code_to_paper"
  if (input.paper_files.length > 0 || input.experiment_logs.length > 0) return "materials_to_paper"
  if (input.dataset_paths.length > 0) return "data_to_paper"
  return "topic_to_paper"
}

function evidenceFor(workflow: ResearchWorkflow) {
  const common = ["verified citations", "claim-source bindings", "profile compliance checks"]
  if (workflow === "code_to_paper") {
    return [...common, "source-range-bound codebase map", "method extraction tied to file paths", "reproduction plan"]
  }
  if (workflow === "data_to_paper") {
    return [...common, "dataset card", "license and version verification", "analysis plan"]
  }
  if (workflow === "materials_to_paper") {
    return [...common, "material source map", "dataset card", "experiment log metric extraction"]
  }
  return [...common, "literature map", "dataset feasibility scan", "experiment design"]
}

function risksFor(workflow: ResearchWorkflow, input: ResearchBrief["inputs"]): ResearchBriefRisk[] {
  const risks: ResearchBriefRisk[] = [
    {
      id: "low_confidence_direction",
      severity: "medium",
      message: "Pause when the topic cannot support a credible research direction.",
    },
  ]
  if (workflow === "code_to_paper") {
    risks.push({
      id: "code_claim_grounding",
      severity: "high",
      message: "Every method or system claim must bind to source ranges in the provided code paths.",
    })
  }
  if (input.paper_files.length > 0) {
    risks.push({
      id: "material_consistency",
      severity: "medium",
      message: "Uploaded or referenced paper materials may conflict and need reconciliation.",
    })
  }
  if (input.dataset_paths.length > 0) {
    risks.push({
      id: "dataset_license",
      severity: "high",
      message: "Dataset license, version, and provenance must be verified before final claims.",
    })
  }
  if (input.experiment_logs.length > 0) {
    risks.push({
      id: "experiment_reproduction",
      severity: "high",
      message: "Experiment logs must be parsed and reproduced or marked exploratory before final export.",
    })
  }
  return risks
}

export function normalizeResearchIntake(request: ResearchIntakeRequest): ResearchBrief {
  const topic = normalizeText(request.topic)
  if (!topic) throw new Error("Research intake topic is required.")

  const inputs = {
    workspace_path: request.workspace_path ? normalizePath(request.workspace_path) : undefined,
    code_paths: normalizePaths(request.code_paths),
    paper_files: normalizePaths(request.paper_files),
    dataset_paths: normalizePaths(request.dataset_paths),
    experiment_logs: normalizePaths(request.experiment_logs),
  }
  const workflow = inferWorkflow(inputs)
  const targetProfile = request.target_profile ?? "generic-preprint"

  return {
    schema_version: "ResearchBrief.v1",
    workflow,
    topic,
    language: request.language ?? "zh-CN",
    target_profile: targetProfile,
    inputs,
    model_roles: request.model_roles,
    research_questions: [
      `What verifiable research question can be answered for "${topic}"?`,
      `Which evidence, code, data, or experiments are required to support "${topic}"?`,
    ],
    contribution_candidates:
      workflow === "code_to_paper"
        ? ["Code-grounded method extraction", "Reproducible system or algorithm evaluation"]
        : ["Open literature and data discovery for the topic", "Experiment plan derived from available evidence"],
    verifiable_hypotheses: [
      `A claim-ledger-first paper for "${topic}" can be supported with traceable sources.`,
      "Final export must be blocked until claim, citation, data, code, and reproduction checks pass.",
    ],
    needed_evidence: evidenceFor(workflow),
    recommended_profile: targetProfile,
    risks: risksFor(workflow, inputs),
    pause_conditions: [
      "missing_api_key_or_tool",
      "cost_over_budget",
      "license_or_source_conflict",
      "low_confidence_direction",
      "reproduction_failure",
      "authenticity_gate_blocked",
    ],
  }
}

export async function recordResearchIntake(
  runDir: string,
  request: ResearchIntakeRequest,
  options?: ResearchRuntimeOptions,
): Promise<RecordResearchIntakeResult> {
  const brief = normalizeResearchIntake(request)
  const artifact = await writeResearchArtifact(
    runDir,
    {
      kind: "outline",
      logical_path: "intake/research-brief.json",
      data: brief,
      metadata: { artifact_schema: "ResearchBrief.v1", workflow: brief.workflow },
    },
    options,
  )
  const event = await appendResearchEvent(
    runDir,
    {
      type: "intake.brief.created",
      actor: "system",
      payload: {
        artifact_id: artifact.artifact_id,
        workflow: brief.workflow,
        target_profile: brief.target_profile,
        language: brief.language,
      },
    },
    options,
  )
  return { brief, artifact, event }
}
