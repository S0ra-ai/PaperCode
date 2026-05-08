# Folio

**An autonomous TUI engine for academic paper generation.**

Folio is a small-Copilot-style terminal application that takes a user from
"vague topic" all the way to a fully-formatted, citation-verified academic
paper — through clarification, format extraction, multi-stage drafting,
sandboxed code experiments, and full-provenance verification.

Think of it as *your own ChatGPT-with-a-research-team, sitting in a TUI*.

---

## What it does (target capabilities)

1. **Progressive clarification** — when the user gives a fuzzy ask
   ("write me a paper on graph neural networks"), Folio interviews them:
   topic, venue/journal, length, language, author profile, formatting
   preferences. Stops asking only when it has enough.
2. **Format extraction** — give Folio a journal sample PDF, an IEEE
   template, or a set of submission guidelines, and a dedicated agent
   reverse-engineers the format spec (margins, citation style, section
   order, figure captions, ...).
3. **Drafting** — multi-stage outline → section drafting → review →
   regeneration, with figure/table generation when needed.
4. **Code experiments** — when the topic implies empirical results,
   Folio finds a dataset, drafts code, runs it in a Docker sandbox,
   and writes the experiment section from the actual results.
5. **Provenance & honesty** — a verifier agent independently checks every
   reference (DOI/arXiv/Crossref), every dataset (existence + license),
   every cited fact (round-trip back to source), and runs a self
   plagiarism check.
6. **Two control modes** — `autopilot` (engine decides) and `interactive`
   (engine asks the user before risky decisions).

## What it is not

- Not a web app, not a service. **TUI only**, single-user, runs locally.
- Not a generic Copilot. Domain is **academic writing**.
- Not a fork of IntelliGen. **Clean-room rewrite** in a new repo.

## Stack (locked-in)

| Layer | Choice | Why |
|---|---|---|
| Language | Python 3.11+ | LLM/data ecosystem |
| TUI | [Textual](https://textual.textualize.io/) + Rich | Modern, async, good for streaming |
| Code execution | Docker sandbox | Safe, reproducible |
| External capabilities | MCP client (fetch / arxiv / playwright / context7 / ...) | Reuse ecosystem, don't rewrite scrapers |
| Verification | Full provenance — refs + data + fact round-trip + plagiarism | Academic honesty is non-negotiable |
| LLM providers | One adapter — `OpenAICompatibleProvider`; protocol-bound, vendor-agnostic | Any OpenAI Chat Completions v1 endpoint plugs in |

## Quickstart

```bash
# 1. clone + install
git clone <this-repo> Folio
cd Folio
uv sync                      # or: pip install -e .

# 2. register one LLM endpoint (interactive wizard)
uv run folio init
#   …or headless / for CI:
uv run folio init --headless \
  --label dev \
  --base-url https://api.deepseek.com/v1 \
  --default-model deepseek-chat \
  --api-key "$DEEPSEEK_API_KEY"

# 3. launch the TUI — directly into a chat-style prompt
uv run folio
#   then type one of:
#     write me an IEEE survey on diffusion models, 18000 words
#     :pdf path/to/template.pdf
#     :survey transformer time series
#     :resume                # interactively pick a recent run
#     :resume 7f3a           # resume by uuid prefix
#     :endpoints             # manage providers
#     :quit

# …or skip the TUI and run a survey from CLI:
uv run folio survey "transformer-based time series forecasting" \
  --keywords transformer,forecasting --words 18000 \
  --output-dir ./out/ts-survey

# …or list / resume past runs from the CLI:
uv run folio resume --list
uv run folio resume 7f3a   # resume run whose uuid starts with 7f3a
```

`folio init` writes `~/.folio/config.yml` (no secrets) and stores the
API key in your OS keyring, with a Fernet-encrypted file fallback
(`FOLIO_MASTER_PASSPHRASE`).

For full walk-through, CLI reference, and PDF-export setup, see
[`docs/quickstart.md`](docs/quickstart.md). Build the docs site
locally with `uv run mkdocs serve`.

### Sample gallery

Three frozen, cassette-backed reference outputs (one per builtin
venue: IEEE / CJC / Springer-LNCS) live under
[`examples/`](examples/README.md) and rebuild **without** an API key:

```bash
uv run python scripts/build_sample_gallery.py
# or single-demo:
uv run python scripts/build_sample_gallery.py --only cjc_demo
```

### Dev loop

```bash
uv run pytest                # 228 passing, 1 skipped (PDF compile)
uv run ruff check .
uv run ruff format --check .
uv run mypy app/core         # strict
uv run mkdocs build --strict
```

> The skipped test is `test_export_pdf` — it needs either a host
> [`tectonic`](https://tectonic-typesetting.github.io) binary
> (`scoop install tectonic` / `brew install tectonic` / `cargo install
> tectonic`) **or** a working Docker daemon to compile `paper.tex` →
> `paper.pdf`. The pipeline degrades gracefully when both are absent.

## Status

✅ **M1 → M6 roadmap complete.** Full pipeline (clarify → format →
outline → draft → cite → verify → export TeX/DOCX/PDF) plus sandboxed
code experiments, fact round-trip, n-gram plagiarism, dataset license
SPDX check, audit-zip export, multi-provider SAMA routing with
failover and cost metering, TUI Endpoints panel, MkDocs site, three
frozen sample-gallery demos, and **M6 `survey_from_domain`**: domain →
federated literature search → curated corpus → hybrid taxonomy →
~15 000-word IEEE-English survey with fail-closed citations
(see [`docs/surveys.md`](docs/surveys.md)).

End-to-end correctness is locked in by recorded LLM cassettes
(`pytest-recording`); CI replays them with no API key. See
[`docs/testing.md`](docs/testing.md) for the cassette policy.

## Scope & licensing

- **Single user, single profile.** No multi-tenant model — see
  `~/.folio/profile.yml`. Multi-user support is explicitly out of scope.
- **Source code:** [MPL-2.0](https://www.mozilla.org/en-US/MPL/2.0/).
- **Generated papers:** MIT by default (configurable per run).

See [`plan.md`](./plan.md) for the staged roadmap and
[`PROJECT_CONTEXT.md`](./PROJECT_CONTEXT.md) for the full design rationale
and decisions log.

## For AI assistants

Read [`AGENTS.md`](./AGENTS.md) **first**. It contains the architectural
constraints any change must satisfy.
