import type { ExperimentMetric, ResultReport } from "../research/experiments"
import type { ResearchCapability, ResearchCapabilityRegistry } from "./capabilities"

export interface ExperimentClaimEligibility {
  status: "claimable" | "blocked" | "exploratory_only"
  final_claim_allowed: boolean
  citation_label: "reproduced" | "exploratory" | "blocked"
  blockers: string[]
}

const EXPERIMENT_LOOP_CAPABILITIES = [
  "skill.jupyter-notebook",
  "opencode.shell",
  "python.experiment-log-parse",
  "python.dataset-metadata-probe",
] as const

export function resolveExperimentLoopCapabilities(registry: ResearchCapabilityRegistry): ResearchCapability[] {
  return EXPERIMENT_LOOP_CAPABILITIES.map((name) => registry.get(name))
}

function directionForMetric(name: string): ExperimentMetric["direction"] {
  const lower = name.toLowerCase()
  if (lower.includes("loss") || lower.includes("latency") || lower.includes("error") || lower.includes("time")) {
    return "lower_better"
  }
  return "higher_better"
}

function unitForMetric(name: string) {
  return name.toLowerCase().endsWith("_ms") ? "ms" : undefined
}

export function parseExperimentLogMetrics(log: string): ExperimentMetric[] {
  const metricPattern = /([A-Za-z][A-Za-z0-9_.-]*)\s*(?:=|:|\s)\s*(-?\d+(?:\.\d+)?)/g
  const metrics: ExperimentMetric[] = []
  for (const match of log.matchAll(metricPattern)) {
    const name = match[1]
    const value = Number(match[2])
    if (!name || !Number.isFinite(value)) continue
    const unit = unitForMetric(name)
    metrics.push({
      name,
      value,
      direction: directionForMetric(name),
      ...(unit ? { unit } : {}),
    })
  }
  return metrics
}

export function classifyExperimentClaimEligibility(input: {
  report: ResultReport
  exploratory?: boolean
}): ExperimentClaimEligibility {
  if (input.report.final_claims_allowed && input.report.reproduction.status === "passed") {
    return {
      status: "claimable",
      final_claim_allowed: true,
      citation_label: "reproduced",
      blockers: [],
    }
  }
  if (input.exploratory) {
    return {
      status: "exploratory_only",
      final_claim_allowed: false,
      citation_label: "exploratory",
      blockers: [],
    }
  }
  return {
    status: "blocked",
    final_claim_allowed: false,
    citation_label: "blocked",
    blockers: input.report.blockers.length > 0 ? input.report.blockers : ["experiment_not_reproduced"],
  }
}
