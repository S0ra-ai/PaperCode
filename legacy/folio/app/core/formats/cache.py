# SPDX-License-Identifier: MPL-2.0
"""Three-tier FormatSpec cache.

Lookup order: `custom` (per-source SHA) → `venue` (venue label) →
`builtin` (shipped with repo). On miss the `FormatStage` is run and
the result is written into the appropriate tier.

See plan.md § 4a for full rationale.
"""

from __future__ import annotations

import hashlib
import json
import shutil
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Literal

from pydantic import ValidationError

from app.config.loader import folio_home
from app.core.formats.spec import SCHEMA_VERSION, FormatSpec

VENUE_TTL = timedelta(days=30)
TIERS = ("custom", "venue", "builtin")
TierName = Literal["custom", "venue", "builtin"]

BUILTIN_DIR = Path(__file__).resolve().parents[3] / "templates" / "builtin_formats"


def _user_dir(tier: TierName) -> Path:
    d = folio_home() / "formats" / tier
    d.mkdir(parents=True, exist_ok=True)
    return d


def _path_for(tier: TierName, key: str) -> Path:
    if tier == "builtin":
        return BUILTIN_DIR / f"{key}.json"
    return _user_dir(tier) / f"{key}.json"


def custom_key_for(pdf_path: Path) -> str:
    """SHA-256 of the PDF bytes; truncated for filename ergonomics."""
    h = hashlib.sha256(pdf_path.read_bytes()).hexdigest()
    return h[:32]


def _load(path: Path) -> FormatSpec | None:
    if not path.exists():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if int(data.get("schema_version", 0)) != SCHEMA_VERSION:
            # silent invalidate; caller will re-extract
            return None
        return FormatSpec.model_validate(data)
    except (json.JSONDecodeError, ValidationError):
        return None


def _is_stale(spec: FormatSpec, *, ttl: timedelta = VENUE_TTL) -> bool:
    if spec.extracted_at is None:
        return False
    return datetime.now(UTC) - spec.extracted_at > ttl


def get(
    *,
    custom_key: str | None = None,
    venue_label: str | None = None,
) -> tuple[FormatSpec, TierName] | None:
    """Resolve a FormatSpec from the three tiers.

    Returns `(spec, tier)` on hit, `None` on miss. Stale `venue` entries
    are returned as-is — the `refresh` policy decides whether to prompt.
    """
    if custom_key and (spec := _load(_path_for("custom", custom_key))):
        return spec, "custom"
    if venue_label:
        if spec := _load(_path_for("venue", venue_label)):
            return spec, "venue"
        if spec := _load(_path_for("builtin", venue_label)):
            return spec, "builtin"
    return None


def is_stale(spec: FormatSpec) -> bool:
    """Whether a venue-tier spec is past its TTL."""
    return spec.source == "venue" and _is_stale(spec)


def _bump_version(path: Path) -> int:
    """Rename `<key>.json` → `<key>.vN.json` and return N."""
    if not path.exists():
        return 0
    n = 1
    while path.with_name(f"{path.stem}.v{n}.json").exists():
        n += 1
    backup = path.with_name(f"{path.stem}.v{n}.json")
    shutil.move(str(path), str(backup))
    return n


def put(
    spec: FormatSpec,
    *,
    tier: TierName,
    key: str,
    diff_from_prev: str | None = None,
) -> Path:
    """Store `spec` under `<tier>/<key>.json`; rolls existing aside as `.vN.json`."""
    if tier == "builtin":
        raise ValueError(
            "builtin tier is read-only at runtime; use `folio format update`"
        )
    target = _path_for(tier, key)
    n = _bump_version(target)
    spec_to_write = spec.model_copy(
        update={
            "extracted_at": spec.extracted_at or datetime.now(UTC),
            "source": tier,
            "prev_version": n if n > 0 else None,
            "diff_from_prev": diff_from_prev if n > 0 else None,
        }
    )
    target.write_text(
        spec_to_write.model_dump_json(indent=2),
        encoding="utf-8",
    )
    return target


def forget(*, tier: TierName, key: str) -> bool:
    """Delete a cache entry (and its history). Returns True if anything removed."""
    if tier == "builtin":
        raise ValueError("cannot forget builtin entries")
    base = _path_for(tier, key)
    parent = base.parent
    removed = False
    for path in parent.glob(f"{key}*.json"):
        path.unlink()
        removed = True
    return removed


def list_entries(tier: TierName) -> list[tuple[str, FormatSpec]]:
    """Return `(key, spec)` for each current (non-`.vN.`) entry in `tier`."""
    directory = BUILTIN_DIR if tier == "builtin" else _user_dir(tier)
    if not directory.exists():
        return []
    out: list[tuple[str, FormatSpec]] = []
    for path in sorted(directory.glob("*.json")):
        if ".v" in path.stem and path.stem.rsplit(".v", 1)[1].isdigit():
            continue  # historical version
        spec = _load(path)
        if spec is not None:
            out.append((path.stem, spec))
    return out


def import_external(source: Path, *, key: str | None = None) -> Path:
    """Copy a hand-authored FormatSpec JSON into the `custom` tier."""
    spec = _load(source)
    if spec is None:
        raise ValueError(f"not a valid FormatSpec JSON: {source}")
    target_key = key or source.stem
    return put(spec, tier="custom", key=target_key)
