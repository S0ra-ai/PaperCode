# Strict Live Acceptance Report

- Generated: 2026-05-11T03:56:36.3072274+08:00
- Mode: strict-live-focused
- Full workspace suite: False
- Check timeout seconds: 300
- Status: passed

| Check | Status | Seconds | Detail |
| --- | --- | ---: | --- |
| `taskflow-validate-all` | pass | 1.035 | OK   task-045-report-path-hygiene OK   task-046-live-paper-quality-benchmark OK   task-047-strict-acceptance-timeouts OK   task-048-paperrun-completion-gates OK   task-049-export-pdf-renderer-fallback OK   task-050-default-observability-coverage OK   task-051-live-benchmark-regression-pass OK   task-052-remove-stub-leftovers OK   task-053-tui-provider-copy-cleanup OK   task-054-tracked-secret-example-cleanup  All tasks are valid. |
| `readme-changelog-version` | pass | 0.428 | README version 0.6.0-dev matches CHANGELOG latest version. |
| `tracked-secret-scan` | pass | 0.446 | no tracked sk-* API keys found |
| `server-tests` | pass | 74.846 | (pass) strict live acceptance script > does not assign reserved PowerShell variables (pass) strict live acceptance script > keeps strict live checks strict while allowing deterministic fixture tests (pass) strict live acceptance script > scans only tracked files for secrets and writes the markdown report (pass) strict live acceptance script > bounds each check and writes partial reports during execution (pass) strict live acceptance script > uses focused paper-critical tests by default with opt-... |
| `preview-tests` | pass | 7.156 | $ bun test --timeout 30000 bun test v1.3.13 (bf2e2cec)  test\preview.test.ts: (pass) preview server > serves token-protected read-only preview endpoints [15.00ms] (pass) preview server > cancels stale render jobs and keeps the newest markdown [32.00ms]   2 pass  0 fail  9 expect() calls Ran 2 tests across 1 file. [82.00ms] |
| `python-tests` | pass | 1.094 | ..... ---------------------------------------------------------------------- Ran 5 tests in 0.596s  OK |
| `server-typecheck` | pass | 10.648 | $ tsgo --noEmit |
| `workspace-typecheck` | pass | 12.069 | @opencode-ai/console-core:typecheck: cache hit, replaying logs d8052de696bec53a @opencode-ai/console-core:typecheck: $ tsgo --noEmit @opencode-ai/enterprise:typecheck: cache hit, replaying logs b0166dcb6e3c27f5 @opencode-ai/enterprise:typecheck: $ tsgo --noEmit @opencode-ai/console-app:typecheck: cache hit, replaying logs 3f030304c2a2acee @opencode-ai/console-app:typecheck: $ tsgo --noEmit paper_fucker:typecheck: $ tsgo --noEmit   Tasks:    13 successful, 13 total Cached:    12 cached, 13 total ... |
| `opencode-tui-smoke` | pass | 10.339 | local paper_fucker CLI help responded |
| `live-provider-call` | pass | 1.325 | provider deepseek model deepseek-v4-pro responded |
| `exa-live-search` | pass | 0.473 | Exa MCP remote initialize responded |
| `nature-skill-profile` | pass | 2.318 | nature-paper skill installed and official guidance reachable |
| `pandoc-conversion` | pass | 0.27 | pandoc generated acceptance.tex |
| `latex-pdf-generation` | pass | 1.501 | xelatex.exe generated acceptance-pdf.pdf |
| `docx-generation` | pass | 0.349 | pandoc generated acceptance-docx.docx |
| `topic-to-paper-live-run` | pass | 26.846 |   "project_version": "0.6.0-dev",   "run_id": "run-f79eb2b5-f6e3-4562-a9e6-b54b4494baab",   "status": "blocked",   "stages": 14,   "artifacts": 33,   "claims": 1,   "forced_export": "forced_draft",   "failed_checks": [     "reproduction_failure"   ],   "preview": "ready" } |
| `code-to-paper-live-run` | pass | 32.735 |   "project_version": "0.6.0-dev",   "run_id": "run-b6e6bd3b-85b2-480e-8e13-d8806f3bdd1c",   "status": "blocked",   "stages": 14,   "artifacts": 33,   "claims": 1,   "forced_export": "forced_draft",   "failed_checks": [     "reproduction_failure"   ],   "preview": "ready" } |
| `hard-fork-paper-core` | pass | 0.002 | paper core lives under packages/opencode/src/paper and no packages/server sidecar exists |
| `hard-fork-paperrun-api-tui` | pass | 0.006 | PaperRun API and TUI workbench are first-class paper surfaces |
| `hard-fork-agent-tree` | pass | 0.002 | Agent Tree supports nested multi-model agents with budget limits |
| `hard-fork-quality-egress` | pass | 0.002 | quality modes, private-first egress, forced draft, supplementary, and availability bundles are present |
| `hard-fork-public-branding` | pass | 0.005 | public logo, command registry, TUI home, sidebars, dashboard, and paper API expose Paper Fucker/PaperRun surfaces |
| `observability-audit-coverage` | pass | 0.003 | PaperRun diagnostics expose observability audit coverage for stage/capability/model/subagent/tool/egress/export/cost |
| `git-flow-cleanup` | pass | 0.092 | current branch feature/strict-live-run-evidence follows Git Flow and no codex/task branches remain |
