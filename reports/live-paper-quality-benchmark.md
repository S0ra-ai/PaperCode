# Live Paper Quality Benchmark Regression

Version: `0.5.0-dev`
TaskFlow task: `task-051-live-benchmark-regression-pass`
Branch: `feature/live-benchmark-regression-pass`
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

## Regression Result

- Run id: `run-ee44237e-e1cc-40d5-abee-611dbc9a8222`
- Run dir: `.paper_fucker/runs/run-ee44237e-e1cc-40d5-abee-611dbc9a8222` (ignored by Git)
- Snapshot status: `blocked`
- Stage graph: 13 succeeded, 1 blocked.
- Blocked stage: `reproduction`
- Final export: blocked by `reproduction_failure`
- Forced export: Markdown, LaTeX, PDF, and DOCX were written.
- PDF status: `written`
- Export count: 4
- Event count: 104
- Source ledger count: 84
- Artifact count: 33
- Claim count: 1
- Draft count: 1
- Review count: 1
- Preview: ready, read-only, 1 annotation.

The final export remains blocked because this benchmark does not provide an approved container reproduction. That is the expected authenticity-gate behavior: a reviewable forced draft is allowed, while a final bundle is not.

## Fixed Quality Gaps

| Original 0.4.0 gap | Follow-up task | 0.5.0 outcome |
| --- | --- | --- |
| Strict acceptance could run for too long without partial progress. | `task-047-strict-acceptance-timeouts` | Focused strict acceptance now has per-check timeouts and passed. |
| PaperRun snapshot stayed `running` after stages completed. | `task-048-paperrun-completion-gates` | Snapshot now reports `blocked` when final authenticity gates block export. |
| Reproduction stage showed success while final gate reported `reproduction_failure`. | `task-048-paperrun-completion-gates` | Reproduction stage is now projected as `blocked`. |
| PDF export stopped at `latexmk` failure even though XeLaTeX worked. | `task-049-export-pdf-renderer-fallback` | Forced PDF export is written through renderer fallback. The `latexmk` failure diagnostic is retained. |
| Default diagnostics missed capability/model/subagent/tool/egress/cost audit kinds. | `task-050-default-observability-coverage` | `missing_kinds` is empty. Required audit kinds are present. |
| A final benchmark rerun was needed after hardening. | `task-051-live-benchmark-regression-pass` | Live benchmark and focused strict acceptance both passed. |

## Observability Coverage

The final run recorded complete audit coverage:

```text
stage=28
capability=12
model_role=8
subagent=1
tool=1
data_egress=1
export_renderer=4
cost=1
missing_kinds=[]
```

The forced export retained renderer diagnostics, including the `latexmk` failure:

```text
pdf: latexmk failed with exit code 1. D:\Program\texlive\2024\bin\windows\runscript.tlu:941: D:\Program\texlive\2024\bin\windows\runscript.tlu:714: attempt to concatenate a nil value
```

The fallback renderer still wrote the PDF artifact successfully.

## Strict Acceptance Evidence

Focused strict acceptance passed after the benchmark rerun with `CheckTimeoutSeconds=300`.

Covered checks include:

- TaskFlow validation for all tasks.
- README/CHANGELOG version sync.
- Tracked secret scan.
- Focused server paper tests.
- Preview tests.
- Python research-tools tests.
- Server and workspace typecheck.
- PaperCode CLI/TUI smoke.
- DeepSeek live provider smoke.
- Exa MCP live initialize.
- `nature-paper` skill/profile smoke.
- Pandoc, LaTeX PDF, and DOCX generation.
- Topic-to-paper and code-to-paper runs.
- Hard-fork paper core, PaperRun API/TUI, Agent Tree, quality/egress, public branding, observability audit, and Git Flow discipline.

## Local Artifacts

- Benchmark summary JSON: `tmp/live-paper-quality-benchmark/paperrun-summary.json` (ignored by Git)
- Captured task output: `tmp/live-paper-quality-benchmark/task051-output.json` (ignored by Git)
- Toolchain smoke files: `tmp/live-paper-quality-benchmark/toolchain/` (ignored by Git)
- PaperRun artifacts: `.paper_fucker/runs/run-ee44237e-e1cc-40d5-abee-611dbc9a8222/` (ignored by Git)

## Residual Gate

The only remaining blocker is intentional: final export requires evidence that the reproduction gate passed. For this benchmark, reproduction remains `blocked`, so final export is correctly denied and forced draft export is clearly marked with failed checks.

