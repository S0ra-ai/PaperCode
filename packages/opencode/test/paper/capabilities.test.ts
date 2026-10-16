import { describe, expect, test } from "bun:test"
import {
  PAPER_CAPABILITY_STAGES,
  createResearchCapabilityRegistry,
  defaultResearchCapabilities,
  type ResearchCapability,
} from "@/paper"

describe("research capability registry", () => {
  test("defines the full closed-loop paper stage surface", () => {
    expect(PAPER_CAPABILITY_STAGES).toEqual([
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
    ])
  })

  test("registers default MCP, OpenCode tool, skill, first-party, and Python capabilities", () => {
    const registry = createResearchCapabilityRegistry(defaultResearchCapabilities())

    expect(registry.get("exa")).toMatchObject({
      name: "exa",
      type: "mcp",
      trust: "external_verified",
      network: "required",
      allowed_stages: ["literature", "data", "verification"],
    })
    expect(registry.get("opencode.read")).toMatchObject({
      type: "builtin_tool",
      substrate: "opencode",
      allowed_stages: ["intake", "code_analysis", "verification"],
    })
    expect(registry.get("skill.nature-paper")).toMatchObject({
      type: "skill",
      trust: "profile_guidance",
      allowed_stages: ["profile_formatting", "verification", "export"],
    })
    expect(registry.get("python.experiment-log-parse")).toMatchObject({
      type: "python_tool",
      trust: "local_generated",
      network: "none",
      allowed_stages: ["experiment_execution", "reproduction", "verification"],
    })
    expect(registry.get("paper.claim-ledger")).toMatchObject({
      type: "first_party_tool",
      trust: "first_party",
      allowed_stages: ["claim_ledger", "drafting", "verification"],
    })
  })

  test("filters capabilities by stage and capability type", () => {
    const registry = createResearchCapabilityRegistry(defaultResearchCapabilities())

    expect(registry.forStage("literature").map((capability) => capability.name)).toContain("exa")
    expect(registry.forStage("code_analysis").map((capability) => capability.name)).toEqual(
      expect.arrayContaining(["opencode.read", "opencode.grep", "opencode.glob", "opencode.task"]),
    )
    expect(registry.forStage("experiment_execution", { type: "python_tool" }).map((capability) => capability.name)).toEqual(
      expect.arrayContaining(["python.experiment-log-parse", "python.dataset-metadata-probe"]),
    )
  })

  test("rejects duplicate registrations and produces trace metadata", () => {
    const customCapability: ResearchCapability = {
      name: "custom.paper-check",
      type: "first_party_tool",
      substrate: "papercode",
      title: "Custom paper check",
      description: "Fixture capability used to prove registration and trace metadata.",
      input_schema: { type: "object" },
      output_schema: { type: "object" },
      trust: "first_party",
      cost: "free",
      network: "none",
      allowed_stages: ["verification"],
    }
    const registry = createResearchCapabilityRegistry([customCapability])

    expect(registry.traceFor("custom.paper-check", { run_id: "run-1", stage: "verification" })).toEqual({
      run_id: "run-1",
      stage: "verification",
      capability_name: "custom.paper-check",
      capability_type: "first_party_tool",
      substrate: "papercode",
      trust: "first_party",
      cost: "free",
      network: "none",
      otel_span_name: "papercode.capability.custom.paper-check",
    })
    expect(() => registry.register(customCapability)).toThrow('Research capability "custom.paper-check" is already registered')
  })
})
