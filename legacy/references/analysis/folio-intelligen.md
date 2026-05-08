# Folio and IntelliGen Analysis

Sources: `legacy/folio`, `legacy/intelligen-v3`, `legacy/archive-manifest.md`
Decision: adopt concepts, reject code import without later license review.

## Folio Patterns

- `StageMessage` contract is a useful predecessor for explicit stage handoff, but paper_fucker should use JSON/JSONL facts plus typed artifact schemas instead of Python-only in-memory payload mutation.
- `FormatSpec` cache is worth adopting conceptually: builtin templates, venue-level cache, and user/custom template records map directly to `TemplateSpec`.
- Citation verification is a strong pattern: fail closed for unresolved citations and keep source evidence in a registry.
- Export path is pragmatic: LaTeX first, PDF through local engines/Docker fallback, DOCX through pandoc.
- Sandbox experiment design is useful, but paper_fucker should require final container reproduction before claims become final.
- Provider routing and TUI endpoint management are useful, but current paper_fucker defaults should stay DeepSeek-first until multi-provider policy is implemented.

## IntelliGen Patterns

- Evidence/reference side panel maps well to the read-only preview annotations already present in `packages/preview`.
- Section-aware regeneration and review loops are useful for `DraftPaper` + `ClaimLedger`.
- Service-layer extraction is relevant for keeping paper_fucker first-party modules out of `packages/opencode`.
- Its old Python-core authority is explicitly rejected; Python remains a tool bridge.

## Adopt

- Stage handoff discipline, but implemented as first-party TS run facts.
- Template cache concepts, but represented as `TemplateSpec` artifacts with evidence and confidence.
- Citation/evidence UI concepts, but backed by `SourceRecord`, `ClaimLedger`, and preview annotations.
- Export fallback ordering and external tool diagnostics.

## Defer

- Provider panels beyond DeepSeek until model/router contracts are stable.
- Full user profile and author metadata management until export bundles exist.

## Reject

- Runtime fake citations or unresolved citation placeholders in final output.
- Python as the authoritative research orchestrator.
- Direct reuse of archived implementation code before explicit license/source approval.
