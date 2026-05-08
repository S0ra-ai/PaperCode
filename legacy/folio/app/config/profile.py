# SPDX-License-Identifier: MPL-2.0
"""User profile store — `~/.folio/profile.yml`.

Persists author identity and stable preferences across runs so the
clarify stage doesn't have to re-ask things like name / affiliation
on every paper.

Schema is deliberately small: anything that's per-paper belongs in
``StageMessage.payload['clarify']``, not here.
"""

from __future__ import annotations

from pathlib import Path

import yaml
from pydantic import BaseModel, Field, ValidationError

from app.config.loader import folio_home

PROFILE_FILENAME = "profile.yml"


class UserProfile(BaseModel):
    author: str | None = None
    affiliation: str | None = None
    email: str | None = None
    orcid: str | None = None
    default_style: str = "ieee"  # ieee | acm | cjc | springer | ...
    default_language: str = "en"
    extra: dict[str, str] = Field(default_factory=dict)

    model_config = {"extra": "forbid"}


class ProfileError(RuntimeError):
    """Raised when profile.yml is malformed."""


def profile_path() -> Path:
    return folio_home() / PROFILE_FILENAME


def load() -> UserProfile:
    path = profile_path()
    if not path.exists():
        return UserProfile()
    try:
        raw = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    except yaml.YAMLError as exc:
        raise ProfileError(f"profile.yml is not valid YAML: {exc}") from exc
    if not isinstance(raw, dict):
        raise ProfileError(f"profile.yml must be a mapping, got {type(raw).__name__}")
    try:
        return UserProfile.model_validate(raw)
    except ValidationError as exc:
        raise ProfileError(f"profile.yml schema mismatch: {exc}") from exc


def save(profile: UserProfile) -> Path:
    path = profile_path()
    data = profile.model_dump(mode="json", exclude_none=True)
    path.write_text(
        yaml.safe_dump(data, sort_keys=True, allow_unicode=True),
        encoding="utf-8",
    )
    return path


def merge_into_clarify(
    profile: UserProfile, clarify: dict[str, object]
) -> dict[str, object]:
    """Pre-fill clarify answers from profile, without overwriting user input."""
    out = dict(clarify)
    mapping = {
        "author": profile.author,
        "affiliation": profile.affiliation,
        "email": profile.email,
        "orcid": profile.orcid,
        "language": profile.default_language,
        "style": profile.default_style,
    }
    for k, v in mapping.items():
        if v and not out.get(k):
            out[k] = v
    return out
