import { Schema } from "effect"
import { zod } from "@/util/effect-zod"
import { PositiveInt, withStatics } from "@/util/schema"

const Modality = Schema.Literals(["text", "audio", "image", "video", "pdf"])

// Reasoning effort tiers a user may pin for a provider or model. The value is forwarded to the
// vendor as `reasoning_effort`, so it stays a plain string set rather than a capability model.
const ReasoningEffort = Schema.Literals(["minimal", "low", "medium", "high", "xhigh", "max"])

const ReasoningSetting = Schema.Union([Schema.Boolean, ReasoningEffort])

export const ProviderCompat = Schema.Struct({
  /**
   * Whether the endpoint accepts the OpenAI `developer` role. Declaring `false` asserts the model
   * must be reached with `system` messages; the OpenAI-compatible transport this config maps to
   * always sends `system`, so the assertion holds by construction (the sibling wire test pins it).
   */
  supportsDeveloperRole: Schema.optional(Schema.Boolean),
})
export type ProviderCompat = Schema.Schema.Type<typeof ProviderCompat>

// Shape of the vendor API. Only OpenAI-compatible transports are mapped today; the closed set keeps
// an unknown shape from silently falling back to a transport that cannot speak the endpoint.
const ApiShape = Schema.Literals(["openai-completions", "openai-compatible"])

const NPM_BY_API_SHAPE: Record<Schema.Schema.Type<typeof ApiShape>, string> = {
  "openai-completions": "@ai-sdk/openai-compatible",
  "openai-compatible": "@ai-sdk/openai-compatible",
}

const ModelFields = {
  family: Schema.optional(Schema.String),
  release_date: Schema.optional(Schema.String),
  attachment: Schema.optional(Schema.Boolean),
  temperature: Schema.optional(Schema.Boolean),
  tool_call: Schema.optional(Schema.Boolean),
  interleaved: Schema.optional(
    Schema.Union([
      Schema.Literal(true),
      Schema.Struct({
        field: Schema.Literals(["reasoning_content", "reasoning_details"]),
      }),
    ]),
  ),
  cost: Schema.optional(
    Schema.Struct({
      input: Schema.Finite,
      output: Schema.Finite,
      cache_read: Schema.optional(Schema.Finite),
      cache_write: Schema.optional(Schema.Finite),
      context_over_200k: Schema.optional(
        Schema.Struct({
          input: Schema.Finite,
          output: Schema.Finite,
          cache_read: Schema.optional(Schema.Finite),
          cache_write: Schema.optional(Schema.Finite),
        }),
      ),
    }),
  ),
  limit: Schema.optional(
    Schema.Struct({
      // Both halves are optional so a partial override keeps the value inherited from the registry
      // instead of zero-filling it.
      context: Schema.optional(Schema.Finite),
      input: Schema.optional(Schema.Finite),
      output: Schema.optional(Schema.Finite),
    }),
  ),
  modalities: Schema.optional(
    Schema.Struct({
      input: Schema.mutable(Schema.Array(Modality)),
      output: Schema.mutable(Schema.Array(Modality)),
    }),
  ),
  experimental: Schema.optional(Schema.Boolean),
  status: Schema.optional(Schema.Literals(["alpha", "beta", "deprecated"])),
  provider: Schema.optional(
    Schema.Struct({ npm: Schema.optional(Schema.String), api: Schema.optional(Schema.String) }),
  ),
  options: Schema.optional(Schema.Record(Schema.String, Schema.Any)),
  headers: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  variants: Schema.optional(
    Schema.Record(
      Schema.String,
      Schema.StructWithRest(
        Schema.Struct({
          disabled: Schema.optional(Schema.Boolean).annotate({ description: "Disable this variant for the model" }),
        }),
        [Schema.Record(Schema.String, Schema.Any)],
      ),
    ).annotate({ description: "Variant-specific configuration" }),
  ),
}

export const Model = Schema.Struct({
  id: Schema.optional(Schema.String),
  name: Schema.optional(Schema.String),
  reasoning: Schema.optional(Schema.Boolean),
  ...ModelFields,
}).pipe(withStatics((s) => ({ zod: zod(s) })))
export type Model = Schema.Schema.Type<typeof Model>

