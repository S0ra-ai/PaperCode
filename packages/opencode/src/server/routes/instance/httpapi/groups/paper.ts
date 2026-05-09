import { Schema } from "effect"
import { HttpApi, HttpApiEndpoint, HttpApiError, HttpApiGroup, HttpApiSchema, OpenApi } from "effect/unstable/httpapi"
import { Authorization } from "../middleware/authorization"
import { InstanceContextMiddleware } from "../middleware/instance-context"
import { WorkspaceRoutingMiddleware } from "../middleware/workspace-routing"
import { described } from "./metadata"

const root = "/paper"

const StringArray = Schema.Array(Schema.String)
const BudgetTier = Schema.Literals(["quick", "standard", "deep", "submission", "custom"])
const QualityMode = Schema.Literals(["reviewable_bundle", "submission_candidate"])

const DataEgressPolicyPayload = Schema.Struct({
  mode: Schema.optional(Schema.Literals(["private_first", "allow_summaries", "allow_authorized_paths"])),
  allowed_paths: Schema.optional(StringArray),
  denied_patterns: Schema.optional(StringArray),
  external_model_full_text: Schema.optional(Schema.Boolean),
})

export const PaperRunCreatePayload = Schema.Struct({
  topic: Schema.String,
  workspace_path: Schema.optional(Schema.String),
  code_paths: Schema.optional(StringArray),
  paper_files: Schema.optional(StringArray),
  dataset_paths: Schema.optional(StringArray),
  experiment_logs: Schema.optional(StringArray),
  target_profile: Schema.optional(Schema.String),
  language: Schema.optional(Schema.String),
  model_roles: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  budget_tier: Schema.optional(BudgetTier),
  quality_mode: Schema.optional(QualityMode),
  data_egress_policy: Schema.optional(DataEgressPolicyPayload),
})

export const PaperGuidancePayload = Schema.Struct({
  message: Schema.String,
})

export const PaperExportPayload = Schema.Struct({
  forced: Schema.optional(Schema.Boolean),
})

export const PaperPaths = {
  runs: `${root}/runs`,
  run: `${root}/runs/:runID`,
  events: `${root}/runs/:runID/events`,
  guidance: `${root}/runs/:runID/guidance`,
  preview: `${root}/runs/:runID/preview`,
  export: `${root}/runs/:runID/export`,
  capabilities: `${root}/capabilities`,
  doctor: `${root}/doctor`,
  providersDiscover: `${root}/providers/discover`,
  modelRoles: `${root}/model-roles`,
} as const

const AnyJson = Schema.Any

export const PaperApi = HttpApi.make("paper")
  .add(
    HttpApiGroup.make("paper")
      .add(
        HttpApiEndpoint.post("createRun", PaperPaths.runs, {
          payload: PaperRunCreatePayload,
          success: described(AnyJson, "Created PaperRun snapshot"),
          error: HttpApiError.BadRequest,
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "paper.runs.create",
            summary: "Create PaperRun",
            description: "Create a first-class paper_fucker PaperRun from topic, code, data, logs, or paper materials.",
          }),
        ),
        HttpApiEndpoint.get("getRun", PaperPaths.run, {
          params: { runID: Schema.String },
          success: described(AnyJson, "PaperRun snapshot"),
          error: [HttpApiError.BadRequest, HttpApiError.NotFound],
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "paper.runs.get",
            summary: "Get PaperRun",
            description: "Get PaperRun state, ledgers, agent tree, diagnostics, preview state, and export state.",
          }),
        ),
        HttpApiEndpoint.get("events", PaperPaths.events, {
          params: { runID: Schema.String },
          success: Schema.String.pipe(HttpApiSchema.asText({ contentType: "text/event-stream" })),
          error: [HttpApiError.BadRequest, HttpApiError.NotFound],
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "paper.runs.events",
            summary: "Subscribe to PaperRun events",
            description: "Stream PaperRun snapshots as server-sent events.",
          }),
        ),
        HttpApiEndpoint.post("guidance", PaperPaths.guidance, {
          params: { runID: Schema.String },
          payload: PaperGuidancePayload,
          success: described(AnyJson, "Guidance response"),
          error: [HttpApiError.BadRequest, HttpApiError.NotFound],
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "paper.runs.guidance",
            summary: "Record PaperRun guidance",
            description: "Attach Chinese user guidance to a running paper workflow.",
          }),
        ),
        HttpApiEndpoint.get("preview", PaperPaths.preview, {
          params: { runID: Schema.String },
          success: described(AnyJson, "Read-only PaperRun preview payload"),
          error: [HttpApiError.BadRequest, HttpApiError.NotFound],
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "paper.runs.preview",
            summary: "Get PaperRun preview",
            description: "Return the read-only preview data bound to PaperRun artifacts and ledgers.",
          }),
        ),
        HttpApiEndpoint.post("export", PaperPaths.export, {
          params: { runID: Schema.String },
          payload: PaperExportPayload,
          success: described(AnyJson, "Paper export bundle status"),
          error: [HttpApiError.BadRequest, HttpApiError.NotFound],
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "paper.runs.export",
            summary: "Export PaperRun bundle",
            description: "Create final or forced-draft export status. Final exports remain blocked until gates pass.",
          }),
        ),
        HttpApiEndpoint.get("capabilities", PaperPaths.capabilities, {
          success: described(AnyJson, "Registered paper research capabilities"),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "paper.capabilities",
            summary: "List paper capabilities",
            description: "List MCP, skill, built-in, first-party, and Python capabilities available to paper stages.",
          }),
        ),
        HttpApiEndpoint.get("doctor", PaperPaths.doctor, {
          success: described(AnyJson, "Paper doctor diagnostics"),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "paper.doctor",
            summary: "Run paper doctor",
            description: "Inspect paper_fucker runtime health, defaults, storage, language, MCP, and skill readiness.",
          }),
        ),
        HttpApiEndpoint.get("providersDiscover", PaperPaths.providersDiscover, {
          success: described(AnyJson, "Provider/model discovery"),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "paper.providers.discover",
            summary: "Discover providers and models",
            description: "Return OpenCode provider/model discovery data for paper model role assignment.",
          }),
        ),
        HttpApiEndpoint.get("modelRoles", PaperPaths.modelRoles, {
          success: described(AnyJson, "Paper model role assignment"),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "paper.model_roles",
            summary: "Get model roles",
            description: "Return the provider-agnostic model role routing defaults for paper agents.",
          }),
        ),
      )
      .annotateMerge(
        OpenApi.annotations({
          title: "paper",
          description: "First-class PaperRun routes for the paper_fucker论文工作台.",
        }),
      )
      .middleware(InstanceContextMiddleware)
      .middleware(WorkspaceRoutingMiddleware)
      .middleware(Authorization),
  )
  .annotateMerge(
    OpenApi.annotations({
      title: "paper_fucker PaperRun HttpApi",
      version: "0.2.2-dev",
      description:
        "PaperRun API for research intake, stage graph, ledgers, guidance, preview, export, and diagnostics.",
    }),
  )
