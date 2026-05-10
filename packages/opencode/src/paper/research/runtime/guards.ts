import type { ResearchFinalGateState } from "./state"

export type ResearchPlannedStage =
  | "template"
  | "literature"
  | "data"
  | "experiment"
  | "writing"
  | "verification"
  | "export"

export type ResearchStageBlockingDiagnostic = {
  stage: ResearchPlannedStage
  status: "blocked"
  reason: string
  blocks_final_output: true
  required_action?: string
  historical_task_id?: string
}

export type ResearchOutputKind =
  | "literature"
  | "dataset"
  | "experiment"
  | "claim"
  | "paper_text"
  | "final_export"

export type ResearchOutputProvenance = {
  source_type: "verified" | "tool" | "user" | "placeholder" | "synthetic" | "fake"
  source_ids?: string[]
  artifact_ids?: string[]
  note?: string
}

export class ResearchAuthenticityError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ResearchAuthenticityError"
  }
}

export function createStageBlockingDiagnostic(input: {
  stage: ResearchPlannedStage
  reason: string
  required_action?: string
  historical_task_id?: string
}): ResearchStageBlockingDiagnostic {
  const diagnostic: ResearchStageBlockingDiagnostic = {
    stage: input.stage,
    status: "blocked",
    reason: input.reason,
    blocks_final_output: true,
  }
  if (input.required_action) diagnostic.required_action = input.required_action
  if (input.historical_task_id) diagnostic.historical_task_id = input.historical_task_id
  return diagnostic
}

export function assertAuthenticResearchOutput(input: {
  kind: ResearchOutputKind
  provenance: ResearchOutputProvenance
  final_gate?: ResearchFinalGateState
}) {
  const sourceType = input.provenance.source_type
  if (sourceType === "placeholder" || sourceType === "synthetic" || sourceType === "fake") {
    throw new ResearchAuthenticityError(
      `${input.kind} output is ${sourceType}; paper_fucker must not turn unverified placeholder material into research facts.`,
    )
  }

  if (input.kind === "final_export" && input.final_gate?.status !== "passed") {
    throw new ResearchAuthenticityError("Final export requires a passed authenticity gate.")
  }
}
