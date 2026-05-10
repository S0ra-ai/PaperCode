# Strict Live Acceptance Report

- Generated: 2026-05-11T04:00:41.5349345+08:00
- Mode: strict-live-focused
- Full workspace suite: False
- Check timeout seconds: 300
- Status: passed

| Check | Status | Seconds | Detail |
| --- | --- | ---: | --- |
| `taskflow-validate-all` | pass | 1.051 | OK   task-045-report-path-hygiene OK   task-046-live-paper-quality-benchmark OK   task-047-strict-acceptance-timeouts OK   task-048-paperrun-completion-gates OK   task-049-export-pdf-renderer-fallback OK   task-050-default-observability-coverage OK   task-051-live-benchmark-regression-pass OK   task-052-remove-stub-leftovers OK   task-053-tui-provider-copy-cleanup OK   task-054-tracked-secret-example-cleanup  All tasks are valid. |
| `readme-changelog-version` | pass | 0.42 | README version 0.6.1-dev matches CHANGELOG latest version. |
| `tracked-secret-scan` | pass | 0.465 | no tracked sk-* API keys found |
| `server-tests` | pass | 74.133 | (pass) strict live acceptance script > does not assign reserved PowerShell variables (pass) strict live acceptance script > keeps strict live checks strict while allowing deterministic fixture tests (pass) strict live acceptance script > scans only tracked files for secrets and writes the markdown report (pass) strict live acceptance script > bounds each check and writes partial reports during execution (pass) strict live acceptance script > uses focused paper-critical tests by default with opt-... |
| `preview-tests` | pass | 7.661 | $ bun test --timeout 30000 bun test v1.3.13 (bf2e2cec)  test\preview.test.ts: (pass) preview server > serves token-protected read-only preview endpoints [16.00ms] (pass) preview server > cancels stale render jobs and keeps the newest markdown [31.00ms]   2 pass  0 fail  9 expect() calls Ran 2 tests across 1 file. [85.00ms] |
| `python-tests` | pass | 1.005 | ..... ---------------------------------------------------------------------- Ran 5 tests in 0.527s  OK |
| `server-typecheck` | pass | 10.823 | $ tsgo --noEmit |
| `workspace-typecheck` | pass | 11.744 | @opencode-ai/plugin:typecheck: cache hit, replaying logs 25c3095085c25995 @opencode-ai/plugin:typecheck: $ tsgo --noEmit @opencode-ai/enterprise:typecheck: cache hit, replaying logs cfb515b6e5c9396e @opencode-ai/enterprise:typecheck: $ tsgo --noEmit @opencode-ai/console-function:typecheck: cache hit, replaying logs 4430b5a6af737989 @opencode-ai/console-function:typecheck: $ tsgo --noEmit paper_fucker:typecheck: $ tsgo --noEmit   Tasks:    13 successful, 13 total Cached:    12 cached, 13 total   ... |
| `opencode-tui-smoke` | pass | 9.835 | local paper_fucker CLI help responded |
| `live-provider-call` | pass | 2.006 | provider deepseek model deepseek-v4-pro responded |
| `exa-live-search` | pass | 0.436 | Exa MCP remote initialize responded |
| `nature-skill-profile` | pass | 2.293 | nature-paper skill installed and official guidance reachable |
| `pandoc-conversion` | pass | 0.262 | pandoc generated acceptance.tex |
| `latex-pdf-generation` | pass | 1.624 | xelatex.exe generated acceptance-pdf.pdf |
| `docx-generation` | pass | 0.325 | pandoc generated acceptance-docx.docx |
| `topic-to-paper-live-run` | pass | 27.464 |   "project_version": "0.6.1-dev",   "run_id": "run-fd655479-2f22-459c-a219-50125e585c24",   "status": "blocked",   "stages": 14,   "artifacts": 33,   "claims": 1,   "forced_export": "forced_draft",   "failed_checks": [     "reproduction_failure"   ],   "preview": "ready" } |
| `code-to-paper-live-run` | pass | 32.157 |   "project_version": "0.6.1-dev",   "run_id": "run-654eb78f-1e2f-4bac-9ae8-e6c30946a9f2",   "status": "blocked",   "stages": 14,   "artifacts": 33,   "claims": 1,   "forced_export": "forced_draft",   "failed_checks": [     "reproduction_failure"   ],   "preview": "ready" } |
| `hard-fork-paper-core` | pass | 0.002 | paper core lives under packages/opencode/src/paper and no packages/server sidecar exists |
| `hard-fork-paperrun-api-tui` | pass | 0.003 | PaperRun API and TUI workbench are first-class paper surfaces |
| `hard-fork-agent-tree` | pass | 0.004 | Agent Tree supports nested multi-model agents with budget limits |
| `hard-fork-quality-egress` | pass | 0.002 | quality modes, private-first egress, forced draft, supplementary, and availability bundles are present |
| `hard-fork-public-branding` | pass | 0.005 | public logo, command registry, TUI home, sidebars, dashboard, and paper API expose Paper Fucker/PaperRun surfaces |
| `observability-audit-coverage` | pass | 0.002 | PaperRun diagnostics expose observability audit coverage for stage/capability/model/subagent/tool/egress/export/cost |
| `git-flow-cleanup` | pass | 0.097 | current branch feature/strict-live-run-evidence follows Git Flow and no codex/task branches remain |
