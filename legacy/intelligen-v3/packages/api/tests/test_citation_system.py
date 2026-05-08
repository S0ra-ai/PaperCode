"""Tests for the Citation System (registry, validator, reference builder)."""

import os
import sys
import threading

import pytest

# Ensure app imports work
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.modules.generation.services.citation_registry import CitationRegistry, CitationEntry
from app.modules.generation.services.citation_validator import CitationValidator, ValidationResult
from app.modules.generation.services.reference_builder import ReferenceBuilder


# ======================================================================
# CitationRegistry
# ======================================================================
class TestCitationRegistry:

    def test_register_returns_sequential_numbers(self):
        reg = CitationRegistry()
        n1 = reg.register("Paper One", "A Author", "2024", "http://a.com", "Crossref")
        n2 = reg.register("Paper Two", "B Author", "2023", "http://b.com", "OpenAlex")
        assert n1 == 1
        assert n2 == 2
        assert reg.count == 2

    def test_dedup_by_normalized_title(self):
        reg = CitationRegistry()
        n1 = reg.register("Deep Learning for NLP", "A", "2024", "http://a.com", "S")
        n2 = reg.register("deep learning for nlp", "B", "2023", "http://b.com", "S")
        assert n1 == n2
        assert reg.count == 1

    def test_dedup_strips_punctuation(self):
        reg = CitationRegistry()
        n1 = reg.register("A Survey: Deep-Learning!", "A", "2024", "http://a.com", "S")
        n2 = reg.register("A Survey Deep Learning", "B", "2023", "http://b.com", "S")
        assert n1 == n2

    def test_dedup_by_url(self):
        reg = CitationRegistry()
        n1 = reg.register("Title A", "A", "2024", "https://doi.org/10.1234", "S")
        n2 = reg.register("Title B", "B", "2023", "http://doi.org/10.1234", "S")
        assert n1 == n2  # same URL after normalization
        assert reg.count == 1

    def test_register_batch(self):
        reg = CitationRegistry()
        results = [
            {"title": "Paper 1", "authors": "A", "year": "2024",
             "link": "http://1.com", "source": "Crossref", "snippet": "abc"},
            {"title": "Paper 2", "authors": "B", "year": "2023",
             "link": "http://2.com", "source": "OpenAlex", "snippet": "def"},
            {"title": "Paper 1", "authors": "C", "year": "2024",
             "link": "http://3.com", "source": "ArXiv", "snippet": "ghi"},  # dup title
        ]
        nums = reg.register_batch(results)
        assert nums == [1, 2, 1]  # third is dedup of first
        assert reg.count == 2

    def test_get_and_get_all(self):
        reg = CitationRegistry()
        reg.register("Paper A", "Auth A", "2024", "http://a.com", "Crossref", "snip A")
        reg.register("Paper B", "Auth B", "2023", "http://b.com", "OpenAlex", "snip B")

        entry = reg.get(1)
        assert entry is not None
        assert entry.title == "Paper A"
        assert entry.authors == "Auth A"

        assert reg.get(99) is None

        all_entries = reg.get_all()
        assert len(all_entries) == 2
        assert all_entries[0].number == 1
        assert all_entries[1].number == 2

    def test_is_valid(self):
        reg = CitationRegistry()
        reg.register("Paper", "A", "2024", "http://a.com", "S")
        assert reg.is_valid(1) is True
        assert reg.is_valid(2) is False

    def test_thread_safety(self):
        reg = CitationRegistry()
        errors = []

        def register_many(start):
            try:
                for j in range(100):
                    reg.register(f"Paper-{start}-{j}", "A", "2024",
                                 f"http://t{start}_{j}.com", "S")
            except Exception as e:
                errors.append(e)

        threads = [threading.Thread(target=register_many, args=(i,)) for i in range(4)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        assert len(errors) == 0
        assert reg.count == 400  # 4 threads * 100 unique papers

    def test_empty_title_and_url(self):
        reg = CitationRegistry()
        n1 = reg.register("", "A", "2024", "", "S")
        n2 = reg.register("", "B", "2023", "", "S")
        # Empty normalized title/url — cannot deduplicate, treated as separate
        assert n1 != n2
        assert reg.count == 2


# ======================================================================
# CitationValidator
# ======================================================================
class TestCitationValidator:

    def _make_registry(self, n=5):
        reg = CitationRegistry()
        for i in range(n):
            reg.register(f"Paper {i+1}", f"Author {i+1}", str(2020 + i),
                         f"http://p{i+1}.com", "Crossref", f"Snippet {i+1}")
        return reg

    def test_validate_all_valid(self):
        reg = self._make_registry(3)
        text = "As shown in [1] and [2], the method works well [3]."
        v = CitationValidator()
        result = v.validate(text, reg)
        assert result.valid_refs == [1, 2, 3]
        assert result.invalid_refs == []
        assert result.uncited_sources == []
        assert result.coverage_ratio == 1.0

    def test_validate_detects_invalid(self):
        reg = self._make_registry(3)
        text = "As shown in [1], [5], and [99]."
        v = CitationValidator()
        result = v.validate(text, reg)
        assert result.valid_refs == [1]
        assert sorted(result.invalid_refs) == [5, 99]
        assert 2 in result.uncited_sources
        assert 3 in result.uncited_sources

    def test_validate_ignores_markdown_links(self):
        reg = self._make_registry(3)
        # [1](http://link) is a markdown link, not a citation
        text = "See [1](http://link.com) and also [2]."
        v = CitationValidator()
        result = v.validate(text, reg)
        assert 1 not in result.valid_refs  # markdown link, not citation
        assert 2 in result.valid_refs

    def test_fix_removes_invalid(self):
        reg = self._make_registry(3)
        text = "Result [1] and [99] and [2] show improvement."
        v = CitationValidator()
        fixed = v.fix(text, reg)
        assert "[1]" in fixed
        assert "[2]" in fixed
        assert "[99]" not in fixed

    def test_fix_preserves_markdown_links(self):
        reg = self._make_registry(3)
        text = "See [this link](http://example.com) and [1]."
        v = CitationValidator()
        fixed = v.fix(text, reg)
        assert "[this link](http://example.com)" in fixed
        assert "[1]" in fixed

    def test_extract_used_numbers(self):
        reg = self._make_registry(5)
        text = "Text [1] more [3] text [5] and [3] again."
        v = CitationValidator()
        nums = v.extract_used_numbers(text)
        assert nums == [1, 3, 5]

    def test_validate_excludes_references_section(self):
        reg = self._make_registry(3)
        text = ("Body text [1] and [2].\n\n"
                "# 6 参考文献\n\n"
                "[1] Author. Paper. 2024.\n"
                "[2] Author. Paper. 2023.\n"
                "[3] Author. Paper. 2022.\n")
        v = CitationValidator()
        result = v.validate(text, reg, exclude_references_section=True)
        # Only [1] and [2] from body, not [3] from references
        assert result.valid_refs == [1, 2]
        assert 3 in result.uncited_sources

    def test_validate_empty_text(self):
        reg = self._make_registry(2)
        v = CitationValidator()
        result = v.validate("", reg)
        assert result.valid_refs == []
        assert result.invalid_refs == []
        assert result.uncited_sources == [1, 2]
        assert result.coverage_ratio == 0.0

    def test_validate_empty_registry(self):
        reg = CitationRegistry()
        v = CitationValidator()
        result = v.validate("Some text [1] [2]", reg)
        assert result.valid_refs == []
        assert result.invalid_refs == [1, 2]
        assert result.coverage_ratio == 1.0  # 0/0 → 1.0


# ======================================================================
# ReferenceBuilder
# ======================================================================
class TestReferenceBuilder:

    def _make_registry(self):
        reg = CitationRegistry()
        reg.register("Deep Learning Survey", "LeCun Y, Bengio Y", "2015",
                      "https://doi.org/10.1234", "Nature", "A comprehensive survey")
        reg.register("Attention Is All You Need", "Vaswani A", "2017",
                      "https://arxiv.org/abs/1706.03762", "NeurIPS", "Transformer paper")
        reg.register("BERT Paper", "Devlin J", "2019",
                      "https://arxiv.org/abs/1810.04805", "NAACL", "Pre-training model")
        return reg

    def test_build_all(self):
        reg = self._make_registry()
        builder = ReferenceBuilder()
        result = builder.build(reg)
        assert "[1]" in result
        assert "[2]" in result
        assert "[3]" in result
        assert "Deep Learning Survey" in result
        assert "Vaswani A" in result

    def test_build_filtered(self):
        reg = self._make_registry()
        builder = ReferenceBuilder()
        result = builder.build(reg, used_numbers=[1, 3])
        assert "[1]" in result
        assert "[3]" in result
        assert "[2]" not in result

    def test_build_empty(self):
        reg = CitationRegistry()
        builder = ReferenceBuilder()
        assert builder.build(reg) == ""

    def test_build_format(self):
        reg = CitationRegistry()
        reg.register("Test Paper", "Smith J", "2024",
                      "https://doi.org/10.5678", "IEEE", "A test")
        builder = ReferenceBuilder()
        result = builder.build(reg)
        assert result.startswith("[1]")
        assert "Smith J." in result
        assert "Test Paper." in result
        assert "IEEE" in result
        assert "2024" in result
        assert "https://doi.org/10.5678" in result

    def test_build_sorted_by_number(self):
        reg = CitationRegistry()
        reg.register("Z Paper", "Z Author", "2024", "http://z.com", "S")
        reg.register("A Paper", "A Author", "2023", "http://a.com", "S")
        builder = ReferenceBuilder()
        result = builder.build(reg)
        lines = [l for l in result.split('\n\n') if l.strip()]
        assert lines[0].startswith("[1]")
        assert lines[1].startswith("[2]")

    def test_build_handles_na_year(self):
        reg = CitationRegistry()
        reg.register("Paper", "Author", "N/A", "http://p.com", "Source")
        builder = ReferenceBuilder()
        result = builder.build(reg)
        assert "N/A" not in result  # N/A year is excluded from output


# ======================================================================
# Integration: Pipeline helpers
# ======================================================================
class TestPipelineHelpers:
    """Test the new helper methods on ReportPipeline without requiring
    full LLM/search infrastructure."""

    def test_tokenize(self):
        # Import the static method
        from app.modules.generation.services.report_pipeline import ReportPipeline
        tokens = ReportPipeline._tokenize("Deep Learning for NLP 2024")
        assert "deep" in tokens
        assert "learning" in tokens
        assert "2024" in tokens
        assert "nlp" in tokens

    def test_tokenize_chinese(self):
        from app.modules.generation.services.report_pipeline import ReportPipeline
        tokens = ReportPipeline._tokenize("深度学习在自然语言处理中的应用")
        assert "深度学习" in tokens or any("深度" in t for t in tokens)

    def test_tokenize_empty(self):
        from app.modules.generation.services.report_pipeline import ReportPipeline
        assert ReportPipeline._tokenize("") == set()
        assert ReportPipeline._tokenize(None) == set()

    def test_remove_duplicate_paragraphs(self):
        from app.modules.generation.services.report_pipeline import ReportPipeline
        sections = [
            "# 1 Intro\n\n" + "A" * 100 + "\n\n" + "B" * 100,
            "# 2 Body\n\n" + "A" * 100 + "\n\nNew paragraph here that is unique and long enough.",
        ]
        result = ReportPipeline._remove_duplicate_paragraphs(sections)
        # The duplicate "A"*100 should be removed from section 2
        assert result[0].count("A" * 100) == 1
        assert "A" * 100 not in result[1]
        # Headings are preserved
        assert "# 1 Intro" in result[0]
        assert "# 2 Body" in result[1]

    def test_remove_duplicate_preserves_short(self):
        from app.modules.generation.services.report_pipeline import ReportPipeline
        sections = [
            "# 1 Intro\n\nShort.\n\nShort.",
            "# 2 Body\n\nShort.",
        ]
        result = ReportPipeline._remove_duplicate_paragraphs(sections)
        # Short paragraphs (<80 chars) are not deduped
        assert result[0].count("Short.") == 2
        assert result[1].count("Short.") == 1


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
