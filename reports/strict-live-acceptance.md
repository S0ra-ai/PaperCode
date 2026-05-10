# Strict Live Acceptance Report

- Generated: 2026-05-10T17:59:24.4340370+08:00
- Mode: strict-live-focused
- Full workspace suite: False
- Check timeout seconds: 300
- Status: passed

| Check | Status | Seconds | Detail |
| --- | --- | ---: | --- |
| `taskflow-validate-all` | pass | 2.075 | OK   task-042-workbench-live-controls OK   task-043-export-renderer-pipeline OK   task-044-observability-audit-hardening OK   task-045-report-path-hygiene OK   task-046-live-paper-quality-benchmark OK   task-047-strict-acceptance-timeouts OK   task-048-paperrun-completion-gates OK   task-049-export-pdf-renderer-fallback OK   task-050-default-observability-coverage OK   task-051-live-benchmark-regression-pass  All tasks are valid. |
| `readme-changelog-version` | pass | 0.822 | README version 0.5.0-dev matches CHANGELOG latest version. |
| `tracked-secret-scan` | pass | 1.781 | no tracked sk-* API keys found |
| `server-tests` | pass | 97.61 | test\paper\strict-acceptance.test.ts: (pass) strict live acceptance script > declares the complete required check inventory (pass) strict live acceptance script > keeps strict live checks strict while allowing deterministic fixture tests (pass) strict live acceptance script > scans only tracked files for secrets and writes the markdown report [15.00ms] (pass) strict live acceptance script > bounds each check and writes partial reports during execution (pass) strict live acceptance script > uses ... |
| `preview-tests` | pass | 12.889 | $ bun test --timeout 30000 bun test v1.3.13 (bf2e2cec)  test\preview.test.ts: (pass) preview server > serves token-protected read-only preview endpoints [31.00ms] (pass) preview server > cancels stale render jobs and keeps the newest markdown [31.00ms]   2 pass  0 fail  9 expect() calls Ran 2 tests across 1 file. [109.00ms] |
| `python-tests` | pass | 2.028 | .... ---------------------------------------------------------------------- Ran 4 tests in 0.843s  OK |
| `server-typecheck` | pass | 19.972 | $ tsgo --noEmit |
| `workspace-typecheck` | pass | 23.647 | @opencode-ai/ui:typecheck: cache hit, replaying logs 8af7f9d4e0637d83 @opencode-ai/ui:typecheck: $ tsgo --noEmit @opencode-ai/sdk:typecheck: cache hit, replaying logs d2576d3122c77626 @opencode-ai/sdk:typecheck: $ tsgo --noEmit @opencode-ai/core:typecheck: cache hit, replaying logs 25ae03f59447a740 @opencode-ai/core:typecheck: $ tsgo --noEmit paper_fucker:typecheck: $ tsgo --noEmit   Tasks:    13 successful, 13 total Cached:    12 cached, 13 total   Time:    8.419s   |
| `opencode-tui-smoke` | pass | 18.472 | local paper_fucker CLI help responded |
| `live-provider-call` | pass | 1.311 | provider deepseek model deepseek-v4-pro responded |
| `exa-live-search` | pass | 0.312 | Exa MCP remote initialize responded |
| `nature-skill-profile` | pass | 3.801 | nature-paper skill installed and official guidance reachable |
| `pandoc-conversion` | pass | 0.563 | pandoc generated acceptance.tex |
| `latex-pdf-generation` | pass | 3.78 | xelatex.exe generated acceptance-pdf.pdf |
| `docx-generation` | pass | 0.754 | pandoc generated acceptance-docx.docx |
| `topic-to-paper-live-run` | pass | 20.901 | $ bun test --timeout 30000 "test/research/e2e.test.ts" bun test v1.3.13 (bf2e2cec)  test\research\e2e.test.ts: (pass) research pipeline end-to-end acceptance > runs a fixture topic through implemented stages and produces a final export [3844.00ms] (pass) research pipeline end-to-end acceptance > blocks final export on failed gate and produces a forced draft bundle [1406.00ms]   2 pass  0 fail  18 expect() calls Ran 2 tests across 1 file. [7.74s] |
| `code-to-paper-live-run` | pass | 16.471 | $ bun test --timeout 30000 test/paper/code-to-paper.test.ts bun test v1.3.13 (bf2e2cec)  test\paper\code-to-paper.test.ts: (pass) code-to-paper analysis > produces code-grounded artifacts with source ranges [125.00ms] (pass) code-to-paper analysis > records code-to-paper artifacts into a research run [890.00ms]   2 pass  0 fail  7 expect() calls Ran 2 tests across 1 file. [3.55s] |
| `hard-fork-paper-core` | pass | 0.009 | paper core lives under packages/opencode/src/paper and no packages/server sidecar exists |
| `hard-fork-paperrun-api-tui` | pass | 0.022 | PaperRun API and TUI workbench are first-class paper surfaces |
| `hard-fork-agent-tree` | pass | 0.015 | Agent Tree supports nested multi-model agents with budget limits |
| `hard-fork-quality-egress` | pass | 0.018 | quality modes, private-first egress, forced draft, supplementary, and availability bundles are present |
| `hard-fork-public-branding` | pass | 0.013 | public logo, command registry, and TUI tips expose Paper Fucker/PaperRun instead of legacy OpenCode surfaces |
| `observability-audit-coverage` | pass | 0.013 | PaperRun diagnostics expose observability audit coverage for stage/capability/model/subagent/tool/egress/export/cost |
| `git-flow-cleanup` | pass | 0.217 | current branch feature/live-benchmark-regression-pass follows Git Flow and no codex/task branches remain |
