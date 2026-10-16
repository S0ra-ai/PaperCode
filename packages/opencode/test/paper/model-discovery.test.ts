import { afterEach, describe, expect, test } from "bun:test"
import { existsSync } from "fs"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "fs/promises"
import path from "path"
import os from "os"
import {
  discoverOpenAICompatibleModels,
  providerConfigPath,
  providerSecretPath,
  saveProviderEndpointConfig,
} from "../../src/paper/model-discovery"
import {
  candidatesFromDiscovery,
  candidatesFromBuiltinProviders,
  candidatesFromConfigProviders,
  mergeConfigProviderCandidates,
  loadPaperModelInventory,
  mergeModelCandidates,
  modelInventoryPath,
  routePaperModel,
  updatePaperModelAllowlist,
  upsertDiscoveredModels,
} from "../../src/paper/model-inventory"
import { resolveModelRoleAssignment } from "../../src/paper/model-roles"

const tmpRoots: string[] = []
const repoRoot = path.resolve(import.meta.dir, "../../../..")

async function tmpHome() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "paper-fucker-models-"))
  tmpRoots.push(dir)
  return dir
}

afterEach(async () => {
  await Promise.all(tmpRoots.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe("paper provider model discovery", () => {
  test("starts with an empty model inventory and blocks routing until the user configures models", async () => {
    const home = await tmpHome()
    const inventory = await loadPaperModelInventory({ home })
    expect(inventory.decision_model).toBeUndefined()
    expect(inventory.allowlist).toEqual([])
    expect(inventory.candidates).toEqual([])

    const decision = routePaperModel(inventory, { role: "writer" })
    expect(decision.source).toBe("blocked")
    expect(decision.reason).toContain("模型工作台")
    expect(decision.diagnostics).toContain("model_allowlist_empty")
  })

  test("does not treat stale candidate.allowed or decision_model as user allowlist", async () => {
    const home = await tmpHome()
    const file = modelInventoryPath(home)
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(
      file,
      JSON.stringify({
        schema_version: "PaperModelInventory.v1",
        updated_at: "2026-05-12T00:00:00Z",
        decision_model: "lab/paper-pro",
        allowlist: [],
        role_overrides: {},
        candidates: [
          {
            provider_id: "lab",
            model_id: "paper-pro",
            model_ref: "lab/paper-pro",
            display_name: "Paper Pro",
            source: "openai_compatible",
            capabilities: ["general"],
            cost_hint: "standard",
            context_hint: "long",
            smoke_status: "passed",
            allowed: true,
            discovered_at: "2026-05-12T00:00:00Z",
          },
        ],
      }),
      "utf8",
    )

    const inventory = await loadPaperModelInventory({ home })
    expect(inventory.decision_model).toBeUndefined()
    expect(inventory.allowlist).toEqual([])
    expect(inventory.provider_registrations.lab).toBeUndefined()
    expect(inventory.candidates[0]?.allowed).toBe(false)
    expect(routePaperModel(inventory, { role: "planner" }).diagnostics).toContain("model_allowlist_empty")
  })

  test("does not promote stale unregistered candidates into registered providers", async () => {
    const inventory = await loadPaperModelInventory({ home: await tmpHome() })
    const merged = mergeModelCandidates(inventory, [
      {
        provider_id: "openai",
        provider_name: "ChatGPT 订阅",
        model_id: "gpt-5.2",
        model_ref: "openai/gpt-5.2",
        display_name: "gpt-5.2",
        source: "paper_builtin",
        capabilities: ["general"],
        cost_hint: "unknown",
        context_hint: "long",
        smoke_status: "untested",
        allowed: false,
        discovered_at: "2026-05-12T00:00:00Z",
      },
    ])

    expect(merged.provider_registrations.openai).toBeUndefined()
    expect(merged.candidates.map((candidate) => candidate.model_ref)).toEqual(["openai/gpt-5.2"])

    const normalized = await updatePaperModelAllowlist([], {
      home: await tmpHome(),
      candidates: merged.candidates,
      provider_registrations: {},
    })

    expect(normalized.provider_registrations).toEqual({})
    expect(normalized.candidates).toEqual([])
    expect(routePaperModel(normalized, { role: "writer" }).diagnostics).toContain("model_allowlist_empty")
  })

  test("drops legacy manual registrations that only came from builtin provider catalogs", async () => {
    const home = await tmpHome()
    const file = modelInventoryPath(home)
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(
      file,
      JSON.stringify({
        schema_version: "PaperModelInventory.v1",
        updated_at: "2026-05-12T00:00:00Z",
        allowlist: [],
        role_overrides: {},
        provider_registrations: {
          anthropic: {
            provider_id: "anthropic",
            provider_name: "Anthropic",
            kind: "manual",
            status: "registered",
            model_count: 525,
            allowed_count: 0,
          },
        },
        candidates: [
          {
            provider_id: "anthropic",
            provider_name: "Anthropic",
            model_id: "claude-opus-4.5",
            model_ref: "anthropic/claude-opus-4.5",
            display_name: "Claude Opus 4.5",
            source: "paper_builtin",
            capabilities: ["general"],
            cost_hint: "unknown",
            context_hint: "long",
            smoke_status: "untested",
            allowed: false,
            discovered_at: "2026-05-12T00:00:00Z",
          },
        ],
      }),
      "utf8",
    )

    const inventory = await loadPaperModelInventory({ home })
    expect(inventory.provider_registrations.anthropic).toBeUndefined()
    expect(inventory.candidates.map((candidate) => candidate.model_ref)).toEqual(["anthropic/claude-opus-4.5"])
    expect(routePaperModel(inventory, { role: "planner" }).diagnostics).toContain("model_allowlist_empty")
  })

  test("filters registered providers to subscription auth and custom endpoint registrations", async () => {
    const home = await tmpHome()
    const file = modelInventoryPath(home)
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(
      file,
      JSON.stringify({
        schema_version: "PaperModelInventory.v1",
        updated_at: "2026-05-12T00:00:00Z",
        allowlist: [],
        role_overrides: {},
        provider_registrations: {
          anthropic: {
            provider_id: "anthropic",
            provider_name: "Anthropic",
            kind: "builtin",
            status: "registered",
            model_count: 1,
            allowed_count: 0,
          },
          openai: {
            provider_id: "openai",
            provider_name: "ChatGPT 订阅",
            kind: "chatgpt_subscription",
            status: "registered",
            model_count: 1,
            allowed_count: 0,
          },
          lab: {
            provider_id: "lab",
            provider_name: "Lab",
            kind: "openai_compatible",
            status: "registered",
            model_count: 1,
            allowed_count: 0,
          },
        },
      }),
      "utf8",
    )

    const inventory = await loadPaperModelInventory({ home })
    expect(Object.keys(inventory.provider_registrations).sort()).toEqual(["lab", "openai"])
  })

  test("does not route allowlisted models from disabled or auth-pending providers", async () => {
    const home = await tmpHome()
    const file = modelInventoryPath(home)
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(
      file,
      JSON.stringify({
        schema_version: "PaperModelInventory.v1",
        updated_at: "2026-05-12T00:00:00Z",
        decision_model: "lab/paper-pro",
        backup_decision_model: "openai/gpt-5.2",
        allowlist: ["lab/paper-pro", "openai/gpt-5.2", "historical/kept"],
        role_overrides: { writer: "lab/paper-pro", reviewer: "historical/kept" },
        provider_registrations: {
          lab: {
            provider_id: "lab",
            provider_name: "Local Lab",
            kind: "openai_compatible",
            status: "disabled",
            model_count: 1,
            allowed_count: 1,
          },
          openai: {
            provider_id: "openai",
            provider_name: "ChatGPT 订阅",
            kind: "chatgpt_subscription",
            status: "needs_auth",
            model_count: 1,
            allowed_count: 1,
          },
        },
        stage_model_policies: {
          writer: { role: "writer", mode: "forced", model_ref: "lab/paper-pro" },
          reviewer: { role: "reviewer", mode: "forced", model_ref: "historical/kept" },
        },
        candidates: [
          {
            provider_id: "lab",
            provider_name: "Local Lab",
            model_id: "paper-pro",
            model_ref: "lab/paper-pro",
            display_name: "Paper Pro",
            source: "openai_compatible",
            capabilities: ["general"],
            cost_hint: "standard",
            context_hint: "long",
            smoke_status: "passed",
            allowed: true,
            discovered_at: "2026-05-12T00:00:00Z",
          },
          {
            provider_id: "openai",
            provider_name: "ChatGPT 订阅",
            model_id: "gpt-5.2",
            model_ref: "openai/gpt-5.2",
            display_name: "GPT 5.2",
            source: "paper_builtin",
            capabilities: ["general"],
            cost_hint: "unknown",
            context_hint: "long",
            smoke_status: "untested",
            allowed: true,
            discovered_at: "2026-05-12T00:00:00Z",
          },
        ],
      }),
      "utf8",
    )

    const inventory = await loadPaperModelInventory({ home })
    expect(inventory.allowlist).toEqual(["historical/kept"])
    expect(inventory.decision_model).toBeUndefined()
    expect(inventory.backup_decision_model).toBeUndefined()
    expect(inventory.role_overrides).toEqual({ reviewer: "historical/kept" })
    expect(inventory.stage_model_policies.writer).toEqual({ role: "writer", mode: "auto" })
    expect(inventory.stage_model_policies.reviewer).toEqual({
      role: "reviewer",
      mode: "forced",
      model_ref: "historical/kept",
    })
    expect(inventory.provider_registrations.lab).toMatchObject({ status: "disabled", allowed_count: 0 })
    expect(inventory.provider_registrations.openai).toMatchObject({ status: "needs_auth", allowed_count: 0 })
    expect(inventory.candidates.map((candidate) => [candidate.model_ref, candidate.allowed])).toEqual([
      ["lab/paper-pro", false],
      ["openai/gpt-5.2", false],
    ])
    expect(routePaperModel(inventory, { role: "writer" })).toMatchObject({
      source: "blocked",
      diagnostics: ["decision_model_missing"],
    })
  })

  test("can route a historical allowlisted decision model even when candidate metadata is unavailable", async () => {
    const inventory = await updatePaperModelAllowlist(["lab/paper-pro"], {
      home: await tmpHome(),
      decision_model: "lab/paper-pro",
    })

    const decision = routePaperModel(inventory, { role: "planner" })
    expect(decision).toMatchObject({
      source: "decision_model",
      selected_model: "lab/paper-pro",
      provider_id: "lab",
      model_id: "paper-pro",
    })
    expect(decision.candidate_count).toBe(0)
    expect(decision.diagnostics).toContain("model_candidate_metadata_missing")
  })

  test("discovers OpenAI-compatible /v1/models without leaking API keys", async () => {
    const calls: Array<{ url: string; auth?: string }> = []
    const result = await discoverOpenAICompatibleModels(
      {
        provider_id: "local-lab",
        provider_name: "Local Lab",
        base_url: "https://models.example/v1",
        api_key: "sk-test-secret",
        compatibility: "openai-compatible",
      },
      {
        fetch: async (input, init) => {
          calls.push({
            url: String(input),
            auth: new Headers(init?.headers).get("authorization") ?? undefined,
          })
          return Response.json({
            data: [{ id: "paper-writer" }, { id: "paper-reviewer", owned_by: "lab" }],
          })
        },
      },
    )

    expect(calls).toEqual([{ url: "https://models.example/v1/models", auth: "Bearer sk-test-secret" }])
    expect(result.provider_id).toBe("local-lab")
    expect(result.models.map((model) => model.id)).toEqual(["paper-writer", "paper-reviewer"])
    expect(JSON.stringify(result)).not.toContain("sk-test-secret")
  })

  test("stores provider endpoint config without tracking the API key", async () => {
    const home = await tmpHome()
    const saved = await saveProviderEndpointConfig(
      {
        provider_id: "deepseek",
        provider_name: "DeepSeek",
        base_url: "https://api.deepseek.com/v1",
        api_key: "sk-local-only",
        compatibility: "openai-compatible",
      },
      { home },
    )

    const publicConfig = await readFile(providerConfigPath(home, "deepseek"), "utf8")
    const secretConfig = await readFile(providerSecretPath(home), "utf8")

    expect(saved.api_key_ref).toBe("provider:deepseek")
    expect(publicConfig).toContain('"api_key_ref": "provider:deepseek"')
    expect(publicConfig).not.toContain("sk-local-only")
    expect(secretConfig).toContain("sk-local-only")
    expect(saved.config_path.startsWith(home)).toBe(true)
    expect(saved.secret_path.startsWith(path.join(home, ".paper_fucker", "local"))).toBe(true)
  })

  test("persists discovered models into a user allowlist and routes only allowlisted models", async () => {
    const home = await tmpHome()
    const discovery = await discoverOpenAICompatibleModels(
      {
        provider_id: "lab",
        base_url: "https://lab.example/v1",
        api_key: "sk-test-secret",
        compatibility: "openai-compatible",
      },
      {
        fetch: async () =>
          Response.json({
            data: [{ id: "paper-small" }, { id: "paper-pro-128k" }],
          }),
      },
    )

    await upsertDiscoveredModels(discovery, {
      home,
      allow: ["lab/paper-pro-128k"],
      decision_model: "lab/paper-pro-128k",
    })
    const inventory = await loadPaperModelInventory({ home })

    expect(inventory.decision_model).toBe("lab/paper-pro-128k")
    expect(inventory.allowlist).toContain("lab/paper-pro-128k")
    expect(inventory.candidates.find((candidate) => candidate.model_ref === "lab/paper-pro-128k")?.allowed).toBe(true)

    const routed = routePaperModel(inventory, {
      role: "writer",
      task_scale: "large",
      difficulty: "high",
      budget_tier: "standard",
    })
    expect(routed.source).toBe("decision_model")
    expect(routed.selected_model).toBeDefined()
    expect(routed.allowed_models).toContain(routed.selected_model!)
  })

  test("blocks forced models that are not in the user allowlist", async () => {
    const home = await tmpHome()
    const inventory = await updatePaperModelAllowlist(["deepseek/deepseek-v4-pro"], {
      home,
      decision_model: "deepseek/deepseek-v4-pro",
    })
    const decision = routePaperModel(inventory, {
      role: "reviewer",
      forced_model: "openai/gpt-5.2",
    })

    expect(decision.source).toBe("blocked")
    expect(decision.diagnostics).toContain("forced_model_not_allowed")
    expect(decision.reason).toContain("不在允许列表")
  })

  test("persists built-in provider models into the Paper allowlist", async () => {
    const home = await tmpHome()
    const candidates = candidatesFromBuiltinProviders({
      "github-copilot": {
        name: "GitHub Copilot",
        models: {
          "claude-opus-4.7": { name: "Claude Opus 4.7" },
        },
      },
    })
    const inventory = await updatePaperModelAllowlist(["github-copilot/claude-opus-4.7"], {
      home,
      decision_model: "github-copilot/claude-opus-4.7",
      candidates,
    })

    expect(inventory.candidates.find((candidate) => candidate.model_ref === "github-copilot/claude-opus-4.7")).toMatchObject({
      provider_id: "github-copilot",
      source: "paper_builtin",
      allowed: true,
    })
    expect(routePaperModel(inventory, { role: "planner" })).toMatchObject({
      source: "decision_model",
      selected_model: "github-copilot/claude-opus-4.7",
    })
  })

  test("tracks registered providers without enabling unallowed models", async () => {
    const home = await tmpHome()
    const candidates = candidatesFromBuiltinProviders({
      "github-copilot": {
        name: "GitHub Copilot",
        models: {
          "claude-opus-4.7": { name: "Claude Opus 4.7" },
          "gpt-5.1": { name: "GPT 5.1" },
        },
      },
    })
    const inventory = await updatePaperModelAllowlist(["github-copilot/claude-opus-4.7"], {
      home,
      decision_model: "github-copilot/claude-opus-4.7",
      candidates,
      provider_registrations: {
        "github-copilot": {
          provider_id: "github-copilot",
          provider_name: "GitHub Copilot",
          kind: "builtin",
          status: "registered",
          model_count: 2,
          allowed_count: 1,
        },
      },
    })

    expect(inventory.provider_registrations["github-copilot"]).toMatchObject({
      status: "registered",
      model_count: 2,
      allowed_count: 1,
    })
    expect(inventory.candidates.map((candidate) => [candidate.model_ref, candidate.allowed])).toEqual([
      ["github-copilot/claude-opus-4.7", true],
      ["github-copilot/gpt-5.1", false],
    ])
    expect(routePaperModel(inventory, { role: "reviewer" }).allowed_models).toEqual([
      "github-copilot/claude-opus-4.7",
    ])
  })

  test("treats ChatGPT and GitHub Copilot subscriptions as first-class paper providers", async () => {
    const home = await tmpHome()
    const candidates = candidatesFromBuiltinProviders({
      openai: {
        name: "ChatGPT Plus/Pro",
        models: {
          "gpt-5.2": { name: "GPT 5.2" },
          "gpt-5.2-mini": { name: "GPT 5.2 Mini" },
        },
      },
      "github-copilot": {
        name: "GitHub Copilot",
        models: {
          "claude-opus-4.7": { name: "Claude Opus 4.7" },
          "gpt-5-mini": { name: "GPT 5 Mini" },
        },
      },
    })
    const inventory = await updatePaperModelAllowlist(
      ["openai/gpt-5.2", "github-copilot/claude-opus-4.7"],
      {
        home,
        decision_model: "openai/gpt-5.2",
        backup_decision_model: "github-copilot/claude-opus-4.7",
        candidates,
        provider_registrations: {
          openai: {
            provider_id: "openai",
            provider_name: "ChatGPT Plus/Pro",
            kind: "chatgpt_subscription",
            status: "registered",
            model_count: 2,
            allowed_count: 1,
          },
          "github-copilot": {
            provider_id: "github-copilot",
            provider_name: "GitHub Copilot",
            kind: "copilot_subscription",
            status: "registered",
            model_count: 2,
            allowed_count: 1,
          },
        },
        stage_model_policies: {
          writer: { role: "writer", mode: "dynamic" },
          reviewer: { role: "reviewer", mode: "forced", model_ref: "github-copilot/claude-opus-4.7" },
        },
      },
    )

    expect(inventory.provider_registrations.openai).toMatchObject({
      kind: "chatgpt_subscription",
      status: "registered",
      model_count: 2,
      allowed_count: 1,
    })
    expect(inventory.provider_registrations["github-copilot"]).toMatchObject({
      kind: "copilot_subscription",
      status: "registered",
      model_count: 2,
      allowed_count: 1,
    })
    expect(inventory.allowlist.sort()).toEqual([
      "github-copilot/claude-opus-4.7",
      "openai/gpt-5.2",
    ])
    expect(inventory.decision_model).toBe("openai/gpt-5.2")
    expect(inventory.backup_decision_model).toBe("github-copilot/claude-opus-4.7")
    expect(routePaperModel(inventory, { role: "writer", difficulty: "high" })).toMatchObject({
      source: "decision_model",
      decision_model: "openai/gpt-5.2",
    })
    expect(routePaperModel(inventory, { role: "reviewer" })).toMatchObject({
      source: "user_override",
      selected_model: "github-copilot/claude-opus-4.7",
    })
  })

  test("removing a provider purges its candidates, allowlist, decisions, and forced stage policies", async () => {
    const home = await tmpHome()
    const builtinCandidates = candidatesFromBuiltinProviders({
      "github-copilot": {
        name: "GitHub Copilot",
        models: {
          "claude-opus-4.7": { name: "Claude Opus 4.7" },
        },
      },
    })
    const customCandidates = candidatesFromDiscovery({
      provider_id: "lab",
      provider_name: "Local Lab",
      base_url: "https://lab.example/v1",
      compatibility: "openai-compatible",
      models: [{ id: "writer-pro" }],
      diagnostics: [],
    })

    await updatePaperModelAllowlist(["github-copilot/claude-opus-4.7", "lab/writer-pro"], {
      home,
      decision_model: "github-copilot/claude-opus-4.7",
      backup_decision_model: "lab/writer-pro",
      candidates: [...builtinCandidates, ...customCandidates],
      provider_registrations: {
        "github-copilot": {
          provider_id: "github-copilot",
          provider_name: "GitHub Copilot",
          kind: "copilot_subscription",
          status: "registered",
          model_count: 1,
          allowed_count: 1,
        },
        lab: {
          provider_id: "lab",
          provider_name: "Local Lab",
          kind: "openai_compatible",
          status: "registered",
          model_count: 1,
          allowed_count: 1,
        },
      },
      stage_model_policies: {
        writer: { role: "writer", mode: "forced", model_ref: "github-copilot/claude-opus-4.7" },
        reviewer: { role: "reviewer", mode: "forced", model_ref: "lab/writer-pro" },
      },
    })

    const inventory = await updatePaperModelAllowlist(["lab/writer-pro"], {
      home,
      decision_model: "lab/writer-pro",
      provider_registrations: {
        lab: {
          provider_id: "lab",
          provider_name: "Local Lab",
          kind: "openai_compatible",
          status: "registered",
          model_count: 1,
          allowed_count: 1,
        },
      },
      stage_model_policies: {
        writer: { role: "writer", mode: "forced", model_ref: "github-copilot/claude-opus-4.7" },
        reviewer: { role: "reviewer", mode: "forced", model_ref: "lab/writer-pro" },
      },
    })

    expect(inventory.provider_registrations["github-copilot"]).toBeUndefined()
    expect(inventory.candidates.map((candidate) => candidate.model_ref)).toEqual(["lab/writer-pro"])
    expect(inventory.allowlist).toEqual(["lab/writer-pro"])
    expect(inventory.decision_model).toBe("lab/writer-pro")
    expect(inventory.backup_decision_model).toBeUndefined()
    expect(inventory.stage_model_policies.writer).toEqual({ role: "writer", mode: "auto" })
    expect(inventory.stage_model_policies.reviewer).toEqual({
      role: "reviewer",
      mode: "forced",
      model_ref: "lab/writer-pro",
    })
  })

  test("clearing registered providers resets the complete model inventory", async () => {
    const home = await tmpHome()
    const candidates = candidatesFromDiscovery({
      provider_id: "lab",
      provider_name: "Local Lab",
      base_url: "https://lab.example/v1",
      compatibility: "openai-compatible",
      models: [{ id: "writer-pro" }, { id: "reviewer-pro" }],
      diagnostics: [],
    })

    await updatePaperModelAllowlist(["lab/writer-pro", "lab/reviewer-pro"], {
      home,
      decision_model: "lab/writer-pro",
      backup_decision_model: "lab/reviewer-pro",
      candidates,
      provider_registrations: {
        lab: {
          provider_id: "lab",
          provider_name: "Local Lab",
          kind: "openai_compatible",
          status: "registered",
          model_count: 2,
          allowed_count: 2,
        },
      },
      stage_model_policies: {
        writer: { role: "writer", mode: "forced", model_ref: "lab/writer-pro" },
      },
    })

    const cleared = await updatePaperModelAllowlist([], {
      home,
      provider_registrations: {},
      stage_model_policies: {},
    })

    expect(cleared.provider_registrations).toEqual({})
    expect(cleared.candidates).toEqual([])
    expect(cleared.allowlist).toEqual([])
    expect(cleared.decision_model).toBeUndefined()
    expect(cleared.backup_decision_model).toBeUndefined()
    expect(cleared.stage_model_policies).toEqual({})
    expect(routePaperModel(cleared, { role: "writer" }).diagnostics).toContain("model_allowlist_empty")
  })

  test("uses a backup decision model when the primary model is stale", async () => {
    const home = await tmpHome()
    const file = modelInventoryPath(home)
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(
      file,
      JSON.stringify({
        schema_version: "PaperModelInventory.v1",
        updated_at: "2026-05-13T00:00:00Z",
        decision_model: "lab/removed",
        backup_decision_model: "lab/backup",
        allowlist: ["lab/backup"],
        role_overrides: {},
        candidates: [],
      }),
      "utf8",
    )

    const inventory = await loadPaperModelInventory({ home })
    expect(inventory.decision_model).toBeUndefined()
    expect(inventory.backup_decision_model).toBe("lab/backup")
    expect(routePaperModel(inventory, { role: "planner" })).toMatchObject({
      source: "decision_model",
      decision_model: "lab/backup",
      selected_model: "lab/backup",
    })
  })

  test("routes forced stage policies only through the allowlist", async () => {
    const home = await tmpHome()
    const inventory = await updatePaperModelAllowlist(["lab/planner", "lab/writer"], {
      home,
      decision_model: "lab/planner",
      stage_model_policies: {
        writer: { role: "writer", mode: "forced", model_ref: "lab/writer" },
        reviewer: { role: "reviewer", mode: "dynamic" },
      },
    })

    expect(routePaperModel(inventory, { role: "writer" })).toMatchObject({
      source: "user_override",
      selected_model: "lab/writer",
    })
    expect(routePaperModel(inventory, { role: "reviewer" })).toMatchObject({
      source: "decision_model",
      selected_model: "lab/planner",
    })
  })

  test("ships a provider matrix smoke script that reads local secrets without echoing keys", async () => {
    const scriptPath = path.join(repoRoot, "scripts", "provider-matrix-smoke.ps1")
    expect(existsSync(scriptPath)).toBe(true)
    const script = await readFile(scriptPath, "utf8")

    expect(script).toContain(".paper_fucker")
    expect(script).toContain("providers")
    expect(script).toContain("provider-secrets.json")
    expect(script).toContain("/models")
    expect(script).toContain("/chat/completions")
    expect(script).toContain("reports/provider-matrix-smoke.md")
    expect(script).toContain("pending_config")
    expect(script).not.toContain("Write-Output $apiKey")
  })
})

describe("paper model role assignment", () => {
  test("resolves default, role, and subagent model overrides", () => {
    const assignment = {
      default_model: "deepseek/deepseek-v4-pro",
      roles: {
        writer: "deepseek/deepseek-v4-pro",
        reviewer: "openai/gpt-5.2",
      },
      subagents: {
        verifier: "anthropic/claude-sonnet-4-5",
      },
    }

    expect(resolveModelRoleAssignment(assignment, "planner")).toMatchObject({
      provider_id: "deepseek",
      model_id: "deepseek-v4-pro",
      source: "default",
    })
    expect(resolveModelRoleAssignment(assignment, "reviewer")).toMatchObject({
      provider_id: "openai",
      model_id: "gpt-5.2",
      source: "role_override",
    })
    expect(resolveModelRoleAssignment(assignment, "reviewer", "verifier")).toMatchObject({
      provider_id: "anthropic",
      model_id: "claude-sonnet-4-5",
      source: "subagent_override",
    })
  })
})

describe("providers declared in config", () => {
  const catalog = {
    fjbdg: {
      name: "fjbdg",
      models: {
        "deepseek-v4-flash-vision-exp": {
          limit: { context: 1_000_000, output: 384_000 },
          capabilities: { reasoning: true, input: { image: true } },
        },
      },
    },
    "not-declared": { name: "other", models: { "some-model": {} } },
  }

  test("candidates carry the declared metadata and only cover declared providers", () => {
    const candidates = candidatesFromConfigProviders(catalog, ["fjbdg"])
    expect(candidates).toHaveLength(1)
    const [candidate] = candidates
    expect(candidate).toMatchObject({
      provider_id: "fjbdg",
      model_id: "deepseek-v4-flash-vision-exp",
      model_ref: "fjbdg/deepseek-v4-flash-vision-exp",
      source: "manual",
      context_hint: "long",
      allowed: false,
    })
    expect(candidate.capabilities).toContain("planning")
    expect(candidate.capabilities).toContain("review")
  })

  test("merging registers the provider but leaves its models un-allowed", async () => {
    const home = await tmpHome()
    const stored = await loadPaperModelInventory({ home })
    const merged = mergeConfigProviderCandidates(stored, candidatesFromConfigProviders(catalog, ["fjbdg"]))
    expect(merged.provider_registrations.fjbdg).toMatchObject({ kind: "manual", status: "registered", model_count: 1 })
    expect(merged.allowlist).toEqual([])
    expect(merged.candidates.every((candidate) => candidate.allowed === false)).toBe(true)
  })

  test("allowlisting a declared model unblocks routing for the paper roles", async () => {
    const home = await tmpHome()
    const stored = await loadPaperModelInventory({ home })
    const merged = mergeConfigProviderCandidates(stored, candidatesFromConfigProviders(catalog, ["fjbdg"]))
    const ref = "fjbdg/deepseek-v4-flash-vision-exp"
    const inventory = await updatePaperModelAllowlist([ref], {
      home,
      candidates: merged.candidates,
      provider_registrations: merged.provider_registrations,
      decision_model: ref,
    })
    expect(inventory.allowlist).toEqual([ref])
    const decision = routePaperModel(inventory, { role: "writer", budget_tier: "standard" })
    expect(decision.source).not.toBe("blocked")
    expect(decision.selected_model).toBe(ref)
  })
})
