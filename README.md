# paper_fucker

Current version: <!-- version:start -->0.1.20-dev<!-- version:end -->

`paper_fucker` is a private-first, OpenCode-derived closed-loop paper system. It turns a topic, codebase, dataset, experiment log, or paper material set into a verifiable academic-paper bundle with research planning, source discovery, code understanding, experiment/reproduction support, ClaimLedger-first writing, authenticity gates, profile-aware formatting, preview, and export.

The repository is governed by TaskFlow. The active implementation plan lives in `.plan/confirmed/`; historical planning drafts are not an execution source.

## Current Status

- End-to-end fixture acceptance now covers the first-party research pipeline from topic intake through template resolution, literature/data discovery, experiments, ClaimLedger writing, verification gate, final export, and forced draft failure behavior.
- The product direction is a deep OpenCode transformation, not a thin wrapper: OpenCode remains the substrate for providers/models, agents/sessions, tools, MCP, skills, TUI, permissions, and plugins.
- paper_fucker owns the paper domain: intake, paper profiles, model roles, capability registry, paper orchestration, authoring loop, authenticity gates, and export bundles.
- Supported input modes are topic-to-paper, code-to-paper, data-to-paper, experiment-log-to-paper, and mixed-materials-to-paper.
- Model selection is role-based and OpenCode-provider-agnostic. The paper workflow resolves planner, literature researcher, code analyst, experiment designer, writer, reviewer, citation checker, and cheap summarizer roles from OpenCode `provider/model` ids.
- The authoritative research contracts and server-side paper_fucker runtime live under `packages/server`.
- Research runs are stored workspace-first under `<workspace>/.paper_fucker/runs/<run-id>`, with `~/.paper_fucker/runs/<run-id>` as the fallback.
- Runtime operations are automatic API calls, not workflows that require users to keep typing shell commands.
- Initialization writes config, linked tool paths, and encrypted secrets under `~/.paper_fucker`; it does not write credentials to `.env` or repository files.
- The default language is Chinese (`zh-CN`). DeepSeek with OpenCode model id `deepseek/deepseek-v4-pro` is the default sample endpoint, but paper_fucker is provider-agnostic and must support every provider/model that OpenCode supports.
- Exa is configured as a remote MCP search connector for source discovery through `.paper_fucker/paper_fucker.jsonc`.
- MCP servers and skills are first-class research capabilities. Literature search, code analysis, experiments, paper profiles, statistical checks, figures, and export helpers are routed through the `ResearchCapabilityRegistry` instead of bypassing OpenCode.
- The automatic orchestrator now owns the default topic-to-paper stage graph and proceeds stage-by-stage unless a pause condition is raised.
- Trusted template resolution now records `TemplateSpec.v1`, adopts clear high-confidence official templates automatically, and falls back to a CJC default when no venue is known.
- Open literature and dataset discovery now records `SourceRecord.v1`, `LiteratureMap.v1`, `DataPlan.v1`, `DatasetCard.v1`, and direction feasibility artifacts with license and verification diagnostics.
- The experiment loop now plans proposed/baseline/ablation runs, records host exploration, requires container reproduction for final claims, and classifies environment/resource/method failures.
- ClaimLedger-first writing now binds claims to citations before Markdown draft generation, streams draft chunks, annotates unsupported claims, and records diff/rollback metadata.
- The final authenticity gate now blocks invalid references, unsupported claims, dataset license failures, and failed container reproduction while preserving non-blocking reviewer warnings.
- Export bundles now produce Markdown/LaTeX/PDF/DOCX manifests, block final exports when the authenticity gate fails, and allow clearly marked forced drafts with failed checks attached.
- The repository root is paper_fucker-first; upstream localized OpenCode README files are preserved under `upstream/opencode-readmes/`.
- The imported OpenCode package remains the upstream-derived agent/CLI substrate while paper_fucker runtime surfaces are extracted into first-party packages.
- Python is reserved for per-run MCP and CLI research tools.
- Project configuration and run indexes use `~/.paper_fucker`.
- The default target is Windows-native operation.

## Project Structure