export const Info = Schema.Struct({
  api: Schema.optional(Schema.String),
  name: Schema.optional(Schema.String),
  env: Schema.optional(Schema.mutable(Schema.Array(Schema.String))),
  id: Schema.optional(Schema.String),
  npm: Schema.optional(Schema.String),
  whitelist: Schema.optional(Schema.mutable(Schema.Array(Schema.String))),
  blacklist: Schema.optional(Schema.mutable(Schema.Array(Schema.String))),
  compat: Schema.optional(ProviderCompat),
  options: Schema.optional(
    Schema.StructWithRest(
      Schema.Struct({
        apiKey: Schema.optional(Schema.String),
        baseURL: Schema.optional(Schema.String),
        enterpriseUrl: Schema.optional(Schema.String).annotate({
          description: "GitHub Enterprise URL for copilot authentication",
        }),
        setCacheKey: Schema.optional(Schema.Boolean).annotate({
          description: "Enable promptCacheKey for this provider (default false)",
        }),
        timeout: Schema.optional(
          Schema.Union([PositiveInt, Schema.Literal(false)]).annotate({
            description:
              "Timeout in milliseconds for requests to this provider. Default is 300000 (5 minutes). Set to false to disable timeout.",
          }),
        ).annotate({
          description:
            "Timeout in milliseconds for requests to this provider. Default is 300000 (5 minutes). Set to false to disable timeout.",
        }),
        chunkTimeout: Schema.optional(PositiveInt).annotate({
          description:
            "Timeout in milliseconds between streamed SSE chunks for this provider. If no chunk arrives within this window, the request is aborted.",
        }),
      }),
      [Schema.Record(Schema.String, Schema.Any)],
    ),
  ),
  models: Schema.optional(Schema.Record(Schema.String, Model)),
})
  .annotate({ identifier: "ProviderConfig" })
  .pipe(withStatics((s) => ({ zod: zod(s) })))
export type Info = Schema.Schema.Type<typeof Info>

// ---------------------------------------------------------------------------
// User-facing provider dialect ("providers")
//
// The `provider` key above grew out of the models.dev database shape: `env` is a list, `api` is a
// URL, `models` is a record keyed by id, and model limits live under `limit`/`modalities`. That
// spelling is fine for overriding a known provider, but it is unfriendly for declaring a new
// OpenAI-compatible endpoint by hand.
//
// `providers` is the hand-written dialect: display names, an env var for the key, a base URL, an
// API shape, and models as a list with `contextWindow`/`maxTokens`/`input`/`reasoning`. It is
// normalized into the records above at the provider registry boundary, so nothing downstream needs
// to know about it.
// ---------------------------------------------------------------------------

export const UserModel = Schema.Struct({
  id: Schema.optional(Schema.String),
  name: Schema.optional(Schema.String),
  contextWindow: Schema.optional(Schema.Finite),
  maxTokens: Schema.optional(Schema.Finite),
  input: Schema.optional(Schema.mutable(Schema.Array(Modality))),
  output: Schema.optional(Schema.mutable(Schema.Array(Modality))),
  reasoning: Schema.optional(ReasoningSetting),
  /**
   * Effort tiers this model accepts, mapped to the value the endpoint expects, e.g.
   * `{ "max": "max", "high": "high" }`. Each entry becomes a selectable variant and the tier named
   * by `reasoning` (or the provider default) is what requests send by default.
   */
  reasoningEfforts: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  ...ModelFields,
}).pipe(withStatics((s) => ({ zod: zod(s) })))
export type UserModel = Schema.Schema.Type<typeof UserModel>


