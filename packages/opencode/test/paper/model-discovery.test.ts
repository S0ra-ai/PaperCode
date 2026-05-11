import { afterEach, describe, expect, test } from "bun:test"
import { existsSync } from "fs"
import { mkdtemp, readFile, rm } from "fs/promises"
import path from "path"
import os from "os"
import {
  discoverOpenAICompatibleModels,
  providerConfigPath,
  providerSecretPath,
  saveProviderEndpointConfig,
} from "../../src/paper/model-discovery"
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
