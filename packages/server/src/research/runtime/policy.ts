import os from "os"

export type ResearchAccessMode = "full_access" | "bounded"
export type ResearchMode = "unlimited" | "bounded"

export type ResearchPermissionInput = {
  access_mode?: ResearchAccessMode
  research_mode?: ResearchMode
  bounded_hours?: number
}

export type ResearchPermissionState = {
  access_mode: ResearchAccessMode
  research_mode: ResearchMode
  full_access: boolean
  manual_command_required: false
  tool_execution: "auto"
  bounded_hours?: number
  expires_at?: string
}

export type ResearchResourceSnapshot = {
  detected_at: string
  platform: NodeJS.Platform
  arch: string
  hostname: string
  cpu_count: number
  total_memory_bytes: number
  free_memory_bytes: number
  gpu: {
    available: boolean
    hint?: string
  }
}

export type ResearchCostBudget = {
  llm_soft_usd?: number
  api_soft_usd?: number
  total_soft_usd?: number
}

export type ResearchBudgetAlert = {
  id: string
  category: "llm" | "api" | "total"
  threshold_usd: number
  observed_usd: number
  created_at: string
}

export type ResearchCostState = {
  llm_usd: number
  api_usd: number
  total_usd: number
  budget: ResearchCostBudget
  alerts: ResearchBudgetAlert[]
}

export type ResearchCostUsage = {
  llm_usd?: number
  api_usd?: number
}

export function createPermissionState(input: ResearchPermissionInput | undefined, now: string): ResearchPermissionState {
  const accessMode = input?.access_mode ?? "full_access"
  const researchMode = input?.research_mode ?? (accessMode === "full_access" ? "unlimited" : "bounded")
  if (accessMode === "full_access") {
    return {
      access_mode: "full_access",
      research_mode: "unlimited",
      full_access: true,
      manual_command_required: false,
      tool_execution: "auto",
    }
  }

  const boundedHours = input?.bounded_hours ?? 3
  if (!Number.isFinite(boundedHours) || boundedHours <= 0 || boundedHours > 24) {
    throw new Error("Bounded research mode must be between 0 and 24 hours.")
  }
  return {
    access_mode: "bounded",
    research_mode: researchMode === "unlimited" ? "bounded" : researchMode,
    full_access: false,
    manual_command_required: false,
    tool_execution: "auto",
    bounded_hours: boundedHours,
    expires_at: new Date(Date.parse(now) + boundedHours * 60 * 60 * 1000).toISOString(),
  }
}

export function detectResourceSnapshot(now: string): ResearchResourceSnapshot {
  const gpuHint = process.env.CUDA_VISIBLE_DEVICES || process.env.PAPER_FUCKER_GPU
  return {
    detected_at: now,
    platform: process.platform,
    arch: process.arch,
    hostname: os.hostname(),
    cpu_count: os.cpus().length,
    total_memory_bytes: os.totalmem(),
    free_memory_bytes: os.freemem(),
    gpu: gpuHint
      ? {
          available: gpuHint !== "-1" && gpuHint.toLowerCase() !== "none",
          hint: gpuHint,
        }
      : {
          available: false,
        },
  }
}

export function createCostState(budget: ResearchCostBudget | undefined): ResearchCostState {
  return {
    llm_usd: 0,
    api_usd: 0,
    total_usd: 0,
    budget: budget ?? {},
    alerts: [],
  }
}

function money(value: number) {
  return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000
}

function crossed(before: number, after: number, threshold: number | undefined) {
  return typeof threshold === "number" && Number.isFinite(threshold) && before < threshold && after >= threshold
}

export function applyCostUsage(state: ResearchCostState, usage: ResearchCostUsage, now: string): ResearchCostState {
  const previous = { llm_usd: state.llm_usd, api_usd: state.api_usd, total_usd: state.total_usd }
  const llmUsd = money(state.llm_usd + (usage.llm_usd ?? 0))
  const apiUsd = money(state.api_usd + (usage.api_usd ?? 0))
  const totalUsd = money(llmUsd + apiUsd)
  const alerts = [...state.alerts]

  const addAlert = (category: ResearchBudgetAlert["category"], threshold: number, observed: number) => {
    const id = `${category}:${threshold}`
    if (alerts.some((alert) => alert.id === id)) return
    alerts.push({
      id,
      category,
      threshold_usd: threshold,
      observed_usd: observed,
      created_at: now,
    })
  }

  if (crossed(previous.llm_usd, llmUsd, state.budget.llm_soft_usd)) {
    addAlert("llm", state.budget.llm_soft_usd!, llmUsd)
  }
  if (crossed(previous.api_usd, apiUsd, state.budget.api_soft_usd)) {
    addAlert("api", state.budget.api_soft_usd!, apiUsd)
  }
  if (crossed(previous.total_usd, totalUsd, state.budget.total_soft_usd)) {
    addAlert("total", state.budget.total_soft_usd!, totalUsd)
  }

  return {
    llm_usd: llmUsd,
    api_usd: apiUsd,
    total_usd: totalUsd,
    budget: state.budget,
    alerts,
  }
}
