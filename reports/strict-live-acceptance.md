# Strict Live Acceptance Report

- Generated: 2026-05-11T06:19:44.1768228+08:00
- Mode: strict-live-focused
- Full workspace suite: False
- Check timeout seconds: 240
- Status: passed

| Check | Status | Seconds | Detail |
| --- | --- | ---: | --- |
| `taskflow-validate-all` | pass | 1.623 | OK   task-045-report-path-hygiene OK   task-046-live-paper-quality-benchmark OK   task-047-strict-acceptance-timeouts OK   task-048-paperrun-completion-gates OK   task-049-export-pdf-renderer-fallback OK   task-050-default-observability-coverage OK   task-051-live-benchmark-regression-pass OK   task-052-remove-stub-leftovers OK   task-053-tui-provider-copy-cleanup OK   task-054-tracked-secret-example-cleanup  All tasks are valid. |
| `readme-changelog-version` | pass | 0.606 | README version 0.8.0-dev matches CHANGELOG latest version. |
| `tracked-secret-scan` | pass | 0.542 | no tracked sk-* API keys found |
| `server-tests` | pass | 142.506 | (pass) strict live acceptance script > keeps strict live checks strict while allowing deterministic fixture tests (pass) strict live acceptance script > scans only tracked files for secrets and writes the markdown report (pass) strict live acceptance script > bounds each check and writes partial reports during execution (pass) strict live acceptance script > uses focused paper-critical tests by default with opt-in full workspace suite (pass) strict live acceptance script > checks Agent Team capa... |
| `preview-tests` | pass | 12.07 | $ bun test --timeout 30000 bun test v1.3.13 (bf2e2cec)  test\preview.test.ts: (pass) preview server > serves token-protected read-only preview endpoints (pass) preview server > cancels stale render jobs and keeps the newest markdown [32.00ms]   2 pass  0 fail  9 expect() calls Ran 2 tests across 1 file. [82.00ms] |
| `python-tests` | pass | 2.089 | .................. ---------------------------------------------------------------------- Ran 18 tests in 1.317s  OK |
| `server-typecheck` | pass | 16.659 | $ tsgo --noEmit |
| `workspace-typecheck` | pass | 19.132 | @opencode-ai/sdk:typecheck: cache hit, replaying logs 9ac1d35952ee4299 @opencode-ai/sdk:typecheck: $ tsgo --noEmit @opencode-ai/app:typecheck: cache hit, replaying logs 66061008c0855405 @opencode-ai/app:typecheck: $ tsgo -b @opencode-ai/ui:typecheck: cache hit, replaying logs 2718401f082ec25a @opencode-ai/ui:typecheck: $ tsgo --noEmit paper_fucker:typecheck: $ tsgo --noEmit   Tasks:    13 successful, 13 total Cached:    12 cached, 13 total   Time:    5.618s   |
| `opencode-tui-smoke` | pass | 15.525 | local paper_fucker CLI help responded |
| `live-provider-call` | pass | 1.235 | provider deepseek model deepseek-v4-pro responded |
| `exa-live-search` | pass | 0.334 | Exa MCP remote initialize responded |
| `nature-skill-profile` | pass | 3.062 | nature-paper skill installed and official guidance reachable |
| `pandoc-conversion` | pass | 0.413 | pandoc generated acceptance.tex |
| `latex-pdf-generation` | pass | 2.302 | xelatex.exe generated acceptance-pdf.pdf |
| `docx-generation` | pass | 0.406 | pandoc generated acceptance-docx.docx |
| `live-crawler-fetch` | pass | 5.451 | {"status": "fetched", "method": "urllib", "title": "Example Domain"} |
| `hf-live-research-loop` | pass | 7.326 | {"papers": 1, "jobs_mode": "blocked", "trackio_mode": "provided"} |
| `topic-to-paper-live-run` | pass | 58.897 |   "run_id": "run-c9219cf1-1a27-4a99-a6ce-f3a3ad288b97",   "status": "blocked",   "stages": 14,   "artifacts": 33,   "claims": 1,   "forced_export": "forced_draft",   "final_export": "blocked",   "failed_checks": [     "reproduction_failure"   ],   "preview": "ready" } |
| `code-to-paper-live-run` | pass | 64.258 |   "run_id": "run-fc9674fd-459a-4f9b-83b8-3600cc978321",   "status": "blocked",   "stages": 14,   "artifacts": 33,   "claims": 1,   "forced_export": "forced_draft",   "final_export": "blocked",   "failed_checks": [     "reproduction_failure"   ],   "preview": "ready" } |
| `final-export-pass-run` | pass | 73.385 |   "scenario": "final",   "project_version": "0.8.0-dev",   "run_id": "run-2cbfb292-cbfa-4e94-85eb-c7e7f907d635",   "status": "succeeded",   "stages": 14,   "artifacts": 34,   "claims": 1,   "forced_export": "forced_draft",   "final_export": "final",   "failed_checks": [],   "preview": "ready" } |
| `hard-fork-paper-core` | pass | 0.004 | paper core lives under packages/opencode/src/paper and no packages/server sidecar exists |
| `hard-fork-paperrun-api-tui` | pass | 0.005 | PaperRun API and TUI workbench are first-class paper surfaces |
| `hard-fork-agent-tree` | pass | 0.004 | Agent Tree supports nested multi-model agents with budget limits |
| `hard-fork-quality-egress` | pass | 0.004 | quality modes, private-first egress, forced draft, supplementary, and availability bundles are present |
| `hard-fork-public-branding` | pass | 0.01 | public logo, command registry, TUI home, sidebars, dashboard, and paper API expose Paper Fucker/PaperRun surfaces |
| `observability-audit-coverage` | pass | 0.012 | PaperRun diagnostics expose observability audit coverage for stage/capability/model/subagent/tool/egress/export/cost |
| `agent-team-capability-fusion` | pass | 0.011 | Agent Team, built-in capability packs, harness, memory, code understanding, crawler, and HF loop are fused |
| `paper-workbench-ux-sidebar` | pass | 0.005 | PaperRun workbench keeps cost/token/context/outline and PaperRun diagnostics visible |
| `hf-no-mock-boundary` | pass | 0.004 | HF product calls fail closed without authorized live access; fixture data is explicit only |
| `changelog-split-archives` | pass | 0.005 | TaskFlow changelog split preferences and 0.1.x archive are present |
| `git-flow-cleanup` | pass | 0.132 | current branch feature/live-product-closure follows Git Flow and no codex/task branches remain |
