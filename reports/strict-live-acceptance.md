# Strict Live Acceptance Report

- Generated: 2026-05-11T11:44:59.4594782+08:00
- Mode: strict-live-focused
- Full workspace suite: False
- Check timeout seconds: 300
- Status: passed

| Check | Status | Seconds | Detail |
| --- | --- | ---: | --- |
| `taskflow-validate-all` | pass | 1.538 | OK   task-045-report-path-hygiene OK   task-046-live-paper-quality-benchmark OK   task-047-strict-acceptance-timeouts OK   task-048-paperrun-completion-gates OK   task-049-export-pdf-renderer-fallback OK   task-050-default-observability-coverage OK   task-051-live-benchmark-regression-pass OK   task-052-remove-stub-leftovers OK   task-053-tui-provider-copy-cleanup OK   task-054-tracked-secret-example-cleanup  All tasks are valid. |
| `readme-changelog-version` | pass | 0.54 | README version 0.8.4-dev matches CHANGELOG latest version. |
| `tracked-secret-scan` | pass | 1.886 | no tracked sk-* API keys found |
| `server-tests` | pass | 151.93 | (pass) strict live acceptance script > keeps strict live checks strict while allowing deterministic fixture tests (pass) strict live acceptance script > scans only tracked files for secrets and writes the markdown report (pass) strict live acceptance script > bounds each check and writes partial reports during execution (pass) strict live acceptance script > uses focused paper-critical tests by default with opt-in full workspace suite (pass) strict live acceptance script > checks Agent Team capability fusion and product no-mock boundaries (pass) strict live acceptance script > uses real PaperRun benchmark evidence for live topic and code checks (pass) strict live acceptance script > allows Git Flow feature and fix branches during active task work   24 pass  0 fail  175 expect() calls Ran 24 tests across 7 files. [140.18s] |
| `preview-tests` | pass | 14.045 | $ bun test --timeout 30000 bun test v1.3.13 (bf2e2cec)  test\preview.test.ts: (pass) preview server > serves token-protected read-only preview endpoints (pass) preview server > cancels stale render jobs and keeps the newest markdown [31.00ms]   2 pass  0 fail  9 expect() calls Ran 2 tests across 1 file. [80.00ms] |
| `python-tests` | pass | 2.733 | .................. ---------------------------------------------------------------------- Ran 18 tests in 1.449s  OK |
| `server-typecheck` | pass | 17.429 | $ tsgo --noEmit |
| `workspace-typecheck` | pass | 19.491 | @opencode-ai/console-core:typecheck: cache hit, replaying logs 355d2197ea9786ab @opencode-ai/console-core:typecheck: $ tsgo --noEmit @opencode-ai/sdk:typecheck: cache hit, replaying logs 9ac1d35952ee4299 @opencode-ai/sdk:typecheck: $ tsgo --noEmit @paper-fucker/preview:typecheck: cache hit, replaying logs 35d181cf5889d108 @paper-fucker/preview:typecheck: $ tsgo --noEmit paper_fucker:typecheck: $ tsgo --noEmit   Tasks:    13 successful, 13 total Cached:    12 cached, 13 total   Time:    7.724s   |
| `opencode-tui-smoke` | pass | 17.136 | local paper_fucker CLI help responded |
| `live-provider-call` | pass | 1.667 | provider deepseek model deepseek-v4-pro responded |
| `exa-live-search` | pass | 1.4 | Exa MCP remote initialize responded |
| `nature-skill-profile` | pass | 3.333 | nature-paper skill installed and official guidance reachable |
| `pandoc-conversion` | pass | 0.495 | pandoc generated acceptance.tex |
| `latex-pdf-generation` | pass | 3.628 | xelatex.exe generated acceptance-pdf.pdf |
| `docx-generation` | pass | 0.592 | pandoc generated acceptance-docx.docx |
| `live-crawler-fetch` | pass | 6.817 | {"status": "fetched", "method": "urllib", "title": "Example Domain"} |
| `hf-live-research-loop` | pass | 7.253 | {"papers": 1, "jobs_mode": "blocked", "trackio_mode": "provided"} |
| `topic-to-paper-live-run` | pass | 82.622 | {   "summary_path": "tmp/live-paper-quality-benchmark/topic/paperrun-summary.json",   "scenario": "topic",   "project_version": "0.8.4-dev",   "run_id": "run-b3166e8b-efe6-4149-8930-8ec2cbe56294",   "status": "blocked",   "stages": 14,   "artifacts": 33,   "claims": 1,   "forced_export": "forced_draft",   "final_export": "blocked",   "failed_checks": [     "unsupported_claim",     "reproduction_failure"   ],   "preview": "ready" } |
| `code-to-paper-live-run` | pass | 90.039 | {   "summary_path": "tmp/live-paper-quality-benchmark/code/paperrun-summary.json",   "scenario": "code",   "project_version": "0.8.4-dev",   "run_id": "run-e8bf1a53-acf5-49c6-8cd8-9367f3dee142",   "status": "blocked",   "stages": 14,   "artifacts": 33,   "claims": 1,   "forced_export": "forced_draft",   "final_export": "blocked",   "failed_checks": [     "unsupported_claim",     "reproduction_failure"   ],   "preview": "ready" } |
| `final-export-pass-run` | pass | 101.333 | {   "summary_path": "tmp/live-paper-quality-benchmark/final/paperrun-summary.json",   "scenario": "final",   "project_version": "0.8.4-dev",   "run_id": "run-4052155d-6c9b-451e-b69c-8db3d329925f",   "status": "succeeded",   "stages": 14,   "artifacts": 35,   "claims": 1,   "forced_export": "forced_draft",   "final_export": "final",   "failed_checks": [],   "preview": "ready" } SourceEvidenceManifest.v1 final_gate=passed |
| `hard-fork-paper-core` | pass | 0.003 | paper core lives under packages/opencode/src/paper and no packages/server sidecar exists |
| `hard-fork-paperrun-api-tui` | pass | 0.007 | PaperRun API and TUI workbench are first-class paper surfaces |
| `hard-fork-agent-tree` | pass | 0.004 | Agent Tree supports nested multi-model agents with budget limits |
| `hard-fork-quality-egress` | pass | 0.006 | quality modes, private-first egress, forced draft, supplementary, and availability bundles are present |
| `hard-fork-public-branding` | pass | 0.018 | public logo, command registry, TUI home, sidebars, dashboard, and paper API expose Paper Fucker/PaperRun surfaces |
| `observability-audit-coverage` | pass | 0.008 | PaperRun diagnostics expose observability audit coverage for stage/capability/model/subagent/tool/egress/export/cost |
| `agent-team-capability-fusion` | pass | 0.011 | Agent Team, built-in capability packs, harness, memory, code understanding, crawler, and HF loop are fused |
| `paper-workbench-ux-sidebar` | pass | 0.008 | PaperRun workbench keeps cost/token/context/outline and PaperRun diagnostics visible |
| `hf-no-mock-boundary` | pass | 0.005 | HF product calls fail closed without authorized live access; fixture data is explicit only |
| `changelog-split-archives` | pass | 0.008 | TaskFlow changelog split preferences and 0.1.x archive are present |
| `git-flow-cleanup` | pass | 0.151 | current branch feature/source-gate-acceptance-lock follows Git Flow and no codex/task branches remain |
