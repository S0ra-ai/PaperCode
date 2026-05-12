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
  candidatesFromBuiltinProviders,
  loadPaperModelInventory,
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
    expect(inventory.candidates[0]?.allowed).toBe(false)
    expect(routePaperModel(inventory, { role: "planner" }).diagnostics).toContain("model_allowlist_empty")
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

  test("persists built-in OpenCode provider models into the Paper allowlist", async () => {
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
      source: "opencode_builtin",
      allowed: true,
    })
    expect(routePaperModel(inventory, { role: "planner" })).toMatchObject({
      source: "decision_model",
      selected_model: "github-copilot/claude-opus-4.7",
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
