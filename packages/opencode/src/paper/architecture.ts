export type PaperArchitectureLayer = {
  id: "model_agent_substrate" | "research_runtime" | "paper_domain"
  owns: string[]
}

export type PaperInputMode =
  | "topic_to_paper"
  | "code_to_paper"
  | "data_to_paper"
  | "experiment_log_to_paper"
  | "materials_to_paper"

export type PaperSystemDescription = {
  product: "papercode"
  purpose: string
  model_strategy: "paper_provider_agnostic"
  supports_all_configured_models: boolean
  default_model_sample: {
    provider_id: string
    model_id: string
  }
  core_capability_sources: Array<"model_provider_runtime" | "agent_runtime" | "managed_skills" | "papercode_tools">
  input_modes: PaperInputMode[]
  architecture: typeof PAPERCODE_ARCHITECTURE
}

export const PAPERCODE_ARCHITECTURE = {
  layers: [
    {
      id: "model_agent_substrate",
      owns: ["providers", "models", "agents", "sessions", "tools", "mcp", "skills", "tui", "permissions"],
    },
    {
      id: "research_runtime",
      owns: ["run_storage", "events", "artifacts", "claims", "verification", "exports"],
    },
    {
      id: "paper_domain",
      owns: ["intake", "paper_profiles", "model_roles", "capability_registry", "paper_orchestrator", "authoring_loop"],
    },
  ] satisfies PaperArchitectureLayer[],
} as const

export const SUPPORTED_PAPER_INPUT_MODES = [
  "topic_to_paper",
  "code_to_paper",
  "data_to_paper",
  "experiment_log_to_paper",
  "materials_to_paper",
] as const satisfies PaperInputMode[]

export function describePaperSystem(): PaperSystemDescription {
  return {
    product: "papercode",
    purpose:
      "A closed-loop academic paper system with PaperCode managed providers, agents, tools, MCP servers, skills, and TUI for verifiable topic/code/data/materials-to-paper workflows.",
    model_strategy: "paper_provider_agnostic",
    supports_all_configured_models: true,
    default_model_sample: {
      provider_id: "deepseek",
      model_id: "deepseek-v4-pro",
    },
    core_capability_sources: ["model_provider_runtime", "agent_runtime", "managed_skills", "papercode_tools"],
    input_modes: [...SUPPORTED_PAPER_INPUT_MODES],
    architecture: PAPERCODE_ARCHITECTURE,
  }
}
