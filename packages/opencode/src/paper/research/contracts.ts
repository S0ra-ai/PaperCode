import Ajv2020 from "ajv/dist/2020"
import type { ErrorObject, ValidateFunction } from "ajv"
import path from "path"
import { readFileSync } from "fs"
import researchSchema from "../../../../../schemas/research/v1.schema.json" with { type: "json" }
import {
  RESEARCH_SCHEMA_VERSION,
  type ResearchContractByKind,
  type ResearchContractKind,
  type ResearchSchemaVersion,
} from "./generated/contracts"
import { contractAttributes, withSpan } from "./telemetry"

const SCHEMA_PATH = path.join(import.meta.dirname, "../../../../../schemas/research/v1.schema.json")
const SCHEMA_ID = "https://papercode.local/schemas/research/v1.schema.json"

type SchemaDocument = {
  $id: string
  $defs: Record<string, unknown>
}

const DEF_BY_KIND: Record<ResearchContractKind, string> = {
  run: "Run",
  event: "Event",
  artifact: "Artifact",
  source: "Source",
  tool_trace: "ToolTrace",
  claim: "Claim",
  draft: "Draft",
  review: "Review",
  export: "Export",
  checkpoint: "Checkpoint",
}

const LEGACY_SCHEMA_VERSIONS = new Set(["research.v0"])

let schemaCache: SchemaDocument | undefined
let ajvCache: Ajv2020 | undefined
const validators = new Map<ResearchContractKind, ValidateFunction>()

export class ResearchContractValidationError extends Error {
  constructor(
    readonly kind: ResearchContractKind,
    readonly errors: ErrorObject[],
  ) {
    super(`Invalid ${kind} research contract: ${formatErrors(errors)}`)
    this.name = "ResearchContractValidationError"
  }
}

export class ResearchContractMigrationError extends Error {
  constructor(
    readonly kind: ResearchContractKind,
    readonly fromVersion: string | undefined,
    readonly toVersion: ResearchSchemaVersion = RESEARCH_SCHEMA_VERSION,
  ) {
    super(migrationMessage(kind, fromVersion, toVersion))
    this.name = "ResearchContractMigrationError"
  }
}

function formatErrors(errors: ErrorObject[]) {
  return errors.map((item) => `${item.instancePath || "/"} ${item.message ?? "failed validation"}`).join("; ")
}

function migrationMessage(kind: ResearchContractKind, from: string | undefined, to: ResearchSchemaVersion) {
  if (!from) return `${kind} research contract is missing schema_version; regenerate or migrate it to ${to}.`
  if (LEGACY_SCHEMA_VERSIONS.has(from)) {
    return `${kind} research contract uses ${from}; a migration to ${to} must be registered before it can be loaded.`
  }
  return `${kind} research contract uses unsupported schema_version ${from}; expected ${to}.`
}

function loadSchema() {
  if (!schemaCache) {
    try {
      schemaCache = JSON.parse(readFileSync(SCHEMA_PATH, "utf8")) as SchemaDocument
    } catch {
      schemaCache = researchSchema as SchemaDocument
    }
  }
  return schemaCache
}

function ajv() {
  if (!ajvCache) {
    ajvCache = new Ajv2020({
      allErrors: true,
      strict: false,
    })
    ajvCache.addSchema(loadSchema(), SCHEMA_ID)
  }
  return ajvCache
}

function validator(kind: ResearchContractKind) {
  const cached = validators.get(kind)
  if (cached) return cached

  const name = DEF_BY_KIND[kind]
  const validate = ajv().getSchema(`${SCHEMA_ID}#/$defs/${name}`) ?? ajv().compile({ $ref: `${SCHEMA_ID}#/$defs/${name}` })
  validators.set(kind, validate)
  return validate
}

function schemaVersionOf(value: unknown) {
  if (!value || typeof value !== "object" || !("schema_version" in value)) return undefined
  const version = (value as { schema_version?: unknown }).schema_version
  return typeof version === "string" ? version : undefined
}

export function schema() {
  return loadSchema()
}

export function assertCurrentSchemaVersion(kind: ResearchContractKind, value: unknown) {
  const version = schemaVersionOf(value)
  if (version !== RESEARCH_SCHEMA_VERSION) throw new ResearchContractMigrationError(kind, version)
}

export function validate<K extends ResearchContractKind>(
  kind: K,
  value: unknown,
): ResearchContractByKind[K] {
  return withSpan(
    "research.contract.validate",
    contractAttributes({
      kind,
      schemaVersion: schemaVersionOf(value),
    }),
    () => {
      assertCurrentSchemaVersion(kind, value)
      const check = validator(kind)
      if (!check(value)) throw new ResearchContractValidationError(kind, check.errors ?? [])
      return value as ResearchContractByKind[K]
    },
  )
}

export function migrate<K extends ResearchContractKind>(
  kind: K,
  value: unknown,
): ResearchContractByKind[K] {
  return withSpan(
    "research.contract.migrate",
    contractAttributes({
      kind,
      schemaVersion: schemaVersionOf(value),
    }),
    () => {
      assertCurrentSchemaVersion(kind, value)
      return validate(kind, value)
    },
  )
}

export const storageFacts = {
  run: "run.json",
  events: "events.jsonl",
  artifacts: "artifacts.jsonl",
  sources: "sources.jsonl",
  tool_traces: "tool-traces.jsonl",
  claims: "claims.jsonl",
  drafts: "drafts.jsonl",
  reviews: "reviews.jsonl",
  exports: "exports.jsonl",
  checkpoints: "checkpoints.jsonl",
} as const

export const defaultStorageLayout = {
  facts: storageFacts,
  run_index: "index.sqlite",
  global_index: "~/.papercode/index.sqlite",
  index_rebuildable: true,
} as const

export * from "./generated/contracts"
