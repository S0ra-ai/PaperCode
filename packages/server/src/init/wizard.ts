import { existsSync } from "fs"
import {
  defaultConfig,
  initPaths,
  loadConfig,
  loadToolLinks,
  writeConfig,
  writeToolLinks,
  type ModelEndpointConfig,
  type PaperFuckerConfig,
} from "./config"
import { discoverInitTools, type ToolDiscoveryReport } from "./discovery"
import { writeSecrets } from "./secrets"
import { withSpan } from "../research/telemetry"

export type InitWizardInput = {
  home?: string
  workspace?: string
  models?: {
    default_endpoint?: string
    endpoints?: ModelEndpointConfig[]
  }
  tool_links?: Record<string, string>
  secrets?: Record<string, string>
  secrets_passphrase?: string
  preview?: Partial<PaperFuckerConfig["preview"]>
  budgets?: PaperFuckerConfig["budgets"]
  access?: Partial<PaperFuckerConfig["access"]>
}

export type InitWizardResult = {
  paths: ReturnType<typeof initPaths>
  config: PaperFuckerConfig
  tools: ToolDiscoveryReport
  wrote_secrets: boolean
}

function nowIso() {
  return new Date().toISOString()
}

export async function runInitWizard(input: InitWizardInput): Promise<InitWizardResult> {
  return withSpan(
    "paper_fucker.init.run",
    {
      "paper_fucker.init.home": input.home ?? "",
    },
    async (span) => {
      const paths = initPaths(input.home)
      const config = defaultConfig({
        now: nowIso(),
        workspace: input.workspace,
        access: input.access,
        budgets: input.budgets,
        preview: input.preview,
        models: {
          default_endpoint: input.models?.default_endpoint,
          endpoints: input.models?.endpoints ?? [],
        },
      })
      await writeConfig(paths, config)
      await writeToolLinks(paths, input.tool_links ?? {})
      const tools = discoverInitTools(input.tool_links ?? {})
      const secrets = input.secrets ?? {}
      const wroteSecrets = Object.keys(secrets).length > 0
      if (wroteSecrets) await writeSecrets(paths, secrets, input.secrets_passphrase ?? "")
      span.setAttribute("paper_fucker.init.tools.available", Object.values(tools.tools).filter((tool) => tool.status === "available").length)
      span.setAttribute("paper_fucker.init.secrets.written", wroteSecrets)
      return { paths, config, tools, wrote_secrets: wroteSecrets }
    },
  )
}

export async function diagnoseInit(home?: string) {
  const paths = initPaths(home)
  const [config, links] = await Promise.all([loadConfig(paths), loadToolLinks(paths)])
  const tools = discoverInitTools(links)
  return {
    paths,
    config_exists: existsSync(paths.config),
    tools_exists: existsSync(paths.tools),
    secrets_exists: existsSync(paths.secrets),
    config,
    tools,
  }
}
