import { Config } from "effect"
import { InstallationChannel } from "../installation/version"

function currentKey(key: string) {
  if (!key.startsWith("OPENCODE")) return key
  return `PAPERCODE${key.slice("OPENCODE".length)}`
}

function envValue(key: string) {
  return process.env[currentKey(key)] ?? process.env[key]
}

function paperOnlyEnvValue(key: string) {
  return process.env[currentKey(key)]
}

for (const key of ["OPENCODE_EXPERIMENTAL_FILEWATCHER", "OPENCODE_EXPERIMENTAL_DISABLE_FILEWATCHER"]) {
  const preferred = currentKey(key)
  if (process.env[key] === undefined && process.env[preferred] !== undefined) process.env[key] = process.env[preferred]
}

function truthy(key: string) {
  const raw = envValue(key)?.toLowerCase()
  return raw === "true" || raw === "1"
}

function falsy(key: string) {
  const raw = envValue(key)?.toLowerCase()
  return raw === "false" || raw === "0"
}

// Channels that default to the new effect-httpapi server backend. The legacy
// hono backend remains the default for stable (`prod`/`latest`) installs.
const HTTPAPI_DEFAULT_ON_CHANNELS = new Set(["dev", "beta", "local"])

function number(key: string) {
  const raw = envValue(key)
  if (!raw) return undefined
  const parsed = Number(raw)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined
}

const OPENCODE_EXPERIMENTAL = truthy("OPENCODE_EXPERIMENTAL")
const OPENCODE_DISABLE_CLAUDE_CODE = truthy("OPENCODE_DISABLE_CLAUDE_CODE")
const OPENCODE_DISABLE_CLAUDE_CODE_SKILLS =
  OPENCODE_DISABLE_CLAUDE_CODE || truthy("OPENCODE_DISABLE_CLAUDE_CODE_SKILLS")
const copy = envValue("OPENCODE_EXPERIMENTAL_DISABLE_COPY_ON_SELECT")

