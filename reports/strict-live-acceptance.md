# Strict Live Acceptance Report

- Generated: 2026-05-10T18:18:15.9032346+08:00
- Mode: strict-live-focused
- Full workspace suite: False
- Check timeout seconds: 300
- Status: passed

| Check | Status | Seconds | Detail |
| --- | --- | ---: | --- |
| `taskflow-validate-all` | pass | 1.757 | OK   task-043-export-renderer-pipeline OK   task-044-observability-audit-hardening OK   task-045-report-path-hygiene OK   task-046-live-paper-quality-benchmark OK   task-047-strict-acceptance-timeouts OK   task-048-paperrun-completion-gates OK   task-049-export-pdf-renderer-fallback OK   task-050-default-observability-coverage OK   task-051-live-benchmark-regression-pass OK   task-052-remove-stub-leftovers  All tasks are valid. |
| `readme-changelog-version` | pass | 0.735 | README version 0.5.1-dev matches CHANGELOG latest version. |
| `tracked-secret-scan` | pass | 1.706 | no tracked sk-* API keys found |
| `server-tests` | pass | 88.927 | test\paper\strict-acceptance.test.ts: (pass) strict live acceptance script > declares the complete required check inventory (pass) strict live acceptance script > keeps strict live checks strict while allowing deterministic fixture tests (pass) strict live acceptance script > scans only tracked files for secrets and writes the markdown report (pass) strict live acceptance script > bounds each check and writes partial reports during execution (pass) strict live acceptance script > uses focused pa... |
| `preview-tests` | pass | 11.638 | $ bun test --timeout 30000 bun test v1.3.13 (bf2e2cec)  test\preview.test.ts: (pass) preview server > serves token-protected read-only preview endpoints [16.00ms] (pass) preview server > cancels stale render jobs and keeps the newest markdown [31.00ms]   2 pass  0 fail  9 expect() calls Ran 2 tests across 1 file. [98.00ms] |
| `python-tests` | pass | 2.234 | ..... ---------------------------------------------------------------------- Ran 5 tests in 1.085s  OK |
| `server-typecheck` | pass | 19.399 | $ tsgo --noEmit |
| `workspace-typecheck` | pass | 21.314 | @paper-fucker/preview:typecheck: cache hit, replaying logs 35d181cf5889d108 @paper-fucker/preview:typecheck: $ tsgo --noEmit @opencode-ai/plugin:typecheck: cache hit, replaying logs 25c3095085c25995 @opencode-ai/plugin:typecheck: $ tsgo --noEmit @opencode-ai/app:typecheck: cache hit, replaying logs 66061008c0855405 @opencode-ai/app:typecheck: $ tsgo -b paper_fucker:typecheck: $ tsgo --noEmit   Tasks:    13 successful, 13 total Cached:    12 cached, 13 total   Time:    9.047s   |
| `opencode-tui-smoke` | pass | 17.011 | local paper_fucker CLI help responded |
| `live-provider-call` | pass | 1.2 | provider deepseek model deepseek-v4-pro responded |
| `exa-live-search` | pass | 0.543 | Exa MCP remote initialize responded |
| `nature-skill-profile` | pass | 3.03 | nature-paper skill installed and official guidance reachable |
| `pandoc-conversion` | pass | 0.43 | pandoc generated acceptance.tex |
| `latex-pdf-generation` | pass | 3.841 | xelatex.exe generated acceptance-pdf.pdf |
| `docx-generation` | pass | 0.663 | pandoc generated acceptance-docx.docx |
| `topic-to-paper-live-run` | pass | 19.982 | $ bun test --timeout 30000 "test/research/e2e.test.ts" bun test v1.3.13 (bf2e2cec)  test\research\e2e.test.ts: (pass) research pipeline end-to-end acceptance > runs a fixture topic through implemented stages and produces a final export [3672.00ms] (pass) research pipeline end-to-end acceptance > blocks final export on failed gate and produces a forced draft bundle [1313.00ms]   2 pass  0 fail  18 expect() calls Ran 2 tests across 1 file. [7.48s] |
| `code-to-paper-live-run` | pass | 15.03 | $ bun test --timeout 30000 test/paper/code-to-paper.test.ts bun test v1.3.13 (bf2e2cec)  test\paper\code-to-paper.test.ts: (pass) code-to-paper analysis > produces code-grounded artifacts with source ranges [156.00ms] (pass) code-to-paper analysis > records code-to-paper artifacts into a research run [797.00ms]   2 pass  0 fail  7 expect() calls Ran 2 tests across 1 file. [3.43s] |
| `hard-fork-paper-core` | pass | 0.004 | paper core lives under packages/opencode/src/paper and no packages/server sidecar exists |
| `hard-fork-paperrun-api-tui` | pass | 0.006 | PaperRun API and TUI workbench are first-class paper surfaces |
| `hard-fork-agent-tree` | pass | 0.003 | Agent Tree supports nested multi-model agents with budget limits |
| `hard-fork-quality-egress` | pass | 0.007 | quality modes, private-first egress, forced draft, supplementary, and availability bundles are present |
| `hard-fork-public-branding` | pass | 0.005 | public logo, command registry, and TUI tips expose Paper Fucker/PaperRun instead of legacy OpenCode surfaces |
| `observability-audit-coverage` | pass | 0.007 | PaperRun diagnostics expose observability audit coverage for stage/capability/model/subagent/tool/egress/export/cost |
| `git-flow-cleanup` | pass | 0.165 | current branch fix/remove-stub-leftovers follows Git Flow and no codex/task branches remain |
