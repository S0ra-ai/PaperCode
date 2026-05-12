import { describe, expect, test } from "bun:test"
import {
  DEFAULT_MODEL_ROLE_CONFIG,
  PAPER_MODEL_ROLES,
  createModelRoleRouter,
  parseOpenCodeModelId,
} from "@/paper"

describe("paper model role router", () => {
  test("defines the paper model roles used by the closed-loop workflow", () => {
    expect(PAPER_MODEL_ROLES).toEqual([
      "planner",
      "literature_researcher",
      "code_analyst",
      "experiment_designer",
      "writer",
      "reviewer",
      "citation_checker",
      "cheap_summarizer",
      "subagent",
    ])
  })

  test("uses DeepSeek as a default sample without making it the only supported provider", () => {
    const router = createModelRoleRouter()

    expect(router.resolve("writer")).toEqual({
      role: "writer",
      provider_id: "deepseek",
      model_id: "deepseek-v4-pro",
      source: "default",
    })
    expect(router.strategy).toBe("opencode_provider_agnostic")
    expect(DEFAULT_MODEL_ROLE_CONFIG.default_model).toBe("deepseek/deepseek-v4-pro")
  })

  test("supports per-role overrides for any OpenCode provider/model id", () => {
    const router = createModelRoleRouter({
      default_model: "openrouter/anthropic/claude-3.7-sonnet",
      roles: {
        reviewer: "github-copilot/gpt-5-mini",
        cheap_summarizer: "openai/gpt-5-nano",
      },
    })

    expect(router.resolve("planner")).toEqual({
      role: "planner",
      provider_id: "openrouter",
      model_id: "anthropic/claude-3.7-sonnet",
      source: "default",
    })
    expect(router.resolve("reviewer")).toEqual({
      role: "reviewer",
      provider_id: "github-copilot",
      model_id: "gpt-5-mini",
      source: "role_override",
    })
    expect(router.resolve("cheap_summarizer")).toEqual({
      role: "cheap_summarizer",
      provider_id: "openai",
      model_id: "gpt-5-nano",
      source: "role_override",
    })
  })

  test("reports invalid OpenCode model identifiers with role context", () => {
    expect(parseOpenCodeModelId("deepseek/deepseek-v4-pro")).toEqual({
      provider_id: "deepseek",
      model_id: "deepseek-v4-pro",
    })

    expect(() => createModelRoleRouter({ default_model: "missing-provider" }).resolve("writer")).toThrow(
      'Invalid OpenCode model id for role "writer": missing-provider',
    )
  })
})
