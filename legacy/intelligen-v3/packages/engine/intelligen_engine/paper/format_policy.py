"""Venue-aware format resolution.

The important invariant is that an explicit user venue, such as IEEE, is a hard
constraint. Uploaded samples can add context, but they must not silently replace
the requested venue.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from intelligen_engine.paper.models import FormatIntent, FormatSpec


BUILTIN_FORMATS: dict[tuple[str, str], FormatSpec] = {
    ("IEEE", "conference"): FormatSpec(
        venue_label="IEEE",
        display_name="IEEE Conference",
        variant="conference",
        page_size="Letter",
        columns=2,
        citation_style="numeric",
        bibliography_style="IEEEtran",
        template_hint="ieee.tex.j2",
        keywords_required=True,
        font_size_pt=10,
        paper="letter",
        document_class_options=("conference",),
        source="builtin",
    ),
    ("IEEE", "journal"): FormatSpec(
        venue_label="IEEE",
        display_name="IEEE Journal",
        variant="journal",
        page_size="Letter",
        columns=2,
        citation_style="numeric",
        bibliography_style="IEEEtran",
        template_hint="ieee.tex.j2",
        keywords_required=True,
        font_size_pt=10,
        paper="letter",
        document_class_options=("journal",),
        source="builtin",
    ),
}

_ALIASES = {
    "ieee": "IEEE",
    "ieee conference": "IEEE",
    "ieee-conf": "IEEE",
    "ieeetran": "IEEE",
}


@dataclass(frozen=True)
class FormatDecision:
    spec: FormatSpec
    source: str
    conflicts: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    @property
    def has_conflict(self) -> bool:
        return bool(self.conflicts)


def normalize_venue_label(label: str | None) -> str | None:
    if label is None:
        return None
    raw = " ".join(label.strip().lower().split())
    if not raw:
        return None
    return _ALIASES.get(raw, label.strip())


def normalize_ieee_variant(variant: str | None) -> str:
    if variant is None or not variant.strip():
        return "conference"
    raw = " ".join(variant.strip().lower().replace("_", " ").split())
    aliases = {
        "conf": "conference",
        "conference": "conference",
        "ieee conference": "conference",
        "journal": "journal",
        "transaction": "journal",
        "transactions": "journal",
        "journal transactions": "journal",
        "ieee transactions": "journal",
    }
    if raw in aliases:
        return aliases[raw]
    if raw in {"access", "ieee access"}:
        raise ValueError(
            "IEEE Access needs its own ieeeaccess template; supported IEEE variants "
            "are conference and journal"
        )
    raise ValueError(
        f"unsupported IEEE variant {variant!r}; choose conference or journal"
    )


def resolve_format(
    intent: FormatIntent,
    *,
    sample_spec: FormatSpec | None = None,
    default_venue: str = "IEEE",
) -> FormatDecision:
    """Resolve a concrete format spec from explicit intent and optional sample.

    Priority:
    explicit venue > sample/guide-derived spec > builtin default.
    """

    explicit_label = normalize_venue_label(intent.venue_label)
    if intent.is_explicit and explicit_label == "IEEE":
        variant = normalize_ieee_variant(intent.variant)
        spec = BUILTIN_FORMATS[(explicit_label, variant)]
        conflicts = _sample_conflicts(spec, sample_spec)
        return FormatDecision(
            spec=spec,
            source="explicit_venue",
            conflicts=conflicts,
            warnings=_conflict_warnings(conflicts),
        )

    if sample_spec is not None:
        return FormatDecision(spec=sample_spec, source="sample_spec")

    fallback_label = normalize_venue_label(default_venue) or "IEEE"
    variant = normalize_ieee_variant(intent.variant) if fallback_label == "IEEE" else ""
    spec = BUILTIN_FORMATS.get((fallback_label, variant), BUILTIN_FORMATS[("IEEE", "conference")])
    return FormatDecision(
        spec=spec,
        source="default_builtin",
        warnings=[f"no explicit venue; defaulted to {spec.venue_label}"],
    )


def _sample_conflicts(
    explicit_spec: FormatSpec,
    sample_spec: FormatSpec | None,
) -> list[str]:
    if sample_spec is None:
        return []
    conflicts: list[str] = []
    if sample_spec.venue_label != explicit_spec.venue_label:
        conflicts.append(
            f"sample venue {sample_spec.venue_label!r} conflicts with "
            f"explicit venue {explicit_spec.venue_label!r}"
        )
    if sample_spec.template_hint != explicit_spec.template_hint:
        conflicts.append(
            f"sample template {sample_spec.template_hint!r} conflicts with "
            f"explicit template {explicit_spec.template_hint!r}"
        )
    if sample_spec.columns != explicit_spec.columns:
        conflicts.append(
            f"sample columns {sample_spec.columns} conflicts with "
            f"explicit columns {explicit_spec.columns}"
        )
    return conflicts


def _conflict_warnings(conflicts: list[str]) -> list[str]:
    if not conflicts:
        return []
    return [
        "explicit venue was kept; sample format was treated as contextual only",
        *conflicts,
    ]
