# SPDX-License-Identifier: MPL-2.0
from __future__ import annotations

import pytest

from app.core.integrity.license import check_compatibility


@pytest.mark.parametrize(
    "dataset,paper",
    [
        ("MIT", "MIT"),
        ("BSD-3-Clause", "MIT"),
        ("Apache-2.0", "MPL-2.0"),
        ("CC-BY-4.0", "MIT"),
    ],
)
def test_permissive_datasets_compatible(dataset: str, paper: str) -> None:
    d = check_compatibility(dataset, paper)
    assert d.compatible
    assert "permissive" in d.reason


def test_unknown_dataset_fails_closed() -> None:
    d = check_compatibility("WTFPL", "MIT")
    assert not d.compatible
    assert "unknown dataset" in d.reason


def test_unknown_paper_fails_closed() -> None:
    d = check_compatibility("MIT", "FOO-1.0")
    assert not d.compatible
    assert "unknown paper" in d.reason


def test_non_commercial_dataset_never_compatible() -> None:
    d = check_compatibility("CC-BY-NC-4.0", "MIT")
    assert not d.compatible
    assert "commercial" in d.reason or "redistribution" in d.reason


def test_strong_copyleft_requires_matching_paper_license() -> None:
    bad = check_compatibility("GPL-3.0", "MIT")
    assert not bad.compatible
    good = check_compatibility("GPL-3.0", "GPL-3.0")
    assert good.compatible


def test_gpl2_dataset_compatible_with_gpl3_paper() -> None:
    d = check_compatibility("GPL-2.0", "GPL-3.0")
    assert d.compatible


def test_weak_copyleft_dataset_blocked_under_permissive_paper() -> None:
    d = check_compatibility("MPL-2.0", "MIT")
    assert not d.compatible


def test_weak_copyleft_dataset_ok_under_weak_copyleft_paper() -> None:
    d = check_compatibility("MPL-2.0", "MPL-2.0")
    assert d.compatible
