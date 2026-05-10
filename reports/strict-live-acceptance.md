# Strict Live Acceptance Report

- Generated: 2026-05-11T03:46:20.6027803+08:00
- Mode: strict-live-focused
- Full workspace suite: False
- Check timeout seconds: 300
- Status: passed

| Check | Status | Seconds | Detail |
| --- | --- | ---: | --- |
| `taskflow-validate-all` | pass | 1.045 | OK   task-045-report-path-hygiene OK   task-046-live-paper-quality-benchmark OK   task-047-strict-acceptance-timeouts OK   task-048-paperrun-completion-gates OK   task-049-export-pdf-renderer-fallback OK   task-050-default-observability-coverage OK   task-051-live-benchmark-regression-pass OK   task-052-remove-stub-leftovers OK   task-053-tui-provider-copy-cleanup OK   task-054-tracked-secret-example-cleanup  All tasks are valid. |
| `readme-changelog-version` | pass | 0.448 | README version 0.6.0-dev matches CHANGELOG latest version. |
| `tracked-secret-scan` | pass | 0.439 | no tracked sk-* API keys found |
| `server-tests` | pass | 79.467 | (pass) strict live acceptance script > keeps the PowerShell script ASCII-safe for Windows PowerShell parsing [16.00ms] (pass) strict live acceptance script > does not assign reserved PowerShell variables (pass) strict live acceptance script > keeps strict live checks strict while allowing deterministic fixture tests (pass) strict live acceptance script > scans only tracked files for secrets and writes the markdown report (pass) strict live acceptance script > bounds each check and writes partial... |
| `preview-tests` | pass | 7.703 | $ bun test --timeout 30000 bun test v1.3.13 (bf2e2cec)  test\preview.test.ts: (pass) preview server > serves token-protected read-only preview endpoints (pass) preview server > cancels stale render jobs and keeps the newest markdown [47.00ms]   2 pass  0 fail  9 expect() calls Ran 2 tests across 1 file. [80.00ms] |
| `python-tests` | pass | 0.977 | ..... ---------------------------------------------------------------------- Ran 5 tests in 0.509s  OK |
| `server-typecheck` | pass | 10.599 | $ tsgo --noEmit |
| `workspace-typecheck` | pass | 11.865 | @opencode-ai/desktop:typecheck: cache hit, replaying logs 72f0e8742c17dde6 @opencode-ai/desktop:typecheck: $ tsgo -b @opencode-ai/console-app:typecheck: cache hit, replaying logs 09e2d05c0ca3fa47 @opencode-ai/console-app:typecheck: $ tsgo --noEmit @opencode-ai/console-core:typecheck: cache hit, replaying logs 355d2197ea9786ab @opencode-ai/console-core:typecheck: $ tsgo --noEmit paper_fucker:typecheck: $ tsgo --noEmit   Tasks:    13 successful, 13 total Cached:    12 cached, 13 total   Time:    3... |
| `opencode-tui-smoke` | pass | 10.412 | local paper_fucker CLI help responded |
| `live-provider-call` | pass | 1.444 | provider deepseek model deepseek-v4-pro responded |
| `exa-live-search` | pass | 0.477 | Exa MCP remote initialize responded |
| `nature-skill-profile` | pass | 2.338 | nature-paper skill installed and official guidance reachable |
| `pandoc-conversion` | pass | 0.26 | pandoc generated acceptance.tex |
| `latex-pdf-generation` | pass | 1.539 | xelatex.exe generated acceptance-pdf.pdf |
| `docx-generation` | pass | 0.328 | pandoc generated acceptance-docx.docx |
| `topic-to-paper-live-run` | pass | 13.811 | $ bun test --timeout 30000 "test/research/e2e.test.ts" bun test v1.3.13 (bf2e2cec)  test\research\e2e.test.ts: (pass) research pipeline end-to-end acceptance > runs a fixture topic through implemented stages and produces a final export [3453.00ms] (pass) research pipeline end-to-end acceptance > blocks final export on failed gate and produces a forced draft bundle [1063.00ms]   2 pass  0 fail  18 expect() calls Ran 2 tests across 1 file. [5.82s] |
| `code-to-paper-live-run` | pass | 9.204 | $ bun test --timeout 30000 test/paper/code-to-paper.test.ts bun test v1.3.13 (bf2e2cec)  test\paper\code-to-paper.test.ts: (pass) code-to-paper analysis > produces code-grounded artifacts with source ranges [125.00ms] (pass) code-to-paper analysis > records code-to-paper artifacts into a research run [750.00ms]   2 pass  0 fail  7 expect() calls Ran 2 tests across 1 file. [2.19s] |
| `hard-fork-paper-core` | pass | 0.003 | paper core lives under packages/opencode/src/paper and no packages/server sidecar exists |
| `hard-fork-paperrun-api-tui` | pass | 0.003 | PaperRun API and TUI workbench are first-class paper surfaces |
| `hard-fork-agent-tree` | pass | 0.007 | Agent Tree supports nested multi-model agents with budget limits |
| `hard-fork-quality-egress` | pass | 0.002 | quality modes, private-first egress, forced draft, supplementary, and availability bundles are present |
| `hard-fork-public-branding` | pass | 0.005 | public logo, command registry, TUI home, sidebars, dashboard, and paper API expose Paper Fucker/PaperRun surfaces |
| `observability-audit-coverage` | pass | 0.002 | PaperRun diagnostics expose observability audit coverage for stage/capability/model/subagent/tool/egress/export/cost |
| `git-flow-cleanup` | pass | 0.086 | current branch feature/recursive-agent-sidebar-acceptance follows Git Flow and no codex/task branches remain |
