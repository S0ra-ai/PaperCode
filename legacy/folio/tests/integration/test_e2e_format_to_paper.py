# SPDX-License-Identifier: MPL-2.0
"""End-to-end pipeline cassette test (`m1-e2e-test`).

Drives `format → outline → draft → cite → verify → export_latex`
against a real OpenAI-compatible endpoint *once* (record mode), then
replays the captured cassette in CI. Explicit venue/style hints must
short-circuit FormatStage so the sample PDF cannot override them.

VerifyStage runs in **lenient mode** (``FOLIO_VERIFY_LENIENT=1``)
because LLM-invented bibkeys cannot all be resolved against
Crossref/arXiv; the lenient path is exercised by dedicated unit tests
(`tests/unit/test_stages.py::test_verify_lenient_*`).

Recording (one-off):

    $env:FOLIO_LLM_ENDPOINTS="deepseek"
    $env:FOLIO_LLM_DEEPSEEK_BASE_URL="https://api.deepseek.com/v1"
    $env:FOLIO_LLM_DEEPSEEK_API_KEY="sk-..."
    $env:FOLIO_LLM_DEEPSEEK_DEFAULT_MODEL="deepseek-chat"
    $env:FOLIO_VERIFY_LENIENT="1"
    $env:FOLIO_TEST_RECORD_MODE="true"
    uv run pytest tests/integration/test_e2e_format_to_paper.py

Replay (CI default): `uv run pytest`.
"""

from __future__ import annotations

import os
from pathlib import Path

import pytest
import vcr

from app.config.loader import load as load_config
from app.core.contract import StageMessage
from app.core.stages import cite_fetch, export_latex, verify_refs
from app.core.stages import draft as draft_stage
from app.core.stages import format_stage as format_stage_mod
from app.core.stages import outline as outline_stage
from app.providers.factory import build_registry

FIXTURE_PDF = Path(__file__).parent.parent / "fixtures" / "sample_report.pdf"
CASSETTE_DIR = Path(__file__).parent.parent / "cassettes" / Path(__file__).stem
EXAMPLES = Path(__file__).resolve().parents[2] / "examples"


pytestmark = [pytest.mark.integration, pytest.mark.e2e]


def _seed_message() -> StageMessage:
    return StageMessage(
        payload={
            "clarify": {
                "topic": "A short note on n-gram language models",
                "length_pages": 2,
                "audience": "graduate students",
                "language": "en",
                "style": "ieee",
            }
        }
    )


def _cjc_seed_message() -> StageMessage:
    return StageMessage(
        payload={
            "clarify": {
                "topic": "关于 n-gram 语言模型的简短综述",
                "length_pages": 4,
                "audience": "计算机科学研究生",
                "language": "zh",
                "style": "cjc",
            }
        }
    )


def _springer_seed_message() -> StageMessage:
    return StageMessage(
        payload={
            "clarify": {
                "topic": "A short survey of n-gram language models",
                "length_pages": 6,
                "audience": "graduate students",
                "language": "en",
                "style": "springer-lncs",
            }
        }
    )


def _make_vcr(record_mode: str) -> vcr.VCR:
    return vcr.VCR(
        cassette_library_dir=str(CASSETTE_DIR),
        record_mode=record_mode,
        filter_headers=[
            ("authorization", "DUMMY"),
            ("x-api-key", "DUMMY"),
            ("api-key", "DUMMY"),
            ("openai-api-key", "DUMMY"),
            ("cookie", "DUMMY"),
            ("set-cookie", "DUMMY"),
        ],
        filter_query_parameters=[
            ("api_key", "DUMMY"),
            ("apikey", "DUMMY"),
            ("token", "DUMMY"),
        ],
        decode_compressed_response=True,
    )


