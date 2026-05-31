# Strict Live Acceptance Report

- Generated: 2026-05-31T12:24:17.9333375+08:00
- Mode: strict-live-focused
- Full workspace suite: False
- Check timeout seconds: 900
- Status: passed

| Check | Status | Seconds | Detail |
| --- | --- | ---: | --- |
| `taskflow-validate-all` | pass | 1.608 | OK   task-111-product-ux-acceptance OK   task-112-changelog-style-normalization OK   tui-copilot-model-workbench-routing OK   tui-json-parse-guard OK   tui-model-workspace-run-hardening OK   tui-models-depth-switcher-fix OK   tui-paper-workbench-surface OK   tui-prompt-tdz-crash-fix OK   tui-terminal-model-brand-hardening OK   visible-command-surface-audit  All tasks are valid. |
| `readme-changelog-version` | pass | 0.51 | README version 0.13.0.141-dev matches CHANGELOG latest version. |
| `tracked-secret-scan` | pass | 0.747 | no tracked sk-* API keys found |
| `server-tests` | pass | 387.396 | (pass) strict live acceptance script > bounds each check and writes partial reports during execution (pass) strict live acceptance script > uses focused paper-critical tests by default with opt-in full workspace suite (pass) strict live acceptance script > checks Agent Team capability fusion and product no-mock boundaries (pass) strict live acceptance script > uses real PaperRun benchmark evidence for live topic and code checks (pass) strict live acceptance script > live benchmark discovers arXiv sources instead of pinning a fake locator (pass) strict live acceptance script > experiment runner does not invent container image or digest metadata (pass) strict live acceptance script > allows Git Flow feature and fix branches during active task work   35 pass  0 fail  330 expect() calls Ran 35 tests across 7 files. [378.96s] |
| `preview-tests` | pass | 8.382 | (pass) preview client render helpers > renders detailed cost, token, agent tree, and team state (pass) preview client render helpers > renders model routing decisions and blocked diagnostics  test\preview.test.ts: (pass) preview server > serves token-protected read-only preview endpoints (pass) preview server > cancels stale render jobs and keeps the newest markdown [31.00ms] (pass) preview server > pushes replacement snapshots to live preview subscribers   10 pass  0 fail  56 expect() calls Ran 10 tests across 2 files. [87.00ms] |
| `python-tests` | pass | 1.777 | ................... ---------------------------------------------------------------------- Ran 19 tests in 1.102s  OK |
| `server-typecheck` | pass | 13.055 | $ tsgo --noEmit |
| `workspace-typecheck` | pass | 15.019 | @opencode-ai/desktop:typecheck: $ tsgo -b @opencode-ai/enterprise:typecheck: cache hit, replaying logs 85be9d7751e3c985 @opencode-ai/enterprise:typecheck: $ tsgo --noEmit @opencode-ai/app:typecheck: $ tsgo -b @opencode-ai/console-app:typecheck: $ tsgo --noEmit @opencode-ai/ui:typecheck: $ tsgo --noEmit paper_fucker:typecheck: $ tsgo --noEmit   Tasks:    13 successful, 13 total Cached:    9 cached, 13 total   Time:    6.059s   |
| `opencode-tui-smoke` | pass | 11.664 | local paper_fucker CLI help responded |
| `live-provider-call` | pass | 1.202 | provider deepseek model deepseek-v4-pro responded |
| `exa-live-search` | pass | 0.484 | Exa MCP remote initialize responded |
| `nature-skill-profile` | pass | 0.264 | nature-paper skill installed and official guidance reachable |
| `pandoc-conversion` | pass | 0.363 | pandoc generated acceptance.tex |
| `latex-pdf-generation` | pass | 1.723 | xelatex.exe generated acceptance-pdf.pdf |
| `docx-generation` | pass | 0.393 | pandoc generated acceptance-docx.docx |
| `live-preview-browser-smoke` | pass | 9.039 | # Live Preview Browser Smoke  - status: passed - generated_at: 2026-05-31 12:19:27 +08:00 - checks: token rejection, read-only write rejection, SSE snapshot refresh, browser shell render, browser snapshot read, experiment run summary, terminal trace summary, machine environment summary - output: {"status":"passed","port":62220,"checks":["token","readonly","sse","browser-dom","experiment-runs","terminal-traces","machine-environment"]} |
| `live-crawler-fetch` | pass | 5.763 | {"status": "fetched", "method": "urllib", "title": "Example Domain"} |
| `hf-live-research-loop` | pass | 6.914 | {"papers": 1, "jobs_mode": "blocked", "trackio_mode": "provided"} |
| `topic-to-paper-live-run` | pass | 77.601 | {   "summary_path": "tmp/live-paper-quality-benchmark/topic/paperrun-summary.json",   "scenario": "topic",   "project_version": "0.13.0.141-dev",   "run_id": "run-5c837e49-d71e-4cf4-8ff5-a795b251632a",   "status": "blocked",   "stages": 14,   "artifacts": 40,   "claims": 1,   "forced_export": "forced_draft",   "final_export": "blocked",   "failed_checks": [     "missing_verified_reference",     "unsupported_claim",     "reproduction_failure"   ],   "preview": "ready" } |
| `code-to-paper-live-run` | pass | 106.233 | {   "summary_path": "tmp/live-paper-quality-benchmark/code/paperrun-summary.json",   "scenario": "code",   "project_version": "0.13.0.141-dev",   "run_id": "run-b4720e7c-407c-4959-adc8-a1b8f6add269",   "status": "blocked",   "stages": 14,   "artifacts": 47,   "claims": 1,   "forced_export": "forced_draft",   "final_export": "blocked",   "failed_checks": [     "missing_verified_reference",     "reproduction_failure"   ],   "preview": "ready" } |
| `final-export-pass-run` | pass | 94.037 | {   "summary_path": "tmp/live-paper-quality-benchmark/final/paperrun-summary.json",   "scenario": "final",   "project_version": "0.13.0.141-dev",   "run_id": "run-794eaa84-5eed-402b-93a5-101a7a04f548",   "status": "succeeded",   "stages": 14,   "artifacts": 42,   "claims": 1,   "forced_export": "forced_draft",   "final_export": "final",   "failed_checks": [],   "preview": "ready" } SourceEvidenceManifest.v1 final_gate=passed |
| `hard-fork-paper-core` | pass | 0.002 | paper core lives under packages/opencode/src/paper and no packages/server sidecar exists |
| `hard-fork-paperrun-api-tui` | pass | 0.004 | PaperRun API and TUI workbench are first-class paper surfaces |
| `hard-fork-agent-tree` | pass | 0.003 | Agent Tree supports nested multi-model agents with budget limits |
| `hard-fork-quality-egress` | pass | 0.004 | quality modes, private-first egress, forced draft, supplementary, and availability bundles are present |
| `hard-fork-public-branding` | pass | 0.011 | public logo, command registry, TUI home, sidebars, dashboard, and paper API expose Paper Fucker/PaperRun surfaces |
| `observability-audit-coverage` | pass | 0.003 | PaperRun diagnostics expose observability audit coverage for stage/capability/model/subagent/tool/egress/export/cost |
| `agent-team-capability-fusion` | pass | 0.006 | Agent Team, built-in capability packs, harness, memory, code understanding, crawler, and HF loop are fused |
| `paper-workbench-ux-sidebar` | pass | 0.003 | PaperRun workbench keeps cost/token/context/outline and PaperRun diagnostics visible |
| `hf-no-mock-boundary` | pass | 0.002 | HF product calls fail closed without authorized live access; test data requires an explicit test switch |
| `changelog-split-archives` | pass | 0.013 | TaskFlow changelog split preferences, one active root entry, and 0.1.x-0.7.x archives are present |
| `git-flow-cleanup` | pass | 0.11 | current branch fix/mcp-tool-binding-test-isolation follows Git Flow and no codex/task branches remain |