- `schemas/research/`: JSON Schema source of truth for research runs, events, artifacts, sources, tool traces, claims, drafts, reviews, exports, and checkpoints.
- `packages/server/`: first-party paper_fucker TypeScript server/runtime package. It owns AJV validation, OpenTelemetry span hooks, generated TypeScript contract types, run/event/artifact runtime APIs, permission/resource/cost/final-gate state, Python tool bridge calls, and rebuildable SQLite indexes.
- `packages/server/src/init/`: first-party initialization and diagnostics flow for `~/.paper_fucker/config.json`, `tools.json`, encrypted `secrets.enc`, external tool discovery, and Full Access acknowledgement.
- `packages/server/src/paper/`: first-party paper domain entrypoint. It defines the OpenCode-substrate architecture, paper input modes, and future model/capability/profile/orchestrator/authoring surfaces.
- `packages/server/src/paper/capabilities.ts`: research capability bus for OpenCode built-in tools, MCP servers, skills, first-party paper tools, and Python research tools. The orchestrator queries it by stage and records tool trace/OpenTelemetry metadata for each capability call.
- `packages/server/src/research/orchestrator/`: automatic topic-to-paper stage graph, Full Access pause policy, checkpoint guidance queue, and run controls.
- `packages/server/src/research/templates/`: trusted template resolution, source evidence/confidence policy, and Markdown-to-LaTeX application through the Python bridge.
- `packages/server/src/research/sources/`: open-source-first literature and dataset discovery, source verification metadata, license/access checks, and automatic nearby-direction feasibility turns.
- `packages/server/src/research/experiments/`: experiment planning, host exploration runner abstraction, container reproduction gate, result analysis, and experiment artifacts.
- `packages/server/src/research/writing/`: ClaimLedger-first writing, citation binding, streamed Markdown draft composition, checkpoint guidance application, and rollback diffs.
- `packages/server/src/research/verification/`: final authenticity gate, blocking reports, review reports, reference/claim/data/reproduction checks, and multi-model review aggregation.
- `packages/server/src/research/export/`: final and forced-draft export bundle creation, manifest generation, missing renderer diagnostics, and export fact recording.
- `packages/server/src/research/README.md`: first-party research runtime boundary guide; domain logic belongs in this runtime and only uses `packages/opencode` through deliberate substrate adapters.
- `packages/preview/`: first-party localhost read-only research preview package with token-checked snapshot/SSE endpoints and static Markdown/LaTeX/PDF/DOCX/annotation/diagnostics UI.
- `research-tools/`: Python MCP/CLI tool package. It provides structured MCP-style diagnostics/probe/document helpers, one-shot conversion commands, external tool discovery/linking for pandoc and LaTeX engines, and generated Pydantic v2 models for tool-side validation.
- `legacy/references/`: reference-project manifests and adopt/defer/reject analysis. These files are design guidance only and do not authorize code import.
- `upstream/opencode-readmes/`: localized README files imported from the OpenCode snapshot, retained for provenance and translation reference instead of root-level project documentation.
- `packages/opencode/`: imported OpenCode-derived agent and CLI substrate retained during migration; new paper_fucker domain code should not be added here unless it is a deliberate compatibility adapter.

## Planning Source

Use TaskFlow tasks under `.plan/confirmed/` as the implementation source of truth.

Important early tasks:

- `task-001-repo-governance`: repository, license, changelog, and Git Flow governance.
- `task-002-legacy-archive`: safe archive of legacy source projects.
- `task-003-import-opencode`: import an OpenCode release snapshot as the product base.
- `task-004-brand-paper-fucker`: rebrand command, config, and user-facing surfaces.
- `task-017-core-contract`: schema, storage, event, artifact, and generated type contracts.
- `task-005-research-runtime`: first-party research run, event, artifact, permission, resource, cost, resume, and final gate runtime.
- `task-006-python-tool-bridge`: Python MCP-style and CLI research tools invoked automatically by the server runtime.
- `task-007-init-wizard`: initialization, diagnostics, external tool discovery, encrypted secrets, and Full Access acknowledgement.
- `task-008-preview-runtime`: localhost token-protected read-only research preview with realtime render status and annotation display.
- `task-018-phase-1-acceptance`: Windows-native phase 1 acceptance gate.
- `task-020-end-to-end-acceptance`: fixture-topic end-to-end acceptance for final/forced export behavior and research pipeline integration.
- `task-021-architecture-reframe`: OpenCode substrate plus paper_fucker paper-domain architecture reframe.
- `task-022-model-router`: provider-agnostic model role router.
- `task-023-research-skill-mcp-bus`: MCP/skill/tool/Python capability registry.
- `task-024-paper-profile-skills`: paper profile registry and first-party `nature-paper` skill.
- `task-025-research-intake`: multi-input intake for topics, code, data, logs, and materials.
- `task-026-real-orchestrator`: no-stub paper stage graph.
- `task-027-code-to-paper`: source-range-grounded codebase-to-paper artifacts.
- `task-028-experiment-mcp-loop`: MCP-assisted experiment and reproduction loop.
- `task-029-tui-paper-workbench`: OpenCode TUI refactor into paper workbench.
- `task-030-paper-authoring-loop`: run-bound preview, review, revision, and export loop.
- `task-031-strict-live-acceptance`: final strict live acceptance for the complete paper system.

## Branching

This repository uses Git Flow:

- `main` is the stable integration branch.
- `develop` is the development integration branch.
- Work branches use Git Flow names based on the function being changed, for example `feature/repository-governance`, `fix/version-check`, or `hotfix/private-license`.

Do not publish releases, tags, or public packages unless explicitly approved.

## Version Policy

`CHANGELOG` is the only version source.

README must expose the same version as the latest `CHANGELOG` entry. Run this check after any changelog or README update:

```powershell
.\scripts\check-readme-version.ps1
```

Development versions advance as `<major>.<minor>.<patch>-dev`; each completed TaskFlow change records a distinct dev version such as `0.1.2-dev`.

## License

This project is private and all rights are reserved unless a later written license change says otherwise.

Third-party source snapshots keep their original licenses. OpenCode provenance and license details are recorded in `NOTICE.md` for the imported upstream snapshot.