@pytest.mark.skipif(not FIXTURE_PDF.exists(), reason="sample PDF fixture missing")
async def test_e2e_format_to_export_with_cache_hit(
    tmp_path: Path, record_mode: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    config = load_config()
    if not config.endpoints and record_mode != "none":
        pytest.skip(
            "no endpoint configured; set FOLIO_LLM_ENDPOINTS + FOLIO_LLM_<LABEL>_* "
            "to record"
        )
    cassette_path = "test_e2e_format_to_export_with_cache_hit.yaml"
    if record_mode == "none" and not (CASSETTE_DIR / cassette_path).exists():
        pytest.skip("no cassette recorded; run with FOLIO_TEST_RECORD_MODE=true once")

    # Lenient verify: LLM-invented bibkeys are not all in Crossref.
    monkeypatch.setenv("FOLIO_VERIFY_LENIENT", "1")

    my_vcr = _make_vcr(record_mode)
    with my_vcr.use_cassette(cassette_path):
        registry = (
            build_registry(config)
            if config.endpoints
            else build_registry(_stub_config_for_replay())
        )

        # ---- first pass: real (or replayed) LLM + Crossref/arXiv calls ----
        msg = _seed_message()
        msg = await format_stage_mod.run(msg, pdf_path=FIXTURE_PDF, registry=registry)
        msg = await outline_stage.run(msg, registry=registry)
        msg = await draft_stage.run(msg, registry=registry)
        msg = await cite_fetch.run(msg)
        msg = await verify_refs.run(msg)

        out_dir = tmp_path / "run1"
        out_dir.mkdir()
        msg = await export_latex.run(msg, output_dir=out_dir)

        assert "format_spec" in msg.payload
        assert "outline" in msg.payload
        assert "draft" in msg.payload
        assert msg.payload["draft"]["sections"], "draft must contain at least 1 section"
        assert msg.payload["citations"], "cite stage must populate citations"
        assert msg.payload["verify_status"] in {"ok", "warnings"}
        assert msg.payload["bibliography"], "bibliography must be non-empty BibTeX"
        assert msg.payload["format_spec"]["venue_label"] == "IEEE"
        assert msg.payload["format_spec"]["template_hint"] == "ieee.tex.j2"
        tex_files = list(out_dir.rglob("*.tex"))
        assert tex_files, "export_latex must emit a .tex file"
        tex_body = tex_files[0].read_text(encoding="utf-8")
        assert "\\documentclass[10pt,letterpaper,conference]{IEEEtran}" in tex_body
        assert "\\tableofcontents" not in tex_body

        # ---- second pass: FormatStage cache must short-circuit ----
        msg2 = _seed_message()
        msg2 = await format_stage_mod.run(msg2, pdf_path=FIXTURE_PDF, registry=registry)
        last = msg2.history[-1]
        assert last.stage == "format"
        note = (last.note or "").lower()
        assert "cache" in note, f"expected cache hit, got note={last.note!r}"
        assert last.prompt_tokens == 0, (
            f"cache hit must not call LLM; got prompt_tokens={last.prompt_tokens}"
        )


async def _record_or_replay_demo(
    *,
    cassette_name: str,
    seed: StageMessage,
    venue_label: str,
    pdf_path: Path,
    tmp_path: Path,
    record_mode: str,
    monkeypatch: pytest.MonkeyPatch,
) -> StageMessage:
    """Shared driver for `cjc` / `springer` demo cassettes.

    Each demo passes ``venue_label`` to FormatStage so the builtin
    spec is cache-hit (no FormatStage LLM call). Outline + draft +
    cite + verify still talk to the configured endpoint, so the
    cassette only captures *those* calls.
    """
    config = load_config()
    if not config.endpoints and record_mode != "none":
        pytest.skip(
            "no endpoint configured; set FOLIO_LLM_ENDPOINTS + FOLIO_LLM_<LABEL>_*"
            " to record"
        )
    if record_mode == "none" and not (CASSETTE_DIR / cassette_name).exists():
        pytest.skip("no cassette recorded; run with FOLIO_TEST_RECORD_MODE=true once")

    monkeypatch.setenv("FOLIO_VERIFY_LENIENT", "1")
    my_vcr = _make_vcr(record_mode)
    with my_vcr.use_cassette(cassette_name):
        registry = (
            build_registry(config)
            if config.endpoints
            else build_registry(_stub_config_for_replay())
        )
        msg = seed
        msg = await format_stage_mod.run(
            msg, pdf_path=pdf_path, registry=registry, venue_label=venue_label
        )
        msg = await outline_stage.run(msg, registry=registry)
        msg = await draft_stage.run(msg, registry=registry)
        msg = await cite_fetch.run(msg)
        msg = await verify_refs.run(msg)
        out_dir = tmp_path / "run"
        out_dir.mkdir()
        msg = await export_latex.run(msg, output_dir=out_dir)
    # FormatStage MUST hit the builtin cache so the cassette stays
    # focused on outline+draft+cite+verify only.
    fmt_record = next(r for r in msg.history if r.stage == "format")
    assert fmt_record.prompt_tokens == 0, (
        "FormatStage LLM was called even though venue_label provided a "
        "builtin cache hit; cassette would now be coupled to that prompt"
    )
    assert msg.payload["draft"]["sections"], "draft must contain at least 1 section"
    return msg


async def test_e2e_cjc_demo(
    tmp_path: Path, record_mode: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Records / replays the CJC sample-gallery cassette."""
    if not FIXTURE_PDF.exists():
        pytest.skip("sample PDF fixture missing")
    await _record_or_replay_demo(
        cassette_name="test_e2e_cjc_demo.yaml",
        seed=_cjc_seed_message(),
        venue_label="CJC",
        pdf_path=FIXTURE_PDF,
        tmp_path=tmp_path,
        record_mode=record_mode,
        monkeypatch=monkeypatch,
    )


async def test_e2e_springer_demo(
    tmp_path: Path, record_mode: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Records / replays the Springer-LNCS sample-gallery cassette."""
    if not FIXTURE_PDF.exists():
        pytest.skip("sample PDF fixture missing")
    await _record_or_replay_demo(
        cassette_name="test_e2e_springer_demo.yaml",
        seed=_springer_seed_message(),
        venue_label="Springer-LNCS",
        pdf_path=FIXTURE_PDF,
        tmp_path=tmp_path,
        record_mode=record_mode,
        monkeypatch=monkeypatch,
    )


def _stub_config_for_replay():
    """Replay-only stub: cassette supplies the responses, so the
    endpoint URL/key/model are pure placeholders. The base_url MUST
    match what was recorded so VCR's matcher succeeds.
    """
    from app.config.loader import EndpointConfig, FolioConfig

    return FolioConfig(
        endpoints=[
            EndpointConfig(
                label="deepseek",
                base_url="https://api.deepseek.com/v1",
                api_key="DUMMY",
                default_model="deepseek-chat",
                source="env",
            )
        ]
    )


def test_cassette_does_not_leak_api_key() -> None:
    """Sanity check: every committed cassette under this module must
    have its Authorization header scrubbed. Catches forgotten
    `filter_headers` configuration before a real key sneaks into git.
    """
    if not CASSETTE_DIR.exists():
        pytest.skip("no cassettes recorded yet")
    cassettes = list(CASSETTE_DIR.glob("*.yaml"))
    if not cassettes:
        pytest.skip("no cassettes recorded yet")
    for cassette in cassettes:
        text = cassette.read_text(encoding="utf-8", errors="ignore")
        for needle in ("sk-7efb2c", "sk-xSZSwt", "sk-or-v1-"):
            assert needle not in text, (
                f"cassette {cassette.name} contains an un-scrubbed API key prefix "
                f"{needle!r}; check filter_headers in the test"
            )
        assert "Bearer sk-" not in text, (
            f"cassette {cassette.name} still has a raw Bearer header"
        )
    if os.environ.get("FOLIO_TEST_RECORD_MODE", "").lower() in (
        "1",
        "true",
        "yes",
        "on",
    ):
        env_keys = [
            k
            for k in os.environ
            if k.startswith("FOLIO_LLM_") and k.endswith("_API_KEY")
        ]
        assert env_keys, "record mode is on but no FOLIO_LLM_*_API_KEY is set"
