# Folio — Project Context

> This file is the **memory transfer** for any AI assistant (or human
> contributor) picking up this project. Read it before touching code.
> It captures the vision, the locked-in decisions, the design lineage,
> and the open questions.

---

## 1. Origin & vision

Folio was spun out of a parent project called **IntelliGen**
(`E:\Project\IntelliGen`), a 3-tier web service (Web 9991 / API 9992 /
Engine 9993) for academic paper generation. The user judged IntelliGen's
engine to be over-coupled to its web stack and decided to **start a clean
single-purpose engine project**, prioritising:

- **Self-contained**: no Web/API tiers, no Postgres/Redis dependency
  required to run.
- **TUI-first**: the engine has its own Textual interface, like
  GitHub Copilot CLI. No browser.
- **Agent-style**: feels like a small Copilot specialised for academic
  writing — multi-turn clarification, autonomous tool use, verifiable
  outputs.

The user's own words (paraphrased from the briefing):

> "First we treat it as a standalone project. Give it a topic and
> requirements — but the user may be vague, so it must progressively
> clarify (format, direction, length, even author info). Once it has
> enough info it starts generating. The format spec may come from a
> journal/sample paper/requirements doc — an agent must figure it out.
> Drafting may need figures and code experiments. Everything must be
> traceable for academic honesty, and a separate agent verifies that
> sources/datasets are real. Code experiments may fail — there must be
> two control modes: engine decides, or ask the user. The whole thing
> runs in a TUI like Copilot."

---

## 2. Locked-in decisions (from initial Q&A)

| # | Question | Decision |
|---|---|---|
| Q1 | Relationship to IntelliGen | **Clean-room** new repo at `E:\Project\Folio` |
| Q2 | TUI stack | **Python + Textual** (Rich for non-interactive output) |
| Q3 | Code experiment execution | **Docker sandbox** (isolated, reproducible) |
| Q4 | Verification scope | **Full provenance** — refs + datasets + fact round-trip + plagiarism self-check |
| Q5 | MCP role | **MCP client only** (calls external MCP servers; not exposing itself as MCP server in MVP) |
| Q6 | MVP focus | **format_to_paper** — given a journal sample/spec, extract format and produce a complete formatted paper |

## 3. MVP scope (M1 target)

**End-to-end demo**: user drops in a sample PDF (e.g. an IEEE Access
paper) and a topic; Folio extracts the format spec, runs the
clarification loop for missing fields, drafts the paper section by
section, verifies references, and outputs a `.tex` / `.docx` / `.pdf`
matching the sample's format.

Out of scope for M1: code experiments (deferred to M3), full plagiarism
check (deferred to M4), `experiment_loop`, multi-author collaboration.

---

## 4. Design lineage

Two reference implementations exist; **neither is to be merged in
directly**. They serve as design vocabulary only.

### 4a. IntelliGen engine (`E:\Project\IntelliGen\packages\engine\intelligen_engine\`)

The "what to avoid" reference. Has working pipelines but mixes HTTP
routes / business logic / DB persistence in the same modules. Useful
for: Provider abstraction patterns, Stage naming conventions, prompt
templates, retrieval (FAISS) wiring.

### 4b. CoPaper academic prototype (`C:\Users\13750\Desktop\源代码\code\intelligen_paper\`)

The "what to aspire to" reference. Clean 5-layer skeleton:

```
contract/      StageMessage + STAGE_CAPABILITY 5-d vector + validate()
providers/     Mock / OpenAI / Anthropic / Google + Registry
stages/        Outline / Draft / Review / Regenerate (each pure-function)
clarify/       Thresholds(τ_e=0.7, τ_f=1, τ_c=1) + entropy gating
orchestrator/  SAMA model assignment + sequential pipeline runner
```

Folio's `app/core/` will adopt these patterns directly.

---

## 5. Architectural skeleton (target)

```
folio/
├── app/
│   ├── tui/              # Textual screens, widgets, key bindings
│   ├── core/             # Pure domain (no IO)
│   │   ├── contract/     # StageMessage, Capability, validate
│   │   ├── stages/       # ClarifyStage, FormatStage, OutlineStage, DraftStage, ReviewStage, ExperimentStage, VerifyStage, ExportStage
│   │   ├── clarify/      # entropy / thresholds / question generator
│   │   └── orchestrator/ # SAMA, scheduler, retry, checkpoint
│   ├── providers/        # LLM provider adapters (Mock + real)
│   ├── tools/            # MCP client wrapper, builtin tools (PDF parse, BibTeX, ...)
│   ├── sandbox/          # Docker exec + result harvest
│   ├── verify/           # Reference verifier, dataset verifier, fact round-trip, plagiarism
│   ├── export/           # LaTeX / docx / PDF / Markdown writers
│   ├── persistence/      # SQLite for trace + checkpoint (no Postgres)
│   ├── observability/    # Structured logs + audit trail
│   └── config/           # YAML config, secrets via env
├── prompts/              # All prompts here, version-controlled
├── templates/            # Format templates (IEEE, ACM, Nature, ...)
├── tests/                # unit / integration / e2e (with MockProvider)
├── docs/
├── pyproject.toml
└── README.md
```

## 6. Hard constraints

These four rules apply to **every** PR / change. See `AGENTS.md` for the
authoritative version.

1. `app/tui/` contains zero business logic — only renders state and
   forwards events to the orchestrator.
2. Every model call goes through `providers.ProviderRegistry`. No SDK
   imports inside `stages/`.
3. Every cross-stage value is a `StageMessage` (defined in
   `contract/`). No bare `dict` / `str`.
4. Every LLM call writes a trace record. Every stage must run under
   `MockProvider` for unit tests.

## 7. Glossary (project-specific terms)

- **Stage**: a pure async function `(StageMessage, Provider) -> StageMessage`.
- **StageMessage**: typed envelope with `payload`, `meta`,
  `provenance`, `cost`. Immutable.
- **Provider**: thin LLM SDK wrapper. Uniform `complete(prompt, **kwargs)`.
- **Capability vector**: 5-dim float vector
  `(reasoning, writing, code, citation, multimodal)` describing both
  what a stage *needs* and what a model *offers*.
- **SAMA** (Stage-Aware Model Assignment): pick model
  `argmax cos(stage_need, model_cap) − λ·cost`.
- **Clarify thresholds**: τ_e = entropy ceiling (0.7), τ_f = required
  fields, τ_c = confidence floor.
- **Provenance**: chain of evidence linking every claim → citation → source.
- **Verifier**: independent agent that re-checks claims against sources.

## 8. Open questions for the user (collect answers before M2)

- LLM provider preference for development (use OpenRouter? OpenAI direct?
  local Ollama?). Defaults: read from env, fall back to MockProvider.
- Default citation style (APA / IEEE / Chicago / venue-driven).
- Where to store user profile (author name, affiliation, ORCID)?
  `~/.folio/profile.yml`?
- License of generated papers? (MIT for code, CC-BY for prose by default?)
- Telemetry — opt-in / off / always-local?

## 9. How to resume work

1. Read this file end to end.
2. Read `AGENTS.md` for hard rules.
3. Read `plan.md` for current milestone and todos.
4. Query SQL `todos` table (in your CLI session) for live status —
   `plan.md` is the human source of truth, SQL is the execution tracker.
5. Before any non-trivial change, consult the rubber-duck.
