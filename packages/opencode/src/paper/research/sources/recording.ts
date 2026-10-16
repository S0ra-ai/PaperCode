import { RESEARCH_SCHEMA_VERSION, type ResearchSourceKind } from "../contracts"
import {
  appendResearchEvent,
  appendResearchFact,
  loadResearchRun,
  writeResearchArtifact,
  type ResearchRuntimeOptions,
} from "../runtime"
import { withSpan } from "../telemetry"
import { discoverDatasets } from "./datasets"
import { assessDirectionFeasibility } from "./feasibility"
import { discoverLiterature } from "./literature"
import type { DatasetCard, DiscoveryInput, SourceRecord } from "./schemas"

function nowIso(options?: ResearchRuntimeOptions, override?: string) {
  return override ?? (options?.clock?.() ?? new Date()).toISOString()
}

function sourceMetadata(record: SourceRecord | DatasetCard) {
  return {
    provider: record.provider,
    license_status: record.license.status,
    license_expression: record.license.expression,
    version: record.version.value,
    retrieved_at: record.version.retrieved_at,
    verification_status: record.verification.status,
    verification_method: record.verification.method,
    verification_diagnostics: record.verification.diagnostics ?? [],
    artifact_schema: record.schema_version,
    topics: record.topics ?? [],
    sha256: record.sha256,
  }
}

async function recordSource(runDir: string, runId: string, record: SourceRecord | DatasetCard, options?: ResearchRuntimeOptions) {
  const createdAt = nowIso(options, "created_at" in record ? record.created_at : record.retrieved_at)
  await appendResearchFact(runDir, "source", {
    schema_version: RESEARCH_SCHEMA_VERSION,
    source_id: record.source_id,
    run_id: runId,
    kind: ("dataset_id" in record ? "dataset" : record.kind) as ResearchSourceKind,
    title: record.title,
    locator: { uri: record.url },
    created_at: createdAt,
    metadata: sourceMetadata(record),
  })
}

export async function discoverAndRecordLiteratureData(
  runDir: string,
  input: DiscoveryInput,
  options?: ResearchRuntimeOptions,
) {
  return withSpan(
    "research.sources.discover_and_record",
    {
      "papercode.research.topic": input.topic,
    },
    async (span) => {
      const run = await loadResearchRun(runDir)
      const now = nowIso(options, input.now)
      const literature = discoverLiterature({
        topic: input.topic,
        candidates: input.literature_candidates,
        min_verified_sources: input.min_verified_sources,
        now,
      })
      const dataPlan = discoverDatasets({
        topic: input.topic,
        candidates: input.dataset_candidates,
        now,
      })
      const feasibility = assessDirectionFeasibility({
        topic: input.topic,
        literature,
        data_plan: dataPlan,
        full_access: input.full_access,
        nearby_directions: input.nearby_directions,
        min_verified_sources: input.min_verified_sources,
        now,
      })

      const records = new Map<string, SourceRecord | DatasetCard>()
      for (const source of literature.sources) records.set(source.source_id, source)
      for (const dataset of dataPlan.datasets) records.set(dataset.source_id, dataset)
      for (const record of records.values()) await recordSource(runDir, run.run_id, record, options)

      const sourceIds = Array.from(records.keys())
      const literatureArtifact = await writeResearchArtifact(
        runDir,
        {
          kind: "source_snapshot",
          logical_path: "sources/literature-map.json",
          data: literature,
          source_ids: sourceIds,
          metadata: { artifact_schema: "LiteratureMap.v1" },
        },
        options,
      )
      const dataPlanArtifact = await writeResearchArtifact(
        runDir,
        {
          kind: "source_snapshot",
          logical_path: "sources/data-plan.json",
          data: dataPlan,
          source_ids: dataPlan.datasets.map((dataset) => dataset.source_id),
          metadata: { artifact_schema: "DataPlan.v1" },
        },
        options,
      )
      const datasetCardsArtifact = await writeResearchArtifact(
        runDir,
        {
          kind: "source_snapshot",
          logical_path: "sources/dataset-cards.json",
          data: dataPlan.datasets,
          source_ids: dataPlan.datasets.map((dataset) => dataset.source_id),
          metadata: { artifact_schema: "DatasetCard.v1[]" },
        },
        options,
      )
      const feasibilityArtifact = await writeResearchArtifact(
        runDir,
        {
          kind: "log",
          logical_path: "sources/direction-feasibility.json",
          data: feasibility,
          source_ids: sourceIds,
          metadata: { artifact_schema: "DirectionFeasibility.v1" },
        },
        options,
      )

      await appendResearchEvent(
        runDir,
        {
          type: "sources.discovery.completed",
          actor: "agent",
          payload: {
            literature_artifact_id: literatureArtifact.artifact_id,
            data_plan_artifact_id: dataPlanArtifact.artifact_id,
            dataset_cards_artifact_id: datasetCardsArtifact.artifact_id,
            feasibility_artifact_id: feasibilityArtifact.artifact_id,
            feasibility_status: feasibility.status,
            source_ids: sourceIds,
          },
        },
        options,
      )
      span.setAttribute("papercode.research.sources.recorded", sourceIds.length)
      span.setAttribute("papercode.research.direction.status", feasibility.status)
      return {
        literature,
        data_plan: dataPlan,
        feasibility,
        artifacts: {
          literature: literatureArtifact,
          data_plan: dataPlanArtifact,
          dataset_cards: datasetCardsArtifact,
          feasibility: feasibilityArtifact,
        },
      }
    },
  )
}
