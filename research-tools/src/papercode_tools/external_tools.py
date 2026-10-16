"""External tool discovery for document conversion helpers."""

from __future__ import annotations

import json
import os
import shutil
from pathlib import Path
from typing import Mapping

from pydantic import BaseModel, Field


class ExternalToolSpec(BaseModel):
    name: str
    executables: list[str]
    role: str
    env_var: str


class ExternalToolState(BaseModel):
    name: str
    role: str
    status: str
    path: str | None = None
    source: str | None = None
    message: str | None = None


class ExternalToolReport(BaseModel):
    config_path: str
    tools: dict[str, ExternalToolState] = Field(default_factory=dict)


DEFAULT_TOOL_SPECS: tuple[ExternalToolSpec, ...] = (
    ExternalToolSpec(
        name="pandoc",
        executables=["pandoc"],
        role="markdown/latex/docx conversion",
        env_var="PAPERCODE_TOOL_PANDOC",
    ),
    ExternalToolSpec(
        name="latexmk",
        executables=["latexmk"],
        role="latex build orchestration",
        env_var="PAPERCODE_TOOL_LATEXMK",
    ),
    ExternalToolSpec(
        name="xelatex",
        executables=["xelatex"],
        role="unicode latex to pdf engine",
        env_var="PAPERCODE_TOOL_XELATEX",
    ),
    ExternalToolSpec(
        name="pdflatex",
        executables=["pdflatex"],
        role="latex to pdf engine",
        env_var="PAPERCODE_TOOL_PDFLATEX",
    ),
    ExternalToolSpec(
        name="lualatex",
        executables=["lualatex"],
        role="lua latex to pdf engine",
        env_var="PAPERCODE_TOOL_LUALATEX",
    ),
    ExternalToolSpec(
        name="tectonic",
        executables=["tectonic"],
        role="self-contained latex to pdf engine",
        env_var="PAPERCODE_TOOL_TECTONIC",
    ),
)


def default_config_path() -> Path:
    configured = os.environ.get("PAPERCODE_TOOLS_CONFIG")
    if configured:
        return Path(configured).expanduser()
    home = Path(os.environ.get("PAPERCODE_HOME", Path.home()))
    return home / ".papercode" / "tools.json"


def load_tool_links(config_path: str | Path | None = None) -> dict[str, str]:
    path = Path(config_path).expanduser() if config_path else default_config_path()
    if not path.exists():
        return {}
    data = json.loads(path.read_text(encoding="utf-8"))
    tools = data.get("tools", data)
    if not isinstance(tools, dict):
        raise ValueError(f"Tool link config must be an object: {path}")
    return {str(key): str(value) for key, value in tools.items()}


def save_tool_link(name: str, tool_path: str, config_path: str | Path | None = None) -> Path:
    path = Path(config_path).expanduser() if config_path else default_config_path()
    links = load_tool_links(path) if path.exists() else {}
    links[name] = str(Path(tool_path).expanduser())
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"tools": links}, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return path


def _candidate_from_link(name: str, links: Mapping[str, str]) -> tuple[str, str] | None:
    linked = links.get(name)
    if not linked:
        return None
    path = Path(linked).expanduser()
    if path.exists():
        return str(path), "config"
    return None


def _candidate_from_env(spec: ExternalToolSpec, environ: Mapping[str, str]) -> tuple[str, str] | None:
    value = environ.get(spec.env_var)
    if not value:
        return None
    path = Path(value).expanduser()
    if path.exists():
        return str(path), "env"
    return None


def _candidate_from_path(spec: ExternalToolSpec) -> tuple[str, str] | None:
    for executable in spec.executables:
        resolved = shutil.which(executable)
        if resolved:
            return resolved, "path"
    return None


def discover_external_tools(
    config_path: str | Path | None = None,
    *,
    environ: Mapping[str, str] | None = None,
) -> ExternalToolReport:
    path = Path(config_path).expanduser() if config_path else default_config_path()
    links = load_tool_links(path) if path.exists() else {}
    env = environ or os.environ
    report = ExternalToolReport(config_path=str(path), tools={})
    for spec in DEFAULT_TOOL_SPECS:
        candidate = _candidate_from_link(spec.name, links) or _candidate_from_env(spec, env) or _candidate_from_path(spec)
        if candidate:
            tool_path, source = candidate
            report.tools[spec.name] = ExternalToolState(
                name=spec.name,
                role=spec.role,
                status="available",
                path=tool_path,
                source=source,
            )
        else:
            report.tools[spec.name] = ExternalToolState(
                name=spec.name,
                role=spec.role,
                status="missing",
                message=f"Auto-discovery checked config, {spec.env_var}, and PATH.",
            )
    return report


def require_tool(name: str, config_path: str | Path | None = None) -> ExternalToolState:
    report = discover_external_tools(config_path)
    state = report.tools.get(name)
    if not state:
        raise KeyError(f"Unknown external tool: {name}")
    if state.status != "available" or not state.path:
        raise FileNotFoundError(state.message or f"{name} is not available")
    return state

