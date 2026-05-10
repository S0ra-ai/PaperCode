# Observability Audit Hardening

Version: 0.3.6-dev  
Work commit: 7d335eb  
Date: 2026/05/10

## Summary

PaperRun diagnostics now include durable observability audit coverage. The audit is derived from run events and explicit observability helpers, and it covers stages, capabilities, model roles, subagents, tool calls, data-egress decisions, export renderers, and cost usage.

## Implemented

- Added `packages/opencode/src/paper/observability.ts`.
- Added durable `PaperObservabilityAudit.v1` entries through `paper.observability.audit` run events.
- Added `PaperObservabilityAuditSummary.v1` with coverage counts and missing-kind detection.
- Added helpers:
  - `recordPaperObservabilityAudit`
  - `recordPaperToolTrace`
  - `recordPaperCostUsage`
  - `recordPaperDataEgressAudit`
  - `paperObservabilityAuditFromEvents`
- Added `diagnostics.audit` to PaperRun snapshots.
- Export renderer actions now emit `export_renderer` audit events.
- Strict live acceptance now declares and checks `observability-audit-coverage`.

## Verification

- `npx --yes bun@1.3.13 --cwd packages/opencode test test/paper/observability-audit.test.ts test/paper/export-pipeline.test.ts`
  - Result: 4 pass, 0 fail, 29 expects.
- `npx --yes bun@1.3.13 --cwd packages/opencode test test/paper/observability-audit.test.ts test/paper/strict-acceptance.test.ts`
  - Result: 4 pass, 0 fail, 43 expects.
- `npx --yes bun@1.3.13 run --cwd packages/opencode typecheck`
  - Result: passed.

## Notes

The audit summary intentionally derives stage coverage from durable orchestrator events and explicit helper calls for capability/model/subagent/tool/egress/export/cost actions. This keeps snapshot diagnostics queryable without introducing a separate database table.
