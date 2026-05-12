import { InstanceState } from "@/effect/instance-state"
import { ModelsDev } from "@/provider/models"
import {
  createPaperRun,
  controlPaperRun,
  discoverPaperProviders,
  exportPaperRun,
  getPaperRunSnapshot,
  initialPaperRunLiveEvents,
  paperCapabilities,
  paperDoctor,
  paperModelWorkbench,
  paperModelRoles,
  type PaperRunCreateRequest,
  PaperRunNotFoundError,
  previewPaperRun,
  recordPaperRunGuidance,
  subscribeToPaperRunLiveEvents,
} from "@/paper/run"
import { discoverOpenAICompatibleModels, saveProviderEndpointConfig } from "@/paper/model-discovery"
import {
  loadPaperModelInventory,
  modelRolesFromInventory,
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
import { InstanceHttpApi } from "../api"
import {
  ModelRoleAssignmentPayload,
  ModelInventoryAllowlistPayload,
  ModelRoutingDecisionPayload,
  PaperControlPayload,
  PaperExportPayload,
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

function paperOptions(directory: string) {
  return { workspace: directory }
}

function paperGlobalOptions() {
  return { home: process.env.PAPER_FUCKER_TEST_HOME ?? process.env.PAPER_FUCKER_HOME }
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
    language: payload.language,
    model_roles: payload.model_roles as PaperRunCreateRequest["model_roles"],
    budget_tier: payload.budget_tier,
    quality_mode: payload.quality_mode,
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
      const run = yield* Effect.tryPromise({
        try: () => createPaperRun(normalizeCreatePayload(ctx.payload), paperOptions(instance.directory)),
        catch: mapPaperBadRequest,
      })
      return {
        run: run.snapshot,
        run_dir: run.run_dir,
      }
    })

    const getRun = Effect.fn("PaperHttpApi.getRun")(function* (ctx: { params: { runID: string } }) {
      const instance = yield* InstanceState.context
      const run = yield* Effect.tryPromise({
        try: () => getPaperRunSnapshot(ctx.params.runID, paperOptions(instance.directory)),
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
          const inventory = await upsertDiscoveredModels(discovered, {
            ...options,
            allow: ctx.payload.allow_models ? [...ctx.payload.allow_models] : undefined,
            decision_model: ctx.payload.decision_model,
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
      return yield* Effect.promise(() => paperModelWorkbench(paperGlobalOptions()))
    })

    const modelInventoryAllowlist = Effect.fn("PaperHttpApi.modelInventoryAllowlist")(function* (ctx: {
      payload: typeof ModelInventoryAllowlistPayload.Type
    }) {
      return yield* Effect.tryPromise({
        try: async () => {
          const inventory = await updatePaperModelAllowlist([...ctx.payload.allowlist], {
            ...paperGlobalOptions(),
            decision_model: ctx.payload.decision_model,
            role_overrides: ctx.payload.roles as Partial<Record<PaperModelRole, string>> | undefined,
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
      .handle("getRun", getRun)
      .handleRaw("events", events)
      .handle("guidance", guidance)
      .handle("controlRun", controlRun)
      .handle("preview", preview)
      .handle("export", exportBundle)
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
