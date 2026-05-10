# Strict Live Acceptance Report

- Generated: 2026-05-10T17:51:14.8401513+08:00
- Mode: strict-live-focused
- Full workspace suite: False
- Check timeout seconds: 300
- Status: passed

| Check | Status | Seconds | Detail |
| --- | --- | ---: | --- |
| `taskflow-validate-all` | pass | 1.851 | OK   task-042-workbench-live-controls OK   task-043-export-renderer-pipeline OK   task-044-observability-audit-hardening OK   task-045-report-path-hygiene OK   task-046-live-paper-quality-benchmark OK   task-047-strict-acceptance-timeouts OK   task-048-paperrun-completion-gates OK   task-049-export-pdf-renderer-fallback OK   task-050-default-observability-coverage OK   task-051-live-benchmark-regression-pass  All tasks are valid. |
| `readme-changelog-version` | pass | 0.705 | README version 0.4.4-dev matches CHANGELOG latest version. |
| `tracked-secret-scan` | pass | 1.663 | no tracked sk-* API keys found |
| `server-tests` | pass | 88.134 | test\paper\strict-acceptance.test.ts: (pass) strict live acceptance script > declares the complete required check inventory (pass) strict live acceptance script > keeps strict live checks strict while allowing deterministic fixture tests (pass) strict live acceptance script > scans only tracked files for secrets and writes the markdown report (pass) strict live acceptance script > bounds each check and writes partial reports during execution (pass) strict live acceptance script > uses focused pa... |
| `preview-tests` | pass | 11.941 | $ bun test --timeout 30000 bun test v1.3.13 (bf2e2cec)  test\preview.test.ts: (pass) preview server > serves token-protected read-only preview endpoints (pass) preview server > cancels stale render jobs and keeps the newest markdown [32.00ms]   2 pass  0 fail  9 expect() calls Ran 2 tests across 1 file. [83.00ms] |
| `python-tests` | pass | 1.85 | .... ---------------------------------------------------------------------- Ran 4 tests in 0.840s  OK |
| `server-typecheck` | pass | 18.83 | $ tsgo --noEmit |
| `workspace-typecheck` | pass | 20.446 | @paper-fucker/preview:typecheck: cache hit, replaying logs 626b1b236385009d @paper-fucker/preview:typecheck: $ tsgo --noEmit @opencode-ai/console-app:typecheck: cache hit, replaying logs 90f11eb2762a5ca7 @opencode-ai/console-app:typecheck: $ tsgo --noEmit @opencode-ai/enterprise:typecheck: cache hit, replaying logs 6d55f40371432afd @opencode-ai/enterprise:typecheck: $ tsgo --noEmit paper_fucker:typecheck: $ tsgo --noEmit   Tasks:    13 successful, 13 total Cached:    12 cached, 13 total   Time: ... |
| `opencode-tui-smoke` | pass | 16.652 | local paper_fucker CLI help responded |
| `live-provider-call` | pass | 1.287 | provider deepseek model deepseek-v4-pro responded |
| `exa-live-search` | pass | 0.319 | Exa MCP remote initialize responded |
| `nature-skill-profile` | pass | 6.75 | nature-paper skill installed and official guidance reachable |
| `pandoc-conversion` | pass | 0.545 | pandoc generated acceptance.tex |
| `latex-pdf-generation` | pass | 3.491 | xelatex.exe generated acceptance-pdf.pdf |
| `docx-generation` | pass | 0.734 | pandoc generated acceptance-docx.docx |
| `topic-to-paper-live-run` | pass | 19.511 | $ bun test --timeout 30000 "test/research/e2e.test.ts" bun test v1.3.13 (bf2e2cec)  test\research\e2e.test.ts: (pass) research pipeline end-to-end acceptance > runs a fixture topic through implemented stages and produces a final export [3703.00ms] (pass) research pipeline end-to-end acceptance > blocks final export on failed gate and produces a forced draft bundle [1265.00ms]   2 pass  0 fail  18 expect() calls Ran 2 tests across 1 file. [7.41s] |
| `code-to-paper-live-run` | pass | 15.029 | $ bun test --timeout 30000 test/paper/code-to-paper.test.ts bun test v1.3.13 (bf2e2cec)  test\paper\code-to-paper.test.ts: (pass) code-to-paper analysis > produces code-grounded artifacts with source ranges [125.00ms] (pass) code-to-paper analysis > records code-to-paper artifacts into a research run [766.00ms]   2 pass  0 fail  7 expect() calls Ran 2 tests across 1 file. [3.37s] |
| `hard-fork-paper-core` | pass | 0.003 | paper core lives under packages/opencode/src/paper and no packages/server sidecar exists |
| `hard-fork-paperrun-api-tui` | pass | 0.008 | PaperRun API and TUI workbench are first-class paper surfaces |
| `hard-fork-agent-tree` | pass | 0.004 | Agent Tree supports nested multi-model agents with budget limits |
| `hard-fork-quality-egress` | pass | 0.007 | quality modes, private-first egress, forced draft, supplementary, and availability bundles are present |
| `hard-fork-public-branding` | pass | 0.006 | public logo, command registry, and TUI tips expose Paper Fucker/PaperRun instead of legacy OpenCode surfaces |
| `observability-audit-coverage` | pass | 0.007 | PaperRun diagnostics expose observability audit coverage for stage/capability/model/subagent/tool/egress/export/cost |
| `git-flow-cleanup` | pass | 0.166 | current branch feature/live-benchmark-regression-pass follows Git Flow and no codex/task branches remain |
