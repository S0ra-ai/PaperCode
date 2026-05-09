import type { ResearchCostState, ResearchRuntimeState } from "../runtime"
import type { ResearchPauseReason, ResearchStageId } from "./stage-graph"

export type ResearchPauseCondition = {
  reason: ResearchPauseReason
  message: string
  stage?: ResearchStageId
}

export type StagePolicySignal = {
  safety_risk?: boolean
  authenticity_risk?: boolean
  external_tool_missing?: string
  source_license_conflict?: string
  low_confidence?: number
  cost_anomaly?: boolean
  stage_failure?: string
}

export type StagePolicyDecision =
  | { action: "proceed" }
  | { action: "pause"; condition: ResearchPauseCondition }

function hasBudgetAlert(cost: ResearchCostState) {
  return cost.alerts.some((alert) => alert.category === "total" || alert.category === "llm" || alert.category === "api")
}

export function decideAutomaticStagePolicy(input: {
  state: ResearchRuntimeState
  stage: ResearchStageId
  signal?: StagePolicySignal
}): StagePolicyDecision {
  const signal = input.signal ?? {}
  if (signal.safety_risk) {
    return { action: "pause", condition: { reason: "safety", stage: input.stage, message: "Safety risk requires review." } }
  }
  if (signal.authenticity_risk) {
    return {
      action: "pause",
      condition: { reason: "authenticity", stage: input.stage, message: "Authenticity risk requires review." },
    }
  }
  if (signal.cost_anomaly || hasBudgetAlert(input.state.cost)) {
    return {
      action: "pause",
      condition: { reason: "cost_anomaly", stage: input.stage, message: "Cost anomaly exceeded the configured budget." },
    }
  }
  if (signal.external_tool_missing) {
    return {
      action: "pause",
      condition: {
        reason: "external_tool_missing",
        stage: input.stage,
        message: `External tool missing: ${signal.external_tool_missing}`,
      },
    }
  }
  if (signal.source_license_conflict) {
    return {
      action: "pause",
      condition: {
        reason: "source_license_conflict",
        stage: input.stage,
        message: `Source or license conflict: ${signal.source_license_conflict}`,
      },
    }
  }
  if (signal.stage_failure) {
    return {
      action: "pause",
      condition: {
        reason: "stage_failure",
        stage: input.stage,
        message: `Stage failure: ${signal.stage_failure}`,
      },
    }
  }
  if (typeof signal.low_confidence === "number" && signal.low_confidence < 0.65) {
    return {
      action: "pause",
      condition: {
        reason: "low_confidence",
        stage: input.stage,
        message: `Confidence ${signal.low_confidence.toFixed(2)} is below automatic threshold 0.65.`,
      },
    }
  }
  return { action: "proceed" }
}
