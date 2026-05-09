# TUI Paper Workbench Report

- Task: `task-029-tui-paper-workbench`
- Version: `0.1.26-dev`
- Branch: `feature/tui-paper-workbench`
- Date: `2026-05-09`

## Scope

This task moves the OpenCode-derived TUI toward a paper_fucker research workbench instead of a generic chat home screen.

## Implemented

- Added `TuiPaperWorkbenchState.v1` for the Chinese home workbench state.
- Added `TuiResearchRunState.v1` for renderer-independent run view state mapping.
- Mapped the paper stage graph into Chinese stage labels and status labels.
- Added standard run panels for stage graph, events, Source Ledger, Claim Ledger, experiment status, and model/tool/cost diagnostics.
- Added run controls for pause, resume, preview, export, and capability installation.
- Updated OpenCode TUI home placeholders to accept paper topics, code paths, paper materials, datasets, and experiment logs.
- Added first-screen `paper_fucker 论文工作台` signal while preserving plugin slots and prompt behavior.
- Updated README and colon-history CHANGELOG to version `0.1.26-dev`.

## Notes

- The current TUI change exposes the workbench state and first-screen entry points.
- Deeper run-page interaction, live preview binding, revision controls, and final export gating are owned by `task-030-paper-authoring-loop`.

## Verification

- `npx --yes bun@1.3.13 --cwd packages/server test test/paper/tui-state.test.ts`
  - Passed: 2 pass, 0 fail, 8 expects.
- Full typecheck, README/CHANGELOG version validation, and TaskFlow validation are recorded in the task step log and CHANGELOG verification block.
