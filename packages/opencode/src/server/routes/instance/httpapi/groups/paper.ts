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
const StorageScope = Schema.Literals(["home", "workspace"])

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
  target_journal: Schema.optional(Schema.String),
  target_journal_url: Schema.optional(Schema.String),
  language: Schema.optional(Schema.String),
  model_roles: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  draft_sections: Schema.optional(
    Schema.Array(
      Schema.Struct({
        section_id: Schema.String,
        markdown: Schema.String,
      }),
    ),
  ),
  declarations: Schema.optional(
    Schema.Struct({
      funding: Schema.optional(Schema.String),
      author_contributions: Schema.optional(Schema.String),
      competing_interests: Schema.optional(Schema.String),
      ethics: Schema.optional(Schema.String),
      llm_disclosure: Schema.optional(Schema.String),
    }),
  ),
  budget_tier: Schema.optional(BudgetTier),
  quality_mode: Schema.optional(QualityMode),
  storage_scope: Schema.optional(StorageScope),
  data_egress_policy: Schema.optional(DataEgressPolicyPayload),
})

export const PaperGuidancePayload = Schema.Struct({
  message: Schema.String,
})

export const PaperControlPayload = Schema.Struct({
  action: Schema.Literals(["resume", "retry", "cancel"]),
  stage: Schema.optional(Schema.String),
})

export const PaperExportPayload = Schema.Struct({
  forced: Schema.optional(Schema.Boolean),
})

export const PaperExperimentStarterApplyPayload = Schema.Struct({
  workspace_path: Schema.optional(Schema.String),
  dry_run: Schema.optional(Schema.Boolean),
  overwrite: Schema.optional(Schema.Boolean),
  file_paths: Schema.optional(StringArray),
  update_package_json: Schema.optional(Schema.Boolean),
})

export const PaperExperimentProtocolRunPayload = Schema.Struct({
  workspace_path: Schema.optional(Schema.String),
  dry_run: Schema.optional(Schema.Boolean),
  timeout_seconds: Schema.optional(Schema.Number),
  repetitions: Schema.optional(Schema.Number),
})

export const ProviderDiscoverPayload = Schema.Struct({
  provider_id: Schema.String,
  provider_name: Schema.optional(Schema.String),
  base_url: Schema.String,
  api_key: Schema.String,
  compatibility: Schema.Literal("openai-compatible"),
  timeout_ms: Schema.optional(Schema.Number),
  persist: Schema.optional(Schema.Boolean),
  allow_models: Schema.optional(StringArray),
  decision_model: Schema.optional(Schema.String),
})

export const ModelRoleAssignmentPayload = Schema.Struct({
  default_model: Schema.String,
  roles: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  subagents: Schema.optional(Schema.Record(Schema.String, Schema.String)),
})

export const ModelInventoryAllowlistPayload = Schema.Struct({
  allowlist: StringArray,
  decision_model: Schema.optional(Schema.String),
  backup_decision_model: Schema.optional(Schema.String),
  roles: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  registered_provider_ids: Schema.optional(StringArray),
  provider_registrations: Schema.optional(Schema.Record(Schema.String, Schema.Any)),
  stage_model_policies: Schema.optional(Schema.Record(Schema.String, Schema.Any)),
})

export const ModelRoutingDecisionPayload = Schema.Struct({
  role: Schema.String,
  stage: Schema.optional(Schema.String),
  difficulty: Schema.optional(Schema.Literals(["low", "medium", "high"])),
  task_scale: Schema.optional(Schema.Literals(["small", "medium", "large"])),
  budget_tier: Schema.optional(BudgetTier),
  required_capabilities: Schema.optional(StringArray),
  forced_model: Schema.optional(Schema.String),
})

/**
 * Error body for the paper routes that fail after the request is understood. Mirrors the
 * PaperApiError.v1 envelope the TUI already reads (message + next action + log directory), so a
 * control or export failure keeps its diagnostics instead of collapsing into an empty 400.
 */
