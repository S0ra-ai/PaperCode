import { InstanceState } from "@/effect/instance-state"
import { ModelsDev } from "@/provider/models"
import { Provider } from "@/provider/provider"
import {
  createPaperRun,
  controlPaperRun,
  discoverPaperProviders,
  exportPaperRun,
  applyPaperRunExperimentStarterPack,
  runPaperRunExperimentProtocol,
  getPaperRunSnapshot,
  initialPaperRunLiveEvents,
  listPaperRuns,
  paperCapabilities,
  paperDoctor,
  paperModelWorkbench,
  paperModelRoles,
  type PaperRunCreateRequest,
  PaperRunNotFoundError,
  previewPaperRun,
  recordPaperRunGuidance,
  resumePaperRun,
  subscribeToPaperRunLiveEvents,
} from "@/paper/run"
import { discoverOpenAICompatibleModels, saveProviderEndpointConfig } from "@/paper/model-discovery"
import {
  candidatesFromBuiltinProviders,
  loadPaperModelInventory,
  mergeModelCandidates,
  modelRolesFromInventory,
  type PaperProviderRegistration,
  type PaperStageModelPolicy,
  routePaperModel,
  updatePaperModelAllowlist,
  upsertDiscoveredModels,
} from "@/paper/model-inventory"
import { PAPER_MODEL_ROLES, type PaperModelRole } from "@/paper/model-router"
import { resolveAllModelRoleAssignments } from "@/paper/model-roles"
import { Effect, Queue } from "effect"
import * as Stream from "effect/Stream"
import { HttpServerResponse } from "effect/unstable/http"
import { HttpApiBuilder, HttpApiError } from "effect/unstable/httpapi"
import * as Sse from "effect/unstable/encoding/Sse"
import os from "os"
import path from "path"
import { InstanceHttpApi } from "../api"
import {
  ModelRoleAssignmentPayload,
  ModelInventoryAllowlistPayload,
  ModelRoutingDecisionPayload,
  PaperControlPayload,
  PaperExportPayload,
  PaperExperimentStarterApplyPayload,
  PaperExperimentProtocolRunPayload,
  PaperGuidancePayload,
  PaperRunCreatePayload,
  ProviderDiscoverPayload,
} from "../groups/paper"

function mapPaperError(error: unknown) {
  if (error instanceof PaperRunNotFoundError) return new HttpApiError.NotFound({})
  return new HttpApiError.BadRequest({})
}

function mapPaperBadRequest() {
  return new HttpApiError.BadRequest({})
}

