# Python Tool Bridge Smoke

> Historical path note: this report predates task-032. Any `packages/server` or `@paper-fucker/server` paths below are provenance only; the current paper_fucker runtime authority is `packages/opencode/src/paper`, and `packages/server` is intentionally absent.

Date: 2026-05-08
TaskFlow task: task-006-python-tool-bridge
Branch: feature/python-tool-bridge

## Boundary

Python tools provide structured MCP-style helpers and one-shot CLI utilities.
They never own final paper_fucker run state. The authoritative `packages/server`
runtime invokes them automatically and records their outputs as run events and
artifacts.

## Implemented Python Tools

- `paper_fucker_tools.external_tools`: discovers pandoc and LaTeX tools from `~/.paper_fucker/tools.json`, `PAPER_FUCKER_TOOL_*` environment variables, and `PATH`.
- `paper_fucker_tools.cli`: exposes `diagnostics`, `link-tool`, `mcp-call`, `md-to-latex`, `latex-to-pdf`, `convert-docx`, and `serve-mcp`.
- `paper_fucker_tools.mcp_tools`: provides `tool_diagnostics`, `pdf_probe`, `dataset_metadata_probe`, `experiment_log_parse`, and `docx_generation_stub`.
- `paper_fucker_tools.mcp_server`: adapts the same registry to FastMCP when the MCP SDK is installed.

## Runtime Bridge

- `packages/server/src/research/runtime/python-bridge.ts` calls `python -m paper_fucker_tools`.
- Structured tool calls use `mcp-call <tool> --input-json ...`.
- CLI calls use the same Python module entrypoint.
- Both paths persist structured stdout/stderr/JSON as `log` artifacts and append `python.tool` or `python.cli` events.

## Verification

- `python -m unittest discover -s research-tools/tests`: passed, 4 tests.
- `python -m paper_fucker_tools diagnostics --json`: passed.
- `python -m paper_fucker_tools md-to-latex <sample.md> -o <sample.tex> --allow-fallback`: passed.
- `npx --yes bun@1.3.13 --cwd packages/server test test/research/python-bridge.test.ts`: passed, 1 pass, 0 fail, 6 expects.
- `npx --yes bun@1.3.13 --cwd packages/server test test/research/contracts.test.ts test/research/runtime.test.ts test/research/python-bridge.test.ts`: passed, 7 pass, 0 fail, 45 expects.
- `npx --yes bun@1.3.13 run typecheck`: passed across workspace, 13 successful tasks.
