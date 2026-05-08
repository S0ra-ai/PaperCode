# Folio Testing Policy

Folio's runtime contract (AGENTS.md § 1.5) is **no MockProvider, anywhere**.
Every LLM call goes through a real, configured provider — including in tests.

To keep CI hermetic and free, we use **recorded HTTP cassettes** via
[`pytest-recording`](https://github.com/kiwicom/pytest-recording) (built on
VCR.py). Cassettes are tiny YAML files captured the *one* time you call a
real endpoint. CI just replays them.

## Workflow

### Replay (default — what CI does)

```powershell
uv run pytest
```

`tests/conftest.py` sets `record_mode = "none"`. Any cassette miss is a
test failure. No network is allowed.

### Record (one-off, locally, when adding/changing an LLM-driven stage)

1. Make sure your `.env` has a working endpoint, e.g.:

   ```ini
   FOLIO_LLM_ENDPOINTS=deepseek
   FOLIO_LLM_DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
   FOLIO_LLM_DEEPSEEK_API_KEY=sk-...
   FOLIO_LLM_DEEPSEEK_DEFAULT_MODEL=deepseek-chat
   ```

2. Recommended endpoint for new cassettes: **DeepSeek** (cheapest of the
   three vendors we test against). Anything OpenAI-Chat-Completions-v1
   compatible works — we don't branch on vendor.

3. Run the targeted test with the record flag:

   ```powershell
   $env:FOLIO_TEST_RECORD_MODE="true"; uv run pytest tests/integration/test_my_new_stage.py
   ```

4. Verify the cassette landed under `tests/cassettes/<test_module>/<test_name>.yaml`.

5. **Scrub keys** — VCR config strips `Authorization` headers, but eyeball
   the diff before committing.

6. Commit the cassette + the test together. Never commit a `.env`.

## Rules

- **Every new LLM-driven stage MUST ship with at least one cassette**
  covering the happy path. PRs without cassettes will not be merged.
- **Cassettes are deterministic test fixtures**, not provider tests.
  Assert on Folio's behaviour (parsed output, payload mutations,
  trace records), not on raw model strings.
- **Refresh cassettes when the prompt template changes.** A stale
  cassette + a new prompt is a false-positive test.
- **One endpoint per cassette.** If you need to test failover, use
  `httpx.MockTransport` (see `tests/unit/test_failover.py`) instead of
  recording two real endpoints.

## Markers

- `@pytest.mark.integration` — hits external services (replays only in CI)
- `@pytest.mark.e2e` — runs the full pipeline end-to-end
- `@pytest.mark.slow` — > 1 s

## Why no MockProvider?

A mock can drift arbitrarily from real provider behaviour: token counts,
JSON-mode quirks, stop-sequence handling, stream-vs-nonstream deltas.
Cassettes capture the actual wire format, so when an upstream ships a
breaking change we see it the next time the cassette is re-recorded —
instead of trusting a hand-written stub forever.
