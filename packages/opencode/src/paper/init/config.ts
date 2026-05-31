import os from "os"
import path from "path"
import { mkdir, readFile } from "fs/promises"
import { existsSync } from "fs"
import { writeJsonAtomic } from "../research/runtime/state"
import type { ModelRoleConfig } from "../model-router"

export const INIT_CONFIG_VERSION = "config.v1" as const
export const INIT_SECRETS_VERSION = "secrets.v1" as const
export const PAPER_FUCKER_DIR = ".paper_fucker"

export type ModelEndpointConfig = {
  name: string
  base_url: string
  model: string
  api_key_secret?: string
}

export type PaperFuckerConfig = {
  schema_version: typeof INIT_CONFIG_VERSION
  created_at: string
  updated_at: string
  language: {
    default: "zh-CN"
  }
  models: {
    default_endpoint?: string
    endpoints: ModelEndpointConfig[]
  }
  model_roles: Omit<ModelRoleConfig, "default_model"> & {
    default_model?: string
    strategy: "paper_provider_agnostic"
  }
  workspace: {
    default_root?: string
  }
  preview: {
    auto_open: boolean
  }
  budgets: {
    llm_soft_usd?: number
    api_soft_usd?: number
    total_soft_usd?: number
  }
  access: {
    mode: "full_access" | "bounded"
    bounded_hours?: number
    full_access_acknowledged: boolean
    acknowledged_at?: string
  }
}

export type ToolLinksFile = {
  tools: Record<string, string>
}

export type InitPaths = {
  home: string
  root: string
  config: string
  tools: string
  secrets: string
}

function envHome(value: string | undefined) {
  if (!value) return undefined
  const trimmed = value.trim()
  if (!trimmed || trimmed === "undefined" || trimmed === "null") return undefined
  return trimmed
}

export function resolveInitHome(home?: string) {
  return path.resolve(
    envHome(home) ?? envHome(process.env.PAPER_FUCKER_TEST_HOME) ?? envHome(process.env.PAPER_FUCKER_HOME) ?? os.homedir(),
  )
}

export function initPaths(home?: string): InitPaths {
  const resolved = resolveInitHome(home)
  const root = path.join(resolved, PAPER_FUCKER_DIR)
  return {
    home: resolved,
    root,
    config: path.join(root, "config.json"),
    tools: path.join(root, "tools.json"),
    secrets: path.join(root, "secrets.enc"),
  }
}

export async function ensureInitRoot(paths: InitPaths) {
  await mkdir(paths.root, { recursive: true })
}

export async function readJsonIfExists<T>(file: string): Promise<T | undefined> {
  if (!existsSync(file)) return undefined
  return JSON.parse(await readFile(file, "utf8")) as T
}

export async function writeConfig(paths: InitPaths, config: PaperFuckerConfig) {
  await ensureInitRoot(paths)
  await writeJsonAtomic(paths.config, config)
}

export async function writeToolLinks(paths: InitPaths, tools: Record<string, string>) {
  await ensureInitRoot(paths)
  await writeJsonAtomic(paths.tools, { tools } satisfies ToolLinksFile)
}

export async function loadConfig(paths: InitPaths) {
  return readJsonIfExists<PaperFuckerConfig>(paths.config)
}

export async function loadToolLinks(paths: InitPaths) {
  const file = await readJsonIfExists<ToolLinksFile>(paths.tools)
  return file?.tools ?? {}
}

export function defaultConfig(input: {
  now: string
  workspace?: string
  language?: Partial<PaperFuckerConfig["language"]>
  access?: Partial<PaperFuckerConfig["access"]>
  budgets?: PaperFuckerConfig["budgets"]
  preview?: Partial<PaperFuckerConfig["preview"]>
  models?: PaperFuckerConfig["models"]
  model_roles?: Partial<ModelRoleConfig>
}): PaperFuckerConfig {
  const mode = input.access?.mode ?? "bounded"
  const acknowledged = input.access?.full_access_acknowledged ?? false
  if (mode === "full_access" && !acknowledged) {
    throw new Error("Full Access mode requires explicit risk acknowledgement.")
  }
  return {
    schema_version: INIT_CONFIG_VERSION,
    created_at: input.now,
    updated_at: input.now,
    language: {
      default: "zh-CN",
    },
    models: input.models ?? {
      endpoints: [],
    },
    model_roles: {
      strategy: "paper_provider_agnostic",
      default_model: input.model_roles?.default_model,
      roles: input.model_roles?.roles ?? {},
    },
    workspace: {
      default_root: input.workspace,
    },
    preview: {
      auto_open: input.preview?.auto_open ?? true,
    },
    budgets: input.budgets ?? {},
    access: {
      mode,
      bounded_hours: mode === "bounded" ? (input.access?.bounded_hours ?? 24) : input.access?.bounded_hours,
      full_access_acknowledged: acknowledged,
      acknowledged_at: acknowledged ? input.now : undefined,
    },
  }
}
