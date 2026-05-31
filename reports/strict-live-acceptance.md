# Strict Live Acceptance Report

- Generated: 2026-05-31T18:39:27.9867150+08:00
- Mode: strict-live-focused
- Full workspace suite: False
- Project version: 0.13.0.160-dev
- Check timeout seconds: 900
- Status: passed

| Check | Status | Seconds | Detail |
| --- | --- | ---: | --- |
| `taskflow-validate-all` | pass | 1.685 | OK   task-111-product-ux-acceptance OK   task-112-changelog-style-normalization OK   tui-copilot-model-workbench-routing OK   tui-json-parse-guard OK   tui-model-workspace-run-hardening OK   tui-models-depth-switcher-fix OK   tui-paper-workbench-surface OK   tui-prompt-tdz-crash-fix OK   tui-terminal-model-brand-hardening OK   visible-command-surface-audit  All tasks are valid. |
| `readme-changelog-version` | pass | 0.576 | README version 0.13.0.160-dev matches CHANGELOG latest version. |
| `development-docs-check` | pass | 2.288 | Development docs check passed for 16 HTML page(s) with render check. |
| `tracked-secret-scan` | pass | 0.938 | no tracked sk-* API keys found |
| `server-tests` | pass | 402.546 | (pass) strict live acceptance script > experiment runner does not invent container image or digest metadata (pass) strict live acceptance script > allows Git Flow feature and fix branches during active task work (pass) strict live acceptance script > autonomous audit does not count stale strict reports as current evidence (pass) strict live acceptance script > autonomous audit locks active and archived report governance (pass) strict live acceptance script > autonomous audit locks PaperCode visible command surface (pass) strict live acceptance script > autonomous audit locks PaperRun model routing boundaries (pass) strict live acceptance script > autonomous audit locks CJC heading format boundaries   40 pass  0 fail  377 expect() calls Ran 40 tests across 7 files. [393.48s] |
| `preview-tests` | pass | 9.145 | (pass) preview client render helpers > renders detailed cost, token, agent tree, and team state (pass) preview client render helpers > renders model routing decisions and blocked diagnostics  test\preview.test.ts: (pass) preview server > serves token-protected read-only preview endpoints [16.00ms] (pass) preview server > cancels stale render jobs and keeps the newest markdown [31.00ms] (pass) preview server > pushes replacement snapshots to live preview subscribers   10 pass  0 fail  58 expect() calls Ran 10 tests across 2 files. [100.00ms] |
| `python-tests` | pass | 1.87 | ................... ---------------------------------------------------------------------- Ran 19 tests in 1.110s  OK |
| `server-typecheck` | pass | 15.021 | $ tsgo --noEmit |
| `workspace-typecheck` | pass | 15.641 | @opencode-ai/app:typecheck: cache hit, replaying logs 3497c541208eb20e @opencode-ai/app:typecheck: $ tsgo -b paper_fucker:typecheck: cache miss, executing 936e95abf89c5477 @opencode-ai/plugin:typecheck: cache hit, replaying logs de2893cd0ad1e5c5 @opencode-ai/plugin:typecheck: $ tsgo --noEmit @paper-fucker/preview:typecheck: $ tsgo --noEmit paper_fucker:typecheck: $ tsgo --noEmit   Tasks:    13 successful, 13 total Cached:    11 cached, 13 total   Time:    5.517s   |
| `opencode-tui-smoke` | pass | 12.696 | local paper_fucker CLI help responded |
| `live-provider-call` | pass | 1.369 | provider deepseek model deepseek-v4-pro responded |
| `exa-live-search` | pass | 0.679 | Exa MCP remote initialize responded |
| `nature-skill-profile` | pass | 0.302 | nature-paper skill installed and official guidance reachable |
| `pandoc-conversion` | pass | 0.385 | pandoc generated acceptance.tex |
| `latex-pdf-generation` | pass | 1.81 | xelatex.exe generated acceptance-pdf.pdf |
| `docx-generation` | pass | 0.38 | pandoc generated acceptance-docx.docx |
| `live-preview-browser-smoke` | pass | 9.991 | # Live Preview Browser Smoke  - status: passed - generated_at: 2026-05-31 18:34:01 +08:00 - checks: token rejection, read-only write rejection, SSE snapshot refresh, browser shell render, browser snapshot read, experiment run summary, terminal trace summary, machine environment summary - output: {"status":"passed","port":62821,"checks":["token","readonly","sse","browser-dom","experiment-runs","terminal-traces","machine-environment"]} |
| `live-crawler-fetch` | pass | 5.647 | {"status": "fetched", "method": "urllib", "title": "Example Domain"} |
| `hf-live-research-loop` | pass | 6.793 | {"papers": 1, "jobs_mode": "blocked", "trackio_mode": "provided"} |
| `topic-to-paper-live-run` | pass | 88.304 | {   "summary_path": "tmp/live-paper-quality-benchmark/topic/paperrun-summary.json",   "scenario": "topic",   "project_version": "0.13.0.160-dev",   "run_id": "run-a6351d87-38d7-45e2-bdcd-7d8e6105392a",   "status": "blocked",   "stages": 14,   "artifacts": 40,   "claims": 1,   "forced_export": "forced_draft",   "final_export": "blocked",   "failed_checks": [     "missing_verified_reference",     "unsupported_claim",     "reproduction_failure"   ],   "preview": "ready" } |
| `code-to-paper-live-run` | pass | 116.257 | {   "summary_path": "tmp/live-paper-quality-benchmark/code/paperrun-summary.json",   "scenario": "code",   "project_version": "0.13.0.160-dev",   "run_id": "run-6ea0eb0b-1fee-4329-bf06-183fe57303cc",   "status": "blocked",   "stages": 14,   "artifacts": 47,   "claims": 1,   "forced_export": "forced_draft",   "final_export": "blocked",   "failed_checks": [     "missing_verified_reference",     "reproduction_failure"   ],   "preview": "ready" } |
| `final-export-pass-run` | pass | 109.334 | {   "summary_path": "tmp/live-paper-quality-benchmark/final/paperrun-summary.json",   "scenario": "final",   "project_version": "0.13.0.160-dev",   "run_id": "run-7334dd65-03e1-4171-a820-0fd08c9495af",   "status": "succeeded",   "stages": 14,   "artifacts": 42,   "claims": 1,   "forced_export": "forced_draft",   "final_export": "final",   "failed_checks": [],   "preview": "ready" } SourceEvidenceManifest.v1 final_gate=passed |
| `hard-fork-paper-core` | pass | 0.003 | paper core lives under packages/opencode/src/paper and no packages/server sidecar exists |
| `hard-fork-paperrun-api-tui` | pass | 0.004 | PaperRun API and TUI workbench are first-class paper surfaces |
| `hard-fork-agent-tree` | pass | 0.004 | Agent Tree supports nested multi-model agents with budget limits |
| `hard-fork-quality-egress` | pass | 0.004 | quality modes, private-first egress, forced draft, supplementary, and availability bundles are present |
| `hard-fork-public-branding` | pass | 0.008 | public logo, command registry, TUI home, sidebars, dashboard, and paper API expose PaperCode/PaperRun surfaces |
| `observability-audit-coverage` | pass | 0.004 | PaperRun diagnostics expose observability audit coverage for stage/capability/model/subagent/tool/egress/export/cost |
| `agent-team-capability-fusion` | pass | 0.007 | Agent Team, built-in capability packs, harness, memory, code understanding, crawler, and HF loop are fused |
| `paper-workbench-ux-sidebar` | pass | 0.005 | PaperRun workbench keeps cost/token/context/outline and PaperRun diagnostics visible |
| `hf-no-mock-boundary` | pass | 0.003 | HF product calls fail closed without authorized live access; test data requires an explicit test switch |
| `changelog-split-archives` | pass | 0.016 | TaskFlow changelog split preferences, one active root entry, and 0.1.x-0.7.x archives are present |
| `git-flow-cleanup` | pass | 0.118 | current branch fix/mcp-tool-binding-test-isolation follows Git Flow and no codex/task branches remain |