export const UserProvider = Schema.Struct({
  displayName: Schema.optional(Schema.String),
  apiKeyEnv: Schema.optional(Schema.String),
  baseURL: Schema.optional(Schema.String),
  api: Schema.optional(ApiShape),
  reasoning: Schema.optional(ReasoningSetting),
  /** Default effort map for every model of this provider; a model-level map wins. */
  reasoningEfforts: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  compat: Schema.optional(ProviderCompat),
  models: Schema.optional(
    Schema.Union([Schema.mutable(Schema.Array(UserModel)), Schema.Record(Schema.String, UserModel)]),
  ),
  // Legacy spellings, accepted here so a `providers` entry can express anything `provider` can.
  name: Schema.optional(Schema.String),
  env: Schema.optional(Schema.mutable(Schema.Array(Schema.String))),
  id: Schema.optional(Schema.String),
  npm: Schema.optional(Schema.String),
  whitelist: Schema.optional(Schema.mutable(Schema.Array(Schema.String))),
  blacklist: Schema.optional(Schema.mutable(Schema.Array(Schema.String))),
  options: Info.fields.options,
}).pipe(withStatics((s) => ({ zod: zod(s) })))
export type UserProvider = Schema.Schema.Type<typeof UserProvider>

export const UserProviders = Schema.Record(Schema.String, UserProvider)

export class UserProviderConfigError extends Error {
  readonly path: string[]
  constructor(message: string, path: string[] = []) {
    super(path.length ? `providers.${path.join(".")}: ${message}` : `providers: ${message}`)
    this.name = "UserProviderConfigError"
    this.path = path
  }
}

function effortOf(setting: Schema.Schema.Type<typeof ReasoningSetting> | undefined) {
  if (typeof setting !== "string") return undefined
  return setting
}

function reasoningOf(setting: Schema.Schema.Type<typeof ReasoningSetting> | undefined) {
  if (setting === undefined) return undefined
  return typeof setting === "boolean" ? setting : true
}

function normalizeModel(
  input: UserModel,
  modelID: string,
  providerReasoning: Schema.Schema.Type<typeof ReasoningSetting> | undefined,
  providerEfforts: Record<string, string> | undefined,
): Model {
  // A model-level setting wins over the provider-level default.
  const setting = input.reasoning ?? providerReasoning
  const efforts = input.reasoningEfforts ?? providerEfforts
  // The declared tier names the value the endpoint expects, e.g. reasoning: "max" + { max: "max" }.
  const effort = effortOf(setting) ? (efforts?.[effortOf(setting)!] ?? effortOf(setting)) : undefined
  const reasoning = reasoningOf(setting) ?? (efforts && Object.keys(efforts).length > 0 ? true : undefined)
  const context = input.contextWindow ?? input.limit?.context
  const output = input.maxTokens ?? input.limit?.output
  const modalities =
    input.input || input.output || input.modalities
      ? {
          input: input.input ?? input.modalities?.input ?? ["text"],
          output: input.output ?? input.modalities?.output ?? ["text"],
        }
      : undefined
  const seededVariants = efforts
    ? Object.fromEntries(Object.entries(efforts).map(([level, value]) => [level, { reasoningEffort: value }]))
    : undefined
  return {
    ...input,
    id: input.id ?? modelID,
    limit:
      context === undefined && output === undefined
        ? input.limit
        : {
            ...(input.limit ?? {}),
            ...(context === undefined ? {} : { context }),
            ...(output === undefined ? {} : { output }),
          },
    modalities,
    reasoning,
    variants: seededVariants ? { ...seededVariants, ...(input.variants ?? {}) } : input.variants,
    options: {
      ...(input.options ?? {}),
      ...(effort ? { reasoningEffort: effort } : {}),
    },
  }
}

function normalizeModels(
  models: NonNullable<UserProvider["models"]> | undefined,
  providerID: string,
  providerReasoning: Schema.Schema.Type<typeof ReasoningSetting> | undefined,
  providerEfforts: Record<string, string> | undefined,
): Record<string, Model> | undefined {
  if (!models) return undefined
  if (!Array.isArray(models)) {
    return Object.fromEntries(
      Object.entries(models).map(([modelID, model]) => [
        modelID,
        normalizeModel(model, modelID, providerReasoning, providerEfforts),
      ]),
    )
  }
  const out: Record<string, Model> = {}
  for (const [index, model] of models.entries()) {
    if (!model.id) {
      throw new UserProviderConfigError(`models[${index}] is missing "id"`, [providerID, "models"])
    }
    if (out[model.id]) {
      throw new UserProviderConfigError(`duplicate model id "${model.id}"`, [providerID, "models"])
    }
    out[model.id] = normalizeModel(model, model.id, providerReasoning, providerEfforts)
  }
  return out
}