export class PaperApiError extends Schema.ErrorClass<PaperApiError>("PaperApiError")(
  {
    error: Schema.Struct({
      schema_version: Schema.Literal("PaperApiError.v1"),
      code: Schema.String,
      message: Schema.String,
      action: Schema.optional(Schema.String),
      log_path: Schema.optional(Schema.String),
    }),
  },
  { httpApiStatus: 400 },
) {}

export const PaperPaths = {
  runs: `${root}/runs`,
  run: `${root}/runs/:runID`,
  resume: `${root}/runs/:runID/resume`,
  events: `${root}/runs/:runID/events`,
  guidance: `${root}/runs/:runID/guidance`,
  control: `${root}/runs/:runID/control`,
  preview: `${root}/runs/:runID/preview`,
  export: `${root}/runs/:runID/export`,
  experimentStarterApply: `${root}/runs/:runID/experiment-starter/apply`,
  experimentProtocolRun: `${root}/runs/:runID/experiments/run`,
  capabilities: `${root}/capabilities`,
  doctor: `${root}/doctor`,
  providersDiscover: `${root}/providers/discover`,
  modelInventory: `${root}/model-inventory`,
  modelRoutingDecision: `${root}/model-routing/decision`,
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
          error: PaperApiError,
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "paper.runs.create",
            summary: "Create PaperRun",
            description: "Create a first-class PaperCode PaperRun from topic, code, data, logs, or paper materials.",
          }),
        ),
        HttpApiEndpoint.get("listRuns", PaperPaths.runs, {
          success: described(AnyJson, "PaperRun history entries"),
          error: PaperApiError,
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "paper.runs.list",
            summary: "List PaperRuns",
            description: "List home and workspace PaperRun history entries for resume and audit workflows.",
          }),
        ),
        HttpApiEndpoint.get("getRun", PaperPaths.run, {
          params: { runID: Schema.String },
          success: described(AnyJson, "PaperRun snapshot"),
          error: [PaperApiError, HttpApiError.NotFound],
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "paper.runs.get",
            summary: "Get PaperRun",
            description: "Get PaperRun state, ledgers, agent tree, diagnostics, preview state, and export state.",
          }),
        ),
        HttpApiEndpoint.post("resumeRun", PaperPaths.resume, {
          params: { runID: Schema.String },
          success: described(AnyJson, "Resumed PaperRun snapshot"),
          error: [PaperApiError, HttpApiError.NotFound],
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "paper.runs.resume",
            summary: "Resume PaperRun",
            description: "Resume a previous PaperRun from the PaperCode home/workspace run index.",
          }),
        ),
        HttpApiEndpoint.get("events", PaperPaths.events, {
          params: { runID: Schema.String },
          success: Schema.String.pipe(HttpApiSchema.asText({ contentType: "text/event-stream" })),
          error: [PaperApiError, HttpApiError.NotFound],
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
          error: [PaperApiError, HttpApiError.NotFound],
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "paper.runs.guidance",
            summary: "Record PaperRun guidance",
            description: "Attach Chinese user guidance to a running paper workflow.",
          }),
        ),
        HttpApiEndpoint.post("controlRun", PaperPaths.control, {
          params: { runID: Schema.String },
          payload: PaperControlPayload,
          success: described(AnyJson, "PaperRun controller state"),
          error: [PaperApiError, HttpApiError.NotFound],
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "paper.runs.control",
            summary: "Control PaperRun",
            description: "Resume, retry, or cancel a PaperRun controller without requiring shell commands.",
          }),
        ),
        HttpApiEndpoint.get("preview", PaperPaths.preview, {
          params: { runID: Schema.String },
          success: described(AnyJson, "Read-only PaperRun preview payload"),
          error: [PaperApiError, HttpApiError.NotFound],
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
          error: [PaperApiError, HttpApiError.NotFound],
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "paper.runs.export",
            summary: "Export PaperRun bundle",
            description: "Create final or forced-draft export status. Final exports remain blocked until gates pass.",
          }),
        ),
        HttpApiEndpoint.post("experimentStarterApply", PaperPaths.experimentStarterApply, {
          params: { runID: Schema.String },
          payload: PaperExperimentStarterApplyPayload,
          success: described(AnyJson, "Experiment starter workspace apply result"),
          error: [PaperApiError, HttpApiError.NotFound],
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "paper.runs.experiment_starter.apply",
            summary: "Apply experiment starter files",
            description:
              "Dry-run or write ExperimentProtocolStarterPack files into the selected workspace without overwriting by default.",
          }),
        ),
        HttpApiEndpoint.post("experimentProtocolRun", PaperPaths.experimentProtocolRun, {
          params: { runID: Schema.String },
          payload: PaperExperimentProtocolRunPayload,
          success: described(AnyJson, "Experiment protocol run result"),
          error: [PaperApiError, HttpApiError.NotFound],
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "paper.runs.experiments.run",
            summary: "Run experiment protocol",
            description:
              "Dry-run or execute the current PaperRun ExperimentPlan/ExperimentProtocol in the selected workspace.",
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
            description: "Inspect PaperCode runtime health, defaults, storage, language, MCP, and skill readiness.",
          }),
        ),
        HttpApiEndpoint.get("providersDiscover", PaperPaths.providersDiscover, {
          success: described(AnyJson, "Provider/model discovery"),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "paper.providers.discover",
            summary: "Discover providers and models",
            description: "Return provider/model discovery data for paper model role assignment.",
          }),
        ),
        HttpApiEndpoint.post("providersDiscoverOpenAI", PaperPaths.providersDiscover, {
          payload: ProviderDiscoverPayload,
          success: described(AnyJson, "OpenAI-compatible provider/model discovery"),
          error: PaperApiError,
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "paper.providers.discoverOpenAI",
            summary: "Discover OpenAI-compatible models",
            description:
              "Discover models from a user-supplied OpenAI-compatible endpoint without persisting the API key.",
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
        HttpApiEndpoint.get("modelInventory", PaperPaths.modelInventory, {
          success: described(AnyJson, "Paper model inventory and allowlist"),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "paper.model_inventory",
            summary: "Get model inventory",
            description: "Return discovered models, user allowlist, the main decision model, and dynamic routing preview.",
          }),
        ),
        HttpApiEndpoint.post("modelInventoryAllowlist", PaperPaths.modelInventory, {
          payload: ModelInventoryAllowlistPayload,
          success: described(AnyJson, "Updated paper model allowlist"),
          error: PaperApiError,
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "paper.model_inventory.allowlist",
            summary: "Update model allowlist",
            description: "Persist the models that the PaperCode decision model and agent team may use.",
          }),
        ),
        HttpApiEndpoint.post("modelRoutingDecision", PaperPaths.modelRoutingDecision, {
          payload: ModelRoutingDecisionPayload,
          success: described(AnyJson, "Paper model routing decision"),
          error: PaperApiError,
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "paper.model_routing.decision",
            summary: "Preview model routing",
            description: "Ask the PaperCode model router which allowlisted model would be used for a stage or role.",
          }),
        ),
        HttpApiEndpoint.post("modelRolesAssign", PaperPaths.modelRoles, {
          payload: ModelRoleAssignmentPayload,
          success: described(AnyJson, "Resolved paper model role assignment"),
          error: PaperApiError,
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "paper.model_roles.assign",
            summary: "Resolve model roles",
            description: "Resolve default, per-role, and subagent model overrides for paper agents.",
          }),
        ),
      )
      .annotateMerge(
        OpenApi.annotations({
          title: "paper",
          description: "First-class PaperRun routes for the PaperCode 论文工作台.",
        }),
      )
      .middleware(InstanceContextMiddleware)
      .middleware(WorkspaceRoutingMiddleware)
      .middleware(Authorization),
  )
  .annotateMerge(
    OpenApi.annotations({
      title: "PaperCode PaperRun HttpApi",
      version: "0.2.2-dev",
      description:
        "PaperRun API for research intake, stage graph, ledgers, guidance, preview, export, and diagnostics.",
    }),
  )
