# AGENTS.md — Rules for AI assistants working on Folio

If you are an AI assistant (Copilot, Claude, GPT, ...) editing this
repo, this file is binding. Read it every session before touching code.

## 1. Hard constraints (non-negotiable)

1. **TUI is dumb.** `app/tui/` only renders state and forwards user
   events to the orchestrator. No prompts, no provider calls, no
   business decisions live there.
2. **All LLM calls go through `providers.ProviderRegistry`.** Do not
   import `openai`, `anthropic`, `google.generativeai`, etc. anywhere
   outside `app/providers/`.
3. **All cross-stage values are `StageMessage` instances** (defined in
   `app/core/contract/`). No bare `dict`, `str`, or tuples flowing
   between stages.
4. **Every LLM call writes a trace record** (request, response, model,
   token cost, latency, hash) via `app/observability/trace.py`.
5. **No `MockProvider` — anywhere.** Runtime requires a real, configured
   provider; tests use **recorded LLM cassettes** (VCR-style via
   `pytest-recording`). Recording is one-off and gated by an env var
   (`FOLIO_TEST_RECORD_MODE=true`); CI replays only. New stages MUST
   ship with a cassette covering the happy path.
6. **Provider code is vendor-agnostic.** Only one concrete adapter
   exists: `OpenAICompatibleProvider`, which speaks OpenAI Chat
   Completions v1. Do not branch on vendor names (`if "openai" in url`,
   `if model.startswith("claude")`, etc.) anywhere in `app/`.

Add a new constraint here only with the user's explicit approval.

## 2. Architectural conventions

- **Domain layer (`app/core/`) has zero IO.** No file/network/DB calls.
  Pure functions of `StageMessage`. Side effects live in
  `providers/`, `tools/`, `sandbox/`, `persistence/`, `export/`.
- **Async first.** Everything that touches a network is `async`.
- **One stage = one file.** `app/core/stages/draft.py` exposes
  `async def run(msg: StageMessage, provider: Provider) -> StageMessage`.
- **Prompts live in `prompts/`** as `.j2` (Jinja2) templates, never
  inline in code. Filename matches stage name.
- **Config in YAML** under `~/.folio/config.yml`; the TUI
  `Settings → Endpoints` panel is the user-facing way to manage
  providers. Secrets via OS keyring (or encrypted fallback);
  `.env` / `FOLIO_LLM_<LABEL>_*` is for development & CI only.
  Never commit `.env`.
- **Persistence is SQLite** (`~/.folio/folio.db`). No Postgres in this
  repo. Use Alembic for migrations.

## 3. Style

- Python 3.11+, formatted with `ruff format`, linted with `ruff check`.
- Type hints on every public function. `mypy --strict` on `app/core/`.
- Docstrings only on public APIs. No "obvious" comments
  (`i += 1  # increment i`).
- Tests use `pytest` + `pytest-asyncio`. Coverage target ≥ 80% on
  `app/core/`.

## 4. Workflow rules

- **Never bypass the rubber-duck for non-trivial work.** Before any
  multi-file change, consult `task` agent type `rubber-duck` with
  your plan.
- **Plan before code.** Update `plan.md` if scope shifts; mirror
  todos in the SQL `todos` table.
- **No drive-by refactors.** If you find a problem outside your task,
  add a TODO note or file an idea — don't fix it.
- **Tests for every new stage.** PR without `tests/unit/test_<stage>.py`
  is incomplete.
- **Commit trailer:** every commit includes
  `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`.

## 5. Tooling

- Package manager: **uv** (preferred) or pip + venv.
- Run TUI: `python -m folio` (after `pip install -e .`).
- Run tests: `pytest` from repo root.
- Lint: `ruff check . && ruff format --check .`.
- Type-check: `mypy app/core`.

## 5a. Licensing

- **Source code** is licensed under **MPL-2.0** (Mozilla Public License
  2.0). New files MUST carry the standard MPL-2.0 SPDX header
  (`# SPDX-License-Identifier: MPL-2.0`).
- **Generated papers** (Folio's runtime output, in `~/.folio/runs/...`)
  are emitted under **MIT** by default. Do not change this default
  without explicit user approval.
- Do not add dependencies whose license is incompatible with MPL-2.0
  (no GPL-only, no AGPL).

## 6. What NOT to do

- Don't add a web framework. No FastAPI / Flask / Django here.
- Don't add Redis / Postgres / RabbitMQ / Celery.
- Don't import IntelliGen code directly. Reference its design only.
- Don't auto-execute generated code outside `app/sandbox/`.
- Don't commit any real API keys, even in tests. Use `MockProvider`.
- Don't expand scope beyond the current milestone in `plan.md`
  without user approval.
