# Folio

Folio is a **TUI-native, single-user, agent-style engine** that turns
a fuzzy academic ask plus a sample format PDF into a fully formatted,
fully verified paper — all from your terminal, against any
OpenAI-compatible LLM endpoint you point it at.

This documentation set is deliberately small and is rendered locally
with MkDocs:

```pwsh
uv run mkdocs serve
```

Then open <http://127.0.0.1:8000>.

## Where to start

- **[Quickstart](quickstart.md)** — install, configure an endpoint,
  launch the chat-style TUI, and resume previous runs.
- **[Stages overview](stages.md)** — the 8-stage pipeline that
  produces a paper, with the `StageMessage` contract that flows
  between them.
- **[Surveys](surveys.md)** — the M6 domain → corpus → ~18 000-word
  survey pipeline.
- **[Testing & cassettes](testing.md)** — how the cassette-replay
  test policy works and how to record new ones.

## Resuming a run

Folio writes a checkpoint after every successful stage to
`~/.folio/runs/<run_id>/checkpoints/`. If a run is interrupted, you
can pick it up — Copilot-style — from the CLI:

```pwsh
folio resume --list      # table of recent runs (uuid, kind, last_stage, topic)
folio resume 7f3a        # resume the run whose uuid starts with 7f3a
```

Or from inside the TUI, type `:resume` (no args → interactive picker)
or `:resume <prefix>`. Already-finished stages are skipped, so no LLM
calls are re-billed.

## Project status

The full M1 → M5 roadmap (format extraction, multi-provider routing,
sandboxed experiments, full provenance, polish & docs) is **complete**.
The automated test suite — including end-to-end runs replayed from
recorded LLM cassettes for IEEE / CJC / Springer-LNCS — is green.

Three frozen sample outputs live in
[`examples/`](https://github.com/k1d/Folio/tree/main/examples) and are
re-buildable offline (no API key needed) via
`uv run python scripts/build_sample_gallery.py`.

See `plan.md` and `PROJECT_CONTEXT.md` at the repo root for the
authoritative roadmap and architectural rules. This site is intended
as a **friendly read** of those documents for new contributors and
for first-time users on a fresh checkout.

## License

Source code: **MPL-2.0**. Generated papers (Folio's output): **MIT**
by default. See `LICENSE` and `AGENTS.md` § 5a.
