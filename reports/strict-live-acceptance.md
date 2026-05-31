# Strict Live Acceptance Report

- Generated: 2026-05-31T18:03:33.4741188+08:00
- Mode: strict-live-focused
- Full workspace suite: False
- Project version: 0.13.0.159-dev
- Check timeout seconds: 900
- Status: passed

| Check | Status | Seconds | Detail |
| --- | --- | ---: | --- |
| `taskflow-validate-all` | pass | 1.69 | OK   task-111-product-ux-acceptance OK   task-112-changelog-style-normalization OK   tui-copilot-model-workbench-routing OK   tui-json-parse-guard OK   tui-model-workspace-run-hardening OK   tui-models-depth-switcher-fix OK   tui-paper-workbench-surface OK   tui-prompt-tdz-crash-fix OK   tui-terminal-model-brand-hardening OK   visible-command-surface-audit  All tasks are valid. |
| `readme-changelog-version` | pass | 0.594 | README version 0.13.0.159-dev matches CHANGELOG latest version. |
| `development-docs-check` | pass | 2.419 | Development docs check passed for 16 HTML page(s) with render check. |
| `tracked-secret-scan` | pass | 0.864 | no tracked sk-* API keys found |
| `server-tests` | pass | 402.012 | (pass) strict live acceptance script > experiment runner does not invent container image or digest metadata (pass) strict live acceptance script > allows Git Flow feature and fix branches during active task work (pass) strict live acceptance script > autonomous audit does not count stale strict reports as current evidence (pass) strict live acceptance script > autonomous audit locks active and archived report governance (pass) strict live acceptance script > autonomous audit locks Paper Fucker visible command surface (pass) strict live acceptance script > autonomous audit locks PaperRun model routing boundaries (pass) strict live acceptance script > autonomous audit locks CJC heading format boundaries   40 pass  0 fail  374 expect() calls Ran 40 tests across 7 files. [392.70s] |
| `preview-tests` | pass | 9.114 | (pass) preview client render helpers > renders detailed cost, token, agent tree, and team state (pass) preview client render helpers > renders model routing decisions and blocked diagnostics  test\preview.test.ts: (pass) preview server > serves token-protected read-only preview endpoints (pass) preview server > cancels stale render jobs and keeps the newest markdown [32.00ms] (pass) preview server > pushes replacement snapshots to live preview subscribers   10 pass  0 fail  56 expect() calls Ran 10 tests across 2 files. [95.00ms] |
| `python-tests` | pass | 1.817 | ................... ---------------------------------------------------------------------- Ran 19 tests in 1.093s  OK |
| `server-typecheck` | pass | 13.651 | $ tsgo --noEmit |
| `workspace-typecheck` | pass | 15.184 | @opencode-ai/desktop:typecheck: cache hit, replaying logs e95529b6d0bb2c25 @opencode-ai/desktop:typecheck: $ tsgo -b @opencode-ai/slack:typecheck: cache hit, replaying logs 3b6b1ab8751cd02e @opencode-ai/slack:typecheck: $ tsgo --noEmit @opencode-ai/plugin:typecheck: cache hit, replaying logs a0fda9728d36ab2a @opencode-ai/plugin:typecheck: $ tsgo --noEmit paper_fucker:typecheck: $ tsgo --noEmit   Tasks:    13 successful, 13 total Cached:    12 cached, 13 total   Time:    5.61s   |
| `opencode-tui-smoke` | pass | 13.008 | local paper_fucker CLI help responded |
| `live-provider-call` | pass | 1.101 | provider deepseek model deepseek-v4-pro responded |
| `exa-live-search` | pass | 0.499 | Exa MCP remote initialize responded |
| `nature-skill-profile` | pass | 0.396 | nature-paper skill installed and official guidance reachable |
| `pandoc-conversion` | pass | 0.363 | pandoc generated acceptance.tex |
| `latex-pdf-generation` | pass | 1.94 | xelatex.exe generated acceptance-pdf.pdf |
| `docx-generation` | pass | 0.395 | pandoc generated acceptance-docx.docx |
| `live-preview-browser-smoke` | pass | 9.853 | # Live Preview Browser Smoke  - status: passed - generated_at: 2026-05-31 17:57:50 +08:00 - checks: token rejection, read-only write rejection, SSE snapshot refresh, browser shell render, browser snapshot read, experiment run summary, terminal trace summary, machine environment summary - output: {"status":"passed","port":60681,"checks":["token","readonly","sse","browser-dom","experiment-runs","terminal-traces","machine-environment"]} |
| `live-crawler-fetch` | pass | 5.543 | {"status": "fetched", "method": "urllib", "title": "Example Domain"} |
| `hf-live-research-loop` | pass | 14.545 | {"papers": 1, "jobs_mode": "blocked", "trackio_mode": "provided"} |
| `topic-to-paper-live-run` | pass | 87.052 | {   "summary_path": "tmp/live-paper-quality-benchmark/topic/paperrun-summary.json",   "scenario": "topic",   "project_version": "0.13.0.159-dev",   "run_id": "run-a8caf598-09ce-499f-aacb-1ec4aba64e60",   "status": "blocked",   "stages": 14,   "artifacts": 40,   "claims": 1,   "forced_export": "forced_draft",   "final_export": "blocked",   "failed_checks": [     "missing_verified_reference",     "unsupported_claim",     "reproduction_failure"   ],   "preview": "ready" } |
| `code-to-paper-live-run` | pass | 116.443 | {   "summary_path": "tmp/live-paper-quality-benchmark/code/paperrun-summary.json",   "scenario": "code",   "project_version": "0.13.0.159-dev",   "run_id": "run-7931f76f-d0c1-4d58-89bc-5a7df85b4600",   "status": "blocked",   "stages": 14,   "artifacts": 47,   "claims": 1,   "forced_export": "forced_draft",   "final_export": "blocked",   "failed_checks": [     "missing_verified_reference",     "reproduction_failure"   ],   "preview": "ready" } |
| `final-export-pass-run` | pass | 119.081 | {   "summary_path": "tmp/live-paper-quality-benchmark/final/paperrun-summary.json",   "scenario": "final",   "project_version": "0.13.0.159-dev",   "run_id": "run-45a00880-4090-4077-a021-2f098fb17bcf",   "status": "succeeded",   "stages": 14,   "artifacts": 42,   "claims": 1,   "forced_export": "forced_draft",   "final_export": "final",   "failed_checks": [],   "preview": "ready" } SourceEvidenceManifest.v1 final_gate=passed |
| `hard-fork-paper-core` | pass | 0.002 | paper core lives under packages/opencode/src/paper and no packages/server sidecar exists |
| `hard-fork-paperrun-api-tui` | pass | 0.005 | PaperRun API and TUI workbench are first-class paper surfaces |
| `hard-fork-agent-tree` | pass | 0.003 | Agent Tree supports nested multi-model agents with budget limits |
| `hard-fork-quality-egress` | pass | 0.004 | quality modes, private-first egress, forced draft, supplementary, and availability bundles are present |
| `hard-fork-public-branding` | pass | 0.008 | public logo, command registry, TUI home, sidebars, dashboard, and paper API expose Paper Fucker/PaperRun surfaces |
| `observability-audit-coverage` | pass | 0.004 | PaperRun diagnostics expose observability audit coverage for stage/capability/model/subagent/tool/egress/export/cost |
| `agent-team-capability-fusion` | pass | 0.007 | Agent Team, built-in capability packs, harness, memory, code understanding, crawler, and HF loop are fused |
| `paper-workbench-ux-sidebar` | pass | 0.004 | PaperRun workbench keeps cost/token/context/outline and PaperRun diagnostics visible |
| `hf-no-mock-boundary` | pass | 0.003 | HF product calls fail closed without authorized live access; test data requires an explicit test switch |
| `changelog-split-archives` | pass | 0.016 | TaskFlow changelog split preferences, one active root entry, and 0.1.x-0.7.x archives are present |
| `git-flow-cleanup` | pass | 0.117 | current branch fix/mcp-tool-binding-test-isolation follows Git Flow and no codex/task branches remain |
