"""Structured result models for Python research tools.

Python tools return these objects to the TypeScript paper runtime. They do not
own papercode run state; the OpenCode paper core records returned data as
events and artifacts.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


ToolStatus = Literal["succeeded", "failed", "skipped"]


class ToolArtifact(BaseModel):
    """A tool-produced output that the paper runtime may persist as an artifact."""

    path: str | None = None
    mime_type: str = "application/json"
    title: str | None = None
    data: dict[str, Any] = Field(default_factory=dict)


class ToolEvent(BaseModel):
    """A tool-produced event candidate for the authoritative runtime."""

    type: str
    payload: dict[str, Any] = Field(default_factory=dict)


class ToolResult(BaseModel):
    """Machine-readable tool result returned by MCP-style and CLI tools."""

    tool_name: str
    status: ToolStatus
    artifacts: list[ToolArtifact] = Field(default_factory=list)
    events: list[ToolEvent] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)
    error: str | None = None

    @classmethod
    def ok(
        cls,
        tool_name: str,
        *,
        artifacts: list[ToolArtifact] | None = None,
        events: list[ToolEvent] | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> "ToolResult":
        return cls(
            tool_name=tool_name,
            status="succeeded",
            artifacts=artifacts or [],
            events=events or [],
            metadata=metadata or {},
        )

    @classmethod
    def fail(cls, tool_name: str, error: str, *, metadata: dict[str, Any] | None = None) -> "ToolResult":
        return cls(tool_name=tool_name, status="failed", error=error, metadata=metadata or {})