function errorText(error: unknown) {
  if (error instanceof Error) return error.message
  if (typeof error === "string") return error
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

function envHome(value: string | undefined) {
  if (!value) return undefined
  const trimmed = value.trim()
  if (!trimmed || trimmed === "undefined" || trimmed === "null") return undefined
  return trimmed
}

function paperRuntimeHome() {
  return envHome(process.env.PAPER_FUCKER_TEST_HOME) ?? envHome(process.env.PAPER_FUCKER_HOME)
}

function paperLogDirectory(home = paperRuntimeHome() ?? os.homedir()) {
  return path.join(home, ".paper_fucker", "data", "log")
}

function paperRunCreateError(error: unknown) {
  const message = errorText(error)
  const schemaFailure = message.includes("schema") || message.includes("$defs") || message.includes("resolve reference")
  const modelFailure = message.includes("model_allowlist_empty") || message.includes("decision_model")
  return {
    error: {
      schema_version: "PaperApiError.v1",
      code: schemaFailure ? "paper_schema_runtime_failed" : modelFailure ? "paper_model_config_blocked" : "paper_run_create_failed",
      message: `PaperRun 创建失败：${message}`,
      action: schemaFailure
        ? "这是 Paper Fucker 运行时 schema 加载问题，请保留日志并重新构建；当前 PaperRun 未创建。"
        : "请检查 /models 主决策模型、可用模型和 /folder 当前工作目录；详细堆栈见 Paper Fucker 日志。",
      log_path: paperLogDirectory(),
    },
  }
}

function paperOptions(directory: string) {
  return { ...paperGlobalOptions(), workspace: directory }
}

function paperGlobalOptions() {
  return { home: paperRuntimeHome() }
}

function paperSseEvent(event: string, data: unknown): Sse.Event {
  return {
    _tag: "Event",
    event,
    id: undefined,
    data: JSON.stringify(data),
  }
}

function normalizeCreatePayload(payload: typeof PaperRunCreatePayload.Type): PaperRunCreateRequest {
  return {
    topic: payload.topic,
    workspace_path: payload.workspace_path,
    code_paths: payload.code_paths ? [...payload.code_paths] : undefined,
    paper_files: payload.paper_files ? [...payload.paper_files] : undefined,
    dataset_paths: payload.dataset_paths ? [...payload.dataset_paths] : undefined,
    experiment_logs: payload.experiment_logs ? [...payload.experiment_logs] : undefined,
    target_profile: payload.target_profile as PaperRunCreateRequest["target_profile"],
    target_journal: payload.target_journal,
    target_journal_url: payload.target_journal_url,
    language: payload.language,
    model_roles: payload.model_roles as PaperRunCreateRequest["model_roles"],
    budget_tier: payload.budget_tier,
    quality_mode: payload.quality_mode,
    storage_scope: payload.storage_scope,
    data_egress_policy: payload.data_egress_policy
      ? {
          mode: payload.data_egress_policy.mode,
          allowed_paths: payload.data_egress_policy.allowed_paths
            ? [...payload.data_egress_policy.allowed_paths]
            : undefined,
          denied_patterns: payload.data_egress_policy.denied_patterns
            ? [...payload.data_egress_policy.denied_patterns]
            : undefined,
          external_model_full_text: payload.data_egress_policy.external_model_full_text,
        }
      : undefined,
  }
}

export const paperHandlers = HttpApiBuilder.group(InstanceHttpApi, "paper", (handlers) =>
  Effect.gen(function* () {
    const createRun = Effect.fn("PaperHttpApi.createRun")(function* (ctx: {
      payload: typeof PaperRunCreatePayload.Type
    }) {
      const instance = yield* InstanceState.context
      return yield* Effect.promise(async () => {
        try {
          const run = await createPaperRun(normalizeCreatePayload(ctx.payload), paperOptions(instance.directory))
          return {
            run: run.snapshot,
            run_dir: run.run_dir,
          }
        } catch (error) {
          return paperRunCreateError(error)
        }
      })
    })

    const listRuns = Effect.fn("PaperHttpApi.listRuns")(function* () {
      const instance = yield* InstanceState.context
      const runs = yield* Effect.tryPromise({
        try: () => listPaperRuns(paperOptions(instance.directory)),
        catch: mapPaperBadRequest,
      })
      return { runs }
    })

    const getRun = Effect.fn("PaperHttpApi.getRun")(function* (ctx: { params: { runID: string } }) {
      const instance = yield* InstanceState.context
      const run = yield* Effect.tryPromise({
        try: () => getPaperRunSnapshot(ctx.params.runID, paperOptions(instance.directory)),
        catch: mapPaperError,
      })
      return { run }
    })

    const resumeRun = Effect.fn("PaperHttpApi.resumeRun")(function* (ctx: { params: { runID: string } }) {
      const instance = yield* InstanceState.context
      const run = yield* Effect.tryPromise({
        try: () => resumePaperRun({ run_id: ctx.params.runID }, paperOptions(instance.directory)),
        catch: mapPaperError,
      })
      return { run }
    })

    const events = Effect.fn("PaperHttpApi.events")(function* (ctx: { params: { runID: string } }) {
      const instance = yield* InstanceState.context
      const snapshot = yield* Effect.tryPromise({
        try: () => getPaperRunSnapshot(ctx.params.runID, paperOptions(instance.directory)),
        catch: mapPaperError,
      })
      const liveEvents = Stream.callback<ReturnType<typeof initialPaperRunLiveEvents>[number]>((queue) => {
        const unsubscribe = subscribeToPaperRunLiveEvents(ctx.params.runID, (event) => Queue.offerUnsafe(queue, event))
        return Effect.acquireRelease(Effect.void, () => Effect.sync(unsubscribe))
      })
      const heartbeat = Stream.tick("10 seconds").pipe(
        Stream.drop(1),
        Stream.map(() => ({
          event: "paper.run.heartbeat" as const,
          data: { run_id: ctx.params.runID, updated_at: new Date().toISOString() },
        })),
      )
      return HttpServerResponse.stream(Stream.fromIterable(initialPaperRunLiveEvents(snapshot)).pipe(
        Stream.concat(liveEvents.pipe(Stream.merge(heartbeat, { haltStrategy: "left" }))),
        Stream.map((event) => paperSseEvent(event.event, event.data)),
        Stream.pipeThroughChannel(Sse.encode()),
        Stream.encodeText,
      ), {
        contentType: "text/event-stream",
        headers: {
          "Cache-Control": "no-cache, no-transform",
          "X-Accel-Buffering": "no",
          "X-Content-Type-Options": "nosniff",
        },
      })
    })

    const guidance = Effect.fn("PaperHttpApi.guidance")(function* (ctx: {
      params: { runID: string }
      payload: typeof PaperGuidancePayload.Type
    }) {
      const instance = yield* InstanceState.context
      return yield* Effect.tryPromise({
        try: () => recordPaperRunGuidance(ctx.params.runID, ctx.payload, paperOptions(instance.directory)),
        catch: mapPaperError,
      })
    })

    const controlRun = Effect.fn("PaperHttpApi.controlRun")(function* (ctx: {
      params: { runID: string }
      payload: typeof PaperControlPayload.Type
    }) {
      const instance = yield* InstanceState.context
      return yield* Effect.tryPromise({
        try: () =>
          controlPaperRun(
            ctx.params.runID,
            ctx.payload as Parameters<typeof controlPaperRun>[1],
            paperOptions(instance.directory),
          ),
        catch: mapPaperError,
      })
    })

    const preview = Effect.fn("PaperHttpApi.preview")(function* (ctx: { params: { runID: string } }) {
      const instance = yield* InstanceState.context
      return yield* Effect.tryPromise({
        try: () => previewPaperRun(ctx.params.runID, paperOptions(instance.directory)),
        catch: mapPaperError,
      })
    })

    const exportBundle = Effect.fn("PaperHttpApi.export")(function* (ctx: {
      params: { runID: string }
      payload: typeof PaperExportPayload.Type
    }) {
      const instance = yield* InstanceState.context
      return yield* Effect.tryPromise({
        try: () => exportPaperRun(ctx.params.runID, ctx.payload, paperOptions(instance.directory)),
        catch: mapPaperError,
      })
    })

    const experimentStarterApply = Effect.fn("PaperHttpApi.experimentStarterApply")(function* (ctx: {
      params: { runID: string }
      payload: typeof PaperExperimentStarterApplyPayload.Type
    }) {
      const instance = yield* InstanceState.context
      return yield* Effect.tryPromise({
        try: () => applyPaperRunExperimentStarterPack(ctx.params.runID, ctx.payload, paperOptions(instance.directory)),
        catch: mapPaperError,
      })
    })

    const experimentProtocolRun = Effect.fn("PaperHttpApi.experimentProtocolRun")(function* (ctx: {
      params: { runID: string }
      payload: typeof PaperExperimentProtocolRunPayload.Type
    }) {
      const instance = yield* InstanceState.context
      return yield* Effect.tryPromise({
        try: () => runPaperRunExperimentProtocol(ctx.params.runID, ctx.payload, paperOptions(instance.directory)),
        catch: mapPaperError,
      })
    })

    const capabilities = Effect.fn("PaperHttpApi.capabilities")(function* () {
      return paperCapabilities()
    })

    const doctor = Effect.fn("PaperHttpApi.doctor")(function* () {
      const instance = yield* InstanceState.context
      return yield* Effect.promise(() => paperDoctor(paperOptions(instance.directory)))
    })

    const providersDiscover = Effect.fn("PaperHttpApi.providersDiscover")(function* () {
      const providers = yield* ModelsDev.Service.use((service) => service.get()).pipe(
        Effect.catch(() => Effect.succeed({})),
      )
      return discoverPaperProviders(providers)
    })

    const providersDiscoverOpenAI = Effect.fn("PaperHttpApi.providersDiscoverOpenAI")(function* (ctx: {
      payload: typeof ProviderDiscoverPayload.Type
    }) {
      const instance = yield* InstanceState.context
      return yield* Effect.tryPromise({
        try: async () => {
          const discovered = await discoverOpenAICompatibleModels(ctx.payload)
          if (!ctx.payload.persist) return discovered
          const options = paperGlobalOptions()
          const saved = await saveProviderEndpointConfig(ctx.payload, options)
          const discoveredRefs = discovered.models.map((model) => `${discovered.provider_id}/${model.id}`)
          const inventory = await upsertDiscoveredModels(discovered, {
            ...options,
            allow: ctx.payload.allow_models ? [...ctx.payload.allow_models] : discoveredRefs,
            decision_model: ctx.payload.decision_model ?? discoveredRefs[0],
          })
          return { ...discovered, saved, inventory }
        },
        catch: mapPaperBadRequest,
      })
    })

    const modelRoles = Effect.fn("PaperHttpApi.modelRoles")(function* () {
      return paperModelRoles()
    })

    const modelInventory = Effect.fn("PaperHttpApi.modelInventory")(function* () {
      const providers = yield* ModelsDev.Service.use((service) => service.get()).pipe(
        Effect.catch(() => Effect.succeed({})),
      )
      const connected = yield* Provider.Service.use((service) => service.list()).pipe(
        Effect.catch(() => Effect.succeed({})),
      )
      return yield* Effect.promise(async () => {
        const state = await paperModelWorkbench(paperGlobalOptions())
        const connectedProviderIDs = new Set(Object.keys(connected))
        const registeredProviders = new Set(
          Object.entries(state.inventory.provider_registrations ?? {})
            .filter(([providerID, registration]) => {
              if (registration.status !== "registered") return false
              if (registration.kind === "openai_compatible" || registration.kind === "manual") return true
              return (providerID === "openai" || providerID === "github-copilot") && connectedProviderIDs.has(providerID)
            })
            .map(([providerID]) => providerID),
        )
        const builtinCandidates = candidatesFromBuiltinProviders(providers)
        const inventory = mergeModelCandidates(
          state.inventory,
          builtinCandidates.filter((candidate) => registeredProviders.has(candidate.provider_id)),
        )
        return {
          ...state,
          inventory,
          builtin_providers: Object.entries(providers)
            .filter(([provider_id]) => provider_id === "openai" || provider_id === "github-copilot")
            .map(([provider_id, provider]) => ({
              provider_id,
              provider_name: provider.name ?? provider_id,
              model_count: Object.keys(provider.models ?? {}).length,
              registered: registeredProviders.has(provider_id),
            }))
            .sort((left, right) => left.provider_id.localeCompare(right.provider_id)),
          roles: modelRolesFromInventory(inventory),
          routing: PAPER_MODEL_ROLES.map((role) => routePaperModel(inventory, { role })),
        }
      })
    })

    const modelInventoryAllowlist = Effect.fn("PaperHttpApi.modelInventoryAllowlist")(function* (ctx: {
      payload: typeof ModelInventoryAllowlistPayload.Type
    }) {
      const providers = yield* ModelsDev.Service.use((service) => service.get()).pipe(
        Effect.catch(() => Effect.succeed({})),
      )
      const connected = yield* Provider.Service.use((service) => service.list()).pipe(
        Effect.catch(() => Effect.succeed({})),
      )
      return yield* Effect.tryPromise({
        try: async () => {
          const connectedProviderIDs = new Set(Object.keys(connected))
          const subscriptionProviderIDs = new Set(
            (ctx.payload.registered_provider_ids ?? []).filter(
              (providerID) =>
                (providerID === "openai" || providerID === "github-copilot") && connectedProviderIDs.has(providerID),
            ),
          )
          const builtinCandidates = candidatesFromBuiltinProviders(providers).filter((candidate) =>
            subscriptionProviderIDs.has(candidate.provider_id),
          )
          const providerRegistrations: Record<string, PaperProviderRegistration> = {}
          const providerRecord = providers as Record<string, { name?: string; models?: Record<string, unknown> }>
          for (const providerID of subscriptionProviderIDs) {
            const provider = providerRecord[providerID]
            if (!provider) continue
            providerRegistrations[providerID] = {
              provider_id: providerID,
              provider_name: provider?.name ?? providerID,
              kind:
                providerID === "openai"
                  ? "chatgpt_subscription"
                  : providerID === "github-copilot"
                    ? "copilot_subscription"
                    : "manual",
              status: "registered",
              model_count: Object.keys(provider?.models ?? {}).length,
              allowed_count: ctx.payload.allowlist.filter((ref) => ref.startsWith(`${providerID}/`)).length,
              last_refreshed_at: new Date().toISOString(),
            }
          }
          const payloadRegistrations = Object.fromEntries(
            Object.entries((ctx.payload.provider_registrations as Record<string, PaperProviderRegistration> | undefined) ?? {}).filter(
              ([providerID, registration]) => {
                if (registration.status !== "registered") return false
                if (registration.kind === "openai_compatible" || registration.kind === "manual") return true
                return (
                  (providerID === "openai" || providerID === "github-copilot") &&
                  subscriptionProviderIDs.has(providerID)
                )
              },
            ),
          ) as Record<string, PaperProviderRegistration>
          const inventory = await updatePaperModelAllowlist([...ctx.payload.allowlist], {
            ...paperGlobalOptions(),
            decision_model: ctx.payload.decision_model,
            backup_decision_model: ctx.payload.backup_decision_model,
            role_overrides: ctx.payload.roles as Partial<Record<PaperModelRole, string>> | undefined,
            provider_registrations: {
              ...payloadRegistrations,
              ...providerRegistrations,
            },
            stage_model_policies: ctx.payload.stage_model_policies as Partial<Record<PaperModelRole, PaperStageModelPolicy>> | undefined,
            candidates: builtinCandidates,
          })
          return { inventory, roles: modelRolesFromInventory(inventory) }
        },
        catch: mapPaperBadRequest,
      })
    })

    const modelRoutingDecision = Effect.fn("PaperHttpApi.modelRoutingDecision")(function* (ctx: {
      payload: typeof ModelRoutingDecisionPayload.Type
    }) {
      return yield* Effect.tryPromise({
        try: async () => {
          if (!PAPER_MODEL_ROLES.includes(ctx.payload.role as PaperModelRole)) throw new Error("Unknown paper model role.")
          const inventory = await loadPaperModelInventory(paperGlobalOptions())
          return routePaperModel(inventory, {
            role: ctx.payload.role as PaperModelRole,
            stage: ctx.payload.stage,
            difficulty: ctx.payload.difficulty,
            task_scale: ctx.payload.task_scale,
            budget_tier: ctx.payload.budget_tier,
            required_capabilities: ctx.payload.required_capabilities as Parameters<typeof routePaperModel>[1]["required_capabilities"],
            forced_model: ctx.payload.forced_model,
          })
        },
        catch: mapPaperBadRequest,
      })
    })

    const modelRolesAssign = Effect.fn("PaperHttpApi.modelRolesAssign")(function* (ctx: {
      payload: typeof ModelRoleAssignmentPayload.Type
    }) {
      return yield* Effect.sync(() => ({
        roles: resolveAllModelRoleAssignments({
          default_model: ctx.payload.default_model,
          roles: ctx.payload.roles as Parameters<typeof resolveAllModelRoleAssignments>[0]["roles"],
          subagents: ctx.payload.subagents ? { ...ctx.payload.subagents } : undefined,
        }),
      })).pipe(Effect.catch(() => Effect.fail(new HttpApiError.BadRequest({}))))
    })

    return handlers
      .handle("createRun", createRun)
      .handle("listRuns", listRuns)
      .handle("getRun", getRun)
      .handle("resumeRun", resumeRun)
      .handleRaw("events", events)
      .handle("guidance", guidance)
      .handle("controlRun", controlRun)
      .handle("preview", preview)
      .handle("export", exportBundle)
      .handle("experimentStarterApply", experimentStarterApply)
      .handle("experimentProtocolRun", experimentProtocolRun)
      .handle("capabilities", capabilities)
      .handle("doctor", doctor)
      .handle("providersDiscover", providersDiscover)
      .handle("providersDiscoverOpenAI", providersDiscoverOpenAI)
      .handle("modelRoles", modelRoles)
      .handle("modelInventory", modelInventory)
      .handle("modelInventoryAllowlist", modelInventoryAllowlist)
      .handle("modelRoutingDecision", modelRoutingDecision)
      .handle("modelRolesAssign", modelRolesAssign)
  }),
)
