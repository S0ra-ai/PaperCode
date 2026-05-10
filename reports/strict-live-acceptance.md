# Strict Live Acceptance Report

- Generated: 2026-05-11T03:42:12.4757804+08:00
- Mode: strict-live-focused
- Full workspace suite: False
- Check timeout seconds: 300
- Status: passed

| Check | Status | Seconds | Detail |
| --- | --- | ---: | --- |
| `taskflow-validate-all` | pass | 1.028 | OK   task-045-report-path-hygiene OK   task-046-live-paper-quality-benchmark OK   task-047-strict-acceptance-timeouts OK   task-048-paperrun-completion-gates OK   task-049-export-pdf-renderer-fallback OK   task-050-default-observability-coverage OK   task-051-live-benchmark-regression-pass OK   task-052-remove-stub-leftovers OK   task-053-tui-provider-copy-cleanup OK   task-054-tracked-secret-example-cleanup  All tasks are valid. |
| `readme-changelog-version` | pass | 0.42 | README version 0.5.7-dev matches CHANGELOG latest version. |
| `tracked-secret-scan` | pass | 0.361 | no tracked sk-* API keys found |
| `server-tests` | pass | 75.525 | (pass) strict live acceptance script > keeps the PowerShell script ASCII-safe for Windows PowerShell parsing (pass) strict live acceptance script > does not assign reserved PowerShell variables (pass) strict live acceptance script > keeps strict live checks strict while allowing deterministic fixture tests (pass) strict live acceptance script > scans only tracked files for secrets and writes the markdown report (pass) strict live acceptance script > bounds each check and writes partial reports d... |
| `preview-tests` | pass | 7.225 | $ bun test --timeout 30000 bun test v1.3.13 (bf2e2cec)  test\preview.test.ts: (pass) preview server > serves token-protected read-only preview endpoints [16.00ms] (pass) preview server > cancels stale render jobs and keeps the newest markdown [31.00ms]   2 pass  0 fail  9 expect() calls Ran 2 tests across 1 file. [82.00ms] |
| `python-tests` | pass | 0.985 | ..... ---------------------------------------------------------------------- Ran 5 tests in 0.507s  OK |
| `server-typecheck` | pass | 10.275 | $ tsgo --noEmit |
| `workspace-typecheck` | pass | 11.517 | @opencode-ai/slack:typecheck: cache hit, replaying logs 00afa8a7a00d85ce @opencode-ai/slack:typecheck: $ tsgo --noEmit @opencode-ai/console-function:typecheck: cache hit, replaying logs adfdc1becded7ae3 @opencode-ai/console-function:typecheck: $ tsgo --noEmit @paper-fucker/preview:typecheck: cache hit, replaying logs 58c77cf2832b96e1 @paper-fucker/preview:typecheck: $ tsgo --noEmit paper_fucker:typecheck: $ tsgo --noEmit   Tasks:    13 successful, 13 total Cached:    12 cached, 13 total   Time: ... |
| `opencode-tui-smoke` | pass | 10.075 | local paper_fucker CLI help responded |
| `live-provider-call` | pass | 1.254 | provider deepseek model deepseek-v4-pro responded |
| `exa-live-search` | pass | 0.471 | Exa MCP remote initialize responded |
| `nature-skill-profile` | pass | 2.777 | nature-paper skill installed and official guidance reachable |
| `pandoc-conversion` | pass | 0.25 | pandoc generated acceptance.tex |
| `latex-pdf-generation` | pass | 1.404 | xelatex.exe generated acceptance-pdf.pdf |
| `docx-generation` | pass | 0.292 | pandoc generated acceptance-docx.docx |
| `topic-to-paper-live-run` | pass | 12.946 | $ bun test --timeout 30000 "test/research/e2e.test.ts" bun test v1.3.13 (bf2e2cec)  test\research\e2e.test.ts: (pass) research pipeline end-to-end acceptance > runs a fixture topic through implemented stages and produces a final export [3281.00ms] (pass) research pipeline end-to-end acceptance > blocks final export on failed gate and produces a forced draft bundle [1094.00ms]   2 pass  0 fail  18 expect() calls Ran 2 tests across 1 file. [5.68s] |
| `code-to-paper-live-run` | pass | 9.031 | $ bun test --timeout 30000 test/paper/code-to-paper.test.ts bun test v1.3.13 (bf2e2cec)  test\paper\code-to-paper.test.ts: (pass) code-to-paper analysis > produces code-grounded artifacts with source ranges [125.00ms] (pass) code-to-paper analysis > records code-to-paper artifacts into a research run [703.00ms]   2 pass  0 fail  7 expect() calls Ran 2 tests across 1 file. [2.14s] |
| `hard-fork-paper-core` | pass | 0.002 | paper core lives under packages/opencode/src/paper and no packages/server sidecar exists |
| `hard-fork-paperrun-api-tui` | pass | 0.003 | PaperRun API and TUI workbench are first-class paper surfaces |
| `hard-fork-agent-tree` | pass | 0.002 | Agent Tree supports nested multi-model agents with budget limits |
| `hard-fork-quality-egress` | pass | 0.002 | quality modes, private-first egress, forced draft, supplementary, and availability bundles are present |
| `hard-fork-public-branding` | pass | 0.005 | public logo, command registry, TUI home, sidebars, dashboard, and paper API expose Paper Fucker/PaperRun surfaces |
| `observability-audit-coverage` | pass | 0.003 | PaperRun diagnostics expose observability audit coverage for stage/capability/model/subagent/tool/egress/export/cost |
| `git-flow-cleanup` | pass | 0.096 | current branch feature/recursive-agent-sidebar-acceptance follows Git Flow and no codex/task branches remain |
