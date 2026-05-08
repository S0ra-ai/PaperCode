# Surveys — `survey_from_domain`

Given a research domain, Folio searches the literature and drafts a
~15 000-word IEEE-English survey (review paper) with fail-closed
citation verification.

## Quickstart

```bash
folio survey "transformer-based time series forecasting" \
  --keywords transformer,forecasting,attention \
  --year-from 2018 --year-to 2025 \
  --words 15000 \
  --author "Jane Doe" \
  --output-dir ./out/ts-survey
```

Or launch the TUI in survey mode (live progress + event log):

```bash
folio --survey "transformer-based time series forecasting" \
  --survey-keywords transformer,forecasting \
  --survey-words 15000 \
  --survey-output-dir ./out/ts-survey
```

Outputs (under `--output-dir`):

- `paper.tex` — IEEEtran source
- `paper.pdf` — compiled via tectonic-in-docker (omit `--no-pdf`)
- `paper.docx` — pandoc conversion (omit `--no-docx`)
- `corpus.json` — curated literature corpus (≤80 entries)
- `trace.ndjson` — per-stage LLM trace records

## Pipeline

```
DomainClarify → LiteratureSearch → CorpusCurate → TaxonomyDraft
  → TaxonomyConfirm → PdfOnDemand → SurveyOutline → SurveyDraft
  → CiteBind → VerifyRefs → ExportLatex → ExportPdf → ExportDocx
```

Each stage emits a `StageRecord` for trace and cost accounting.

## Literature sources

All adapters live under `app/tools/literature/`. Free/open sources are
always on; the gated ones require credentials.

| Source            | Default | Credentials            |
|-------------------|---------|------------------------|
| arXiv             | on      | none                   |
| Crossref          | on      | none                   |
| Semantic Scholar  | on      | optional API key       |
| OpenAlex          | on      | none                   |
| IEEE Xplore       | skip\*  | `IEEE_XPLORE_API_KEY`  |
| Google Scholar web| off     | playwright-MCP, ToS⚠️  |

\* Skipped-with-warning when credentials are absent; the pipeline still
runs as long as at least **two** sources return results.

### scholar_web and ToS

Google Scholar does not offer an API. The `scholar_web` adapter drives
a browser through playwright-MCP; this may violate Scholar's ToS and
triggers rate-limiting quickly. It is **disabled by default**. Enable
it only with explicit consent:

```yaml
# ~/.folio/config.yml
survey:
  sources:
    scholar_web:
      enabled: true
      max_queries_per_run: 30
```

For a strictly-free, ToS-safe configuration, keep scholar_web off and
leave IEEE Xplore unconfigured.

## Cost estimate

For ~80 corpus items and a 15k-word target:

| Stage            | Calls | Notes                          |
|------------------|-------|--------------------------------|
| domain_clarify   | 0-1   | deterministic unless ambiguous |
| taxonomy_draft   | 1     | feeds abstracts                |
| survey_outline   | 1     | budget allocation              |
| survey_draft     | 7-9   | one per section + abstract     |
| fact_verify (opt)| 3-5   | sampled round-trip checks      |

With a medium-tier model this typically costs a few USD. Use the
cheapest endpoint available in your ProviderRegistry; M5's SAMA picks
one automatically.

## Fail-closed citations

Every `[CITE:key]` in the draft must resolve to a corpus entry with a
valid DOI or arXiv id. `VerifyRefsStage` blocks export on any unknown
or unresolvable citation. Corpus entries lacking a stable identifier
are dropped during curation (logged as `notes.dropped_no_id`).

## Word budget

Default allocation (override via `--words` and `SurveyBudget`):

| Section               | Words  |
|-----------------------|--------|
| Abstract              | 250    |
| Introduction          | 1 500  |
| Background            | 1 500  |
| Taxonomy branches     | 6 000  |
| Comparative Analysis  | 2 000  |
| Trends & Challenges   | 2 000  |
| Conclusion            | 750    |

Each section is drafted with a ±15% tolerance; over-limit sections are
truncated with a warning, under-limit sections retry once.

## Testing

`tests/unit/test_m6_*.py` cover each stage with fake providers; the
end-to-end `tests/integration/test_survey_from_domain.py` exercises the
full pipeline with monkeypatched literature clients. No live network
or LLM calls are made in CI.
