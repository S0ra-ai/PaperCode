# Export Renderer Pipeline

Version: 0.3.5-dev  
Work commit: 855a944  
Date: 2026/05/10

## Summary

PaperRun export now has a run-bound renderer pipeline that writes concrete Markdown, LaTeX, PDF, DOCX, and `manifest.json` files under each run directory. The API returns file paths, renderer status, failed checks, manifest path, and tool diagnostics instead of a placeholder export status.

## Implemented

- Added `packages/opencode/src/paper/export-pipeline.ts`.
- Rendered outputs into `<run-dir>/exports/<bundle-id>/`:
  - `<bundle-id>.md`
  - `<bundle-id>.tex`
  - `<bundle-id>.pdf`
  - `<bundle-id>.docx`
  - `manifest.json`
- Added default external tool discovery for pandoc and LaTeX engines.
- Added injectable command runner and renderers for deterministic tests and future MCP/tool execution.
- Missing pandoc or LaTeX engines now produce actionable diagnostics instead of fake success.
- Forced drafts prepend the Markdown warning and include failed checks in the manifest.
- `/paper/runs/:runID/export` now materializes exports and returns concrete files, `manifest_path`, `tool_diagnostics`, and `failed_checks`.
- Preview payload now includes `exports` and `export_state` so the UI can display concrete export artifacts and diagnostics.

## Verification

- `npx --yes bun@1.3.13 --cwd packages/opencode test test/paper/export-pipeline.test.ts test/paper/authoring.test.ts test/paper/run-api.test.ts`
  - Result: 7 pass, 0 fail, 63 expects.
- `npx --yes bun@1.3.13 --cwd packages/opencode test test/paper/run-api.test.ts`
  - Result: 1 pass, 0 fail, 27 expects.
- `npx --yes bun@1.3.13 run --cwd packages/opencode typecheck`
  - Result: passed.

## Notes

The pipeline still keeps the renderer interface injectable. This is intentional: real local tools are used by default, while tests and future MCP-backed renderers can provide deterministic runners without bypassing the PaperRun export contract.
