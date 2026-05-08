# IEEE Demo Sample (Gallery)

This directory is a **golden-output sample** for Folio's M1 pipeline.
It is regenerated deterministically from the m1 e2e cassette and is
checked in so you can:

1. Eyeball what Folio actually produces, without running an LLM.
2. Detect accidental drift in stage prompts or LaTeX templates — the
   regression test (`tests/integration/test_sample_gallery.py`) re-runs
   the pipeline through the cassette and diffs against `expected/`.

## Contents

| File | Purpose |
|---|---|
| `input.pdf` | Source PDF whose format Folio extracts (small CN report). |
| `clarify_answers.yml` | Clarify dict the run was seeded with. |
| `expected/paper.tex` | Generated LaTeX, IEEE style. |
| `expected/references.bib` | Generated BibTeX (Crossref+arXiv via the cassette). |
| `expected/payload.json` | StageMessage payload snapshot (clarify / format_spec / outline / draft / citations / verify_status). |

## Regenerating

After changing a stage prompt or template, refresh the gallery so the
regression test stops failing for the right reason:

```pwsh
uv run python scripts/build_sample_gallery.py --only ieee_demo
```

The script uses the recorded cassette, so no API key is needed.

## Notes

- The PDF is copied from `tests/fixtures/sample_report.pdf`. Keep it
  small; avoid binary churn.
- `verify` runs in **lenient mode** during recording (LLM-invented
  bibkeys are not all in Crossref); see
  `tests/unit/test_stages.py::test_verify_lenient_*` for the strict
  vs lenient contract.
