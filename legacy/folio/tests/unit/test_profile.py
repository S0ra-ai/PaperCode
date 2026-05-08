# SPDX-License-Identifier: MPL-2.0
"""Tests for the user profile store."""

from __future__ import annotations

from pathlib import Path

import pytest
from pydantic import ValidationError

from app.config.profile import (
    ProfileError,
    UserProfile,
    load,
    merge_into_clarify,
    profile_path,
    save,
)


def test_load_empty_when_missing(_isolate_folio_home: Path) -> None:
    p = load()
    assert p == UserProfile()


def test_round_trip(_isolate_folio_home: Path) -> None:
    p = UserProfile(
        author="Ada Lovelace",
        affiliation="Analytical Engine Co.",
        email="ada@example.org",
        orcid="0000-0001-0000-0000",
        default_style="acm",
        default_language="en",
    )
    save(p)
    assert profile_path().exists()
    out = load()
    assert out.author == "Ada Lovelace"
    assert str(out.email) == "ada@example.org"
    assert out.default_style == "acm"


def test_malformed_yaml_raises(_isolate_folio_home: Path) -> None:
    profile_path().write_text(": : :", encoding="utf-8")
    with pytest.raises(ProfileError):
        load()


def test_non_mapping_raises(_isolate_folio_home: Path) -> None:
    profile_path().write_text("- just\n- a\n- list\n", encoding="utf-8")
    with pytest.raises(ProfileError):
        load()


def test_merge_into_clarify_does_not_overwrite() -> None:
    profile = UserProfile(author="Ada", default_language="zh", default_style="cjc")
    out = merge_into_clarify(profile, {"author": "Babbage"})
    assert out["author"] == "Babbage"
    assert out["language"] == "zh"
    assert out["style"] == "cjc"


def test_merge_skips_none_fields() -> None:
    profile = UserProfile()  # author/affiliation/email/orcid all None
    out = merge_into_clarify(profile, {})
    # defaults still flow in (default_language, default_style)
    assert out == {"language": "en", "style": "ieee"}
    # but None fields don't add keys
    assert "author" not in out
    assert "email" not in out


def test_extra_field_rejected() -> None:
    with pytest.raises(ValidationError):
        UserProfile(author="A", unknown_field="x")  # type: ignore[call-arg]
