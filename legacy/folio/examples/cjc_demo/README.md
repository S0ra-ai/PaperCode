# CJC Demo Sample (Gallery)

This directory is a **golden-output sample** for Folio's M1 pipeline,
configured for the *Chinese Journal of Computers* (CJC) builtin venue.

It is regenerated deterministically from the
`test_e2e_cjc_demo.yaml` cassette and is checked in so you can:

1. Eyeball Chinese-language paper output without running an LLM.
2. Detect accidental drift in stage prompts or LaTeX templates — the
   regression test (`tests/integration/test_sample_gallery.py::
   test_cjc_gallery_matches_expected`) re-runs the pipeline through the
   cassette and diffs against `expected/`.

## Contents

| File | Purpose |
|---|---|
| `input.pdf` | Source PDF (only its hash is used; FormatStage cache-hits the builtin CJC spec). |
| `clarify_answers.yml` | Clarify dict the run was seeded with. |
| `expected/paper.tex` | Generated LaTeX, CJC style (8 sections in Chinese). |
| `expected/references.bib` | Generated BibTeX (Crossref+arXiv via the cassette). |
| `expected/payload.json` | StageMessage payload snapshot. |

## How it differs from the IEEE demo

- **`venue_label="CJC"` is passed to FormatStage**, which short-circuits
  to the builtin spec at `templates/builtin_formats/CJC.json`. No
  format-extraction LLM call happens. The asserted invariant is
  `format_record.prompt_tokens == 0`.
- **Language is `zh`**: outline + draft prompts render in Chinese; the
  bibkeys the LLM invents include CJK characters (e.g. `bahl_语音识别`).
- The cassette captures **9 LLM calls** (1 outline + 8 draft sections).

## Regenerating

After changing a stage prompt or template, refresh the gallery so the
regression test stops failing for the right reason:

```pwsh
uv run python scripts/build_sample_gallery.py --only cjc_demo
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
uv run pytest tests/integration/test_e2e_format_to_paper.py::test_e2e_cjc_demo
```

Then rebuild the gallery (above). Real-LLM cost is ~5 minutes on
DeepSeek-chat.