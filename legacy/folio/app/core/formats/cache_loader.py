# SPDX-License-Identifier: MPL-2.0
"""FormatSpec cache loader: three-layer discovery (custom → venue → builtin).

Loads cached FormatSpecs from: custom (~/.folio/cache/formats/),
venue (built-in library), and builtin (repo). Checks validity (expiry,
schema version) and supports refresh.
"""

from __future__ import annotations

import hashlib
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import TYPE_CHECKING

from app.config.loader import folio_home
from app.core.formats.spec import SCHEMA_VERSION, FormatSpec

if TYPE_CHECKING:
    from sqlalchemy.orm import Session


def format_cache_dir() -> Path:
    """Return custom format cache directory."""
    cache = folio_home() / "cache" / "formats"
    cache.mkdir(parents=True, exist_ok=True)
    return cache


def compute_format_key(venue_label: str) -> str:
    """Compute stable key for venue (alphanumeric + hash)."""
    return hashlib.sha256(venue_label.encode()).hexdigest()[:16]


async def discover_builtin_formats() -> dict[str, FormatSpec]:
    """Load all builtin venue formats from app/data/formats/*.json."""
    formats: dict[str, FormatSpec] = {}
    formats_dir = Path(__file__).parent.parent.parent / "data" / "formats"
    if not formats_dir.exists():
        return formats

    for json_file in formats_dir.glob("*.json"):
        try:
            spec = FormatSpec.model_validate_json(json_file.read_text())
            if spec.schema_version == SCHEMA_VERSION:
                formats[spec.venue_label] = spec
        except Exception:
            pass

    return formats


async def discover_custom_formats(db: Session | None = None) -> dict[str, FormatSpec]:
    """Load custom formats from DB cache or filesystem."""
    formats = {}

    if db is not None:
        from app.persistence.db import FormatCacheRow

        rows = db.query(FormatCacheRow).filter_by(source="custom").all()
        for row in rows:
            try:
                spec = FormatSpec.model_validate(row.format_spec)
                if row.validity == "valid" and spec.schema_version == SCHEMA_VERSION:
                    formats[spec.venue_label] = spec
            except Exception:
                pass

    return formats


async def discover_venue_formats(db: Session | None = None) -> dict[str, FormatSpec]:
    """Load cached venue formats from DB."""
    formats = {}

    if db is not None:
        from app.persistence.db import FormatCacheRow

        rows = (
            db.query(FormatCacheRow).filter_by(source="venue", validity="valid").all()
        )
        for row in rows:
            try:
                spec = FormatSpec.model_validate(row.format_spec)
                if (
                    spec.schema_version == SCHEMA_VERSION
                    and row.expires_at
                    and row.expires_at > datetime.now(UTC)
                ):
                    formats[spec.venue_label] = spec
            except Exception:
                pass

    return formats


async def load_all_formats(
    db: Session | None = None, refresh: bool = False
) -> dict[str, FormatSpec]:
    """Load all formats from three sources: custom → venue → builtin.

    If `refresh=True`, skip cache and rebuild from source.
    Returns dict of { venue_label: FormatSpec }.
    """
    formats: dict[str, FormatSpec] = {}

    # Layer 1: Builtin (always loaded, never expired)
    builtin = await discover_builtin_formats()
    formats.update(builtin)

    # Layer 2: Venue (cached, with expiry)
    if not refresh:
        venue = await discover_venue_formats(db)
        formats.update(venue)

    # Layer 3: Custom (always loaded, never expired)
    custom = await discover_custom_formats(db)
    formats.update(custom)

    return formats


async def lookup_format(
    venue_label: str, db: Session | None = None
) -> FormatSpec | None:
    """Lookup single format by venue_label across all layers.

    Order: custom → venue → builtin.
    """
    if db is not None:
        from app.persistence.db import FormatCacheRow

        # Check custom first
        row = (
            db.query(FormatCacheRow)
            .filter_by(source="custom", key=venue_label, validity="valid")
            .first()
        )
        if row:
            try:
                return FormatSpec.model_validate(row.format_spec)
            except Exception:
                pass

        # Check venue (with validity check)
        row = (
            db.query(FormatCacheRow)
            .filter_by(source="venue", key=venue_label, validity="valid")
            .first()
        )
        if row and row.expires_at and row.expires_at > datetime.now(UTC):
            try:
                return FormatSpec.model_validate(row.format_spec)
            except Exception:
                pass

    # Check builtin
    builtin = await discover_builtin_formats()
    if venue_label in builtin:
        return builtin[venue_label]

    return None


async def save_format_cache(
    spec: FormatSpec,
    source: str,
    validity: str = "valid",
    db: Session | None = None,
) -> None:
    """Save FormatSpec to cache (DB or filesystem).

    Args:
        spec: FormatSpec to cache.
        source: 'custom' | 'venue' | 'builtin'.
        validity: 'valid' | 'expired' | 'invalid'.
        db: SQLAlchemy session (if provided, saves to DB).
    """
    if db is None:
        return

    from app.persistence.db import FormatCacheRow

    key = (
        spec.venue_label if source != "custom" else compute_format_key(spec.venue_label)
    )
    expires_at = None
    if source == "venue":
        # Venue formats expire after 30 days
        expires_at = datetime.now(UTC) + timedelta(days=30)

    row = FormatCacheRow(
        source=source,
        key=key,
        format_spec=spec.model_dump(),
        validity=validity,
        extracted_at=datetime.now(UTC),
        expires_at=expires_at,
        schema_version=str(SCHEMA_VERSION),
        note=f"Cached from {source}",
    )
    db.add(row)
    db.commit()


async def check_format_validity(spec: FormatSpec, db: Session | None = None) -> bool:
    """Check if a FormatSpec is still valid (schema version match).

    Returns False if schema version mismatch or other issues.
    """
    if spec.schema_version != SCHEMA_VERSION:
        return False

    if db is not None:
        from app.persistence.db import FormatCacheRow

        row = (
            db.query(FormatCacheRow)
            .filter_by(key=spec.venue_label)
            .order_by(FormatCacheRow.extracted_at.desc())
            .first()
        )
        if row:
            return row.validity == "valid"

    return True
