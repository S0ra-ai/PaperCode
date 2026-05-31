# Strict Live Acceptance Report

- Generated: 2026-05-11T09:52:17.5356687+08:00
- Mode: strict-live-full
- Full workspace suite: True
- Check timeout seconds: 600
- Status: passed

| Check | Status | Seconds | Detail |
| --- | --- | ---: | --- |
| `taskflow-validate-all` | pass | 3.19 | OK   task-045-report-path-hygiene OK   task-046-live-paper-quality-benchmark OK   task-047-strict-acceptance-timeouts OK   task-048-paperrun-completion-gates OK   task-049-export-pdf-renderer-fallback OK   task-050-default-observability-coverage OK   task-051-live-benchmark-regression-pass OK   task-052-remove-stub-leftovers OK   task-053-tui-provider-copy-cleanup OK   task-054-tracked-secret-example-cleanup  All tasks are valid. |
| `readme-changelog-version` | pass | 1.307 | README version 0.8.1-dev matches CHANGELOG latest version. |
| `tracked-secret-scan` | pass | 2.229 | no tracked sk-* API keys found |
| `server-tests` | pass | 1957.156 |   2 tests todo: (todo) 404 mapping for missing session > HttpApi /session/{missing}/todo returns 404 not 500 (todo) Instruction.resolve > fetches remote instructions from config URLs via HttpClient   2586 pass  38 skip  2 todo  0 fail  16 snapshots, 7757 expect() calls Ran 2626 tests across 248 files. [1937.74s] |
| `preview-tests` | pass | 14.13 | $ bun test --timeout 30000 bun test v1.3.13 (bf2e2cec)  test\preview.test.ts: (pass) preview server > serves token-protected read-only preview endpoints (pass) preview server > cancels stale render jobs and keeps the newest markdown [32.00ms]   2 pass  0 fail  9 expect() calls Ran 2 tests across 1 file. [79.00ms] |
| `python-tests` | pass | 3.463 | .................. ---------------------------------------------------------------------- Ran 18 tests in 1.549s  OK |
| `server-typecheck` | pass | 22.984 | $ tsgo --noEmit |
| `workspace-typecheck` | pass | 24.783 | @opencode-ai/console-app:typecheck: cache hit, replaying logs 53e5d5b3e8363eda @opencode-ai/console-app:typecheck: $ tsgo --noEmit @opencode-ai/plugin:typecheck: cache hit, replaying logs 0b9f556e6360790a @opencode-ai/plugin:typecheck: $ tsgo --noEmit @opencode-ai/console-function:typecheck: cache hit, replaying logs adfdc1becded7ae3 @opencode-ai/console-function:typecheck: $ tsgo --noEmit paper_fucker:typecheck: $ tsgo --noEmit   Tasks:    13 successful, 13 total Cached:    12 cached, 13 total   Time:    8.647s   |
| `opencode-tui-smoke` | pass | 21.28 | local paper_fucker CLI help responded |
| `live-provider-call` | pass | 1.558 | provider deepseek model deepseek-v4-pro responded |
| `exa-live-search` | pass | 0.334 | Exa MCP remote initialize responded |
| `nature-skill-profile` | pass | 3.758 | nature-paper skill installed and official guidance reachable |
| `pandoc-conversion` | pass | 0.864 | pandoc generated acceptance.tex |
| `latex-pdf-generation` | pass | 4.017 | xelatex.exe generated acceptance-pdf.pdf |
| `docx-generation` | pass | 0.632 | pandoc generated acceptance-docx.docx |
| `live-crawler-fetch` | pass | 6.538 | {"status": "fetched", "method": "urllib", "title": "Example Domain"} |
| `hf-live-research-loop` | pass | 7.966 | {"papers": 1, "jobs_mode": "blocked", "trackio_mode": "provided"} |
| `topic-to-paper-live-run` | pass | 71.397 |   "run_id": "run-2bd148ef-e575-4643-aeb2-844a356572d2",   "status": "blocked",   "stages": 14,   "artifacts": 33,   "claims": 1,   "forced_export": "forced_draft",   "final_export": "blocked",   "failed_checks": [     "reproduction_failure"   ],   "preview": "ready" } |
| `code-to-paper-live-run` | pass | 75.334 |   "run_id": "run-2171e037-4998-495f-abd0-5c7bf4a13531",   "status": "blocked",   "stages": 14,   "artifacts": 33,   "claims": 1,   "forced_export": "forced_draft",   "final_export": "blocked",   "failed_checks": [     "reproduction_failure"   ],   "preview": "ready" } |
| `final-export-pass-run` | pass | 86.643 |   "scenario": "final",   "project_version": "0.8.1-dev",   "run_id": "run-c529984e-02fb-44b1-a431-163b2a7b931f",   "status": "succeeded",   "stages": 14,   "artifacts": 34,   "claims": 1,   "forced_export": "forced_draft",   "final_export": "final",   "failed_checks": [],   "preview": "ready" } |
| `hard-fork-paper-core` | pass | 0.004 | paper core lives under packages/opencode/src/paper and no packages/server sidecar exists |
| `hard-fork-paperrun-api-tui` | pass | 0.008 | PaperRun API and TUI workbench are first-class paper surfaces |
| `hard-fork-agent-tree` | pass | 0.005 | Agent Tree supports nested multi-model agents with budget limits |
| `hard-fork-quality-egress` | pass | 0.006 | quality modes, private-first egress, forced draft, supplementary, and availability bundles are present |
| `hard-fork-public-branding` | pass | 0.014 | public logo, command registry, TUI home, sidebars, dashboard, and paper API expose Paper Fucker/PaperRun surfaces |
| `observability-audit-coverage` | pass | 0.011 | PaperRun diagnostics expose observability audit coverage for stage/capability/model/subagent/tool/egress/export/cost |
| `agent-team-capability-fusion` | pass | 0.012 | Agent Team, built-in capability packs, harness, memory, code understanding, crawler, and HF loop are fused |
| `paper-workbench-ux-sidebar` | pass | 0.011 | PaperRun workbench keeps cost/token/context/outline and PaperRun diagnostics visible |
| `hf-no-mock-boundary` | pass | 0.006 | HF product calls fail closed without authorized live access; fixture data is explicit only |
| `changelog-split-archives` | pass | 0.01 | TaskFlow changelog split preferences and 0.1.x archive are present |
| `git-flow-cleanup` | pass | 0.163 | current branch feature/full-workspace-acceptance follows Git Flow and no codex/task branches remain |
