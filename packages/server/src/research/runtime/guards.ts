import type { ResearchFinalGateState } from "./state"

export type ResearchPlannedStage =
  | "template"
  | "literature"
  | "data"
  | "experiment"
  | "writing"
  | "verification"
  | "export"

export type ResearchStageStub = {
  stage: ResearchPlannedStage
  status: "not_implemented"
  reason: string
  blocks_final_output: true
}

export type ResearchOutputKind =
  | "literature"
  | "dataset"
  | "experiment"
  | "claim"
  | "paper_text"
  | "final_export"

export type ResearchOutputProvenance = {
  source_type: "verified" | "tool" | "user" | "stub" | "synthetic" | "fake"
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

export function createNotImplementedStageStub(stage: ResearchPlannedStage, reason: string): ResearchStageStub {
  return {
    stage,
    status: "not_implemented",
    reason,
    blocks_final_output: true,
  }
}

export function phaseOneStageStubs(): ResearchStageStub[] {
  return [
    createNotImplementedStageStub("template", "Trusted template resolution is tracked by task-010-template-resolve."),
    createNotImplementedStageStub("literature", "Open literature discovery is tracked by task-011-literature-data."),
    createNotImplementedStageStub("data", "Dataset discovery and license verification is tracked by task-011-literature-data."),
    createNotImplementedStageStub("experiment", "Experiment planning and reproduction is tracked by task-012-experiment-loop."),
    createNotImplementedStageStub("writing", "Claim-ledger writing is tracked by task-013-writing-claim-ledger."),
    createNotImplementedStageStub("verification", "Authenticity verification is tracked by task-014-verification-gate."),
    createNotImplementedStageStub("export", "Final and forced-draft export is tracked by task-015-export-bundles."),
  ]
}

export function assertAuthenticResearchOutput(input: {
  kind: ResearchOutputKind
  provenance: ResearchOutputProvenance
  final_gate?: ResearchFinalGateState
}) {
  const sourceType = input.provenance.source_type
  if (sourceType === "stub" || sourceType === "synthetic" || sourceType === "fake") {
    throw new ResearchAuthenticityError(
      `${input.kind} output is ${sourceType}; paper_fucker must not turn unverified placeholder material into research facts.`,
    )
  }

  if (input.kind === "final_export" && input.final_gate?.status !== "passed") {
    throw new ResearchAuthenticityError("Final export requires a passed authenticity gate.")
  }
}
