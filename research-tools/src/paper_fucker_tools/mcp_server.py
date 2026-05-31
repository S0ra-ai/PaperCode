"""MCP SDK adapter for paper_fucker structured Python tools."""

from __future__ import annotations

from .mcp_tools import TOOL_REGISTRY


def create_server():
    try:
        from mcp.server.fastmcp import FastMCP  # type: ignore
    except Exception as error:  # pragma: no cover - depends on optional runtime install
        raise RuntimeError("The MCP SDK is not installed. Run `uv sync` in research-tools first.") from error

    server = FastMCP("paper_fucker_research_tools")

    def make_tool(handler):
        def tool(input_data: dict | None = None):
            return handler(input_data or {}).model_dump()

        return tool

    for name, handler in TOOL_REGISTRY.items():
        server.tool(name=name)(make_tool(handler))

    return server


def run() -> None:
    create_server().run()

