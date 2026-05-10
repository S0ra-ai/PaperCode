import { InstanceState } from "@/effect/instance-state"
import { ModelsDev } from "@/provider/models"
import {
  createPaperRun,
  controlPaperRun,
  discoverPaperProviders,
  exportPaperRun,
  getPaperRunSnapshot,
  paperCapabilities,
  paperDoctor,
  paperModelRoles,
  type PaperRunCreateRequest,
  PaperRunNotFoundError,
  previewPaperRun,
  recordPaperRunGuidance,
  subscribePaperRunEvents,
} from "@/paper/run"
import { discoverOpenAICompatibleModels } from "@/paper/model-discovery"
import { resolveAllModelRoleAssignments } from "@/paper/model-roles"
import { Effect } from "effect"
import * as Stream from "effect/Stream"
import { HttpServerResponse } from "effect/unstable/http"
import { HttpApiBuilder, HttpApiError } from "effect/unstable/httpapi"
import { InstanceHttpApi } from "../api"
import {
  ModelRoleAssignmentPayload,
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
      const text = yield* Effect.tryPromise({
        try: () => subscribePaperRunEvents(ctx.params.runID, paperOptions(instance.directory)),
        catch: mapPaperError,
      })
      return HttpServerResponse.stream(Stream.make(text).pipe(Stream.encodeText), {
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
      return paperDoctor()
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
      return yield* Effect.tryPromise({
        try: () => discoverOpenAICompatibleModels(ctx.payload),
        catch: mapPaperBadRequest,
      })
    })

    const modelRoles = Effect.fn("PaperHttpApi.modelRoles")(function* () {
      return paperModelRoles()
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
      .handle("modelRolesAssign", modelRolesAssign)
  }),
)
