# SPDX-License-Identifier: MPL-2.0
"""N-gram shingle overlap detector."""

from __future__ import annotations

import re
from collections.abc import Iterable
from dataclasses import dataclass

DEFAULT_N = 5
DEFAULT_THRESHOLD = 0.30

_TOKEN_RE = re.compile(r"[A-Za-z0-9\u4e00-\u9fff]+")


def _tokenize(text: str) -> list[str]:
    return [t.lower() for t in _TOKEN_RE.findall(text)]


def shingles(text: str, n: int = DEFAULT_N) -> set[tuple[str, ...]]:
    if n <= 0:
        raise ValueError("n must be positive")
    toks = _tokenize(text)
    if len(toks) < n:
        return set()
    return {tuple(toks[i : i + n]) for i in range(len(toks) - n + 1)}


def overlap_ratio(candidate: str, reference: str, n: int = DEFAULT_N) -> float:
    a = shingles(candidate, n=n)
    if not a:
        return 0.0
    b = shingles(reference, n=n)
    return len(a & b) / len(a)


@dataclass(frozen=True)
class PlagiarismFlag:
    section: str
    source_id: str
    ratio: float
    n: int


def flag_overlaps(
    sections: Iterable[tuple[str, str]],
    sources: Iterable[tuple[str, str]],
    *,
    n: int = DEFAULT_N,
    threshold: float = DEFAULT_THRESHOLD,
) -> list[PlagiarismFlag]:
    src_shingles = [(sid, shingles(text, n=n)) for sid, text in sources]
    flags: list[PlagiarismFlag] = []
    for name, text in sections:
        sec = shingles(text, n=n)
        if not sec:
            continue
        for sid, ssh in src_shingles:
            if not ssh:
                continue
            ratio = len(sec & ssh) / len(sec)
            if ratio >= threshold:
                flags.append(
                    PlagiarismFlag(section=name, source_id=sid, ratio=ratio, n=n)
                )
    flags.sort(key=lambda f: f.ratio, reverse=True)
    return flags
