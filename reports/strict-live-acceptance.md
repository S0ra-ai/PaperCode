# Strict Live Acceptance Report

## Latest Task 046 Attempt

- Generated: 2026/05/10 16:29:24 +08:00
- Mode: strict-live benchmark rerun on `feature/live-paper-quality-benchmark`
- Status: needs-hardening
- Result: the full script was terminated after more than 18 minutes while `packages/opencode test` continued without per-check timeout or progress output.
- Follow-up: `task-047-strict-acceptance-timeouts` will add bounded checks, partial report persistence, and a focused paper-critical default suite.
- Targeted live benchmark checks passed separately: DeepSeek `/models` + chat, Exa MCP initialize, Nature skill/guidance, pandoc LaTeX/DOCX, direct XeLaTeX PDF, and the focused PaperRun/code/export/observability tests.

## Historical Full Script Result

- Generated: 2026-05-10T14:06:28.9442609+08:00
- Mode: strict-live
- Status: passed

| Check | Status | Seconds | Detail |
| --- | --- | ---: | --- |
| `taskflow-validate-all` | pass | 0.887 | OK   task-029-tui-paper-workbench OK   task-030-paper-authoring-loop OK   task-031-strict-live-acceptance OK   task-032-opencode-paper-core-migration OK   task-033-paper-run-api OK   task-034-dialog-workbench-tui OK   task-035-provider-model-wizard OK   task-036-multimodel-agent-orchestration OK   task-037-public-surface-cleanup OK   task-038-hard-fork-acceptance  All tasks are valid. |
| `readme-changelog-version` | pass | 0.356 | README version 0.3.0-dev matches CHANGELOG latest version. |
| `tracked-secret-scan` | pass | 1.102 | no tracked sk-* API keys found |
| `server-tests` | pass | 1081.368 |   2 tests todo: (todo) 404 mapping for missing session > HttpApi /session/{missing}/todo returns 404 not 500 (todo) Instruction.resolve > fetches remote instructions from config URLs via HttpClient   2547 pass  38 skip  2 todo  0 fail  16 snapshots, 7490 expect() calls Ran 2587 tests across 236 files. [1071.82s] |
| `preview-tests` | pass | 9.822 | $ bun test --timeout 30000 bun test v1.3.13 (bf2e2cec)  test\preview.test.ts: (pass) preview server > serves token-protected read-only preview endpoints (pass) preview server > cancels stale render jobs and keeps the newest markdown [32.00ms]   2 pass  0 fail  9 expect() calls Ran 2 tests across 1 file. [76.00ms] |
| `python-tests` | pass | 1.165 | .... ---------------------------------------------------------------------- Ran 4 tests in 0.597s  OK |
| `server-typecheck` | pass | 14.863 | $ tsgo --noEmit |
| `workspace-typecheck` | pass | 11.364 | @opencode-ai/slack:typecheck: $ tsgo --noEmit @opencode-ai/app:typecheck: cache hit, replaying logs b4a1c454efb50676 @opencode-ai/app:typecheck: $ tsgo -b @opencode-ai/plugin:typecheck: cache hit, replaying logs 25c3095085c25995 @opencode-ai/plugin:typecheck: $ tsgo --noEmit @opencode-ai/core:typecheck: cache hit, replaying logs 071e8e42ffb56ab5 @opencode-ai/core:typecheck: $ tsgo --noEmit   Tasks:    13 successful, 13 total Cached:    13 cached, 13 total   Time:    753ms >>> FULL TURBO  |
| `opencode-tui-smoke` | pass | 14.359 | local paper_fucker CLI help responded |
| `live-provider-call` | pass | 1.599 | provider deepseek model deepseek-v4-pro responded |
| `exa-live-search` | pass | 0.35 | Exa MCP remote initialize responded |
| `nature-skill-profile` | pass | 3.701 | nature-paper skill installed and official guidance reachable |
| `pandoc-conversion` | pass | 0.162 | pandoc generated acceptance.tex |
| `latex-pdf-generation` | pass | 2.014 | xelatex.exe generated acceptance-pdf.pdf |
| `docx-generation` | pass | 0.164 | pandoc generated acceptance-docx.docx |
| `topic-to-paper-live-run` | pass | 16.388 | $ bun test --timeout 30000 "test/research/e2e.test.ts" bun test v1.3.13 (bf2e2cec)  test\research\e2e.test.ts: (pass) research pipeline end-to-end acceptance > runs a fixture topic through implemented stages and produces a final export [2484.00ms] (pass) research pipeline end-to-end acceptance > blocks final export on failed gate and produces a forced draft bundle [453.00ms]   2 pass  0 fail  18 expect() calls Ran 2 tests across 1 file. [4.98s] |
| `code-to-paper-live-run` | pass | 12.414 | $ bun test --timeout 30000 test/paper/code-to-paper.test.ts bun test v1.3.13 (bf2e2cec)  test\paper\code-to-paper.test.ts: (pass) code-to-paper analysis > produces code-grounded artifacts with source ranges [125.00ms] (pass) code-to-paper analysis > records code-to-paper artifacts into a research run [781.00ms]   2 pass  0 fail  7 expect() calls Ran 2 tests across 1 file. [3.01s] |
| `hard-fork-paper-core` | pass | 0.002 | paper core lives under packages/opencode/src/paper and no packages/server sidecar exists |
| `hard-fork-paperrun-api-tui` | pass | 0.004 | PaperRun API and TUI workbench are first-class paper surfaces |
| `hard-fork-agent-tree` | pass | 0.002 | Agent Tree supports nested multi-model agents with budget limits |
| `hard-fork-quality-egress` | pass | 0.004 | quality modes, private-first egress, forced draft, supplementary, and availability bundles are present |
| `hard-fork-public-branding` | pass | 0.003 | public logo, command registry, and TUI tips expose Paper Fucker/PaperRun instead of legacy OpenCode surfaces |
| `git-flow-cleanup` | pass | 0.127 | current branch feature/hard-fork-acceptance follows Git Flow and no codex/task branches remain |
