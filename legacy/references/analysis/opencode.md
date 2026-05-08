# OpenCode Analysis

Source: `packages/opencode`, `upstream/opencode-manifest.json`
Decision: adopt as substrate, do not make it the paper-domain authority.

## Useful Capabilities

- Tools: shell, edit/apply_patch, grep/glob, web fetch/search, task/subagent, skill, and MCP tool conversion already exist under `packages/opencode/src/tool` and `packages/opencode/src/mcp`.
- Agent model: primary/subagent modes, permission rules, model selection, and configurable agents are already represented in `packages/opencode/src/agent/agent.ts`.
- Sessions: message persistence, compaction, status, retry, revert, and session events are mature enough to host long-running research conversations.
- LSP: edit/apply_patch can surface diagnostics after code edits, useful for generated experiment code.
- MCP: remote and local MCP servers are supported; project config now includes `exa` as a remote MCP search connector.
- TUI/web: existing command routing and UI surfaces can display run controls without inventing a new terminal framework.

## Adopt

- Use OpenCode permissions and tools for concrete actions: command execution, file edits, source fetching, MCP calls, and diagnostics.
- Use sessions/events as an interaction substrate for TUI guidance and checkpoints.
- Use MCP remote support for Exa and future literature/search connectors.
- Use LSP diagnostics as one signal in experiment-code generation and repair.

## Defer

- Deep integration with upstream session persistence until first-party research run ids are stable.
- Subagent fan-out for writing/review until authenticity gates can trace every model/tool contribution.

## Reject

- Putting `TemplateSpec`, `LiteratureMap`, `ExperimentRun`, `ClaimLedger`, `BlockingReport`, or `ExportBundle` inside `packages/opencode`.
- Treating slash commands as the primary workflow. They remain escape hatches; the default flow is automatic orchestration from a topic.

## Follow-up

- Add a first-party `opencode-adapter` that exposes a narrow interface: `runTool`, `runAgent`, `queueTuiGuidance`, `emitRunControl`.
- Keep OpenCode package changes minimal and compatibility-focused.
