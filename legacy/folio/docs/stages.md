# Stages overview

Folio's pipeline is a chain of **stages**, each a pure async function

```python
async def run(msg: StageMessage, **deps) -> StageMessage
```

that takes a `StageMessage` from `app/core/contract/`, mutates the
typed `payload` dict, appends a `StageRecord` to its trace, and
returns a new immutable copy. No stage ever does IO outside of its
declared dependencies (provider registry, sandbox runner, persistence
adapter).

## The chain

| # | Stage | Module | Purpose |
|---|---|---|---|
| 1 | `format_stage` | `app/core/stages/format_stage.py` | Extract a `FormatSpec` from the user's sample PDF (template hint, citation style, columns, language…). Caches by content hash. |
| 2 | `clarify` | `app/core/stages/clarify.py` | LLM-driven entropy-based question loop until topic / length / audience / language / style are confidently filled. |
| 3 | `outline` | `app/core/stages/outline.py` | Produce a section tree (title, abstract sketch, ordered sections). |
| 4 | `draft` | `app/core/stages/draft.py` | Expand each outline node into prose, emitting `\cite{key}` placeholders. |
| 5 | `cite_fetch` | `app/core/stages/cite_fetch.py` | Resolve every cite key against Crossref + arXiv (HTTPS), build the `references.bib`. |
| 6 | `verify_refs` | `app/core/stages/verify_refs.py` | Cross-check every cite key has a matching bib entry; fail-closed by default, lenient via `FOLIO_VERIFY_LENIENT=1`. |
| 7a | `export_latex` | `app/core/stages/export_latex.py` | Render `paper.tex` from a Jinja2 template (`templates/`) + `references.bib`. |
| 7b | `export_pdf` | `app/core/stages/export_pdf.py` | Compile to `paper.pdf` via the first available LaTeX engine on the host: `tectonic` → `latexmk` → `xelatex` → `pdflatex` → `lualatex` → docker `tectonictypesetting/tectonic`. Override the chain with `FOLIO_LATEX_ENGINE=<engine>`. Skip-on-missing. |
| 7c | `export_docx` | `app/core/stages/export_docx.py` | Convert to `paper.docx` via host `pandoc` or `pandoc/latex` Docker image. Skip-on-missing. |

## M3-only stages (sandboxed experiments)

| # | Stage | Module | Purpose |
|---|---|---|---|
| – | `code` | `app/core/stages/code.py` | Generate a `code.py` for an experiment from outline + dataset metadata. |
| – | `experiment_write` | `app/core/stages/experiment_write.py` | Run `code.py` inside the `folio-sandbox` Docker image, parse stdout / artefacts, weave results back into the draft. |

## M4-only stages (provenance & honesty)

| # | Stage | Module | Purpose |
|---|---|---|---|
| – | `fact_verify` | `app/core/stages/fact_verify.py` | For each (claim, source) pair, ask an independent endpoint whether the source supports the claim; mismatches go to `payload['fact_flags']`. |

## Cross-cutting concerns

- **Provider routing**: `app/providers/registry.py` selects an endpoint
  per stage via SAMA (Stage-Aware Model Assignment). Stages never
  import vendor SDKs directly.
- **Tracing**: every LLM call writes a `trace.jsonl` record (model,
  tokens, latency, prompt-hash) via `app/observability/trace.py`.
- **Persistence**: `~/.folio/folio.db` (SQLite + Alembic) holds the
  format-spec cache, citation cache, and run history.
- **Sandbox**: `app/sandbox/runner.py` shells out to Docker with
  `--network=none --read-only --cap-drop=ALL`, mounting user code at
  `/work` inside the `folio-sandbox:0.1` image
  (`docker/folio-sandbox/Dockerfile`).
