# Strict Live Acceptance Report

- Generated: 2026-05-11T05:25:29.1027617+08:00
- Mode: fixture
- Full workspace suite: False
- Check timeout seconds: 120
- Status: passed

| Check | Status | Seconds | Detail |
| --- | --- | ---: | --- |
| `taskflow-validate-all` | pass | 1.124 | OK   task-045-report-path-hygiene OK   task-046-live-paper-quality-benchmark OK   task-047-strict-acceptance-timeouts OK   task-048-paperrun-completion-gates OK   task-049-export-pdf-renderer-fallback OK   task-050-default-observability-coverage OK   task-051-live-benchmark-regression-pass OK   task-052-remove-stub-leftovers OK   task-053-tui-provider-copy-cleanup OK   task-054-tracked-secret-example-cleanup  All tasks are valid. |
| `readme-changelog-version` | pass | 0.423 | README version 0.6.6-dev matches CHANGELOG latest version. |
| `tracked-secret-scan` | pass | 0.445 | no tracked sk-* API keys found |
| `server-tests` | pass | 86.666 | (pass) strict live acceptance script > keeps strict live checks strict while allowing deterministic fixture tests (pass) strict live acceptance script > scans only tracked files for secrets and writes the markdown report (pass) strict live acceptance script > bounds each check and writes partial reports during execution (pass) strict live acceptance script > uses focused paper-critical tests by default with opt-in full workspace suite (pass) strict live acceptance script > checks Agent Team capa... |
| `preview-tests` | pass | 7.062 | $ bun test --timeout 30000 bun test v1.3.13 (bf2e2cec)  test\preview.test.ts: (pass) preview server > serves token-protected read-only preview endpoints [16.00ms] (pass) preview server > cancels stale render jobs and keeps the newest markdown [31.00ms]   2 pass  0 fail  9 expect() calls Ran 2 tests across 1 file. [84.00ms] |
| `python-tests` | pass | 1.046 | .............. ---------------------------------------------------------------------- Ran 14 tests in 0.539s  OK |
| `server-typecheck` | pass | 10.628 | $ tsgo --noEmit |
| `workspace-typecheck` | pass | 8.044 | @opencode-ai/enterprise:typecheck: $ tsgo --noEmit @paper-fucker/preview:typecheck: cache hit, replaying logs 35d181cf5889d108 @paper-fucker/preview:typecheck: $ tsgo --noEmit @opencode-ai/console-function:typecheck: cache hit, replaying logs 4430b5a6af737989 @opencode-ai/console-function:typecheck: $ tsgo --noEmit @opencode-ai/ui:typecheck: cache hit, replaying logs 2718401f082ec25a @opencode-ai/ui:typecheck: $ tsgo --noEmit   Tasks:    13 successful, 13 total Cached:    13 cached, 13 total   T... |
| `opencode-tui-smoke` | pass | 9.945 | local paper_fucker CLI help responded |
| `live-provider-call` | pass | 0.002 | fixture live-provider-call: deepseek/deepseek-v4-pro |
| `exa-live-search` | pass | 0.001 | fixture exa-live-search: mcp initialize |
| `nature-skill-profile` | pass | 0.003 | nature-paper skill installed and official guidance reachable |
| `pandoc-conversion` | pass | 0.264 | pandoc generated acceptance.tex |
| `latex-pdf-generation` | pass | 1.485 | xelatex.exe generated acceptance-pdf.pdf |
| `docx-generation` | pass | 0.284 | pandoc generated acceptance-docx.docx |
| `topic-to-paper-live-run` | pass | 32.895 |   "project_version": "0.6.6-dev",   "run_id": "run-11c5c65d-5ad6-4003-90b4-65915c85a196",   "status": "blocked",   "stages": 14,   "artifacts": 33,   "claims": 1,   "forced_export": "forced_draft",   "failed_checks": [     "reproduction_failure"   ],   "preview": "ready" } |
| `code-to-paper-live-run` | pass | 37.176 |   "project_version": "0.6.6-dev",   "run_id": "run-3b83ab37-4689-481f-85a4-59f2d90da351",   "status": "blocked",   "stages": 14,   "artifacts": 33,   "claims": 1,   "forced_export": "forced_draft",   "failed_checks": [     "reproduction_failure"   ],   "preview": "ready" } |
| `hard-fork-paper-core` | pass | 0.002 | paper core lives under packages/opencode/src/paper and no packages/server sidecar exists |
| `hard-fork-paperrun-api-tui` | pass | 0.006 | PaperRun API and TUI workbench are first-class paper surfaces |
| `hard-fork-agent-tree` | pass | 0.002 | Agent Tree supports nested multi-model agents with budget limits |
| `hard-fork-quality-egress` | pass | 0.002 | quality modes, private-first egress, forced draft, supplementary, and availability bundles are present |
| `hard-fork-public-branding` | pass | 0.008 | public logo, command registry, TUI home, sidebars, dashboard, and paper API expose Paper Fucker/PaperRun surfaces |
| `observability-audit-coverage` | pass | 0.003 | PaperRun diagnostics expose observability audit coverage for stage/capability/model/subagent/tool/egress/export/cost |
| `agent-team-capability-fusion` | pass | 0.008 | Agent Team, built-in capability packs, harness, memory, code understanding, crawler, and HF loop are fused |
| `paper-workbench-ux-sidebar` | pass | 0.003 | PaperRun workbench keeps cost/token/context/outline and PaperRun diagnostics visible |
| `hf-no-mock-boundary` | pass | 0.002 | HF product calls fail closed without authorized live access; fixture data is explicit only |
| `changelog-split-archives` | pass | 0.004 | TaskFlow changelog split preferences and 0.1.x archive are present |
| `git-flow-cleanup` | pass | 0.096 | current branch feature/agent-team-capability-acceptance follows Git Flow and no codex/task branches remain |
