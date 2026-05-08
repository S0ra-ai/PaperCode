# SPDX-License-Identifier: MPL-2.0
"""FormatSpec model + cache tests."""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest

from app.core.contract import StageMessage
from app.core.formats import (
    SCHEMA_VERSION,
    CitationStyle,
    FormatSpec,
    custom_key_for,
    forget,
    get,
    is_stale,
    list_entries,
    put,
)
from app.core.formats.cache import _path_for
from app.core.formats.refresh import RefreshReason, decide
from app.core.stages import format_stage


def _make_spec(**overrides: object) -> FormatSpec:
    base = {
        "venue_label": "TestVenue",
        "display_name": "Test Venue",
        "language": "en",
        "citation_style": CitationStyle.NUMERIC,
    }
    base.update(overrides)
    return FormatSpec.model_validate(base)


def test_spec_round_trip_json() -> None:
    spec = _make_spec()
    data = json.loads(spec.model_dump_json())
    again = FormatSpec.model_validate(data)
    assert again == spec
    assert again.schema_version == SCHEMA_VERSION


def test_put_then_get_custom() -> None:
    spec = _make_spec(venue_label="custom-x")
    put(spec, tier="custom", key="abc")
    hit = get(custom_key="abc")
    assert hit is not None
    found, tier = hit
    assert tier == "custom"
    assert found.venue_label == "custom-x"
    assert found.source == "custom"
    assert found.extracted_at is not None


def test_put_bumps_old_to_v1() -> None:
    spec1 = _make_spec(display_name="v1")
    spec2 = _make_spec(display_name="v2")
    put(spec1, tier="venue", key="ACME")
    put(spec2, tier="venue", key="ACME")
    found, _ = get(venue_label="ACME")  # type: ignore[misc]
    assert found.display_name == "v2"
    assert found.prev_version == 1
    archived = _path_for("venue", "ACME").with_name("ACME.v1.json")
    assert archived.exists()


def test_list_entries_skips_archived() -> None:
    put(_make_spec(display_name="A"), tier="venue", key="ZZZ")
    put(_make_spec(display_name="B"), tier="venue", key="ZZZ")
    rows = list_entries("venue")
    keys = [k for k, _ in rows]
    assert keys == ["ZZZ"]


def test_get_falls_through_to_builtin() -> None:
    # IEEE.json is shipped in the repo; should be discoverable.
    hit = get(venue_label="IEEE")
    assert hit is not None
    spec, tier = hit
    assert tier == "builtin"
    assert spec.venue_label == "IEEE"


def test_is_stale_only_for_venue() -> None:
    custom = _make_spec(
        source="custom", extracted_at=datetime.now(UTC) - timedelta(days=99)
    )
    venue = _make_spec(
        source="venue", extracted_at=datetime.now(UTC) - timedelta(days=99)
    )
    assert is_stale(custom) is False
    assert is_stale(venue) is True


def test_forget_removes_history() -> None:
    put(_make_spec(), tier="venue", key="WILDCARD")
    put(_make_spec(), tier="venue", key="WILDCARD")
    assert forget(tier="venue", key="WILDCARD") is True
    assert get(venue_label="WILDCARD") is None


def test_builtin_tier_is_read_only() -> None:
    with pytest.raises(ValueError):
        put(_make_spec(), tier="builtin", key="X")  # type: ignore[arg-type]


def test_refresh_decide_user_forced() -> None:
    spec = _make_spec(source="venue", extracted_at=datetime.now(UTC))
    d = decide(spec, user_forced=True)
    assert d.refresh and d.reason == RefreshReason.USER_FORCED


def test_refresh_decide_venue_ttl_prompts_only() -> None:
    spec = _make_spec(
        source="venue", extracted_at=datetime.now(UTC) - timedelta(days=99)
    )
    d = decide(spec)
    assert d.refresh is False and d.prompt_user is True
    assert d.reason == RefreshReason.VENUE_TTL


def test_refresh_decide_custom_never_auto() -> None:
    spec = _make_spec(
        source="custom", extracted_at=datetime.now(UTC) - timedelta(days=999)
    )
    d = decide(spec)
    assert d.refresh is False and d.prompt_user is False


def test_refresh_decide_cache_miss() -> None:
    d = decide(None)
    assert d.refresh and d.reason == RefreshReason.SCHEMA_INVALID


def test_schema_version_mismatch_is_silent_invalidate(
    _isolate_folio_home: Path,
) -> None:
    target = _isolate_folio_home / "formats" / "venue" / "OLDV.json"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps({"schema_version": 999, "venue_label": "OLDV"}))
    assert get(venue_label="OLDV") is None


async def test_format_stage_prefers_explicit_venue_over_pdf_custom_cache(
    tmp_path: Path,
) -> None:
    pdf = tmp_path / "sample.pdf"
    pdf.write_bytes(b"%PDF-1.4\nnot a real pdf, but enough for cache key")
    custom_key = custom_key_for(pdf)
    put(
        _make_spec(
            venue_label="Custom",
            display_name="Wrong cached custom",
            columns=1,
            template_hint="_generic.tex.j2",
        ),
        tier="custom",
        key=custom_key,
    )

    msg = StageMessage(payload={"clarify": {"style": "ieee"}})
    out = await format_stage.run(msg, pdf_path=pdf, registry=object())

    assert out.payload["format_spec"]["venue_label"] == "IEEE"
    assert out.payload["format_spec"]["template_hint"] == "ieee.tex.j2"
    assert out.payload["format_spec"]["columns"] == 2
    assert out.history[-1].prompt_tokens == 0


async def test_format_stage_forced_refresh_does_not_override_explicit_venue(
    tmp_path: Path,
) -> None:
    pdf = tmp_path / "sample.pdf"
    pdf.write_bytes(b"%PDF-1.4\nnot a real pdf, but enough for cache key")

    out = await format_stage.run(
        StageMessage(payload={"clarify": {"style": "ieee"}}),
        pdf_path=pdf,
        registry=object(),
        user_forced_refresh=True,
    )

    assert out.payload["format_spec"]["venue_label"] == "IEEE"
    assert out.payload["format_spec"]["template_hint"] == "ieee.tex.j2"
    assert out.history[-1].prompt_tokens == 0


async def test_format_stage_uses_pdf_custom_cache_without_venue(
    tmp_path: Path,
) -> None:
    pdf = tmp_path / "sample.pdf"
    pdf.write_bytes(b"%PDF-1.4\nnot a real pdf, but enough for cache key")
    custom_key = custom_key_for(pdf)
    put(
        _make_spec(
            venue_label="Custom",
            display_name="Cached custom",
            columns=1,
            template_hint="_generic.tex.j2",
        ),
        tier="custom",
        key=custom_key,
    )

    out = await format_stage.run(StageMessage(), pdf_path=pdf, registry=object())

    assert out.payload["format_spec"]["venue_label"] == "Custom"
    assert out.payload["format_spec"]["template_hint"] == "_generic.tex.j2"
    assert out.payload["format_spec"]["columns"] == 1
    assert out.history[-1].prompt_tokens == 0
