# Real Paper Orchestrator

> Historical path note: this report predates task-032. Any `packages/server` or `@paper-fucker/server` paths below are provenance only; the current paper_fucker runtime authority is `packages/opencode/src/paper`, and `packages/server` is intentionally absent.

Version: 0.1.23-dev

Task: `task-026-real-orchestrator`

## Summary

paper_fucker now has a paper-domain orchestrator graph that represents the full closed-loop paper workflow. The runner no longer treats missing work as success: missing capabilities or missing concrete handlers produce blocked diagnostics.

## Implemented

- Added `ResearchRunGraph.v1` with 14 stages:
  - intake
  - planning
  - literature
  - code_analysis
  - data
  - experiment_design
  - experiment_execution
  - reproduction
  - claim_ledger
  - drafting
  - profile_formatting
  - verification
  - revision
  - export
- Added `ResearchRunController.v1` snapshots.
- Added real intake default handler that records `ResearchBrief.v1`.
- Added default blocked diagnostics for missing capabilities or missing concrete handlers.
- Added `BlockedDiagnostic.v1` artifacts under `paper-orchestrator/blocked/`.
- Removed the legacy research orchestrator stub success fallback and replaced it with a `stage_failure` pause signal.

## Verification

- `npx --yes bun@1.3.13 --cwd packages/server test test/research/orchestrator.test.ts test/paper/orchestrator.test.ts`
  - Result: 5 pass, 0 fail, 21 expects.

Further repository verification is recorded in the TaskFlow step log.
