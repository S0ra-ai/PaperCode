# Strict Live Acceptance Report

- Generated: 2026-05-11T10:40:56.1076698+08:00
- Mode: strict-live-focused
- Full workspace suite: False
- Check timeout seconds: 600
- Status: passed

| Check | Status | Seconds | Detail |
| --- | --- | ---: | --- |
| `taskflow-validate-all` | pass | 1.84 | OK   task-045-report-path-hygiene OK   task-046-live-paper-quality-benchmark OK   task-047-strict-acceptance-timeouts OK   task-048-paperrun-completion-gates OK   task-049-export-pdf-renderer-fallback OK   task-050-default-observability-coverage OK   task-051-live-benchmark-regression-pass OK   task-052-remove-stub-leftovers OK   task-053-tui-provider-copy-cleanup OK   task-054-tracked-secret-example-cleanup  All tasks are valid. |
| `readme-changelog-version` | pass | 0.758 | README version 0.8.3-dev matches CHANGELOG latest version. |
| `tracked-secret-scan` | pass | 1.79 | no tracked sk-* API keys found |
| `server-tests` | pass | 149.338 | (pass) strict live acceptance script > keeps strict live checks strict while allowing deterministic fixture tests (pass) strict live acceptance script > scans only tracked files for secrets and writes the markdown report (pass) strict live acceptance script > bounds each check and writes partial reports during execution (pass) strict live acceptance script > uses focused paper-critical tests by default with opt-in full workspace suite (pass) strict live acceptance script > checks Agent Team capability fusion and product no-mock boundaries (pass) strict live acceptance script > uses real PaperRun benchmark evidence for live topic and code checks (pass) strict live acceptance script > allows Git Flow feature and fix branches during active task work   23 pass  0 fail  164 expect() calls Ran 23 tests across 6 files. [137.67s] |
| `preview-tests` | pass | 12.143 | $ bun test --timeout 30000 bun test v1.3.13 (bf2e2cec)  test\preview.test.ts: (pass) preview server > serves token-protected read-only preview endpoints (pass) preview server > cancels stale render jobs and keeps the newest markdown [31.00ms]   2 pass  0 fail  9 expect() calls Ran 2 tests across 1 file. [83.00ms] |
| `python-tests` | pass | 2.537 | .................. ---------------------------------------------------------------------- Ran 18 tests in 1.462s  OK |
| `server-typecheck` | pass | 17.387 | $ tsgo --noEmit |
| `workspace-typecheck` | pass | 19.773 | @opencode-ai/console-app:typecheck: cache hit, replaying logs 2a40d9b06036b72d @opencode-ai/console-app:typecheck: $ tsgo --noEmit @opencode-ai/enterprise:typecheck: cache hit, replaying logs 103d7dd18f342ad6 @opencode-ai/enterprise:typecheck: $ tsgo --noEmit @opencode-ai/plugin:typecheck: cache hit, replaying logs 0b9f556e6360790a @opencode-ai/plugin:typecheck: $ tsgo --noEmit paper_fucker:typecheck: $ tsgo --noEmit   Tasks:    13 successful, 13 total Cached:    12 cached, 13 total   Time:    7.78s   |
| `opencode-tui-smoke` | pass | 16.135 | local paper_fucker CLI help responded |
| `live-provider-call` | pass | 1.54 | provider deepseek model deepseek-v4-pro responded |
| `exa-live-search` | pass | 0.375 | Exa MCP remote initialize responded |
| `nature-skill-profile` | pass | 3.014 | nature-paper skill installed and official guidance reachable |
| `pandoc-conversion` | pass | 0.431 | pandoc generated acceptance.tex |
| `latex-pdf-generation` | pass | 3.055 | xelatex.exe generated acceptance-pdf.pdf |
| `docx-generation` | pass | 0.512 | pandoc generated acceptance-docx.docx |
| `live-crawler-fetch` | pass | 6.084 | {"status": "fetched", "method": "urllib", "title": "Example Domain"} |
| `hf-live-research-loop` | pass | 8.165 | {"papers": 1, "jobs_mode": "blocked", "trackio_mode": "provided"} |
| `topic-to-paper-live-run` | pass | 65.007 |   "status": "blocked",   "stages": 14,   "artifacts": 33,   "claims": 1,   "forced_export": "forced_draft",   "final_export": "blocked",   "failed_checks": [     "unsupported_claim",     "reproduction_failure"   ],   "preview": "ready" } |
| `code-to-paper-live-run` | pass | 68.833 |   "status": "blocked",   "stages": 14,   "artifacts": 33,   "claims": 1,   "forced_export": "forced_draft",   "final_export": "blocked",   "failed_checks": [     "unsupported_claim",     "reproduction_failure"   ],   "preview": "ready" } |
| `final-export-pass-run` | pass | 76.732 |   "scenario": "final",   "project_version": "0.8.3-dev",   "run_id": "run-c0bf68de-d937-4d30-99b0-1e5456e1d2c1",   "status": "succeeded",   "stages": 14,   "artifacts": 35,   "claims": 1,   "forced_export": "forced_draft",   "final_export": "final",   "failed_checks": [],   "preview": "ready" } |
| `hard-fork-paper-core` | pass | 0.003 | paper core lives under packages/opencode/src/paper and no packages/server sidecar exists |
| `hard-fork-paperrun-api-tui` | pass | 0.006 | PaperRun API and TUI workbench are first-class paper surfaces |
| `hard-fork-agent-tree` | pass | 0.004 | Agent Tree supports nested multi-model agents with budget limits |
| `hard-fork-quality-egress` | pass | 0.004 | quality modes, private-first egress, forced draft, supplementary, and availability bundles are present |
| `hard-fork-public-branding` | pass | 0.009 | public logo, command registry, TUI home, sidebars, dashboard, and paper API expose Paper Fucker/PaperRun surfaces |
| `observability-audit-coverage` | pass | 0.009 | PaperRun diagnostics expose observability audit coverage for stage/capability/model/subagent/tool/egress/export/cost |
| `agent-team-capability-fusion` | pass | 0.01 | Agent Team, built-in capability packs, harness, memory, code understanding, crawler, and HF loop are fused |
| `paper-workbench-ux-sidebar` | pass | 0.006 | PaperRun workbench keeps cost/token/context/outline and PaperRun diagnostics visible |
| `hf-no-mock-boundary` | pass | 0.004 | HF product calls fail closed without authorized live access; fixture data is explicit only |
| `changelog-split-archives` | pass | 0.007 | TaskFlow changelog split preferences and 0.1.x archive are present |
| `git-flow-cleanup` | pass | 0.13 | current branch feature/product-closure-hardening follows Git Flow and no codex/task branches remain |
