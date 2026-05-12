export const PAPER_MODEL_ROLES = [
  "planner",
  "literature_researcher",
  "code_analyst",
  "experiment_designer",
  "writer",
  "reviewer",
  "citation_checker",
  "cheap_summarizer",
  "subagent",
] as const

export type PaperModelRole = (typeof PAPER_MODEL_ROLES)[number]

export type OpenCodeModelRef = {
  provider_id: string
  model_id: string
}

export type ModelRoleConfig = {
  default_model: string
  roles?: Partial<Record<PaperModelRole, string>>
}

export type ResolvedModelRole = OpenCodeModelRef & {
  role: PaperModelRole
  source: "default" | "role_override"
}

export type ModelRoleRouter = {
  strategy: "opencode_provider_agnostic"
  config: ModelRoleConfig
  resolve(role: PaperModelRole): ResolvedModelRole
  diagnostics(): {
    strategy: "opencode_provider_agnostic"
    default_model: OpenCodeModelRef
    role_overrides: Partial<Record<PaperModelRole, OpenCodeModelRef>>
  }
}

export const DEFAULT_MODEL_ROLE_CONFIG = {
  default_model: "deepseek/deepseek-v4-pro",
  roles: {},
} as const satisfies ModelRoleConfig

export class InvalidOpenCodeModelIdError extends Error {
  constructor(
    readonly value: string,
    readonly role?: PaperModelRole,
  ) {
    super(role ? `Invalid OpenCode model id for role "${role}": ${value}` : `Invalid OpenCode model id: ${value}`)
    this.name = "InvalidOpenCodeModelIdError"
  }
}

export function parseOpenCodeModelId(value: string, role?: PaperModelRole): OpenCodeModelRef {
  const [provider, ...modelParts] = value.split("/")
  const model = modelParts.join("/")
  if (!provider?.trim() || !model.trim()) throw new InvalidOpenCodeModelIdError(value, role)
  return {
    provider_id: provider.trim(),
    model_id: model.trim(),
  }
}

export function createModelRoleRouter(config: Partial<ModelRoleConfig> = {}): ModelRoleRouter {
  const resolvedConfig: ModelRoleConfig = {
    default_model: config.default_model ?? DEFAULT_MODEL_ROLE_CONFIG.default_model,
    roles: config.roles ?? {},
  }

  return {
    strategy: "opencode_provider_agnostic",
    config: resolvedConfig,
    resolve(role) {
      const override = resolvedConfig.roles?.[role]
      const source = override ? "role_override" : "default"
      const ref = parseOpenCodeModelId(override ?? resolvedConfig.default_model, role)
      return {
        role,
        ...ref,
        source,
      }
    },
    diagnostics() {
      const role_overrides: Partial<Record<PaperModelRole, OpenCodeModelRef>> = {}
      for (const role of PAPER_MODEL_ROLES) {
        const value = resolvedConfig.roles?.[role]
        if (value) role_overrides[role] = parseOpenCodeModelId(value, role)
      }
      return {
        strategy: "opencode_provider_agnostic",
        default_model: parseOpenCodeModelId(resolvedConfig.default_model),
        role_overrides,
      }
    },
  }
}
