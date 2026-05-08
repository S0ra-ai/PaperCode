# Research Skill/MCP Bus

Version: 0.1.20-dev

Task: `task-023-research-skill-mcp-bus`

## Summary

`ResearchCapabilityRegistry` is now the paper-domain capability bus. It records OpenCode tools, MCP servers, skills, first-party paper tools, and Python research tools as structured capabilities that can be selected by paper stage.

## Implemented

- Added the full paper stage surface from `intake` through `export`.
- Added capability metadata for type, substrate, schemas, trust level, cost, network requirement, and allowed stages.
- Added duplicate registration and missing capability diagnostics.
- Added stage/type filtering for orchestrator selection.
- Added trace metadata for future tool trace artifact and OpenTelemetry span recording.
- Registered defaults for:
  - Exa remote MCP search.
  - OpenCode `read`, `grep`, `glob`, `task`, and `shell`.
  - `nature-paper` and `jupyter-notebook` skills.
  - paper_fucker ClaimLedger and export bundle tools.
  - Python experiment log parsing and dataset metadata probing.

## Verification

- `npx --yes bun@1.3.13 --cwd packages/server test test/paper/capabilities.test.ts`
  - Result: 4 pass, 0 fail, 11 expects.

Further repository verification is recorded in the TaskFlow step log.
