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
  substrate: "opencode" | "paper_fucker" | "python" | "external_mcp" | "codex_skill"
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
      otel_span_name: `paper_fucker.capability.${capability.name}`,
    }
  }
}

export function createResearchCapabilityRegistry(capabilities: ResearchCapability[] = []) {
  return new ResearchCapabilityRegistry(capabilities)
}

const objectSchema = { type: "object" } as const

export function defaultResearchCapabilities(): ResearchCapability[] {
  return [
    {
      name: "exa",
      type: "mcp",
      substrate: "external_mcp",
      title: "Exa remote research search",
      description: "Remote Exa MCP search for literature, data, and source verification.",
      input_schema: objectSchema,
      output_schema: objectSchema,
      trust: "external_verified",
      cost: "metered",
      network: "required",
      allowed_stages: ["literature", "data", "verification"],
    },
    {
      name: "opencode.read",
      type: "builtin_tool",
      substrate: "opencode",
      title: "OpenCode read",
      description: "Read source files and paper materials through the OpenCode tool substrate.",
      input_schema: objectSchema,
      output_schema: objectSchema,
      trust: "first_party",
      cost: "free",
      network: "none",
      allowed_stages: ["intake", "code_analysis", "verification"],
    },
    {
      name: "opencode.grep",
      type: "builtin_tool",
      substrate: "opencode",
      title: "OpenCode grep",
      description: "Search source and document text through the OpenCode tool substrate.",
      input_schema: objectSchema,
      output_schema: objectSchema,
      trust: "first_party",
      cost: "free",
      network: "none",
      allowed_stages: ["code_analysis", "verification"],
    },
    {
      name: "opencode.glob",
      type: "builtin_tool",
      substrate: "opencode",
      title: "OpenCode glob",
      description: "Discover workspace files for intake, code analysis, and export packaging.",
      input_schema: objectSchema,
      output_schema: objectSchema,
      trust: "first_party",
      cost: "free",
      network: "none",
      allowed_stages: ["intake", "code_analysis", "export"],
    },
    {
      name: "opencode.task",
      type: "builtin_tool",
      substrate: "opencode",
      title: "OpenCode task",
      description: "Delegate bounded code analysis or verification work through OpenCode agents.",
      input_schema: objectSchema,
      output_schema: objectSchema,
      trust: "first_party",
      cost: "variable",
      network: "optional",
      allowed_stages: ["planning", "code_analysis", "verification", "revision"],
    },
    {
      name: "opencode.shell",
      type: "builtin_tool",
      substrate: "opencode",
      title: "OpenCode shell",
      description: "Run approved local commands for diagnostics, experiments, and export rendering.",
      input_schema: objectSchema,
      output_schema: objectSchema,
      trust: "first_party",
      cost: "free",
      network: "optional",
      allowed_stages: ["experiment_execution", "reproduction", "export"],
    },
    {
      name: "skill.nature-paper",
      type: "skill",
      substrate: "codex_skill",
      title: "Nature paper profile skill",
      description: "Paper profile skill for Nature-style structure, statements, figures, and submission checks.",
      input_schema: objectSchema,
      output_schema: objectSchema,
      trust: "profile_guidance",
      cost: "free",
      network: "required",
      allowed_stages: ["profile_formatting", "verification", "export"],
    },
    {
      name: "skill.jupyter-notebook",
      type: "skill",
      substrate: "codex_skill",
      title: "Jupyter notebook skill",
      description: "Generate and maintain exploratory notebooks for experiment design and analysis.",
      input_schema: objectSchema,
      output_schema: objectSchema,
      trust: "local_generated",
      cost: "free",
      network: "none",
      allowed_stages: ["experiment_design", "experiment_execution", "reproduction"],
    },
    {
      name: "paper.claim-ledger",
      type: "first_party_tool",
      substrate: "paper_fucker",
      title: "ClaimLedger writer",
      description: "Create, update, and verify ClaimLedger entries before draft generation.",
      input_schema: objectSchema,
      output_schema: objectSchema,
      trust: "first_party",
      cost: "free",
      network: "none",
      allowed_stages: ["claim_ledger", "drafting", "verification"],
    },
    {
      name: "paper.export-bundle",
      type: "first_party_tool",
      substrate: "paper_fucker",
      title: "Paper export bundle",
      description: "Build final and forced-draft paper bundles from verified run artifacts.",
      input_schema: objectSchema,
      output_schema: objectSchema,
      trust: "first_party",
      cost: "free",
      network: "none",
      allowed_stages: ["export", "verification"],
    },
    {
      name: "python.experiment-log-parse",
      type: "python_tool",
      substrate: "python",
      title: "Experiment log parser",
      description: "Parse experiment logs and extract structured metric records.",
      input_schema: objectSchema,
      output_schema: objectSchema,
      trust: "local_generated",
      cost: "free",
      network: "none",
      allowed_stages: ["experiment_execution", "reproduction", "verification"],
    },
    {
      name: "python.dataset-metadata-probe",
      type: "python_tool",
      substrate: "python",
      title: "Dataset metadata probe",
      description: "Inspect dataset files and derive structured metadata and diagnostics.",
      input_schema: objectSchema,
      output_schema: objectSchema,
      trust: "local_generated",
      cost: "free",
      network: "none",
      allowed_stages: ["data", "experiment_execution", "verification"],
    },
  ]
}
