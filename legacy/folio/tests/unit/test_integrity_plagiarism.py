# SPDX-License-Identifier: MPL-2.0
from __future__ import annotations

from app.core.integrity.plagiarism import (
    flag_overlaps,
    overlap_ratio,
    shingles,
)


def test_shingles_basic() -> None:
    sh = shingles("the quick brown fox jumps over", n=3)
    assert ("the", "quick", "brown") in sh
    assert ("brown", "fox", "jumps") in sh
    assert len(sh) == 4


def test_shingles_too_short_returns_empty() -> None:
    assert shingles("hi there", n=5) == set()


def test_overlap_ratio_identical_text_is_one() -> None:
    text = "lorem ipsum dolor sit amet consectetur"
    assert overlap_ratio(text, text, n=5) == 1.0


def test_overlap_ratio_disjoint_is_zero() -> None:
    assert (
        overlap_ratio(
            "alpha beta gamma delta epsilon",
            "one two three four five six",
            n=5,
        )
        == 0.0
    )


def test_flag_overlaps_threshold() -> None:
    # Section copies the first half of source1 verbatim.
    src1 = (
        "transformers replaced recurrent networks for sequence modelling "
        "because attention is parallelisable and scales sub-quadratically"
    )
    section = (
        "transformers replaced recurrent networks for sequence modelling "
        "in our experiments"
    )
    flags = flag_overlaps(
        [("Method", section)],
        [("src1", src1), ("src2", "completely unrelated content here")],
        n=5,
        threshold=0.3,
    )
    assert len(flags) == 1
    assert flags[0].source_id == "src1"
    assert flags[0].section == "Method"
    assert flags[0].ratio >= 0.3


def test_flag_overlaps_below_threshold_yields_nothing() -> None:
    flags = flag_overlaps(
        [("Intro", "alpha beta gamma delta epsilon zeta eta theta")],
        [("s", "one two three four five six seven eight")],
        threshold=0.3,
    )
    assert flags == []


def test_flag_overlaps_sorted_by_ratio_desc() -> None:
    section = "alpha beta gamma delta epsilon zeta eta theta iota"
    flags = flag_overlaps(
        [("Sec", section)],
        [("low", "alpha beta gamma delta epsilon foo bar baz qux"), ("high", section)],
        n=5,
        threshold=0.0,
    )
    assert [f.source_id for f in flags] == ["high", "low"]
    assert flags[0].ratio >= flags[1].ratio


def test_chinese_tokens_supported() -> None:
    sh = shingles("机器 学习 模型 训练 数据 验证", n=3)
    assert ("机器", "学习", "模型") in sh
