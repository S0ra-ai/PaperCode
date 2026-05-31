# Strict Live Acceptance Report

- Generated: 2026-05-31T13:54:23.7530874+08:00
- Mode: strict-live-focused
- Full workspace suite: False
- Check timeout seconds: 900
- Status: passed

| Check | Status | Seconds | Detail |
| --- | --- | ---: | --- |
| `taskflow-validate-all` | pass | 1.64 | OK   task-111-product-ux-acceptance OK   task-112-changelog-style-normalization OK   tui-copilot-model-workbench-routing OK   tui-json-parse-guard OK   tui-model-workspace-run-hardening OK   tui-models-depth-switcher-fix OK   tui-paper-workbench-surface OK   tui-prompt-tdz-crash-fix OK   tui-terminal-model-brand-hardening OK   visible-command-surface-audit  All tasks are valid. |
| `readme-changelog-version` | pass | 0.524 | README version 0.13.0.150-dev matches CHANGELOG latest version. |
| `development-docs-check` | pass | 0.705 | Development docs check passed for 16 HTML page(s). |
| `tracked-secret-scan` | pass | 0.753 | no tracked sk-* API keys found |
| `server-tests` | pass | 393.542 | (pass) strict live acceptance script > bounds each check and writes partial reports during execution (pass) strict live acceptance script > uses focused paper-critical tests by default with opt-in full workspace suite (pass) strict live acceptance script > checks Agent Team capability fusion and product no-mock boundaries (pass) strict live acceptance script > uses real PaperRun benchmark evidence for live topic and code checks (pass) strict live acceptance script > live benchmark discovers arXiv sources instead of pinning a fake locator (pass) strict live acceptance script > experiment runner does not invent container image or digest metadata (pass) strict live acceptance script > allows Git Flow feature and fix branches during active task work   35 pass  0 fail  332 expect() calls Ran 35 tests across 7 files. [385.04s] |
| `preview-tests` | pass | 8.391 | (pass) preview client render helpers > renders detailed cost, token, agent tree, and team state (pass) preview client render helpers > renders model routing decisions and blocked diagnostics  test\preview.test.ts: (pass) preview server > serves token-protected read-only preview endpoints [16.00ms] (pass) preview server > cancels stale render jobs and keeps the newest markdown [31.00ms] (pass) preview server > pushes replacement snapshots to live preview subscribers   10 pass  0 fail  56 expect() calls Ran 10 tests across 2 files. [89.00ms] |
| `python-tests` | pass | 1.743 | ................... ---------------------------------------------------------------------- Ran 19 tests in 1.076s  OK |
| `server-typecheck` | pass | 12.761 | $ tsgo --noEmit |
| `workspace-typecheck` | pass | 9.658 | @opencode-ai/console-app:typecheck: $ tsgo --noEmit @opencode-ai/desktop:typecheck: cache hit, replaying logs bacba1bce8d36bb5 @opencode-ai/desktop:typecheck: $ tsgo -b @opencode-ai/ui:typecheck: cache hit, replaying logs 4866b9460c6b6b63 @opencode-ai/ui:typecheck: $ tsgo --noEmit @opencode-ai/console-function:typecheck: cache hit, replaying logs 766965655f7beb7e @opencode-ai/console-function:typecheck: $ tsgo --noEmit   Tasks:    13 successful, 13 total Cached:    13 cached, 13 total   Time:    420ms >>> FULL TURBO  |
| `opencode-tui-smoke` | pass | 12.103 | local paper_fucker CLI help responded |
| `live-provider-call` | pass | 1.446 | provider deepseek model deepseek-v4-pro responded |
| `exa-live-search` | pass | 0.638 | Exa MCP remote initialize responded |
| `nature-skill-profile` | pass | 0.286 | nature-paper skill installed and official guidance reachable |
| `pandoc-conversion` | pass | 0.36 | pandoc generated acceptance.tex |
| `latex-pdf-generation` | pass | 1.748 | xelatex.exe generated acceptance-pdf.pdf |
| `docx-generation` | pass | 0.346 | pandoc generated acceptance-docx.docx |
| `live-preview-browser-smoke` | pass | 9.032 | # Live Preview Browser Smoke  - status: passed - generated_at: 2026-05-31 13:49:29 +08:00 - checks: token rejection, read-only write rejection, SSE snapshot refresh, browser shell render, browser snapshot read, experiment run summary, terminal trace summary, machine environment summary - output: {"status":"passed","port":62609,"checks":["token","readonly","sse","browser-dom","experiment-runs","terminal-traces","machine-environment"]} |
| `live-crawler-fetch` | pass | 5.677 | {"status": "fetched", "method": "urllib", "title": "Example Domain"} |
| `hf-live-research-loop` | pass | 7.153 | {"papers": 1, "jobs_mode": "blocked", "trackio_mode": "provided"} |
| `topic-to-paper-live-run` | pass | 79.256 | {   "summary_path": "tmp/live-paper-quality-benchmark/topic/paperrun-summary.json",   "scenario": "topic",   "project_version": "0.13.0.150-dev",   "run_id": "run-35c36c04-07bc-4148-9664-d48715959f4a",   "status": "blocked",   "stages": 14,   "artifacts": 40,   "claims": 1,   "forced_export": "forced_draft",   "final_export": "blocked",   "failed_checks": [     "missing_verified_reference",     "unsupported_claim",     "reproduction_failure"   ],   "preview": "ready" } |
| `code-to-paper-live-run` | pass | 108.136 | {   "summary_path": "tmp/live-paper-quality-benchmark/code/paperrun-summary.json",   "scenario": "code",   "project_version": "0.13.0.150-dev",   "run_id": "run-96622d82-bacb-4af1-9df3-94f4a604da75",   "status": "blocked",   "stages": 14,   "artifacts": 47,   "claims": 1,   "forced_export": "forced_draft",   "final_export": "blocked",   "failed_checks": [     "missing_verified_reference",     "reproduction_failure"   ],   "preview": "ready" } |
| `final-export-pass-run` | pass | 94.222 | {   "summary_path": "tmp/live-paper-quality-benchmark/final/paperrun-summary.json",   "scenario": "final",   "project_version": "0.13.0.150-dev",   "run_id": "run-4b28b465-9969-49b8-9a8a-6787319ac8fa",   "status": "succeeded",   "stages": 14,   "artifacts": 42,   "claims": 1,   "forced_export": "forced_draft",   "final_export": "final",   "failed_checks": [],   "preview": "ready" } SourceEvidenceManifest.v1 final_gate=passed |
| `hard-fork-paper-core` | pass | 0.002 | paper core lives under packages/opencode/src/paper and no packages/server sidecar exists |
| `hard-fork-paperrun-api-tui` | pass | 0.004 | PaperRun API and TUI workbench are first-class paper surfaces |
| `hard-fork-agent-tree` | pass | 0.003 | Agent Tree supports nested multi-model agents with budget limits |
| `hard-fork-quality-egress` | pass | 0.004 | quality modes, private-first egress, forced draft, supplementary, and availability bundles are present |
| `hard-fork-public-branding` | pass | 0.007 | public logo, command registry, TUI home, sidebars, dashboard, and paper API expose Paper Fucker/PaperRun surfaces |
| `observability-audit-coverage` | pass | 0.003 | PaperRun diagnostics expose observability audit coverage for stage/capability/model/subagent/tool/egress/export/cost |
| `agent-team-capability-fusion` | pass | 0.006 | Agent Team, built-in capability packs, harness, memory, code understanding, crawler, and HF loop are fused |
| `paper-workbench-ux-sidebar` | pass | 0.004 | PaperRun workbench keeps cost/token/context/outline and PaperRun diagnostics visible |
| `hf-no-mock-boundary` | pass | 0.002 | HF product calls fail closed without authorized live access; test data requires an explicit test switch |
| `changelog-split-archives` | pass | 0.013 | TaskFlow changelog split preferences, one active root entry, and 0.1.x-0.7.x archives are present |
| `git-flow-cleanup` | pass | 0.11 | current branch fix/mcp-tool-binding-test-isolation follows Git Flow and no codex/task branches remain |
