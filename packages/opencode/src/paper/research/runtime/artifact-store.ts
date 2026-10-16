import { mkdir, writeFile } from "fs/promises"
import path from "path"
import { createHash, randomUUID } from "crypto"
import {
  RESEARCH_SCHEMA_VERSION,
  type ResearchArtifact,
  type ResearchArtifactKind,
  type ResearchMetadata,
} from "../contracts"
import { withSpan } from "../telemetry"
import { artifactAbsolutePath, normalizeRelativeArtifactPath } from "./paths"
import {
  appendResearchEvent,
  appendResearchFact,
  loadResearchRun,
  nextResearchId,
  readJsonlFacts,
  type ResearchRuntimeOptions,
} from "./run-store"

export class ResearchArtifactLockedError extends Error {
  constructor(
    readonly logicalPath: string,
    readonly artifactId: string,
  ) {
    super(`Artifact ${logicalPath} is locked by ${artifactId} and cannot be superseded.`)
    this.name = "ResearchArtifactLockedError"
  }
}

export type WriteResearchArtifactInput = {
  artifact_id?: string
  kind: ResearchArtifactKind
  logical_path: string
  data: unknown
  mime_type?: string
  source_ids?: string[]
  locked?: boolean
  metadata?: ResearchMetadata
  created_at?: string
}

type NormalizedArtifactData = {
  bytes: Uint8Array
  mime_type: string
}

function stableJson(value: unknown): string {
  if (typeof value === "undefined") return "null"
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(",")}]`
  const object = value as Record<string, unknown>
  return `{${Object.keys(object)
    .filter((key) => typeof object[key] !== "undefined")
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`)
    .join(",")}}`
}

function normalizeArtifactData(value: unknown, mimeType?: string): NormalizedArtifactData {
  if (value instanceof Uint8Array) {
    return { bytes: value, mime_type: mimeType ?? "application/octet-stream" }
  }
  if (value instanceof ArrayBuffer) {
    return { bytes: new Uint8Array(value), mime_type: mimeType ?? "application/octet-stream" }
  }
  if (typeof value === "string") {
    return { bytes: new TextEncoder().encode(value), mime_type: mimeType ?? "text/plain" }
  }
  return { bytes: new TextEncoder().encode(stableJson(value)), mime_type: mimeType ?? "application/json" }
}

function sha256(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex")
}

function metadataLogicalPath(artifact: ResearchArtifact) {
  const value = artifact.metadata?.logical_path
  return typeof value === "string" ? value : artifact.path
}

function metadataVersion(artifact: ResearchArtifact) {
  const value = artifact.metadata?.version
  return typeof value === "number" ? value : 1
}

function isLocked(artifact: ResearchArtifact) {
  return artifact.metadata?.locked === true
}

function versionedArtifactPath(logicalPath: string, version: number) {
  if (version === 1) return logicalPath
  const parsed = path.posix.parse(logicalPath)
  return path.posix.join(parsed.dir, `${parsed.name}.v${version}${parsed.ext}`)
}

function nowIso(options?: ResearchRuntimeOptions) {
  return (options?.clock?.() ?? new Date()).toISOString()
}

async function nextUniqueResearchArtifactId(runDir: string, options?: ResearchRuntimeOptions) {
  const existing = new Set((await readJsonlFacts(runDir, "artifact")).map((artifact) => artifact.artifact_id))
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = nextResearchId("artifact", options)
    if (!existing.has(candidate)) return candidate
  }
  return `artifact-${randomUUID()}`
}

export async function writeResearchArtifact(
  runDir: string,
  input: WriteResearchArtifactInput,
  options?: ResearchRuntimeOptions,
) {
  return withSpan(
    "research.runtime.artifact_write",
    {
      "papercode.research.run_dir": runDir,
      "papercode.research.artifact.kind": input.kind,
    },
    async (span) => {
      const run = await loadResearchRun(runDir)
      const logicalPath = normalizeRelativeArtifactPath(input.logical_path)
      const previous = (await readJsonlFacts(runDir, "artifact"))
        .filter((artifact) => metadataLogicalPath(artifact) === logicalPath)
        .toSorted((left, right) => metadataVersion(left) - metadataVersion(right))
      const latest = previous[previous.length - 1]
      if (latest && isLocked(latest)) throw new ResearchArtifactLockedError(logicalPath, latest.artifact_id)

      const version = latest ? metadataVersion(latest) + 1 : 1
      const relativeDataPath = path.posix.join("artifacts", versionedArtifactPath(logicalPath, version))
      const normalized = normalizeArtifactData(input.data, input.mime_type)
      const digest = sha256(normalized.bytes)
      const absolutePath = artifactAbsolutePath(runDir, relativeDataPath)
      await mkdir(path.dirname(absolutePath), { recursive: true })
      await writeFile(absolutePath, Buffer.from(normalized.bytes))

      const createdAt = input.created_at ?? nowIso(options)
      const artifact = await appendResearchFact(runDir, "artifact", {
        schema_version: RESEARCH_SCHEMA_VERSION,
        artifact_id: input.artifact_id ?? (await nextUniqueResearchArtifactId(runDir, options)),
        run_id: run.run_id,
        kind: input.kind,
        path: relativeDataPath,
        mime_type: normalized.mime_type,
        sha256: digest,
        source_ids: input.source_ids ?? [],
        created_at: createdAt,
        metadata: {
          ...(input.metadata ?? {}),
          logical_path: logicalPath,
          version,
          locked: input.locked === true,
          supersedes: latest?.artifact_id,
          normalized_sha256: digest,
          normalized_bytes: normalized.bytes.byteLength,
        },
      })

      await appendResearchEvent(
        runDir,
        {
          type: latest ? "artifact.superseded" : "artifact.written",
          actor: "system",
          created_at: createdAt,
          payload: {
            artifact_id: artifact.artifact_id,
            logical_path: logicalPath,
            version,
            supersedes: latest?.artifact_id,
            locked: input.locked === true,
          },
        },
        options,
      )

      span.setAttribute("papercode.research.run_id", run.run_id)
      span.setAttribute("papercode.research.artifact_id", artifact.artifact_id)
      span.setAttribute("papercode.research.artifact.sha256", digest)
      return artifact
    },
  )
}
