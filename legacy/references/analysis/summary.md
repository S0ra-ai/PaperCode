# Reference Adopt / Defer / Reject Summary

TaskFlow task: `task-016-reference-analysis`
Date: 2026-05-09

## Decision Table

| Reference | Adopt | Defer | Reject |
| --- | --- | --- | --- |
| OpenCode | Tool/session/MCP/TUI substrate, permission model, LSP diagnostics | Deep session coupling until run ids are stable | Paper-domain authority inside `packages/opencode` |
| Folio | Stage discipline, FormatSpec cache idea, fail-closed citations, export fallback | Provider panel/profile features | Runtime placeholder citations and Python core authority |
| IntelliGen | Evidence UI, section regeneration, service extraction lessons | Product UX polish after core pipeline | Old IntelliGen execution direction |
| AI Scientist | Stage gates, generated-code safety warnings, simulated review concept | GPU-heavy templates | Copying code/templates or Linux-only assumptions |
| PaperOrchestra | Writing-role decomposition, provenance hardening, rollback concepts | Prompt reuse until license/paper provenance is reviewed | Claim-free paper prose |
| AutoResearch | Short metric loop, keep/revert experiment discipline | Generalization beyond bounded experiments | Treating one-file loops as full paper automation |
| EvoScientist | Skill/knowledge-pack separation | Persistent self-evolving memory | Self-evolution before authenticity gates |
| FARS | Observability, cost visibility, end-to-end stage split | Public live trace model | Scale-first high-cost paper generation |
| AutoRA | Experiment design vocabulary | Behavioral-science automation details | Treating it as the primary CS/AI writing pipeline |

## Architecture Guidance

- Keep `packages/server` as the authoritative research runtime.
- Add first-party modules for orchestrator, templates, sources, experiments, writing, verification, export, and a narrow `opencode-adapter`.
- Use OpenCode tools through a stable adapter rather than importing paper concepts into upstream-derived code.
- Record every external source with URL, license, version/commit when available, confidence, and unresolved ambiguity.
- Use Exa MCP as a search connector, but store search results as `SourceRecord`/artifact evidence before they influence claims.

## Follow-up Tasks

- `task-009`: implement automatic stage graph and guidance queue using OpenCode only through `opencode-adapter`.
- `task-010`: implement `TemplateSpec` with source evidence and confidence, borrowing Folio's cache idea.
- `task-011`: use Exa/OpenAlex/Crossref/Semantic Scholar style connectors behind source policy.
- `task-012`: implement AutoResearch-style metric keep/revert plus final container reproduction.
- `task-013`: require ClaimLedger before prose generation.
- `task-014`: gate final export on references, claims, data license, and reproduced experiment records.
- `task-015`: export final only after gate success; forced draft must carry failed checks.
