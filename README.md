# paper_fucker

Current version: <!-- version:start -->0.5.5-dev<!-- version:end -->

`paper_fucker` is a private-first, OpenCode-derived closed-loop paper system. It turns a topic, codebase, dataset, experiment log, or paper material set into a verifiable academic-paper bundle with research planning, source discovery, code understanding, experiment/reproduction support, ClaimLedger-first writing, authenticity gates, profile-aware formatting, preview, and export.

The repository is governed by TaskFlow. The active implementation plan lives in `.plan/confirmed/`; historical planning drafts are not an execution source.

## Current Status

- End-to-end fixture acceptance now covers the first-party research pipeline from topic intake through template resolution, literature/data discovery, experiments, ClaimLedger writing, verification gate, final export, and forced draft failure behavior.
- The product direction is a deep OpenCode transformation, not a thin wrapper: OpenCode remains the substrate for providers/models, agents/sessions, tools, MCP, skills, TUI, permissions, and plugins.
- paper_fucker owns the paper domain: intake, paper profiles, model roles, capability registry, paper orchestration, authoring loop, authenticity gates, and export bundles.
- Supported input modes are topic-to-paper, code-to-paper, data-to-paper, experiment-log-to-paper, and mixed-materials-to-paper.
- Model selection is role-based and OpenCode-provider-agnostic. The paper workflow resolves planner, literature researcher, code analyst, experiment designer, writer, reviewer, citation checker, and cheap summarizer roles from OpenCode `provider/model` ids.
- OpenAI-compatible provider discovery accepts a user-supplied `base_url` and API key, calls `/models`, stores public provider config under `~/.paper_fucker/providers/`, and stores API keys only under `~/.paper_fucker/local/`.
- Multi-model agent orchestration now has an explicit recursive `AgentRoleRouter` and `AgentTree`: root, stage, worker, specialist, reviewer, verifier, and citation subagents can resolve different OpenCode provider/model ids, continue spawning child agents, and stop by budget, time, parallelism, context, permission, data-egress, license, source, authenticity, or coverage conditions instead of fixed depth limits.
- Data egress is private-first. Agent/tool calls evaluate authorized paths, denied patterns, secret-like files, binary artifacts, and audit events before content may leave the local workspace.
- Tracked documentation no longer contains provider-token-shaped example keys; local credentials remain under ignored `.paper_fucker/local/`.
- The authoritative research contracts and paper_fucker runtime now live inside the OpenCode hard fork under `packages/opencode/src/paper`.
- `PaperRun` is now the first-class user-visible state model. Instance HTTP API routes under `/paper` create runs, stream run snapshots, record guidance, expose preview/export status, list capabilities, run doctor diagnostics, discover providers, and resolve model roles.
- The TUI home screen now submits natural Chinese research input to `/paper/runs` and navigates into a PaperRun dashboard instead of creating an ordinary chat session.
- Public CLI, startup logo, default help, and TUI home guidance now present Paper Fucker as the product surface. Legacy OpenCode chat/session/acp/github/pr commands are kept out of the default user entrypoint or hidden as internal compatibility substrate.
- TUI home/tips copy is Chinese by default and avoids user-facing OpenCode product wording for provider setup and code-to-paper examples.
- Research runs are stored workspace-first under `<workspace>/.paper_fucker/runs/<run-id>`, with `~/.paper_fucker/runs/<run-id>` as the fallback.
- Runtime operations are automatic API calls, not workflows that require users to keep typing shell commands.
- Initialization writes config, linked tool paths, and encrypted secrets under `~/.paper_fucker`; it does not write credentials to `.env` or repository files.
- The default language is Chinese (`zh-CN`). DeepSeek with OpenCode model id `deepseek/deepseek-v4-pro` is the default sample endpoint, but paper_fucker is provider-agnostic and must support every provider/model that OpenCode supports.
- Exa is configured as a remote MCP search connector for source discovery through `.paper_fucker/paper_fucker.jsonc`.
- MCP servers and skills are first-class research capabilities. Literature search, code analysis, experiments, paper profiles, statistical checks, figures, and export helpers are routed through the `ResearchCapabilityRegistry` instead of bypassing OpenCode.
- Paper profiles are plugin-style domain capabilities. Built-in profile ids are `nature-paper`, `ieee-paper`, `acm-paper`, `springer-paper`, and `generic-preprint`; the first-party `nature-paper` skill is installed under `.paper_fucker/skills/nature-paper/SKILL.md`.
- Research intake accepts topic, code paths, paper files, dataset paths, experiment logs, target profile, language, and model-role overrides, then records a `ResearchBrief.v1` artifact for the run.
- The paper orchestrator owns the complete 14-stage closed-loop graph from intake to export. Missing capabilities or missing concrete handlers now produce `BlockedDiagnostic.v1` instead of silent stage success.
- Code-to-paper analysis produces `CodebaseMap.v1`, `MethodExtraction.v1`, `ExperimentSurface.v1`, and `ReproductionPlan.v1` artifacts with source ranges for every extracted method, test, and reproduction command.
- Experiment claims are gated by reproduction semantics: reproduced results may support final claims, while unreproduced results are blocked unless explicitly marked as exploratory.
- The TUI default screen is now a Chinese paper research workbench with topic/code/material/data/log inputs, provider-role context, capability health, stage graph, ledgers, diagnostics, preview, and export controls represented in the paper state adapter.
- The paper authoring loop now binds drafts to run artifacts, applies profile-aware revision metadata, creates read-only preview snapshots, runs reviewer/authenticity checks, blocks unsafe final export, and emits forced draft, supplementary, and availability bundles.
- Strict live acceptance is available through `scripts/strict-acceptance.ps1`; it validates TaskFlow, version sync, tracked secret hygiene, opencode/preview/Python/typecheck suites, local Paper Fucker CLI/TUI smoke, DeepSeek live provider smoke, Exa MCP live smoke, Nature skill/profile, pandoc, LaTeX, DOCX, topic-to-paper, code-to-paper, hard-fork paper core, PaperRun API/TUI, Agent Tree, private-first egress, observability audit coverage, public branding, and Git Flow branch discipline.
- Strict live acceptance is bounded by per-check timeouts and writes partial progress after every check. The default mode runs a focused paper-critical suite for local milestone validation; `-FullWorkspaceSuite` preserves the slower full `packages/opencode test` path for extended runs.
- Final hard-fork acceptance for `0.3.0-dev` asserts that the user-visible product is now PaperRun-first: the paper core lives under `packages/opencode/src/paper`, `packages/server` is gone, the Chinese TUI creates PaperRuns instead of ordinary chat sessions, nested multi-model agents are traceable, final export is blocked by failed authenticity gates, and forced drafts carry failed checks.
- PaperRun creation now drives the default paper stage engine directly. A new run records planning, literature/data seed discovery, source-range code analysis, experiment/reproduction diagnostics, ClaimLedger, draft, profile check, verification gate, preview/export artifacts, and controller snapshots without requiring fixture handler injection.
- PaperRun now has a durable controller state. Pause checkpoints, guidance queue, resume/retry/cancel controls, controller SSE events, and `controller_state` snapshots are persisted under each run so the TUI/API can steer runs without shell commands.
- Intake now records a real `MaterialIndex.v1` for user-supplied code paths, paper files, datasets, and experiment logs. Indexed material receives source ranges and Source Ledger entries; secret-like paths, ignored directories, and unsupported binaries are skipped with explicit reasons.
- The PaperRun TUI dashboard now exposes live Chinese controls for guidance, resume, retry, cancel, preview, final export, forced draft export, capability health, model-role visibility, and a persistent right sidebar for cost/token/context, paper outline, Agent Tree, gate status, blockers, and recent tool/model diagnostics.
- PaperRun export now renders run-bound Markdown, LaTeX, PDF, DOCX, and `manifest.json` files when tools are available. Missing pandoc or LaTeX engines produce explicit diagnostics, while forced drafts are visibly marked with failed checks.
- PDF export now falls back across LaTeX engines in order: `latexmk`, `xelatex`, `pdflatex`, `lualatex`, then `tectonic`. Engine failures are retained as diagnostics, Windows paths are normalized for TeX, and Pandoc emits standalone LaTeX for direct compilation.
- PaperRun diagnostics now include durable observability audit coverage for stages, capabilities, model roles, subagents, tool traces, data-egress decisions, export renderers, and cost usage.
- Default PaperRun execution now records that full observability coverage automatically; live reviewable runs no longer require manual helper calls to populate capability, model_role, subagent, tool, data_egress, export_renderer, cost, and stage audit kinds.
- Current runtime cleanup removed Phase 1 stub/not_implemented terminology from paper authenticity guards and renamed the Python DOCX helper to the canonical `docx_generation` tool.
- Historical reports written before `task-032-opencode-paper-core-migration` may retain `packages/server` or `@paper-fucker/server` paths as provenance. They are marked as historical; the current runtime authority is `packages/opencode/src/paper`, and `packages/server` is intentionally absent.
- A live reviewable benchmark now exists for the current paper core: `scripts/live-paper-quality-benchmark.ts` creates a real topic+code PaperRun, records summary JSON under ignored `tmp/`, and writes findings in `reports/live-paper-quality-benchmark.md`. The first run passed live DeepSeek, Exa, Nature, pandoc, DOCX, direct XeLaTeX, and targeted PaperRun tests, while surfacing hardening tasks for strict acceptance timeouts, terminal run status, PDF fallback, and default audit coverage.
- The `0.5.0-dev` live benchmark regression pass confirms those hardening tasks are closed: focused strict acceptance passes, PaperRun terminates as `blocked` when authenticity gates block final export, reproduction is projected as blocked, forced Markdown/LaTeX/PDF/DOCX export succeeds, and observability audit `missing_kinds` is empty.
- PaperRun terminal states now distinguish execution completion from paper eligibility. A full graph whose authenticity gate blocks final export is surfaced as `blocked` with controller status `review_required`, and `reproduction_failure` is reflected on the reproduction stage instead of hiding behind a successful stage label.
- The automatic orchestrator now owns the default topic-to-paper stage graph and proceeds stage-by-stage unless a pause condition is raised.
- Trusted template resolution now records `TemplateSpec.v1`, adopts clear high-confidence official templates automatically, and falls back to a CJC default when no venue is known.
- Open literature and dataset discovery now records `SourceRecord.v1`, `LiteratureMap.v1`, `DataPlan.v1`, `DatasetCard.v1`, and direction feasibility artifacts with license and verification diagnostics.
- The experiment loop now plans proposed/baseline/ablation runs, records host exploration, requires container reproduction for final claims, and classifies environment/resource/method failures.
- ClaimLedger-first writing now binds claims to citations before Markdown draft generation, streams draft chunks, annotates unsupported claims, and records diff/rollback metadata.
- The final authenticity gate now blocks invalid references, unsupported claims, dataset license failures, and failed container reproduction while preserving non-blocking reviewer warnings.
- Export bundles now produce Markdown/LaTeX/PDF/DOCX manifests, block final exports when the authenticity gate fails, and allow clearly marked forced drafts with failed checks attached.
- The repository root is paper_fucker-first; upstream localized OpenCode README files are preserved under `upstream/opencode-readmes/`.
- The imported OpenCode package is now the paper_fucker product core: OpenCode substrate capabilities remain internal, while paper_fucker domain runtime surfaces live in `packages/opencode/src/paper`.
- Python is reserved for per-run MCP and CLI research tools.
- Project configuration and run indexes use `~/.paper_fucker`.
- The default target is Windows-native operation.

