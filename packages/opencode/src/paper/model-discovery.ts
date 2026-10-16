import { mkdir, readFile, writeFile } from "fs/promises"
import path from "path"
import os from "os"

export type ProviderCompatibilityFormat = "openai-compatible"

export interface ProviderEndpointConfig {
  provider_id: string
  provider_name?: string
  base_url: string
  api_key: string
  compatibility: ProviderCompatibilityFormat
  timeout_ms?: number
}

export interface StoredProviderEndpointConfig {
  provider_id: string
  provider_name?: string
  base_url: string
  compatibility: ProviderCompatibilityFormat
  api_key_ref: string
  config_path: string
  secret_path: string
}

export interface DiscoveredModel {
  id: string
  name?: string
  owned_by?: string
}

export interface ModelDiscoveryResult {
  provider_id: string
  provider_name?: string
  base_url: string
  compatibility: ProviderCompatibilityFormat
  default_model?: string
  models: DiscoveredModel[]
  diagnostics: Array<{
    level: "info" | "warning" | "error"
    message: string
  }>
}

export interface ModelDiscoveryOptions {
  fetch?: (input: string | URL | Request, init?: RequestInit) => Promise<Response>
}

export interface ProviderStorageOptions {
  home?: string
}

function paperHome(home = os.homedir()) {
  return path.join(home, ".papercode")
}

function providerDir(home = os.homedir()) {
  return path.join(paperHome(home), "providers")
}

export function providerConfigPath(home: string, providerID: string) {
  return path.join(providerDir(home), `${providerID}.json`)
}

export function providerSecretPath(home: string) {
  return path.join(paperHome(home), "local", "provider-secrets.json")
}

function normalizeBaseURL(baseURL: string) {
  return baseURL.replace(/\/+$/, "")
}

function modelsURL(baseURL: string) {
  const normalized = normalizeBaseURL(baseURL)
  return `${normalized}/models`
}

function assertProviderConfig(config: ProviderEndpointConfig) {
  if (!/^[a-zA-Z0-9._-]+$/.test(config.provider_id)) {
    throw new Error(`Invalid provider_id: ${config.provider_id}`)
  }
  if (!config.base_url.trim()) throw new Error("Provider base_url is required.")
  if (!config.api_key.trim()) throw new Error("Provider api_key is required.")
  if (config.compatibility !== "openai-compatible") {
    throw new Error(`Unsupported provider compatibility: ${config.compatibility}`)
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  let timeout: Timer | undefined
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error(`Model discovery timed out after ${timeoutMs}ms`)), timeoutMs)
  })
  try {
    return await Promise.race([promise, timeoutPromise])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

function parseModels(payload: unknown): DiscoveredModel[] {
  if (!payload || typeof payload !== "object") return []
  const data = (payload as { data?: unknown }).data
  if (!Array.isArray(data)) return []
  const models: DiscoveredModel[] = []
  for (const item of data) {
    if (!item || typeof item !== "object") continue
    const record = item as Record<string, unknown>
    if (typeof record.id !== "string" || !record.id.trim()) continue
    models.push({
      id: record.id,
      name: typeof record.name === "string" ? record.name : record.id,
      ...(typeof record.owned_by === "string" ? { owned_by: record.owned_by } : {}),
    })
  }
  return models
}

export async function discoverOpenAICompatibleModels(
  config: ProviderEndpointConfig,
  options: ModelDiscoveryOptions = {},
): Promise<ModelDiscoveryResult> {
  assertProviderConfig(config)
  const fetchImpl = options.fetch ?? fetch
  const response = await withTimeout(
    fetchImpl(modelsURL(config.base_url), {
      method: "GET",
      headers: {
        authorization: `Bearer ${config.api_key}`,
        accept: "application/json",
      },
    }),
    config.timeout_ms ?? 10_000,
  )
  if (!response.ok) throw new Error(`Model discovery failed: HTTP ${response.status}`)
  const models = parseModels(await response.json())
  return {
    provider_id: config.provider_id,
    provider_name: config.provider_name,
    base_url: normalizeBaseURL(config.base_url),
    compatibility: config.compatibility,
    default_model: models[0]?.id,
    models,
    diagnostics: [
      {
        level: models.length > 0 ? "info" : "warning",
        message: models.length > 0 ? `Discovered ${models.length} model(s).` : "No models were returned.",
      },
    ],
  }
}

async function readSecrets(secretPath: string): Promise<Record<string, string>> {
  const text = await readFile(secretPath, "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return "{}"
    throw error
  })
  const parsed = JSON.parse(text) as unknown
  return parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : {}
}

export async function saveProviderEndpointConfig(
  config: ProviderEndpointConfig,
  options: ProviderStorageOptions = {},
): Promise<StoredProviderEndpointConfig> {
  assertProviderConfig(config)
  const home = options.home ?? os.homedir()
  const publicPath = providerConfigPath(home, config.provider_id)
  const secretPath = providerSecretPath(home)
  await mkdir(path.dirname(publicPath), { recursive: true })
  await mkdir(path.dirname(secretPath), { recursive: true })

  const apiKeyRef = `provider:${config.provider_id}`
  const publicConfig: Omit<StoredProviderEndpointConfig, "config_path" | "secret_path"> = {
    provider_id: config.provider_id,
    provider_name: config.provider_name,
    base_url: normalizeBaseURL(config.base_url),
    compatibility: config.compatibility,
    api_key_ref: apiKeyRef,
  }
  const secrets = await readSecrets(secretPath)
  secrets[apiKeyRef] = config.api_key

  await writeFile(publicPath, `${JSON.stringify(publicConfig, null, 2)}\n`, "utf8")
  // Credentials, so keep them owner-only like auth.json instead of the default 0644.
  await writeFile(secretPath, `${JSON.stringify(secrets, null, 2)}\n`, { encoding: "utf8", mode: 0o600 })

  return {
    ...publicConfig,
    config_path: publicPath,
    secret_path: secretPath,
  }
}
