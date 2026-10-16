# Research Intake

> Historical path note: this report predates task-032. Any `packages/server` or `@papercode/server` paths below are provenance only; the current papercode runtime authority is `packages/opencode/src/paper`, and `packages/server` is intentionally absent.

Version: 0.1.22-dev

Task: `task-025-research-intake`

## Summary

papercode now normalizes user input into a run-bound `ResearchBrief.v1`. The intake layer handles topic-only papers, code-grounded papers, dataset-driven papers, and mixed material workflows.

## Implemented

- Added `ResearchIntakeRequest`.
- Added `ResearchBrief.v1`.
- Added workflow inference:
  - `topic_to_paper`
  - `code_to_paper`
  - `data_to_paper`
  - `materials_to_paper`
- Added path normalization for workspace, code paths, paper files, datasets, and experiment logs.
- Added default language `zh-CN`.
- Added target profile and model-role override preservation.
- Added needed evidence, pause conditions, and risk output.
- Added `recordResearchIntake()` to write `intake/research-brief.json` and append `intake.brief.created`.

## Verification

- `npx --yes bun@1.3.13 --cwd packages/server test test/paper/intake.test.ts`
  - Result: 4 pass, 0 fail, 20 expects.

Further repository verification is recorded in the TaskFlow step log.
