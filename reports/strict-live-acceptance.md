# Strict Live Acceptance Report

- Generated: 2026-05-09T09:35:40.2504274+08:00
- Mode: strict-live
- Status: passed

| Check | Status | Seconds | Detail |
| --- | --- | ---: | --- |
| `taskflow-validate-all` | pass | 0.689 | OK   task-022-model-router OK   task-023-research-skill-mcp-bus OK   task-024-paper-profile-skills OK   task-025-research-intake OK   task-026-real-orchestrator OK   task-027-code-to-paper OK   task-028-experiment-mcp-loop OK   task-029-tui-paper-workbench OK   task-030-paper-authoring-loop OK   task-031-strict-live-acceptance  All tasks are valid. |
| `readme-changelog-version` | pass | 0.852 | README version 0.2.0-dev matches CHANGELOG latest version. |
| `tracked-secret-scan` | pass | 0.411 | no tracked sk-* API keys found |
| `server-tests` | pass | 31.605 |  test\research\writing.test.ts: (pass) writing and claim ledger > creates a claim ledger before draft sections and binds citations (pass) writing and claim ledger > records streamed Markdown draft, claim facts, and draft facts [422.00ms] (pass) writing and claim ledger > annotates unsupported claims with required action in Markdown (pass) writing and claim ledger > applies checkpoint guidance to the next draft revision (pass) writing and claim ledger > records a diff and can roll back to the pre... |
| `preview-tests` | pass | 7.194 | $ bun test --timeout 30000 bun test v1.3.13 (bf2e2cec)  test\preview.test.ts: (pass) preview server > serves token-protected read-only preview endpoints [15.00ms] (pass) preview server > cancels stale render jobs and keeps the newest markdown [31.00ms]   2 pass  0 fail  9 expect() calls Ran 2 tests across 1 file. [106.00ms] |
| `python-tests` | pass | 0.801 | .... ---------------------------------------------------------------------- Ran 4 tests in 0.468s  OK |
| `server-typecheck` | pass | 7.066 | $ tsgo --noEmit |
| `workspace-typecheck` | pass | 7.928 | @opencode-ai/ui:typecheck: $ tsgo --noEmit @opencode-ai/sdk:typecheck: cache hit, replaying logs 9ac1d35952ee4299 @paper-fucker/preview:typecheck: cache hit, replaying logs 35d181cf5889d108 @opencode-ai/sdk:typecheck: $ tsgo --noEmit @paper-fucker/preview:typecheck: $ tsgo --noEmit @opencode-ai/core:typecheck: cache hit, replaying logs 071e8e42ffb56ab5 @opencode-ai/core:typecheck: $ tsgo --noEmit   Tasks:    14 successful, 14 total Cached:    14 cached, 14 total   Time:    201ms >>> FULL TURBO  |
| `opencode-tui-smoke` | pass | 1.729 | 1.14.25 |
| `live-provider-call` | pass | 1.512 | provider deepseek model deepseek-v4-pro responded |
| `exa-live-search` | pass | 0.411 | Exa MCP remote initialize responded |
| `nature-skill-profile` | pass | 3.149 | nature-paper skill installed and official guidance reachable |
| `pandoc-conversion` | pass | 0.149 | pandoc generated acceptance.tex |
| `latex-pdf-generation` | pass | 1.222 | xelatex.exe generated acceptance-pdf.pdf |
| `docx-generation` | pass | 0.095 | pandoc generated acceptance-docx.docx |
| `topic-to-paper-live-run` | pass | 9.917 | $ bun test --timeout 30000 "test/research/e2e.test.ts" bun test v1.3.13 (bf2e2cec)  test\research\e2e.test.ts: (pass) research pipeline end-to-end acceptance > runs a fixture topic through implemented stages and produces a final export [2359.00ms] (pass) research pipeline end-to-end acceptance > blocks final export on failed gate and produces a forced draft bundle [344.00ms]   2 pass  0 fail  18 expect() calls Ran 2 tests across 1 file. [2.81s] |
| `code-to-paper-live-run` | pass | 7.878 | $ bun test --timeout 30000 test/paper/code-to-paper.test.ts bun test v1.3.13 (bf2e2cec)  test\paper\code-to-paper.test.ts: (pass) code-to-paper analysis > produces code-grounded artifacts with source ranges [125.00ms] (pass) code-to-paper analysis > records code-to-paper artifacts into a research run [766.00ms]   2 pass  0 fail  7 expect() calls Ran 2 tests across 1 file. [1003.00ms] |
| `git-flow-cleanup` | pass | 0.09 | current branch develop follows Git Flow and no codex/task branches remain |
