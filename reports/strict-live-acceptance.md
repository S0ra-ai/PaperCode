# Strict Live Acceptance Report

- Generated: 2026-05-10T18:29:15.9570330+08:00
- Mode: strict-live-focused
- Full workspace suite: False
- Check timeout seconds: 300
- Status: passed

| Check | Status | Seconds | Detail |
| --- | --- | ---: | --- |
| `taskflow-validate-all` | pass | 1.985 | OK   task-044-observability-audit-hardening OK   task-045-report-path-hygiene OK   task-046-live-paper-quality-benchmark OK   task-047-strict-acceptance-timeouts OK   task-048-paperrun-completion-gates OK   task-049-export-pdf-renderer-fallback OK   task-050-default-observability-coverage OK   task-051-live-benchmark-regression-pass OK   task-052-remove-stub-leftovers OK   task-053-tui-provider-copy-cleanup  All tasks are valid. |
| `readme-changelog-version` | pass | 1.236 | README version 0.5.2-dev matches CHANGELOG latest version. |
| `tracked-secret-scan` | pass | 1.693 | no tracked sk-* API keys found |
| `server-tests` | pass | 90.042 | test\paper\strict-acceptance.test.ts: (pass) strict live acceptance script > declares the complete required check inventory (pass) strict live acceptance script > keeps strict live checks strict while allowing deterministic fixture tests (pass) strict live acceptance script > scans only tracked files for secrets and writes the markdown report (pass) strict live acceptance script > bounds each check and writes partial reports during execution (pass) strict live acceptance script > uses focused pa... |
| `preview-tests` | pass | 13.584 | $ bun test --timeout 30000 bun test v1.3.13 (bf2e2cec)  test\preview.test.ts: (pass) preview server > serves token-protected read-only preview endpoints (pass) preview server > cancels stale render jobs and keeps the newest markdown [31.00ms]   2 pass  0 fail  9 expect() calls Ran 2 tests across 1 file. [89.00ms] |
| `python-tests` | pass | 2.355 | ..... ---------------------------------------------------------------------- Ran 5 tests in 0.996s  OK |
| `server-typecheck` | pass | 18.101 | $ tsgo --noEmit |
| `workspace-typecheck` | pass | 20.496 | @opencode-ai/console-core:typecheck: cache hit, replaying logs 9fd53be0810888b9 @opencode-ai/console-core:typecheck: $ tsgo --noEmit @opencode-ai/ui:typecheck: cache hit, replaying logs b11cc6796bcb7c0a @opencode-ai/ui:typecheck: $ tsgo --noEmit @paper-fucker/preview:typecheck: cache hit, replaying logs 626b1b236385009d @paper-fucker/preview:typecheck: $ tsgo --noEmit paper_fucker:typecheck: $ tsgo --noEmit   Tasks:    13 successful, 13 total Cached:    12 cached, 13 total   Time:    7.974s   |
| `opencode-tui-smoke` | pass | 17.02 | local paper_fucker CLI help responded |
| `live-provider-call` | pass | 1.331 | provider deepseek model deepseek-v4-pro responded |
| `exa-live-search` | pass | 0.4 | Exa MCP remote initialize responded |
| `nature-skill-profile` | pass | 3.881 | nature-paper skill installed and official guidance reachable |
| `pandoc-conversion` | pass | 0.695 | pandoc generated acceptance.tex |
| `latex-pdf-generation` | pass | 4.029 | xelatex.exe generated acceptance-pdf.pdf |
| `docx-generation` | pass | 0.616 | pandoc generated acceptance-docx.docx |
| `topic-to-paper-live-run` | pass | 20.833 | $ bun test --timeout 30000 "test/research/e2e.test.ts" bun test v1.3.13 (bf2e2cec)  test\research\e2e.test.ts: (pass) research pipeline end-to-end acceptance > runs a fixture topic through implemented stages and produces a final export [3796.00ms] (pass) research pipeline end-to-end acceptance > blocks final export on failed gate and produces a forced draft bundle [1313.00ms]   2 pass  0 fail  18 expect() calls Ran 2 tests across 1 file. [7.52s] |
| `code-to-paper-live-run` | pass | 15.845 | $ bun test --timeout 30000 test/paper/code-to-paper.test.ts bun test v1.3.13 (bf2e2cec)  test\paper\code-to-paper.test.ts: (pass) code-to-paper analysis > produces code-grounded artifacts with source ranges [140.00ms] (pass) code-to-paper analysis > records code-to-paper artifacts into a research run [797.00ms]   2 pass  0 fail  7 expect() calls Ran 2 tests across 1 file. [3.49s] |
| `hard-fork-paper-core` | pass | 0.003 | paper core lives under packages/opencode/src/paper and no packages/server sidecar exists |
| `hard-fork-paperrun-api-tui` | pass | 0.007 | PaperRun API and TUI workbench are first-class paper surfaces |
| `hard-fork-agent-tree` | pass | 0.004 | Agent Tree supports nested multi-model agents with budget limits |
| `hard-fork-quality-egress` | pass | 0.005 | quality modes, private-first egress, forced draft, supplementary, and availability bundles are present |
| `hard-fork-public-branding` | pass | 0.005 | public logo, command registry, and TUI tips expose Paper Fucker/PaperRun instead of legacy OpenCode surfaces |
| `observability-audit-coverage` | pass | 0.006 | PaperRun diagnostics expose observability audit coverage for stage/capability/model/subagent/tool/egress/export/cost |
| `git-flow-cleanup` | pass | 0.164 | current branch fix/tui-provider-copy follows Git Flow and no codex/task branches remain |
