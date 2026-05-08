# SPDX-License-Identifier: MPL-2.0
"""Generator for `examples/<demo>/expected/` golden bundles.

Drives the M1 pipeline (format → outline → draft → cite → verify →
export_latex) for each registered demo using its **already-recorded**
e2e cassette, then snapshots the resulting LaTeX bundle plus a JSON
view of the StageMessage payload into ``examples/<demo>/expected/``.

Demos covered:

* ``ieee_demo``       — explicit IEEE style hint, sample PDF kept as context only
* ``cjc_demo``        — Builtin CJC venue (Chinese, cache-hit FormatStage)
* ``springer_demo``   — Builtin Springer-LNCS venue (English, cache-hit)

VerifyStage runs in lenient mode so LLM-invented bibkeys downgrade to
warnings (mirrors the e2e cassette's recording conditions).

Because the cassettes are deterministic, repeated runs produce
byte-identical output; that is what makes the gallery suitable as a
golden regression target for ``tests/integration/test_sample_gallery.py``.

Usage::

    uv run python scripts/build_sample_gallery.py
    uv run python scripts/build_sample_gallery.py --only cjc_demo
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import shutil
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path

import vcr

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.core.contract import StageMessage  # noqa: E402
from app.core.stages import (  # noqa: E402
    cite_fetch,
    export_latex,
    verify_refs,
)
from app.core.stages import draft as draft_stage  # noqa: E402
from app.core.stages import format_stage as format_stage_mod  # noqa: E402
from app.core.stages import outline as outline_stage  # noqa: E402
from app.providers.factory import build_registry  # noqa: E402

CASSETTE_DIR = ROOT / "tests" / "cassettes" / "test_e2e_format_to_paper"


@dataclass(frozen=True)
class Demo:
    name: str
    cassette: str
    clarify: dict[str, object]
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


def _normalize_payload(msg: StageMessage) -> dict:
    """Snapshot view with volatile fields stripped (timestamps, paths)."""
    fmt = dict(msg.payload.get("format_spec") or {})
    fmt.pop("extracted_at", None)
    return {
        "clarify": msg.payload.get("clarify"),
        "format_spec": fmt,
        "outline": msg.payload.get("outline"),
        "draft": msg.payload.get("draft"),
        "citations": msg.payload.get("citations"),
        "verify_status": msg.payload.get("verify_status"),
        "verify_warnings": msg.payload.get("verify_warnings"),
    }


async def _run(demo: Demo) -> Path:
    target = ROOT / "examples" / demo.name / "expected"
    pdf = ROOT / "examples" / demo.name / "input.pdf"
    cassette_path = CASSETTE_DIR / demo.cassette
    if not cassette_path.exists():
        raise FileNotFoundError(
            f"cassette missing for {demo.name}: {cassette_path}; record it via "
            f"`pytest tests/integration/test_e2e_format_to_paper.py` with "
            f"FOLIO_TEST_RECORD_MODE=true"
        )
    if not pdf.exists():
        raise FileNotFoundError(f"input PDF missing for {demo.name}: {pdf}")

    if target.exists():
        shutil.rmtree(target)
    target.mkdir(parents=True, exist_ok=True)

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

    snapshot = _normalize_payload(msg)
    (target / "payload.json").write_text(
        json.dumps(snapshot, ensure_ascii=False, indent=2, sort_keys=True),
        encoding="utf-8",
    )
    return target


def _build_one(demo: Demo) -> None:
    # Isolate FOLIO_HOME so the format-cache doesn't leak between demos
    # (the e2e tests use an autouse fixture for this; we replicate it here).
    # FOLIO_VERIFY_LENIENT mirrors the cassettes' recording conditions
    # so verify downgrades unresolved bibkeys to warnings.
    with tempfile.TemporaryDirectory() as td:
        os.environ["FOLIO_HOME"] = td
        os.environ["FOLIO_VERIFY_LENIENT"] = "1"
        target = asyncio.run(_run(demo))
    print(f"[{demo.name}] wrote -> {target}")
    for p in sorted(target.rglob("*")):
        if p.is_file():
            print(f"  {p.relative_to(target)} ({p.stat().st_size} B)")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--only",
        choices=[d.name for d in DEMOS],
        help="rebuild a single demo",
    )
    args = parser.parse_args()

    selected = [d for d in DEMOS if d.name == args.only] if args.only else list(DEMOS)
    for demo in selected:
        _build_one(demo)


if __name__ == "__main__":
    main()
