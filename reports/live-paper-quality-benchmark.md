# Live Paper Quality Benchmark

Version: `0.4.0-dev`
TaskFlow task: `task-046-live-paper-quality-benchmark`
Branch: `feature/live-paper-quality-benchmark`
Date: `2026/05/10`

## Scenario

- Topic: `可验证论文自动化系统的闭环生成与真实性审查`
- Workspace: `E:\Project\paper_fucker`
- Code paths:
  - `packages/opencode/src/paper`
  - `packages/opencode/src/server/routes/instance/httpapi/handlers/paper.ts`
  - `packages/opencode/src/cli/cmd/tui/routes/paper`
- Paper material: `README.md`
- Experiment log material: `reports/strict-live-acceptance.md`
- Profile: `generic-preprint`
- Language: `zh-CN`
- Budget tier: `standard`
- Quality mode: `reviewable_bundle`
- Data egress: `private_first`, only the selected code/report/material paths allowed; `.paper_fucker/local/**`, `.env*`, `.git/**`, `node_modules/**`, and secret-like files denied.

## Live Checks

- DeepSeek live provider smoke passed: `/models` returned configured `deepseek-v4-pro`, and a chat completion returned a response.
- Exa remote MCP initialize passed against `https://mcp.exa.ai/mcp`.
- `nature-paper` skill smoke passed and the Nature author guidance page returned HTTP 200.
- Pandoc Markdown-to-LaTeX and Markdown-to-DOCX smokes passed.
- Direct XeLaTeX PDF smoke passed after correcting the local smoke input.
- Targeted PaperRun/code/export/observability tests passed:

```text
npx --yes bun@1.3.13 --cwd packages/opencode test test/paper/paperrun-execution.test.ts test/paper/code-to-paper.test.ts test/paper/export-pipeline.test.ts test/paper/observability-audit.test.ts
7 pass, 0 fail, 49 expect() calls
```

The first full `scripts/strict-acceptance.ps1` rerun was terminated after more than 18 minutes while `packages/opencode test` continued without a per-check timeout or progress output. That is now tracked by `task-047-strict-acceptance-timeouts`.

## PaperRun Result

- Run id: `run-622f4660-3c8c-4dfe-b25f-04ef7484fd8f`
- Run dir: `.paper_fucker/runs/run-622f4660-3c8c-4dfe-b25f-04ef7484fd8f` (ignored by Git)
- Stage graph: 14/14 stages succeeded.
- Event count: 79
- Source ledger count: 84
- Artifact count: 33
- Claim count: 1
- Draft count: 1
- Review count: 1
- Preview: ready, read-only, 1 annotation.

Final export was blocked by `reproduction_failure`, which is correct for an ungated reviewable benchmark. Forced export produced Markdown, LaTeX, and DOCX files with failed checks attached. PDF export failed through the PaperRun pipeline because `latexmk` failed, while direct XeLaTeX worked; this is tracked by `task-049-export-pdf-renderer-fallback`.

## Quality Gaps

- `strict-acceptance` can hang for too long during full server tests and does not write partial progress before timeout. Follow-up: `task-047-strict-acceptance-timeouts`.
- The real PaperRun snapshot status remained `running` even after all stages succeeded. Follow-up: `task-048-paperrun-completion-gates`.
- The reproduction stage was marked `succeeded` while the final gate recorded `reproduction_failure`. Follow-up: `task-048-paperrun-completion-gates`.
- PaperRun PDF export failed on `latexmk` without falling back to working XeLaTeX. Follow-up: `task-049-export-pdf-renderer-fallback`.
- Default PaperRun diagnostics emitted stage and export renderer audits, but capability, model role, subagent, tool, data-egress, and cost audit kinds were missing. Follow-up: `task-050-default-observability-coverage`.
- A final rerun is needed after these hardening tasks to prove the benchmark has improved. Follow-up: `task-051-live-benchmark-regression-pass`.

## Local Artifacts

- Benchmark summary JSON: `tmp/live-paper-quality-benchmark/paperrun-summary.json` (ignored by Git)
- Toolchain smoke files: `tmp/live-paper-quality-benchmark/toolchain/` (ignored by Git)
- PaperRun artifacts: `.paper_fucker/runs/run-622f4660-3c8c-4dfe-b25f-04ef7484fd8f/` (ignored by Git)

## Repository Hygiene

`.paper_fucker/runs/` is now ignored so live PaperRun artifacts do not enter Git. Secrets remain under `.paper_fucker/local/`, which was already ignored.
