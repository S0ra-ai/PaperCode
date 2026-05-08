# SPDX-License-Identifier: MPL-2.0
from __future__ import annotations

from app.core.contract.survey_types import CorpusItem
from app.tools.literature.dedupe import (
    dedupe_merge,
    make_dedupe_key,
    normalise_arxiv,
    normalise_doi,
)


def test_normalise_doi_strips_scheme_and_lowercases() -> None:
    assert normalise_doi("https://doi.org/10.1234/FOO.BAR") == "10.1234/foo.bar"
    assert normalise_doi("10.1000/xyz123") == "10.1000/xyz123"
    assert normalise_doi(None) is None
    assert normalise_doi("not-a-doi") is None


def test_normalise_arxiv_strips_version() -> None:
    assert normalise_arxiv("2301.12345v3") == "2301.12345"
    assert normalise_arxiv("arxiv:2301.12345") == "2301.12345"
    assert normalise_arxiv(None) is None


def test_make_dedupe_key_prefers_doi() -> None:
    item = CorpusItem(
        key="x",
        doi="10.1234/abc",
        arxiv_id="2301.00001",
        title="Some Title",
        authors=("Doe J.",),
        year=2023,
    )
    assert make_dedupe_key(item) == "doi:10.1234/abc"


def test_dedupe_merge_combines_source_hits_and_keeps_best_fields() -> None:
    a = CorpusItem(
        key="tmp_a",
        doi="10.1234/abc",
        title="X",
        authors=("Doe J.",),
        year=2023,
        citation_count=5,
        source_hits=("arxiv",),
    )
    b = CorpusItem(
        key="tmp_b",
        doi="https://doi.org/10.1234/abc",
        title="X",
        authors=("Doe J.",),
        year=2023,
        citation_count=11,
        abstract="abs",
        source_hits=("crossref",),
    )
    merged = dedupe_merge([a, b])
    assert len(merged) == 1
    only = merged[0]
    assert only.key == "doi:10.1234/abc"
    assert set(only.source_hits) == {"arxiv", "crossref"}
    assert only.citation_count == 11
    assert only.abstract == "abs"


def test_dedupe_merge_falls_back_to_title_author_year() -> None:
    a = CorpusItem(key="a", title="Paper Title!", authors=("Alice B.",), year=2022)
    b = CorpusItem(key="b", title="paper title.", authors=("Alice B.",), year=2022)
    merged = dedupe_merge([a, b])
    assert len(merged) == 1
