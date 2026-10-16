# End-to-End Acceptance Report

> Historical path note: this report predates task-032. Any `packages/server` or `@papercode/server` paths below are provenance only; the current papercode runtime authority is `packages/opencode/src/paper`, and `packages/server` is intentionally absent.

Version: `0.1.17-dev`

TaskFlow task: `task-020-end-to-end-acceptance`

Date: `2026-05-09`

## Scope

This acceptance closes the remaining fixture-level validation gap for the first-party papercode research runtime. It verifies that an automatic research run can move from a topic through the implemented pipeline stages and produce gated export artifacts without relying on manual shell commands inside the user workflow.

Covered stages:

- Research run creation under workspace-local `.papercode/runs/<run-id>`.
- Trusted template resolution with `TemplateSpec.v1`.
- Literature and dataset discovery with source verification, license metadata, `LiteratureMap.v1`, `DataPlan.v1`, and `DatasetCard.v1`.
- Experiment planning, host exploration, container reproduction, and `ResultReport.v1`.
- ClaimLedger-first writing with bound citations and streamed Markdown draft chunks.
- Final authenticity gate with reference, claim, data license, reproduction, and multi-model review checks.
- Final export bundle with Markdown, LaTeX, PDF, and DOCX outputs.
- Forced-draft export when final export is blocked.

## Fixture Topic

The successful-path fixture uses:

- Topic: `Claim-aware LLM retrieval evaluation`
- Template venue: `IEEE`
- Literature provider: `fixture-openalex`
- Dataset provider: `fixture-huggingface`
- Review models: `deepseek-v4-pro` and `deepseek-v4-pro-review`

The failure-path fixture uses an unsupported claim and a blocked final gate to verify that final exports do not bypass authenticity checks.

## Acceptance Results

- Successful path passes: the final gate is `passed`, four verified sources are recorded, one supported claim is recorded, one draft is recorded, one review fact is recorded, and four export files are produced.
- Failure path passes: `FinalExportBlockedError` is raised for final export, while `forced_draft` export succeeds and its Markdown preview includes visible failed-check markers.
- Preview package smoke remains covered through `packages/preview` tests.

## Verification Commands

```powershell
npx --yes bun@1.3.13 --cwd packages/server test test/research/e2e.test.ts
npx --yes bun@1.3.13 --cwd packages/preview test
npx --yes bun@1.3.13 run --cwd packages/server typecheck
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\check-readme-version.ps1
```

TaskFlow validation:

```text
validate_task task-020-end-to-end-acceptance
```

## Residual Risk

This is a deterministic fixture acceptance. Live network source discovery, real renderer binaries, and paid model calls remain separate smoke checks so that CI and local verification stay stable.
