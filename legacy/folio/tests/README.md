# Folio test policy

Per AGENTS.md § 1.5, **Folio never mocks LLM providers**. Tests that
exercise the provider layer use **recorded cassettes** via
[`pytest-recording`](https://pytest-vcr.readthedocs.io/) /
[`vcrpy`](https://vcrpy.readthedocs.io/).

## Layout

```
tests/
├── unit/         # pure-Python, no I/O, no cassettes
├── integration/  # uses cassettes; replays HTTP
├── e2e/          # full pipeline, replays cassettes
├── fixtures/     # sample PDFs etc. (committed)
└── cassettes/    # YAML cassettes (committed)
```

## Recording

Recording requires real keys and is opt-in:

```powershell
$env:FOLIO_TEST_RECORD_MODE = "true"
uv run pytest tests/integration/test_provider_chat.py -k record_me
```

`conftest.py::record_mode` returns `"once"` only when
`FOLIO_TEST_RECORD_MODE=true`; default is `"none"` (replay only),
so CI can never accidentally hit the network.

## Scrubbing

`vcrpy` is configured to drop `Authorization` and any `api_key` query
params from the recorded YAML before commit. Inspect new cassettes by
hand before pushing — secrets must never leak into the repo.
