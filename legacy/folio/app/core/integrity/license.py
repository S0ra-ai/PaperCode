# SPDX-License-Identifier: MPL-2.0
"""SPDX license compatibility matrix for dataset → paper output checks.

Conservative: when in doubt, fail closed. Not legal advice.
"""

from __future__ import annotations

from dataclasses import dataclass

_PERMISSIVE = frozenset(
    {
        "MIT",
        "BSD-2-Clause",
        "BSD-3-Clause",
        "Apache-2.0",
        "ISC",
        "Unlicense",
        "CC0-1.0",
        "CC-BY-4.0",
        "CC-BY-3.0",
    }
)
_WEAK_COPYLEFT = frozenset({"MPL-2.0", "LGPL-2.1", "LGPL-3.0"})
_STRONG_COPYLEFT = frozenset({"GPL-2.0", "GPL-3.0", "AGPL-3.0"})
_NON_COMMERCIAL = frozenset({"CC-BY-NC-4.0", "CC-BY-NC-SA-4.0"})

KNOWN: frozenset[str] = (
    _PERMISSIVE | _WEAK_COPYLEFT | _STRONG_COPYLEFT | _NON_COMMERCIAL
)


@dataclass(frozen=True)
class LicenseDecision:
    compatible: bool
    reason: str
    dataset_license: str
    paper_license: str


def check_compatibility(dataset_license: str, paper_license: str) -> LicenseDecision:
    d = dataset_license.strip()
    p = paper_license.strip()

    if d not in KNOWN:
        return LicenseDecision(False, f"unknown dataset license: {d!r}", d, p)
    if p not in KNOWN:
        return LicenseDecision(False, f"unknown paper license: {p!r}", d, p)

    if d in _NON_COMMERCIAL:
        return LicenseDecision(
            False,
            f"dataset license {d} forbids commercial redistribution; papers are public",
            d,
            p,
        )

    if d in _STRONG_COPYLEFT:
        if p == d or (d == "GPL-2.0" and p == "GPL-3.0"):
            return LicenseDecision(
                True, f"strong-copyleft pass-through: {d} -> {p}", d, p
            )
        return LicenseDecision(
            False,
            f"strong copyleft dataset {d} requires the paper to be released "
            f"under the same license, not {p}",
            d,
            p,
        )

    if d in _WEAK_COPYLEFT:
        if p in _WEAK_COPYLEFT or p in _STRONG_COPYLEFT:
            return LicenseDecision(
                True, f"weak-copyleft dataset {d} ok under {p}", d, p
            )
        return LicenseDecision(
            False,
            f"weak copyleft dataset {d} cannot be re-released under permissive {p}",
            d,
            p,
        )

    return LicenseDecision(True, f"permissive dataset {d} ok under {p}", d, p)
