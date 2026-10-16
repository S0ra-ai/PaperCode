import { describe, expect, test } from "bun:test"
import {
  PAPERCODE_ARCHITECTURE,
  SUPPORTED_PAPER_INPUT_MODES,
  describePaperSystem,
} from "@/paper"

describe("papercode paper system architecture", () => {
  test("frames the model/agent substrate and papercode as the paper domain system", () => {
    expect(PAPERCODE_ARCHITECTURE.layers).toEqual([
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
    ])
  })

  test("supports topic, codebase, data, experiment log, and paper material intake", () => {
    expect(SUPPORTED_PAPER_INPUT_MODES).toEqual([
      "topic_to_paper",
      "code_to_paper",
      "data_to_paper",
      "experiment_log_to_paper",
      "materials_to_paper",
    ])
  })

  test("does not treat DeepSeek as the only model path", () => {
    const system = describePaperSystem()

    expect(system.default_model_sample).toEqual({
      provider_id: "deepseek",
      model_id: "deepseek-v4-pro",
    })
    expect(system.model_strategy).toBe("paper_provider_agnostic")
    expect(system.supports_all_configured_models).toBe(true)
    expect(system.core_capability_sources).toEqual([
      "model_provider_runtime",
      "agent_runtime",
      "managed_skills",
      "papercode_tools",
    ])
  })
})
