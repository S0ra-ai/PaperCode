# Remove Stub Leftovers

Version: `0.5.1-dev`
TaskFlow task: `task-052-remove-stub-leftovers`
Branch: `fix/remove-stub-leftovers`
Date: `2026/05/10`

## Summary

After TaskFlow reached `52/52 done`, a cleanup scan found two current-code names that still reflected earlier Phase 1 implementation scaffolding:

- `packages/opencode/src/paper/research/runtime/guards.ts` exported Phase 1 stage stubs with `not_implemented` status.
- `research-tools/src/paper_fucker_tools/mcp_tools.py` exposed `docx_generation_stub` as the canonical DOCX tool name.

Both were misleading now that the PaperRun closed loop, forced DOCX export, and authenticity gates are implemented.

## Changes

- Replaced Phase 1 stage-stub API with `ResearchStageBlockingDiagnostic` and `createStageBlockingDiagnostic`.
- Blocking diagnostics now use `status: "blocked"` and optional `required_action` / `historical_task_id` metadata.
- Authenticity guard now rejects `placeholder`, `synthetic`, and `fake` provenance without treating a current runtime stage as unimplemented.
- Renamed Python DOCX tool to `docx_generation` and removed the stub-suffixed registry entry.
- Updated Python tool model comments from the removed server sidecar wording to the current OpenCode paper core.
- Updated TypeScript and Python tests for the canonical names.

## Verification

The cleanup was verified with:

```text
npx --yes bun@1.3.13 --cwd packages/opencode test test/research/guards.test.ts test/paper/orchestrator.test.ts
6 pass, 0 fail, 14 expect() calls

$env:PYTHONPATH='research-tools/src'; python -m unittest discover -s research-tools/tests
5 tests, OK

npx --yes bun@1.3.13 run --cwd packages/opencode typecheck
passed
```

The focused cleanup scan returned no current-code matches for the removed runtime/tool names:

```text
phaseOneStageStubs
ResearchStageStub
createNotImplementedStageStub
not_implemented
docx_generation_stub
stub handler
packages/server
@paper-fucker/server
server runtime
```

The cleanup scan intentionally allows historical reports and `CHANGELOG` to retain old path/provenance text, but current runtime and test surfaces should no longer expose the removed stub names.
