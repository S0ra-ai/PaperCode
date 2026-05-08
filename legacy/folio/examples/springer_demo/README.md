# Springer LNCS Demo Sample (Gallery)

This directory is a **golden-output sample** for Folio's M1 pipeline,
configured for the *Springer Lecture Notes in Computer Science*
(LNCS) builtin venue.

It is regenerated deterministically from the
`test_e2e_springer_demo.yaml` cassette and is checked in so you can:

1. Eyeball English LNCS-style output without running an LLM.
2. Detect accidental drift in stage prompts or LaTeX templates — the
   regression test (`tests/integration/test_sample_gallery.py::
   test_springer_gallery_matches_expected`) re-runs the pipeline through
   the cassette and diffs against `expected/`.

## Contents

| File | Purpose |
|---|---|
| `input.pdf` | Source PDF (only its hash is used; FormatStage cache-hits the builtin Springer-LNCS spec). |
| `clarify_answers.yml` | Clarify dict the run was seeded with. |
| `expected/paper.tex` | Generated LaTeX, Springer-LNCS style. |
| `expected/references.bib` | Generated BibTeX (Crossref+arXiv via the cassette; ~40 entries). |
| `expected/payload.json` | StageMessage payload snapshot. |

## How it differs from the other demos

- **`venue_label="Springer-LNCS"` is passed to FormatStage**, which
  short-circuits to the builtin spec at
  `templates/builtin_formats/Springer-LNCS.json`. No format-extraction
  LLM call happens. The asserted invariant is
  `format_record.prompt_tokens == 0`.
- **Language is `en`** with a survey-style topic at 6 pages, exercising
  larger draft sections (more `[CITE:…]` placeholders → more cite
  fan-out) than the IEEE/CJC demos.

## Regenerating

After changing a stage prompt or template, refresh the gallery so the
regression test stops failing for the right reason:

```pwsh
uv run python scripts/build_sample_gallery.py --only springer_demo
```

No API key is needed — the cassette supplies all responses.

## Re-recording the cassette

If you change the **outline / draft prompts** in a way that changes the
LLM-bound request body, the cassette must be re-recorded:

```pwsh
$env:FOLIO_LLM_ENDPOINTS="deepseek"
$env:FOLIO_LLM_DEEPSEEK_API_KEY="sk-..."
$env:FOLIO_TEST_RECORD_MODE="true"
$env:FOLIO_VERIFY_LENIENT="1"
uv run pytest tests/integration/test_e2e_format_to_paper.py::test_e2e_springer_demo
```

Then rebuild the gallery (above). Real-LLM cost is ~7 minutes on
DeepSeek-chat.