export const Flag = {
  OTEL_EXPORTER_OTLP_ENDPOINT: process.env["OTEL_EXPORTER_OTLP_ENDPOINT"],
  OTEL_EXPORTER_OTLP_HEADERS: process.env["OTEL_EXPORTER_OTLP_HEADERS"],

  OPENCODE_AUTO_SHARE: truthy("OPENCODE_AUTO_SHARE"),
  OPENCODE_AUTO_HEAP_SNAPSHOT: truthy("OPENCODE_AUTO_HEAP_SNAPSHOT"),
  OPENCODE_GIT_BASH_PATH: envValue("OPENCODE_GIT_BASH_PATH"),
  OPENCODE_CONFIG: paperOnlyEnvValue("OPENCODE_CONFIG"),
  OPENCODE_DISABLE_AUTOUPDATE: truthy("OPENCODE_DISABLE_AUTOUPDATE"),
  OPENCODE_ALWAYS_NOTIFY_UPDATE: truthy("OPENCODE_ALWAYS_NOTIFY_UPDATE"),
  OPENCODE_DISABLE_PRUNE: truthy("OPENCODE_DISABLE_PRUNE"),
  OPENCODE_DISABLE_TERMINAL_TITLE: truthy("OPENCODE_DISABLE_TERMINAL_TITLE"),
  OPENCODE_SHOW_TTFD: truthy("OPENCODE_SHOW_TTFD"),
  OPENCODE_PERMISSION: envValue("OPENCODE_PERMISSION"),
  OPENCODE_DISABLE_DEFAULT_PLUGINS: truthy("OPENCODE_DISABLE_DEFAULT_PLUGINS"),
  OPENCODE_DISABLE_LSP_DOWNLOAD: truthy("OPENCODE_DISABLE_LSP_DOWNLOAD"),
  OPENCODE_ENABLE_EXPERIMENTAL_MODELS: truthy("OPENCODE_ENABLE_EXPERIMENTAL_MODELS"),
  OPENCODE_DISABLE_AUTOCOMPACT: truthy("OPENCODE_DISABLE_AUTOCOMPACT"),
  OPENCODE_DISABLE_MODELS_FETCH: truthy("OPENCODE_DISABLE_MODELS_FETCH"),
  OPENCODE_DISABLE_MOUSE: truthy("OPENCODE_DISABLE_MOUSE"),
  OPENCODE_DISABLE_CLAUDE_CODE,
  OPENCODE_DISABLE_CLAUDE_CODE_PROMPT: OPENCODE_DISABLE_CLAUDE_CODE || truthy("OPENCODE_DISABLE_CLAUDE_CODE_PROMPT"),
  OPENCODE_DISABLE_CLAUDE_CODE_SKILLS,
  OPENCODE_DISABLE_EXTERNAL_SKILLS: truthy("OPENCODE_DISABLE_EXTERNAL_SKILLS"),
  OPENCODE_FAKE_VCS: envValue("OPENCODE_FAKE_VCS"),
  OPENCODE_SERVER_PASSWORD: envValue("OPENCODE_SERVER_PASSWORD"),
  OPENCODE_SERVER_USERNAME: envValue("OPENCODE_SERVER_USERNAME"),
  OPENCODE_ENABLE_QUESTION_TOOL: truthy("OPENCODE_ENABLE_QUESTION_TOOL"),

  // Experimental
  OPENCODE_EXPERIMENTAL,
  OPENCODE_EXPERIMENTAL_FILEWATCHER: Config.boolean("OPENCODE_EXPERIMENTAL_FILEWATCHER").pipe(
    Config.withDefault(false),
  ),
  OPENCODE_EXPERIMENTAL_DISABLE_FILEWATCHER: Config.boolean("OPENCODE_EXPERIMENTAL_DISABLE_FILEWATCHER").pipe(
    Config.withDefault(false),
  ),
  OPENCODE_EXPERIMENTAL_ICON_DISCOVERY: OPENCODE_EXPERIMENTAL || truthy("OPENCODE_EXPERIMENTAL_ICON_DISCOVERY"),
  OPENCODE_EXPERIMENTAL_DISABLE_COPY_ON_SELECT:
    copy === undefined ? process.platform === "win32" : truthy("OPENCODE_EXPERIMENTAL_DISABLE_COPY_ON_SELECT"),
  OPENCODE_ENABLE_EXA: truthy("OPENCODE_ENABLE_EXA") || OPENCODE_EXPERIMENTAL || truthy("OPENCODE_EXPERIMENTAL_EXA"),
  OPENCODE_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS: number("OPENCODE_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS"),
  OPENCODE_EXPERIMENTAL_OUTPUT_TOKEN_MAX: number("OPENCODE_EXPERIMENTAL_OUTPUT_TOKEN_MAX"),
  OPENCODE_EXPERIMENTAL_OXFMT: OPENCODE_EXPERIMENTAL || truthy("OPENCODE_EXPERIMENTAL_OXFMT"),
  OPENCODE_EXPERIMENTAL_LSP_TY: truthy("OPENCODE_EXPERIMENTAL_LSP_TY"),
  OPENCODE_EXPERIMENTAL_LSP_TOOL: OPENCODE_EXPERIMENTAL || truthy("OPENCODE_EXPERIMENTAL_LSP_TOOL"),
  OPENCODE_EXPERIMENTAL_PLAN_MODE: OPENCODE_EXPERIMENTAL || truthy("OPENCODE_EXPERIMENTAL_PLAN_MODE"),
  OPENCODE_EXPERIMENTAL_MARKDOWN: !falsy("OPENCODE_EXPERIMENTAL_MARKDOWN"),
  OPENCODE_MODELS_URL: paperOnlyEnvValue("OPENCODE_MODELS_URL"),
  OPENCODE_MODELS_PATH: paperOnlyEnvValue("OPENCODE_MODELS_PATH"),
  OPENCODE_DISABLE_EMBEDDED_WEB_UI: truthy("OPENCODE_DISABLE_EMBEDDED_WEB_UI"),
  OPENCODE_DB: paperOnlyEnvValue("OPENCODE_DB"),
  OPENCODE_DISABLE_CHANNEL_DB: truthy("OPENCODE_DISABLE_CHANNEL_DB"),
  OPENCODE_SKIP_MIGRATIONS: truthy("OPENCODE_SKIP_MIGRATIONS"),
  OPENCODE_STRICT_CONFIG_DEPS: truthy("OPENCODE_STRICT_CONFIG_DEPS"),

  OPENCODE_WORKSPACE_ID: envValue("OPENCODE_WORKSPACE_ID"),
  // Defaults to true on dev/beta/local channels so internal users exercise the
  // new effect-httpapi server backend. Stable (`prod`/`latest`) installs stay
  // on the legacy hono backend until the rollout is complete. An explicit env
  // var ("true"/"1" or "false"/"0") always wins, providing an opt-in for
  // stable users and an escape hatch for dev/beta users.
  OPENCODE_EXPERIMENTAL_HTTPAPI:
    truthy("OPENCODE_EXPERIMENTAL_HTTPAPI") ||
    (!falsy("OPENCODE_EXPERIMENTAL_HTTPAPI") && HTTPAPI_DEFAULT_ON_CHANNELS.has(InstallationChannel)),
  OPENCODE_EXPERIMENTAL_WORKSPACES: OPENCODE_EXPERIMENTAL || truthy("OPENCODE_EXPERIMENTAL_WORKSPACES"),
  OPENCODE_EXPERIMENTAL_EVENT_SYSTEM: OPENCODE_EXPERIMENTAL || truthy("OPENCODE_EXPERIMENTAL_EVENT_SYSTEM"),

  // Evaluated at access time (not module load) because tests, the CLI, and
  // external tooling set these env vars at runtime.
  get OPENCODE_DISABLE_PROJECT_CONFIG() {
    return truthy("OPENCODE_DISABLE_PROJECT_CONFIG")
  },
  get OPENCODE_TUI_CONFIG() {
    return paperOnlyEnvValue("OPENCODE_TUI_CONFIG")
  },
  get OPENCODE_CONFIG_CONTENT() {
    return paperOnlyEnvValue("OPENCODE_CONFIG_CONTENT")
  },
  get OPENCODE_CONFIG_DIR() {
    return paperOnlyEnvValue("OPENCODE_CONFIG_DIR")
  },
  get OPENCODE_PURE() {
    return truthy("OPENCODE_PURE")
  },
  get OPENCODE_PLUGIN_META_FILE() {
    return envValue("OPENCODE_PLUGIN_META_FILE")
  },
  get OPENCODE_CLIENT() {
    return envValue("OPENCODE_CLIENT") ?? "cli"
  },
}
