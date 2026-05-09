# Experiment MCP Loop

Version: 0.1.25-dev

Task: `task-028-experiment-mcp-loop`

## Summary

paper_fucker now exposes a paper-domain experiment loop helper that connects experiment stages to skills, OpenCode shell, and Python research tools, and makes final claim eligibility depend on reproduction status.

## Implemented

- Added experiment-loop capability resolution for:
  - `skill.jupyter-notebook`
  - `opencode.shell`
  - `python.experiment-log-parse`
  - `python.dataset-metadata-probe`
- Added metric parsing from experiment logs.
- Added direction inference for metrics such as accuracy, loss, and latency.
- Added reproduction-aware claim eligibility:
  - reproduced results are claimable
  - unreproduced results are blocked
  - explicitly exploratory results can be cited only as exploratory and cannot become final claims

## Verification

- `npx --yes bun@1.3.13 --cwd packages/server test test/paper/experiment-loop.test.ts`
  - Result: 4 pass, 0 fail, 5 expects.

Further repository verification is recorded in the TaskFlow step log.
