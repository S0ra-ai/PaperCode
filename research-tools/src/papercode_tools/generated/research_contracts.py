"""Generated from schemas/research/v1.schema.json. Do not edit by hand."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

RESEARCH_SCHEMA_VERSION = "research.v1"


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ResearchLocator(StrictModel):
    uri: str | None = None
    path: str | None = None
    line_start: int | None = Field(default=None, ge=1)
    line_end: int | None = Field(default=None, ge=1)
    page: int | None = Field(default=None, ge=1)
    selector: str | None = None


class ResearchStorageFacts(StrictModel):
    run: Literal["run.json"]
    events: Literal["events.jsonl"]
    artifacts: Literal["artifacts.jsonl"]
    sources: Literal["sources.jsonl"]
    tool_traces: Literal["tool-traces.jsonl"]
    claims: Literal["claims.jsonl"]
    drafts: Literal["drafts.jsonl"]
    reviews: Literal["reviews.jsonl"]
    exports: Literal["exports.jsonl"]
    checkpoints: Literal["checkpoints.jsonl"]


class ResearchStorageLayout(StrictModel):
    facts: ResearchStorageFacts
    run_index: Literal["index.sqlite"]
    global_index: Literal["~/.papercode/index.sqlite"]
    index_rebuildable: Literal[True]


class ResearchRun(StrictModel):
    schema_version: Literal["research.v1"]
    run_id: str
    topic: str
    workspace: str
    status: Literal["initialized", "running", "succeeded", "failed", "cancelled"]
    created_at: str
    updated_at: str
    storage: ResearchStorageLayout
    metadata: dict[str, Any] | None = None


class ResearchEvent(StrictModel):
    schema_version: Literal["research.v1"]
    event_id: str
    run_id: str
    type: str
    created_at: str
    actor: Literal["system", "user", "agent", "tool"]
    payload: dict[str, Any]


class ResearchArtifact(StrictModel):
    schema_version: Literal["research.v1"]
    artifact_id: str
    run_id: str
    kind: Literal["source_snapshot", "outline", "draft", "review", "export", "table", "figure", "log"]
    path: str
    mime_type: str
    sha256: str | None = None
    source_ids: list[str]
    created_at: str
    metadata: dict[str, Any] | None = None


class ResearchSource(StrictModel):
    schema_version: Literal["research.v1"]
    source_id: str
    run_id: str
    kind: Literal["paper", "code", "web", "dataset", "user_note", "tool_output"]
    title: str
    locator: ResearchLocator
    created_at: str
    metadata: dict[str, Any] | None = None


class ResearchToolTrace(StrictModel):
    schema_version: Literal["research.v1"]
    trace_id: str
    run_id: str
    tool_name: str
    status: Literal["queued", "running", "succeeded", "failed"]
    started_at: str
    ended_at: str | None = None
    input: dict[str, Any]
    output: dict[str, Any] | None = None
    error: str | None = None


class ResearchClaim(StrictModel):
    schema_version: Literal["research.v1"]
    claim_id: str
    run_id: str
    text: str
    status: Literal["proposed", "supported", "contradicted", "needs_evidence"]
    confidence: float = Field(ge=0, le=1)
    source_ids: list[str]
    artifact_ids: list[str]
    created_at: str


class ResearchDraft(StrictModel):
    schema_version: Literal["research.v1"]
    draft_id: str
    run_id: str
    title: str
    format: Literal["markdown", "latex", "docx", "pdf", "html"]
    path: str
    claim_ids: list[str]
    artifact_ids: list[str]
    created_at: str


class ResearchReviewFinding(StrictModel):
    severity: Literal["info", "warning", "error", "blocker"]
    message: str
    source_ids: list[str]


class ResearchReview(StrictModel):
    schema_version: Literal["research.v1"]
    review_id: str
    run_id: str
    target_id: str
    target_kind: Literal["draft", "export", "artifact", "claim"]
    status: Literal["open", "resolved"]
    findings: list[ResearchReviewFinding]
    created_at: str


class ResearchExport(StrictModel):
    schema_version: Literal["research.v1"]
    export_id: str
    run_id: str
    draft_id: str
    format: Literal["pdf", "docx", "html", "latex", "markdown"]
    path: str
    artifact_ids: list[str]
    created_at: str


class ResearchCheckpoint(StrictModel):
    schema_version: Literal["research.v1"]
    checkpoint_id: str
    run_id: str
    stage: Literal["ingest", "analyze", "outline", "draft", "review", "export"]
    status: Literal["pending", "running", "succeeded", "failed"]
    summary: str
    event_ids: list[str]
    artifact_ids: list[str]
    created_at: str
