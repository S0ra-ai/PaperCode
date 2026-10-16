export const PAPER_CAPABILITY_STAGES = [
  "intake",
  "planning",
  "literature",
  "code_analysis",
  "data",
  "experiment_design",
  "experiment_execution",
  "reproduction",
  "claim_ledger",
  "drafting",
  "profile_formatting",
  "verification",
  "revision",
  "export",
] as const

export type PaperCapabilityStage = (typeof PAPER_CAPABILITY_STAGES)[number]

export type ResearchCapabilityType = "skill" | "mcp" | "builtin_tool" | "first_party_tool" | "python_tool"

export type ResearchCapabilityTrust =
  | "first_party"
  | "local_generated"
  | "external_verified"
  | "profile_guidance"
  | "unverified"

export type ResearchCapabilityCost = "free" | "metered" | "variable"

export type ResearchCapabilityNetwork = "none" | "optional" | "required"

export interface ResearchCapability {
  name: string
  type: ResearchCapabilityType
  substrate: "opencode" | "papercode" | "python" | "external_mcp" | "codex_skill"
  title: string
  description: string
  input_schema: Record<string, unknown>
  output_schema: Record<string, unknown>
  trust: ResearchCapabilityTrust
  cost: ResearchCapabilityCost
  network: ResearchCapabilityNetwork
  allowed_stages: PaperCapabilityStage[]
}

export interface ResearchCapabilityTraceContext {
  run_id: string
  stage: PaperCapabilityStage
}

export interface ResearchCapabilityTrace {
  run_id: string
  stage: PaperCapabilityStage
  capability_name: string
  capability_type: ResearchCapabilityType
  substrate: ResearchCapability["substrate"]
  trust: ResearchCapabilityTrust
  cost: ResearchCapabilityCost
  network: ResearchCapabilityNetwork
  otel_span_name: string
}

export interface ResearchCapabilityFilter {
  type?: ResearchCapabilityType
}

export class DuplicateResearchCapabilityError extends Error {
  constructor(name: string) {
    super(`Research capability "${name}" is already registered`)
    this.name = "DuplicateResearchCapabilityError"
  }
}

export class MissingResearchCapabilityError extends Error {
  constructor(name: string) {
    super(`Research capability "${name}" is not registered`)
    this.name = "MissingResearchCapabilityError"
  }
}

export class ResearchCapabilityRegistry {
  private readonly capabilities = new Map<string, ResearchCapability>()

  constructor(capabilities: ResearchCapability[] = []) {
    for (const capability of capabilities) {
      this.register(capability)
    }
  }

  register(capability: ResearchCapability) {
    if (this.capabilities.has(capability.name)) {
      throw new DuplicateResearchCapabilityError(capability.name)
    }
    this.capabilities.set(capability.name, capability)
    return this
  }

  list() {
    return Array.from(this.capabilities.values())
  }

  get(name: string) {
    const capability = this.capabilities.get(name)
    if (!capability) throw new MissingResearchCapabilityError(name)
    return capability
  }

  forStage(stage: PaperCapabilityStage, filter: ResearchCapabilityFilter = {}) {
    return this.list().filter((capability) => {
      return capability.allowed_stages.includes(stage) && (!filter.type || capability.type === filter.type)
    })
  }

  traceFor(name: string, context: ResearchCapabilityTraceContext): ResearchCapabilityTrace {
    const capability = this.get(name)

    return {
      run_id: context.run_id,
      stage: context.stage,
      capability_name: capability.name,
      capability_type: capability.type,
      substrate: capability.substrate,
      trust: capability.trust,
      cost: capability.cost,
      network: capability.network,
      otel_span_name: `papercode.capability.${capability.name}`,
    }
  }
}

export function createResearchCapabilityRegistry(capabilities: ResearchCapability[] = []) {
  return new ResearchCapabilityRegistry(capabilities)
}

export function defaultResearchCapabilities(): ResearchCapability[] {
  return builtinResearchCapabilities()
}
import { builtinResearchCapabilities } from "./capability-pack"
