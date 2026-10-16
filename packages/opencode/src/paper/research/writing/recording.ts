import { RESEARCH_SCHEMA_VERSION } from "../contracts"
import {
  appendResearchEvent,
  appendResearchFact,
  loadResearchRun,
  writeResearchArtifact,
  type ResearchRuntimeOptions,
} from "../runtime"
import { withSpan } from "../telemetry"
import type { ClaimLedger, DraftPaper } from "./schemas"

export type RecordDraftWritingInput = {
  ledger: ClaimLedger
  draft: DraftPaper
  chunks?: string[]
}

export async function recordDraftWriting(
  runDir: string,
  input: RecordDraftWritingInput,
  options?: ResearchRuntimeOptions,
) {
  return withSpan(
    "research.writing.record_draft",
    {
      "papercode.research.draft.id": input.draft.draft_id,
      "papercode.research.claims": input.ledger.entries.length,
    },
    async (span) => {
      const run = await loadResearchRun(runDir)
      const ledgerArtifact = await writeResearchArtifact(
        runDir,
        {
          kind: "log",
          logical_path: "writing/claim-ledger.json",
          data: input.ledger,
          metadata: { artifact_schema: "ClaimLedger.v1" },
        },
        options,
      )
      const draftArtifact = await writeResearchArtifact(
        runDir,
        {
          kind: "draft",
          logical_path: "writing/draft.md",
          data: input.draft.markdown,
          mime_type: "text/markdown",
          source_ids: Array.from(new Set(input.ledger.entries.flatMap((entry) => entry.source_ids))),
          metadata: { artifact_schema: "DraftPaper.v1", draft_id: input.draft.draft_id },
        },
        options,
      )
      const chunksArtifact = await writeResearchArtifact(
        runDir,
        {
          kind: "log",
          logical_path: "writing/stream-chunks.json",
          data: input.chunks ?? [],
          metadata: { artifact_schema: "MarkdownStreamChunks.v1" },
        },
        options,
      )

      for (const entry of input.ledger.entries) {
        await appendResearchFact(runDir, "claim", {
          schema_version: RESEARCH_SCHEMA_VERSION,
          claim_id: entry.claim_id,
          run_id: run.run_id,
          text: entry.text,
          status: entry.status,
          confidence: entry.confidence,
          source_ids: Array.from(new Set(entry.source_ids)),
          artifact_ids: Array.from(new Set([...entry.artifact_ids, ledgerArtifact.artifact_id])),
          created_at: input.ledger.created_at,
        })
      }

      await appendResearchFact(runDir, "draft", {
        schema_version: RESEARCH_SCHEMA_VERSION,
        draft_id: input.draft.draft_id,
        run_id: run.run_id,
        title: input.draft.title,
        format: "markdown",
        path: draftArtifact.path,
        claim_ids: input.draft.claim_ids,
        artifact_ids: [draftArtifact.artifact_id, ledgerArtifact.artifact_id, chunksArtifact.artifact_id],
        created_at: input.draft.created_at,
      })
      await appendResearchEvent(
        runDir,
        {
          type: "writing.draft.recorded",
          actor: "agent",
          payload: {
            draft_id: input.draft.draft_id,
            draft_artifact_id: draftArtifact.artifact_id,
            claim_ledger_artifact_id: ledgerArtifact.artifact_id,
            stream_chunks_artifact_id: chunksArtifact.artifact_id,
            unsupported_claim_ids: input.ledger.unsupported_claim_ids,
          },
        },
        options,
      )
      span.setAttribute("papercode.research.claims.unsupported", input.ledger.unsupported_claim_ids.length)
      return {
        ledger: input.ledger,
        draft: input.draft,
        artifacts: {
          ledger: ledgerArtifact,
          draft: draftArtifact,
          chunks: chunksArtifact,
        },
      }
    },
  )
}
