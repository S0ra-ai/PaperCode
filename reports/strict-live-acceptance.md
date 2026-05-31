# Strict Live Acceptance Report

- Generated: 2026-05-31T16:58:58.0032752+08:00
- Mode: strict-live-focused
- Full workspace suite: False
- Project version: 0.13.0.158-dev
- Check timeout seconds: 900
- Status: passed

| Check | Status | Seconds | Detail |
| --- | --- | ---: | --- |
| `taskflow-validate-all` | pass | 1.746 | OK   task-111-product-ux-acceptance OK   task-112-changelog-style-normalization OK   tui-copilot-model-workbench-routing OK   tui-json-parse-guard OK   tui-model-workspace-run-hardening OK   tui-models-depth-switcher-fix OK   tui-paper-workbench-surface OK   tui-prompt-tdz-crash-fix OK   tui-terminal-model-brand-hardening OK   visible-command-surface-audit  All tasks are valid. |
| `readme-changelog-version` | pass | 0.572 | README version 0.13.0.158-dev matches CHANGELOG latest version. |
| `development-docs-check` | pass | 2.322 | Development docs check passed for 16 HTML page(s) with render check. |
| `tracked-secret-scan` | pass | 0.865 | no tracked sk-* API keys found |
| `server-tests` | pass | 400.881 | (pass) strict live acceptance script > live benchmark discovers arXiv sources instead of pinning a fake locator (pass) strict live acceptance script > experiment runner does not invent container image or digest metadata (pass) strict live acceptance script > allows Git Flow feature and fix branches during active task work (pass) strict live acceptance script > autonomous audit does not count stale strict reports as current evidence (pass) strict live acceptance script > autonomous audit locks active and archived report governance (pass) strict live acceptance script > autonomous audit locks Paper Fucker visible command surface (pass) strict live acceptance script > autonomous audit locks PaperRun model routing boundaries   39 pass  0 fail  364 expect() calls Ran 39 tests across 7 files. [391.80s] |
| `preview-tests` | pass | 9.172 | (pass) preview client render helpers > renders detailed cost, token, agent tree, and team state (pass) preview client render helpers > renders model routing decisions and blocked diagnostics  test\preview.test.ts: (pass) preview server > serves token-protected read-only preview endpoints [15.00ms] (pass) preview server > cancels stale render jobs and keeps the newest markdown [31.00ms] (pass) preview server > pushes replacement snapshots to live preview subscribers [16.00ms]   10 pass  0 fail  56 expect() calls Ran 10 tests across 2 files. [104.00ms] |
| `python-tests` | pass | 1.83 | ................... ---------------------------------------------------------------------- Ran 19 tests in 1.095s  OK |
| `server-typecheck` | pass | 13.915 | $ tsgo --noEmit |
| `workspace-typecheck` | pass | 15.328 | @opencode-ai/desktop:typecheck: cache hit, replaying logs 160f26cfc2a17e13 @opencode-ai/desktop:typecheck: $ tsgo -b @opencode-ai/sdk:typecheck: cache hit, replaying logs 49958a25a80feccd @opencode-ai/sdk:typecheck: $ tsgo --noEmit @opencode-ai/console-function:typecheck: cache hit, replaying logs f87e7dd4b24e5434 @opencode-ai/console-function:typecheck: $ tsgo --noEmit paper_fucker:typecheck: $ tsgo --noEmit   Tasks:    13 successful, 13 total Cached:    12 cached, 13 total   Time:    5.608s   |
| `opencode-tui-smoke` | pass | 13.301 | local paper_fucker CLI help responded |
| `live-provider-call` | pass | 1.379 | provider deepseek model deepseek-v4-pro responded |
| `exa-live-search` | pass | 0.643 | Exa MCP remote initialize responded |
| `nature-skill-profile` | pass | 0.396 | nature-paper skill installed and official guidance reachable |
| `pandoc-conversion` | pass | 0.384 | pandoc generated acceptance.tex |
| `latex-pdf-generation` | pass | 1.878 | xelatex.exe generated acceptance-pdf.pdf |
| `docx-generation` | pass | 0.374 | pandoc generated acceptance-docx.docx |
| `live-preview-browser-smoke` | pass | 9.626 | # Live Preview Browser Smoke  - status: passed - generated_at: 2026-05-31 16:53:40 +08:00 - checks: token rejection, read-only write rejection, SSE snapshot refresh, browser shell render, browser snapshot read, experiment run summary, terminal trace summary, machine environment summary - output: {"status":"passed","port":63472,"checks":["token","readonly","sse","browser-dom","experiment-runs","terminal-traces","machine-environment"]} |
| `live-crawler-fetch` | pass | 5.597 | {"status": "fetched", "method": "urllib", "title": "Example Domain"} |
| `hf-live-research-loop` | pass | 6.94 | {"papers": 1, "jobs_mode": "blocked", "trackio_mode": "provided"} |
| `topic-to-paper-live-run` | pass | 85.746 | {   "summary_path": "tmp/live-paper-quality-benchmark/topic/paperrun-summary.json",   "scenario": "topic",   "project_version": "0.13.0.158-dev",   "run_id": "run-03be99bc-d9ad-4461-81f4-850a5639d624",   "status": "blocked",   "stages": 14,   "artifacts": 40,   "claims": 1,   "forced_export": "forced_draft",   "final_export": "blocked",   "failed_checks": [     "missing_verified_reference",     "unsupported_claim",     "reproduction_failure"   ],   "preview": "ready" } |
| `code-to-paper-live-run` | pass | 115.408 | {   "summary_path": "tmp/live-paper-quality-benchmark/code/paperrun-summary.json",   "scenario": "code",   "project_version": "0.13.0.158-dev",   "run_id": "run-a6521a5b-a077-46ee-b650-4ceb91ce4b93",   "status": "blocked",   "stages": 14,   "artifacts": 47,   "claims": 1,   "forced_export": "forced_draft",   "final_export": "blocked",   "failed_checks": [     "missing_verified_reference",     "reproduction_failure"   ],   "preview": "ready" } |
| `final-export-pass-run` | pass | 103.955 | {   "summary_path": "tmp/live-paper-quality-benchmark/final/paperrun-summary.json",   "scenario": "final",   "project_version": "0.13.0.158-dev",   "run_id": "run-723d014b-bf51-4f7e-8264-e59f9e7e6af3",   "status": "succeeded",   "stages": 14,   "artifacts": 42,   "claims": 1,   "forced_export": "forced_draft",   "final_export": "final",   "failed_checks": [],   "preview": "ready" } SourceEvidenceManifest.v1 final_gate=passed |
| `hard-fork-paper-core` | pass | 0.003 | paper core lives under packages/opencode/src/paper and no packages/server sidecar exists |
| `hard-fork-paperrun-api-tui` | pass | 0.005 | PaperRun API and TUI workbench are first-class paper surfaces |
| `hard-fork-agent-tree` | pass | 0.003 | Agent Tree supports nested multi-model agents with budget limits |
| `hard-fork-quality-egress` | pass | 0.004 | quality modes, private-first egress, forced draft, supplementary, and availability bundles are present |
| `hard-fork-public-branding` | pass | 0.008 | public logo, command registry, TUI home, sidebars, dashboard, and paper API expose Paper Fucker/PaperRun surfaces |
| `observability-audit-coverage` | pass | 0.004 | PaperRun diagnostics expose observability audit coverage for stage/capability/model/subagent/tool/egress/export/cost |
| `agent-team-capability-fusion` | pass | 0.007 | Agent Team, built-in capability packs, harness, memory, code understanding, crawler, and HF loop are fused |
| `paper-workbench-ux-sidebar` | pass | 0.004 | PaperRun workbench keeps cost/token/context/outline and PaperRun diagnostics visible |
| `hf-no-mock-boundary` | pass | 0.003 | HF product calls fail closed without authorized live access; test data requires an explicit test switch |
| `changelog-split-archives` | pass | 0.016 | TaskFlow changelog split preferences, one active root entry, and 0.1.x-0.7.x archives are present |
| `git-flow-cleanup` | pass | 0.12 | current branch fix/mcp-tool-binding-test-isolation follows Git Flow and no codex/task branches remain |
