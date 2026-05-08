"""Command line interface for paper_fucker research tools."""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path
from typing import Any

from .external_tools import discover_external_tools, require_tool, save_tool_link
from .mcp_tools import call_tool
from .models import ToolArtifact, ToolEvent, ToolResult


def _print_json(value: Any) -> None:
    if hasattr(value, "model_dump"):
        value = value.model_dump()
    print(json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True))


def diagnostics(args: argparse.Namespace) -> int:
    result = call_tool("tool_diagnostics", {"config_path": args.config})
    _print_json(result if args.json else result.metadata)
    return 0 if result.status == "succeeded" else 1


def link_tool(args: argparse.Namespace) -> int:
    path = save_tool_link(args.name, args.path, args.config)
    _print_json({"status": "succeeded", "config_path": str(path), "tool": args.name, "path": args.path})
    return 0


def mcp_call(args: argparse.Namespace) -> int:
    input_data = json.loads(args.input_json) if args.input_json else {}
    result = call_tool(args.name, input_data)
    _print_json(result)
    return 0 if result.status == "succeeded" else 1


def _run_external(command: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(command, check=False, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)


def markdown_to_latex(args: argparse.Namespace) -> int:
    input_path = Path(args.input).expanduser()
    output_path = Path(args.output).expanduser()
    try:
        pandoc = require_tool("pandoc", args.config)
        completed = _run_external([pandoc.path or "pandoc", str(input_path), "-t", "latex", "-o", str(output_path)])
        result = ToolResult(
            tool_name="markdown_to_latex",
            status="succeeded" if completed.returncode == 0 else "failed",
            artifacts=[ToolArtifact(path=str(output_path), mime_type="text/x-tex", data={"path": str(output_path)})],
            events=[ToolEvent(type="python.convert.latex", payload={"exit_code": completed.returncode})],
            metadata={"exit_code": completed.returncode, "stdout": completed.stdout, "stderr": completed.stderr},
            error=None if completed.returncode == 0 else completed.stderr,
        )
    except FileNotFoundError as error:
        if not args.allow_fallback:
            result = ToolResult.fail("markdown_to_latex", str(error), metadata=discover_external_tools(args.config).model_dump())
        else:
            output_path.parent.mkdir(parents=True, exist_ok=True)
            body = input_path.read_text(encoding="utf-8")
            output_path.write_text("\\section*{Converted Markdown}\\n\\begin{verbatim}\\n" + body + "\\n\\end{verbatim}\\n", encoding="utf-8")
            result = ToolResult.ok(
                "markdown_to_latex",
                artifacts=[ToolArtifact(path=str(output_path), mime_type="text/x-tex", data={"path": str(output_path)})],
                events=[ToolEvent(type="python.convert.latex", payload={"fallback": True})],
                metadata={"fallback": True, "reason": str(error)},
            )
    _print_json(result)
    return 0 if result.status == "succeeded" else 1


def latex_to_pdf(args: argparse.Namespace) -> int:
    input_path = Path(args.input).expanduser()
    output_path = Path(args.output).expanduser()
    report = discover_external_tools(args.config)
    engine = next((report.tools[name] for name in ("latexmk", "tectonic", "xelatex", "pdflatex", "lualatex") if report.tools[name].status == "available"), None)
    if not engine or not engine.path:
        result = ToolResult.fail("latex_to_pdf", "No LaTeX engine found.", metadata=report.model_dump())
        _print_json(result)
        return 1
    output_path.parent.mkdir(parents=True, exist_ok=True)
    if engine.name == "latexmk":
        command = [engine.path, "-pdf", "-interaction=nonstopmode", f"-outdir={output_path.parent}", str(input_path)]
    elif engine.name == "tectonic":
        command = [engine.path, str(input_path), "--outdir", str(output_path.parent)]
    else:
        command = [engine.path, "-interaction=nonstopmode", f"-output-directory={output_path.parent}", str(input_path)]
    completed = _run_external(command)
    result = ToolResult(
        tool_name="latex_to_pdf",
        status="succeeded" if completed.returncode == 0 else "failed",
        artifacts=[ToolArtifact(path=str(output_path), mime_type="application/pdf", data={"path": str(output_path)})],
        events=[ToolEvent(type="python.convert.pdf", payload={"engine": engine.name, "exit_code": completed.returncode})],
        metadata={"engine": engine.model_dump(), "exit_code": completed.returncode, "stdout": completed.stdout, "stderr": completed.stderr},
        error=None if completed.returncode == 0 else completed.stderr,
    )
    _print_json(result)
    return 0 if result.status == "succeeded" else 1


def convert_docx(args: argparse.Namespace) -> int:
    input_path = Path(args.input).expanduser()
    output_path = Path(args.output).expanduser()
    try:
        pandoc = require_tool("pandoc", args.config)
    except FileNotFoundError as error:
        result = ToolResult.fail("convert_docx", str(error), metadata=discover_external_tools(args.config).model_dump())
        _print_json(result)
        return 1
    completed = _run_external([pandoc.path or "pandoc", str(input_path), "-o", str(output_path)])
    result = ToolResult(
        tool_name="convert_docx",
        status="succeeded" if completed.returncode == 0 else "failed",
        artifacts=[ToolArtifact(path=str(output_path), mime_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document", data={"path": str(output_path)})],
        events=[ToolEvent(type="python.convert.docx", payload={"exit_code": completed.returncode})],
        metadata={"exit_code": completed.returncode, "stdout": completed.stdout, "stderr": completed.stderr},
        error=None if completed.returncode == 0 else completed.stderr,
    )
    _print_json(result)
    return 0 if result.status == "succeeded" else 1


def serve_mcp(_: argparse.Namespace) -> int:
    from .mcp_server import run

    run()
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="paper-fucker-tools")
    sub = parser.add_subparsers(dest="command", required=True)

    diagnostics_parser = sub.add_parser("diagnostics")
    diagnostics_parser.add_argument("--config")
    diagnostics_parser.add_argument("--json", action="store_true")
    diagnostics_parser.set_defaults(func=diagnostics)

    link_parser = sub.add_parser("link-tool")
    link_parser.add_argument("name")
    link_parser.add_argument("path")
    link_parser.add_argument("--config")
    link_parser.set_defaults(func=link_tool)

    mcp_parser = sub.add_parser("mcp-call")
    mcp_parser.add_argument("name")
    mcp_parser.add_argument("--input-json", default="{}")
    mcp_parser.set_defaults(func=mcp_call)

    md_parser = sub.add_parser("md-to-latex")
    md_parser.add_argument("input")
    md_parser.add_argument("-o", "--output", required=True)
    md_parser.add_argument("--config")
    md_parser.add_argument("--allow-fallback", action="store_true")
    md_parser.set_defaults(func=markdown_to_latex)

    pdf_parser = sub.add_parser("latex-to-pdf")
    pdf_parser.add_argument("input")
    pdf_parser.add_argument("-o", "--output", required=True)
    pdf_parser.add_argument("--config")
    pdf_parser.set_defaults(func=latex_to_pdf)

    docx_parser = sub.add_parser("convert-docx")
    docx_parser.add_argument("input")
    docx_parser.add_argument("-o", "--output", required=True)
    docx_parser.add_argument("--config")
    docx_parser.set_defaults(func=convert_docx)

    mcp_server_parser = sub.add_parser("serve-mcp")
    mcp_server_parser.set_defaults(func=serve_mcp)

    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    return int(args.func(args))


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))

