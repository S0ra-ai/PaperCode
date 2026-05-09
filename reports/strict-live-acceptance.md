# Strict Live Acceptance Report

- Generated: 2026-05-09T09:29:48.0528835+08:00
- Mode: strict-live
- Status: passed

| Check | Status | Seconds | Detail |
| --- | --- | ---: | --- |
| `taskflow-validate-all` | pass | 0.644 | OK   task-022-model-router OK   task-023-research-skill-mcp-bus OK   task-024-paper-profile-skills OK   task-025-research-intake OK   task-026-real-orchestrator OK   task-027-code-to-paper OK   task-028-experiment-mcp-loop OK   task-029-tui-paper-workbench OK   task-030-paper-authoring-loop OK   task-031-strict-live-acceptance  All tasks are valid. |
| `readme-changelog-version` | pass | 0.854 | README version 0.2.0-dev matches CHANGELOG latest version. |
| `tracked-secret-scan` | pass | 0.475 | no tracked sk-* API keys found |
| `server-tests` | pass | 31.283 |  test\research\writing.test.ts: (pass) writing and claim ledger > creates a claim ledger before draft sections and binds citations (pass) writing and claim ledger > records streamed Markdown draft, claim facts, and draft facts [422.00ms] (pass) writing and claim ledger > annotates unsupported claims with required action in Markdown (pass) writing and claim ledger > applies checkpoint guidance to the next draft revision (pass) writing and claim ledger > records a diff and can roll back to the pre... |
| `preview-tests` | pass | 7.215 | $ bun test --timeout 30000 bun test v1.3.13 (bf2e2cec)  test\preview.test.ts: (pass) preview server > serves token-protected read-only preview endpoints (pass) preview server > cancels stale render jobs and keeps the newest markdown [32.00ms]   2 pass  0 fail  9 expect() calls Ran 2 tests across 1 file. [89.00ms] |
| `python-tests` | pass | 0.709 | .... ---------------------------------------------------------------------- Ran 4 tests in 0.424s  OK |
| `server-typecheck` | pass | 7.054 | $ tsgo --noEmit |
| `workspace-typecheck` | pass | 8.194 | @paper-fucker/preview:typecheck: cache hit, replaying logs 58c77cf2832b96e1 @paper-fucker/preview:typecheck: $ tsgo --noEmit @opencode-ai/slack:typecheck: cache hit, replaying logs 00afa8a7a00d85ce @opencode-ai/console-core:typecheck: cache hit, replaying logs c7db77b1a63e21bc @opencode-ai/slack:typecheck: $ tsgo --noEmit @opencode-ai/console-core:typecheck: $ tsgo --noEmit @paper-fucker/server:typecheck: $ tsgo --noEmit   Tasks:    14 successful, 14 total Cached:    13 cached, 14 total   Time: ... |
| `opencode-tui-smoke` | pass | 1.539 | 1.14.25 |
| `live-provider-call` | pass | 1.312 | provider deepseek model deepseek-v4-pro responded |
| `exa-live-search` | pass | 0.328 | Exa MCP remote initialize responded |
| `nature-skill-profile` | pass | 3.193 | nature-paper skill installed and official guidance reachable |
| `pandoc-conversion` | pass | 0.117 | pandoc generated acceptance.tex |
| `latex-pdf-generation` | pass | 1.265 | xelatex.exe generated acceptance-pdf.pdf |
| `docx-generation` | pass | 0.114 | pandoc generated acceptance-docx.docx |
| `topic-to-paper-live-run` | pass | 9.73 | $ bun test --timeout 30000 "test/research/e2e.test.ts" bun test v1.3.13 (bf2e2cec)  test\research\e2e.test.ts: (pass) research pipeline end-to-end acceptance > runs a fixture topic through implemented stages and produces a final export [2188.00ms] (pass) research pipeline end-to-end acceptance > blocks final export on failed gate and produces a forced draft bundle [312.00ms]   2 pass  0 fail  18 expect() calls Ran 2 tests across 1 file. [2.60s] |
| `code-to-paper-live-run` | pass | 7.513 | $ bun test --timeout 30000 test/paper/code-to-paper.test.ts bun test v1.3.13 (bf2e2cec)  test\paper\code-to-paper.test.ts: (pass) code-to-paper analysis > produces code-grounded artifacts with source ranges [125.00ms] (pass) code-to-paper analysis > records code-to-paper artifacts into a research run [719.00ms]   2 pass  0 fail  7 expect() calls Ran 2 tests across 1 file. [961.00ms] |
| `git-flow-cleanup` | pass | 0.104 | current branch feature/strict-live-acceptance follows Git Flow and no codex/task branches remain |
