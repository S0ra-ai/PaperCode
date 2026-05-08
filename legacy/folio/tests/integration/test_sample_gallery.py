# SPDX-License-Identifier: MPL-2.0
"""Sample gallery regression tests (`m5-sample-gallery`).

Re-runs the M1 pipeline through each recorded e2e cassette and diffs
the output against ``examples/<demo>/expected/``.

Three demos are covered: ``ieee_demo`` (explicit IEEE style hint),
``cjc_demo`` (builtin CJC venue, Chinese), and ``springer_demo``
(builtin Springer-LNCS venue, English).

If any test fails after a deliberate prompt or template change,
regenerate the gallery::

    uv run python scripts/build_sample_gallery.py
"""

from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass
from pathlib import Path

import pytest
import vcr

from app.core.contract import StageMessage
from app.core.stages import cite_fetch, export_latex, verify_refs
from app.core.stages import draft as draft_stage
from app.core.stages import format_stage as format_stage_mod
from app.core.stages import outline as outline_stage
from app.providers.factory import build_registry

ROOT = Path(__file__).resolve().parents[2]
CASSETTE_DIR = ROOT / "tests" / "cassettes" / "test_e2e_format_to_paper"

pytestmark = [pytest.mark.integration]


@dataclass(frozen=True)
class Demo:
    name: str
    cassette: str
    clarify: dict
    venue_label: str | None


DEMOS: tuple[Demo, ...] = (
    Demo(
        name="ieee_demo",
        cassette="test_e2e_format_to_export_with_cache_hit.yaml",
        clarify={
            "topic": "A short note on n-gram language models",
            "length_pages": 2,
            "audience": "graduate students",
            "language": "en",
            "style": "ieee",
        },
        venue_label=None,
    ),
    Demo(
        name="cjc_demo",
        cassette="test_e2e_cjc_demo.yaml",
        clarify={
            "topic": "关于 n-gram 语言模型的简短综述",
            "length_pages": 4,
            "audience": "计算机科学研究生",
            "language": "zh",
            "style": "cjc",
        },
        venue_label="CJC",
    ),
    Demo(
        name="springer_demo",
        cassette="test_e2e_springer_demo.yaml",
        clarify={
            "topic": "A short survey of n-gram language models",
            "length_pages": 6,
            "audience": "graduate students",
            "language": "en",
            "style": "springer-lncs",
        },
        venue_label="Springer-LNCS",
    ),
)


def _stub_config():
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


async def _run_pipeline(demo: Demo, target: Path) -> StageMessage:
    target.mkdir(parents=True, exist_ok=True)
    pdf = ROOT / "examples" / demo.name / "input.pdf"
    my_vcr = vcr.VCR(
        cassette_library_dir=str(CASSETTE_DIR),
        record_mode="none",
        decode_compressed_response=True,
    )
    with my_vcr.use_cassette(demo.cassette):
        registry = build_registry(_stub_config())
        msg = StageMessage(payload={"clarify": dict(demo.clarify)})
        if demo.venue_label is not None:
            msg = await format_stage_mod.run(
                msg, pdf_path=pdf, registry=registry, venue_label=demo.venue_label
            )
        else:
            msg = await format_stage_mod.run(msg, pdf_path=pdf, registry=registry)
        msg = await outline_stage.run(msg, registry=registry)
        msg = await draft_stage.run(msg, registry=registry)
        msg = await cite_fetch.run(msg)
        msg = await verify_refs.run(msg)
        msg = await export_latex.run(msg, output_dir=target)
    return msg


def _normalize_payload(msg: StageMessage) -> dict:
    fmt = {
        k: v
        for k, v in (msg.payload.get("format_spec") or {}).items()
        if k != "extracted_at"
    }
    return {
        "clarify": msg.payload.get("clarify"),
        "format_spec": fmt,
        "outline": msg.payload.get("outline"),
        "draft": msg.payload.get("draft"),
        "citations": msg.payload.get("citations"),
        "verify_status": msg.payload.get("verify_status"),
        "verify_warnings": msg.payload.get("verify_warnings"),
    }


def _assert_demo_matches(
    demo: Demo, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    cassette_path = CASSETTE_DIR / demo.cassette
    pdf = ROOT / "examples" / demo.name / "input.pdf"
    expected_dir = ROOT / "examples" / demo.name / "expected"
    if not cassette_path.exists():
        pytest.skip(f"cassette missing for {demo.name}")
    if not pdf.exists():
        pytest.skip(f"input.pdf missing for {demo.name}")
    if not expected_dir.exists():
        pytest.skip(f"gallery not yet generated for {demo.name}")

    monkeypatch.setenv("FOLIO_VERIFY_LENIENT", "1")
    msg = asyncio.run(_run_pipeline(demo, tmp_path))

    expected_tex = (expected_dir / "paper.tex").read_text(encoding="utf-8")
    actual_tex_files = list(tmp_path.rglob("paper.tex"))
    assert actual_tex_files, f"{demo.name}: pipeline did not emit paper.tex"
    actual_tex = actual_tex_files[0].read_text(encoding="utf-8")
    assert actual_tex == expected_tex, (
        f"{demo.name}: paper.tex drifted from gallery; if intentional, run "
        f"`uv run python scripts/build_sample_gallery.py --only {demo.name}`"
    )

    expected_bib = (expected_dir / "references.bib").read_text(encoding="utf-8")
    assert expected_bib.strip(), f"{demo.name}: references.bib must be non-empty"
    actual_bib_files = list(tmp_path.rglob("references.bib"))
    assert actual_bib_files, f"{demo.name}: pipeline did not emit references.bib"
    actual_bib = actual_bib_files[0].read_text(encoding="utf-8")
    assert actual_bib == expected_bib, (
        f"{demo.name}: references.bib drifted from gallery; if intentional, run "
        f"`uv run python scripts/build_sample_gallery.py --only {demo.name}`"
    )

    actual_snapshot = _normalize_payload(msg)
    expected_snapshot = json.loads(
        (expected_dir / "payload.json").read_text(encoding="utf-8")
    )
    assert actual_snapshot == expected_snapshot, (
        f"{demo.name}: payload snapshot drifted from gallery; if intentional, run "
        f"`uv run python scripts/build_sample_gallery.py --only {demo.name}`"
    )


def test_ieee_gallery_matches_expected(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _assert_demo_matches(DEMOS[0], tmp_path, monkeypatch)


def test_cjc_gallery_matches_expected(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _assert_demo_matches(DEMOS[1], tmp_path, monkeypatch)


def test_springer_gallery_matches_expected(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _assert_demo_matches(DEMOS[2], tmp_path, monkeypatch)


def test_gallery_files_present() -> None:
    """Every committed demo must have all advertised files."""
    for demo in DEMOS:
        base = ROOT / "examples" / demo.name
        assert (base / "input.pdf").is_file(), demo.name
        assert (base / "clarify_answers.yml").is_file(), demo.name
        assert (base / "README.md").is_file(), demo.name
        expected = base / "expected"
        assert expected.is_dir(), demo.name
        for f in ("paper.tex", "payload.json", "references.bib"):
            assert (expected / f).is_file(), f"{demo.name}/{f}"
