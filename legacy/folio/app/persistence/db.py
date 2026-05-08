# SPDX-License-Identifier: MPL-2.0
"""SQLite engine + session factory.

DB lives at `~/.folio/folio.db`. Schema migrations are managed by
Alembic (see `app/persistence/alembic/`).
"""

from __future__ import annotations

from datetime import datetime
from pathlib import Path

from sqlalchemy import JSON, DateTime, Integer, String, create_engine
from sqlalchemy.orm import (
    DeclarativeBase,
    Mapped,
    Session,
    mapped_column,
    sessionmaker,
)

from app.config.loader import folio_home


class Base(DeclarativeBase):
    pass


class FormatCacheRow(Base):
    """Cached FormatSpec from one of three sources: builtin, venue, custom."""

    __tablename__ = "format_cache"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    source: Mapped[str] = mapped_column(
        String(16), index=True
    )  # 'builtin' | 'venue' | 'custom'
    key: Mapped[str] = mapped_column(
        String(256), index=True
    )  # venue label (e.g., "IEEE"), or hash for custom
    format_spec: Mapped[dict[str, object]] = mapped_column(
        JSON
    )  # FormatSpec.model_dump()
    validity: Mapped[str] = mapped_column(
        String(64), default="valid"
    )  # 'valid' | 'expired' | 'invalid'
    extracted_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    schema_version: Mapped[str] = mapped_column(String(16), default="1")
    prev_version: Mapped[str | None] = mapped_column(
        String(256), nullable=True
    )  # path to previous version
    note: Mapped[str | None] = mapped_column(
        String(512), nullable=True
    )  # human-readable diff


class StageCacheRow(Base):
    """Cached intermediate stage results (outline, draft, etc.)."""

    __tablename__ = "stage_cache"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    run_id: Mapped[str] = mapped_column(String(64), index=True)
    stage_name: Mapped[str] = mapped_column(
        String(64), index=True
    )  # 'format' | 'outline' | 'draft' | ...
    inputs_hash: Mapped[str] = mapped_column(
        String(64), index=True
    )  # SHA256 of inputs to this stage
    payload: Mapped[dict[str, object]] = mapped_column(JSON)  # StageMessage.payload
    cached_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    expires_at: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True
    )  # for short-lived caches


class CheckpointRow(Base):
    """Snapshot of stage input/output for recovery & audit."""

    __tablename__ = "checkpoints"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    run_id: Mapped[str] = mapped_column(String(64), index=True)
    stage_name: Mapped[str] = mapped_column(String(64), index=True)
    checkpoint_num: Mapped[int] = mapped_column(Integer)  # ordinal within run
    input_msg: Mapped[dict[str, object]] = mapped_column(JSON)  # Full StageMessage in
    output_msg: Mapped[dict[str, object]] = mapped_column(JSON)  # Full StageMessage out
    created_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    note: Mapped[str | None] = mapped_column(String(512), nullable=True)


class LLMCallRow(Base):
    """Complete LLM request/response pair for audit trail."""

    __tablename__ = "llm_calls"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    run_id: Mapped[str] = mapped_column(String(64), index=True)
    stage_name: Mapped[str] = mapped_column(String(64), index=True)
    provider_label: Mapped[str] = mapped_column(String(64))
    model: Mapped[str] = mapped_column(String(128))
    request: Mapped[dict[str, object]] = mapped_column(JSON)  # full request payload
    response: Mapped[dict[str, object]] = mapped_column(JSON)  # full response payload
    prompt_tokens: Mapped[int] = mapped_column(Integer, default=0)
    completion_tokens: Mapped[int] = mapped_column(Integer, default=0)
    cost_usd: Mapped[float] = mapped_column(default=0.0)
    latency_ms: Mapped[int] = mapped_column(Integer, default=0)
    timestamp: Mapped[datetime] = mapped_column(DateTime, index=True)


def db_path() -> Path:
    return folio_home() / "folio.db"


def database_url() -> str:
    return f"sqlite:///{db_path()}"


class TraceEventRow(Base):
    __tablename__ = "trace_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ts: Mapped[datetime] = mapped_column(DateTime, index=True)
    run_id: Mapped[str] = mapped_column(String(64), index=True)
    stage: Mapped[str] = mapped_column(String(64))
    provider_label: Mapped[str | None] = mapped_column(String(64), nullable=True)
    model: Mapped[str | None] = mapped_column(String(128), nullable=True)
    prompt_tokens: Mapped[int] = mapped_column(Integer, default=0)
    completion_tokens: Mapped[int] = mapped_column(Integer, default=0)
    cost_usd: Mapped[float] = mapped_column(default=0.0)
    latency_ms: Mapped[int] = mapped_column(Integer, default=0)
    note: Mapped[str | None] = mapped_column(String(512), nullable=True)
    extra: Mapped[dict[str, object]] = mapped_column(JSON, default=dict)


_engine = create_engine(database_url(), future=True)
SessionLocal = sessionmaker(_engine, class_=Session, expire_on_commit=False)


def init_db() -> None:
    """Create tables if missing. Real migrations come via Alembic."""
    Base.metadata.create_all(_engine)
