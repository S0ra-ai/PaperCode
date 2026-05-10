# Public Surface Cleanup

Version: 0.2.6-dev

This task cleans the user-facing OpenCode remnants from the Paper Fucker hard fork without removing the internal substrate that paper_fucker still uses for providers, agents, sessions, tools, MCP, skills, permissions, and plugins.

## Implemented

- Replaced the startup ASCII wordmark with `Paper Fucker`.
- Routed `UI.logo()` and the TUI logo source through the Paper Fucker logo module.
- Removed legacy OpenCode product commands from the default CLI registry:
  - `acp`
  - `agent`
  - `console`
  - `db`
  - `generate`
  - `github`
  - `import`
  - `pr`
  - `session`
  - `stats`
  - `upgrade`
  - `uninstall`
- Hid old resume/session/agent compatibility flags from public `paper_fucker`, `paper_fucker attach`, and `paper_fucker run` help.
- Reworded public non-interactive execution as `PaperRun` input instead of generic chat.
- Reworded `paper_fucker export [runID]` as PaperRun bundle export.
- Replaced generic chat/coding TUI home tips with Chinese PaperRun workbench guidance covering topic-to-paper, code-to-paper, Source Ledger, Claim Ledger, MCP/skills, budget tiers, data egress, preview, and export.
- Stabilized Windows full-suite verification around native file watchers, VCS branch cache refresh, local workspace sync startup, plugin metadata concurrency, prompt queue timing, processor timing, and temporary authoring cleanup.

## Verification

- `npx --yes bun@1.3.13 --cwd packages/opencode src/index.ts --help`
  - Startup banner shows `Paper Fucker`.
  - Default command list exposes the paper workbench, MCP, providers, models, run, preview-related server surfaces, and PaperRun export.
  - Default help no longer exposes legacy `session`, `github`, `pr`, `acp`, `agent`, `console`, `db`, `generate`, `stats`, `upgrade`, or `uninstall` commands.
- `npx --yes bun@1.3.13 --cwd packages/opencode test`
  - 2544 pass
  - 38 skip
  - 2 todo
  - 0 fail
  - 16 snapshots
  - 7462 expects
- `npx --yes bun@1.3.13 run --cwd packages/opencode typecheck`
  - Passed.
- `npx --yes bun@1.3.13 --cwd packages/preview test`
  - 2 pass
  - 0 fail
  - 9 expects
- `python -m unittest discover -s research-tools/tests`
  - 4 tests OK.
- `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\check-readme-version.ps1`
  - README version `0.2.6-dev` matches the latest `CHANGELOG` version.
- `TaskFlow validate_task task-037-public-surface-cleanup`
  - Valid with no errors or warnings.

## Remaining Internal Substrate

OpenCode names remain in package imports, SDK compatibility types, upstream provenance, and internal implementation identifiers where they represent the retained substrate rather than the user-facing product surface. Those are intentionally not removed in this task.