export function normalizeUserProviders(input: Record<string, UserProvider> | undefined): Record<string, Info> {
  if (!input) return {}
  return Object.fromEntries(
    Object.entries(input).map(([providerID, provider]) => {
      const env = provider.apiKeyEnv ? [provider.apiKeyEnv, ...(provider.env ?? [])] : provider.env
      const npm = provider.npm ?? (provider.api ? NPM_BY_API_SHAPE[provider.api] : undefined)
      const options = {
        ...(provider.options ?? {}),
        ...(provider.baseURL ? { baseURL: provider.baseURL } : {}),
      }
      const normalized: Info = {
        name: provider.displayName ?? provider.name,
        env,
        npm,
        compat: provider.compat,
        whitelist: provider.whitelist,
        blacklist: provider.blacklist,
        options: Object.keys(options).length ? options : undefined,
        models: normalizeModels(provider.models, providerID, provider.reasoning, provider.reasoningEfforts),
      }
      return [providerID, normalized]
    }),
  )
}

export type UserProviderIssue =
  | { code: "unrecognized_keys"; path: string[]; keys: string[]; message: string }
  | { code: "custom"; path: string[]; message: string }

/**
 * Problems with a `providers` block that must fail loudly at config load instead of surfacing later:
 * unknown keys (effect's decoder drops nested unknown keys, so `baseUrl` would silently produce a
 * provider with no base URL) and a model list that cannot produce model ids (which would register a
 * provider with zero models, and an empty provider is deleted from the registry).
 */
export function validateUserProviders(input: unknown): UserProviderIssue[] {
  const issues: UserProviderIssue[] = []
  const collectUnknown = (schema: Schema.Top, data: unknown, path: string[]) => {
    if (typeof data !== "object" || data === null || Array.isArray(data)) return
    if (schema.ast._tag !== "Objects" || schema.ast.indexSignatures.length > 0) return
    const known = new Set(schema.ast.propertySignatures.map((item) => String(item.name)))
    const unknown = Object.keys(data).filter((key) => !known.has(key))
    if (unknown.length) {
      issues.push({
        code: "unrecognized_keys",
        path,
        keys: unknown,
        message: `Unrecognized key${unknown.length === 1 ? "" : "s"}: ${unknown.join(", ")}`,
      })
    }
  }
  if (typeof input !== "object" || input === null || Array.isArray(input)) return issues
  for (const [providerID, provider] of Object.entries(input)) {
    collectUnknown(UserProvider, provider, [providerID])
    if (typeof provider !== "object" || provider === null) continue
    const models = (provider as { models?: unknown }).models
    if (Array.isArray(models)) {
      if (models.length === 0) {
        issues.push({ code: "custom", path: [providerID, "models"], message: "models must not be empty" })
      }
      const seen = new Set<string>()
      models.forEach((model, index) => {
        collectUnknown(UserModel, model, [providerID, "models", String(index)])
        if (typeof model !== "object" || model === null) return
        const id = (model as { id?: unknown }).id
        if (typeof id !== "string" || id.length === 0) {
          issues.push({
            code: "custom",
            path: [providerID, "models", String(index)],
            message: "each entry in a models list needs a non-empty id",
          })
          return
        }
        if (seen.has(id)) {
          issues.push({
            code: "custom",
            path: [providerID, "models", String(index)],
            message: `duplicate model id: ${id}`,
          })
        }
        seen.add(id)
      })
    } else if (typeof models === "object" && models !== null) {
      for (const [modelID, model] of Object.entries(models)) {
        collectUnknown(UserModel, model, [providerID, "models", modelID])
      }
    }
  }
  return issues
}

export * as ConfigProvider from "./provider"