## Project Structure

- `paper_fucker` opens the Chinese TUI paper workbench. The user enters a topic, code path, paper material, dataset, experiment log, or mixed request; the home prompt posts it to `/paper/runs` as a `ResearchIntakeRequest`.
- A `PaperRun` is created workspace-first under `.paper_fucker/runs/<run-id>` and automatically advances through intake, planning, literature, code analysis, data, experiment, reproduction, ClaimLedger, drafting, profile formatting, verification, revision, and export.
- The system pauses only for actionable decisions: missing providers/tools, cost limits, data-egress authorization, license/source conflicts, low-confidence direction choices, unreproduced experiments, or authenticity gate blockers.
- The run dashboard shows controls, stage graph, ledgers, model roles, capability health, preview/export controls, and the right sidebar for cost/token/context, outline, Agent Tree, gates, blockers, and recent calls.
- Final export requires passing gates. Forced drafts are allowed for review but remain visibly marked with failed checks.

- `schemas/research/`: JSON Schema source of truth for research runs, events, artifacts, sources, tool traces, claims, drafts, reviews, exports, and checkpoints.
- `packages/opencode/src/paper/`: authoritative paper_fucker TypeScript runtime inside the OpenCode hard fork. It owns AJV validation, OpenTelemetry span hooks, generated TypeScript contract types, run/event/artifact runtime APIs, permission/resource/cost/final-gate state, Python tool bridge calls, paper orchestration, profiles, authoring, preview binding, and rebuildable SQLite indexes.
- `packages/opencode/src/paper/init/`: initialization and diagnostics flow for `~/.paper_fucker/config.json`, `tools.json`, encrypted `secrets.enc`, external tool discovery, and Full Access acknowledgement.
- `packages/opencode/src/paper/capabilities.ts`: research capability bus for OpenCode built-in tools, MCP servers, skills, first-party paper tools, and Python research tools. The orchestrator queries it by stage and records tool trace/OpenTelemetry metadata for each capability call.
- `packages/opencode/src/paper/profiles.ts`: paper profile registry and `PaperProfile.v1` / `PaperProfileCheck.v1` contracts for venue-aware structure, submission checks, and profile skill routing.
- `packages/opencode/src/paper/intake.ts`: multi-input research intake normalizer and runtime recorder for `ResearchIntakeRequest` to `ResearchBrief.v1`.
- `packages/opencode/src/paper/model-discovery.ts`: OpenAI-compatible provider endpoint model discovery and secret-safe provider config storage.
- `packages/opencode/src/paper/model-roles.ts`: model role assignment resolver for default, per-role, and subagent model overrides.
- `packages/opencode/src/paper/agents.ts`: recursive paper agent fabric, role router bridge, per-agent provider/model provenance, guardrail-based expansion decisions, parent-to-child permission narrowing, and artifact provenance tracing.
- `packages/opencode/src/paper/budget.ts`: quick/standard/deep/submission/custom budget tier policy for parallelism, live-search behavior, container reproduction, and cost caps; recursive agent depth is product-unbounded and governed by runtime stop conditions.
- `packages/opencode/src/paper/data-egress.ts`: private-first data egress evaluator for authorized paths, denied patterns, secret-like paths, binary artifacts, and audit traces.
- `packages/opencode/src/paper/orchestrator.ts`: paper-domain run graph/controller for intake, planning, literature, code analysis, data, experiment design/execution/reproduction, ClaimLedger, drafting, profile formatting, verification, revision, and export.
- `packages/opencode/src/paper/code-to-paper.ts`: codebase-to-paper static analysis and runtime artifact recording with source-range-bound method, experiment, and reproduction surfaces.
- `packages/opencode/src/paper/experiment-loop.ts`: paper-domain experiment capability resolver, log metric parser, and reproduction-aware claim eligibility policy.
- `packages/opencode/src/paper/tui-state.ts`: renderer-independent Chinese TUI workbench state adapter for home and run views.
- `packages/opencode/src/paper/authoring.ts`: run-bound authoring loop adapter for ClaimLedger-first drafts, profile-aware revision, verification, final/forced export, supplementary bundle, and code/data availability bundle.
- `packages/opencode/src/paper/preview.ts`: read-only PreviewSnapshot adapter that binds drafts, export files, claim/citation/reviewer annotations, costs, agents, and tool diagnostics to a run.
- `packages/opencode/src/paper/run.ts`: first-class `PaperRun` state projection over research runtime facts, including intake, stage graph, source ledger, claim ledger, experiment status, agent tree, diagnostics, pause questions, preview state, and export state.
- `packages/opencode/src/paper/export-pipeline.ts`: run-bound export renderer pipeline for Markdown, LaTeX, PDF, DOCX, manifest generation, pandoc/LaTeX diagnostics, forced draft markings, and injectable test renderers.
- `packages/opencode/src/paper/observability.ts`: PaperRun observability helpers for durable audit events, tool traces, cost updates, data-egress decisions, and snapshot coverage summaries.
- `packages/opencode/src/cli/cmd/tui/routes/paper/`: Chinese PaperRun workbench route and prompt utilities. The home prompt parses topic, code paths, paper files, datasets, logs, target profile, language, and budget flags into `PaperRunCreateRequest`, then displays a live run dashboard with controller status, guidance/resume/retry/cancel actions, stage graph, Agent Tree, ledgers, diagnostics, model roles, MCP/Skill/toolchain health, preview, final export, forced draft controls, and a PaperRun sidebar.
- `packages/opencode/src/server/routes/instance/httpapi/groups/paper.ts`: `/paper` HttpApi schema group for PaperRun lifecycle, SSE, guidance, preview, export, capability, doctor, provider discovery, and model-role endpoints.
- `packages/opencode/src/server/routes/instance/httpapi/handlers/paper.ts`: PaperRun HttpApi handlers that bind OpenCode instance context to workspace-first run storage and internal provider/model substrate.
- `packages/opencode/src/paper/research/orchestrator/`: automatic topic-to-paper stage graph, Full Access pause policy, checkpoint guidance queue, and run controls.
- `packages/opencode/src/paper/research/templates/`: trusted template resolution, source evidence/confidence policy, and Markdown-to-LaTeX application through the Python bridge.
- `packages/opencode/src/paper/research/sources/`: open-source-first literature and dataset discovery, source verification metadata, license/access checks, and automatic nearby-direction feasibility turns.
- `packages/opencode/src/paper/research/experiments/`: experiment planning, host exploration runner abstraction, container reproduction gate, result analysis, and experiment artifacts.
- `packages/opencode/src/paper/research/writing/`: ClaimLedger-first writing, citation binding, streamed Markdown draft composition, checkpoint guidance application, and rollback diffs.
- `packages/opencode/src/paper/research/verification/`: final authenticity gate, blocking reports, review reports, reference/claim/data/reproduction checks, and multi-model review aggregation.
- `packages/opencode/src/paper/research/export/`: final and forced-draft export bundle creation, manifest generation, missing renderer diagnostics, and export fact recording.
- `packages/opencode/src/paper/research/README.md`: first-party research runtime boundary guide.
- `packages/preview/`: first-party localhost read-only research preview package with token-checked snapshot/SSE endpoints and static Markdown/LaTeX/PDF/DOCX/annotation/diagnostics UI.
- `scripts/strict-acceptance.ps1`: strict live acceptance entrypoint for the full paper system; `-FixtureMode` is only for deterministic script tests.
- `scripts/live-paper-quality-benchmark.ts`: reproducible local live benchmark that creates a topic+code PaperRun against the current paper core, triggers forced export, and writes an ignored JSON summary for quality review.
- `research-tools/`: Python MCP/CLI tool package. It provides structured MCP-style diagnostics/probe/document helpers, one-shot conversion commands, external tool discovery/linking for pandoc and LaTeX engines, and generated Pydantic v2 models for tool-side validation.
- `legacy/references/`: reference-project manifests and adopt/defer/reject analysis. These files are design guidance only and do not authorize code import.
- `upstream/opencode-readmes/`: localized README files imported from the OpenCode snapshot, retained for provenance and translation reference instead of root-level project documentation.
- `packages/opencode/`: deeply modified OpenCode hard fork and paper_fucker product core. OpenCode provider/model, agent/session, tool, MCP, skill, permission, plugin, and TUI substrate capabilities are retained for internal orchestration.

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
- `task-032-opencode-paper-core-migration`: migrate paper_fucker domain runtime into the OpenCode hard fork.
- `task-033-paper-run-api`: expose `PaperRun` as first-class `/paper` HTTP/SSE API state.
- `task-034-dialog-workbench-tui`: turn the TUI default flow into a Chinese PaperRun dialog workbench.
- `task-035-provider-model-wizard`: OpenAI-compatible provider discovery and model role/subagent assignment.
- `task-036-multimodel-agent-orchestration`: multi-layer multi-model agent tree, budget tiers, data egress policy, and artifact provenance.
- `task-037-public-surface-cleanup`: clean startup logo, help/banner text, public commands, and TUI guidance into Paper Fucker product surfaces.
- `task-038-hard-fork-acceptance`: validate the complete OpenCode hard fork paper workbench with strict live acceptance and hard-fork-specific checks.
- `task-039-paperrun-execution-engine`: make PaperRun creation drive the real default paper stage engine.
- `task-040-paperrun-resume-guidance-controller`: add durable PaperRun resume, guidance, cancel, checkpoint, and controller SSE state.
- `task-041-real-intake-material-indexing`: index real input materials with source ranges, Source Ledger entries, and private-first filtering.
- `task-042-workbench-live-controls`: expose PaperRun live controls, model roles, and capability health in the Chinese TUI workbench.
- `task-043-export-renderer-pipeline`: render concrete PaperRun Markdown/LaTeX/PDF/DOCX files, manifest, diagnostics, and forced draft bundles.
- `task-044-observability-audit-hardening`: harden OpenTelemetry-style audit, tool trace, cost, data-egress, export renderer, and strict acceptance diagnostics.
- `task-045-report-path-hygiene`: mark pre-hard-fork reports as historical path provenance and keep current architecture documentation pointed at `packages/opencode/src/paper`.
- `task-046-live-paper-quality-benchmark`: run and record a live reviewable topic+code paper benchmark.
- `task-047-strict-acceptance-timeouts`: bound strict live acceptance checks and preserve partial reports on timeout.
- `task-048-paperrun-completion-gates`: align PaperRun terminal status and reproduction/authenticity gate semantics.
- `task-049-export-pdf-renderer-fallback`: fall back across LaTeX engines when PDF export fails.
- `task-050-default-observability-coverage`: record full observability audit coverage in normal PaperRun execution.
- `task-051-live-benchmark-regression-pass`: rerun the live benchmark after hardening and require improved milestone evidence.

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
