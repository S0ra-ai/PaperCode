"""Tests for the Report Pipeline (plan → retrieve → write → normalize).

Uses mocked LLM and search services to verify pipeline flow,
citation registry integration, and error handling.
"""

import os
import sys
import threading
from dataclasses import dataclass
from typing import List, Dict, Optional
from unittest.mock import patch, MagicMock, PropertyMock

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.modules.generation.schemas import (
    ReportOutline,
    OutlineSection,
    SectionClaim,
    SectionGroundingPlan,
    SectionReviewIssue,
    SectionRubricReview,
)
from app.modules.generation.services.citation_registry import CitationRegistry
from app.modules.generation.services.citation_validator import CitationValidator
from app.modules.generation.services.generation_bridge import build_error_payload
from app.modules.generation.services.reference_builder import ReferenceBuilder
from app.modules.generation.services.context_manager import ContextManager

# ---------------------------------------------------------------------------
# Fixtures & helpers
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def _bypass_evidence_cache():
    """Prevent on-disk evidence cache from polluting test expectations."""
    mock_cache = MagicMock()
    mock_cache.return_value.get.return_value = None  # always cache miss
    with patch(
        "app.modules.generation.retrieval.evidence_cache.EvidenceCache",
        mock_cache,
    ):
        yield

FAKE_OUTLINE = ReportOutline(
    title="深度学习综述",
    sections=[
        OutlineSection(
            number="1", title="引言",
            instruction="Introduce deep learning fundamentals",
            target_words=1500,
            search_queries=["deep learning introduction"],
        ),
        OutlineSection(
            number="2", title="方法与模型",
            instruction="Describe key methods and architectures",
            target_words=2000,
            search_queries=["deep learning methods", "neural network architectures"],
        ),
        OutlineSection(
            number="3", title="参考文献",
            instruction="References section",
            target_words=500,
            search_queries=[],
        ),
    ],
)

FAKE_SEARCH_RESULTS = [
    {
        "title": "Deep Learning",
        "authors": "LeCun Y, Bengio Y, Hinton G",
        "year": "2015",
        "link": "https://doi.org/10.1038/nature14539",
        "source": "Crossref",
        "snippet": "Deep learning allows computational models composed of multiple processing layers.",
    },
    {
        "title": "Attention Is All You Need",
        "authors": "Vaswani A et al.",
        "year": "2017",
        "link": "https://arxiv.org/abs/1706.03762",
        "source": "ArXiv",
        "snippet": "The dominant sequence transduction models are based on complex recurrent networks.",
    },
    {
        "title": "BERT: Pre-training of Deep Bidirectional Transformers",
        "authors": "Devlin J et al.",
        "year": "2019",
        "link": "https://arxiv.org/abs/1810.04805",
        "source": "Semantic Scholar",
        "snippet": "We introduce a new language representation model called BERT.",
    },
]

FAKE_KEYWORDS = {
    "precise": "deep learning survey",
    "general": "deep learning overview",
    "arxiv": "deep learning neural network",
}

# Legacy alphabetical order helper used in section-writing tests.
SORTED_SEARCH_RESULTS = sorted(
    FAKE_SEARCH_RESULTS, key=lambda r: (r["source"], r["title"])
)


def _make_chat_response(content: str, prompt_tokens=100,
                        completion_tokens=200) -> Dict:
    return {
        "content": content,
        "prompt_tokens": prompt_tokens,
        "completion_tokens": completion_tokens,
        "total_tokens": prompt_tokens + completion_tokens,
    }


def _make_grounding_plan(*claims: tuple[str, list[int]] | None) -> SectionGroundingPlan:
    claim_items = [
        SectionClaim(claim=text, citations=citations)
        for text, citations in (claims or (
            ("深度学习的核心在于多层表征学习", [1]),
            ("Transformer与预训练模型推动了方法演进", [2, 3]),
        ))
    ]
    return SectionGroundingPlan(
        focus="围绕证据梳理本节核心论点与研究脉络。",
        bullet_plan=["背景与定义", "关键方法", "代表性证据"],
        claims=claim_items,
    )


def _make_review_result(*, needs_revision: bool = False,
                        verdict: str = "Section passes the rubric.",
                        unsupported_claims: bool = False,
                        sparse_citations: bool = False,
                        repetition: bool = False,
                        length_mismatch: bool = False,
                        weak_transitions: bool = False,
                        issues: Optional[list[SectionReviewIssue]] = None,
                        rewrite_instructions: Optional[list[str]] = None) -> SectionRubricReview:
    return SectionRubricReview(
        needs_revision=needs_revision,
        verdict=verdict,
        unsupported_claims=unsupported_claims,
        sparse_citations=sparse_citations,
        repetition=repetition,
        length_mismatch=length_mismatch,
        weak_transitions=weak_transitions,
        issues=list(issues or []),
        rewrite_instructions=list(rewrite_instructions or []),
    )


def _make_multi_pass_json_side_effect(*,
                                      plan: Optional[SectionGroundingPlan] = None,
                                      plan_usage: Optional[Dict[str, int]] = None,
                                      review: Optional[SectionRubricReview] = None,
                                      review_usage: Optional[Dict[str, int]] = None,
                                      plan_error: Optional[Exception] = None,
                                      review_error: Optional[Exception] = None):
    def fake_chat_json_with_metrics(messages, schema, max_retries=2,
                                    task_type="planning", routing_metadata=None):
        if task_type == "planning":
            if plan_error is not None:
                raise plan_error
            return plan or _make_grounding_plan(), (
                plan_usage or {"prompt_tokens": 10, "completion_tokens": 10, "total_tokens": 20}
            )
        if task_type == "review":
            if review_error is not None:
                raise review_error
            return review or _make_review_result(), (
                review_usage or {"prompt_tokens": 6, "completion_tokens": 4, "total_tokens": 10}
            )
        raise AssertionError(f"Unexpected task_type: {task_type}")

    return fake_chat_json_with_metrics


@dataclass
class FakeModelProfile:
    model: str = "test-model"
    temperature: float = 0.3
    max_tokens: int = 32768
    timeout: int = 300
    fallback_model: Optional[str] = None
    fallback_temperature: Optional[float] = None


class FakeRouter:
    def get_profile(self, task_type: str) -> FakeModelProfile:
        return FakeModelProfile()


def _make_pipeline():
    """Instantiate ReportPipeline with mocked constructors."""
    with patch("app.modules.generation.services.report_pipeline.LLMService") as MockLLM, \
         patch("app.modules.generation.services.report_pipeline.UnifiedAcademicSearcher") as MockSearcher, \
         patch("app.modules.generation.services.report_pipeline.OutlinePlanner") as MockPlanner:
        pipeline = _import_pipeline_class()()
    return pipeline


def _import_pipeline_class():
    from app.modules.generation.services.report_pipeline import ReportPipeline
    return ReportPipeline


# ======================================================================
# Pipeline Flow Tests
# ======================================================================
class TestPipelineFlow:
    """Verify the 4-stage pipeline flow."""

    def _make_pipeline_with_mocks(self):
        """Create pipeline with all services mocked at class level."""
        with patch("app.modules.generation.services.report_pipeline.LLMService") as MockLLM, \
             patch("app.modules.generation.services.report_pipeline.UnifiedAcademicSearcher") as MockSearcher, \
             patch("app.modules.generation.services.report_pipeline.OutlinePlanner") as MockPlanner:

            pipeline = _import_pipeline_class()()
            llm_instance = pipeline.llm
            searcher_instance = pipeline.searcher
            planner_instance = pipeline.planner

        return pipeline, llm_instance, searcher_instance, planner_instance

    def test_generate_end_to_end(self):
        """Full generate() flow returns success with content."""
        pipeline, llm, searcher, planner = self._make_pipeline_with_mocks()

        # Plan stage
        planner.plan.return_value = FAKE_OUTLINE
        llm.chat_json_with_metrics.side_effect = _make_multi_pass_json_side_effect(
            plan_usage={"prompt_tokens": 20, "completion_tokens": 10, "total_tokens": 30},
        )

        # Retrieve stage
        llm.translate_to_keywords.return_value = FAKE_KEYWORDS
        searcher.run_ensemble_search.return_value = list(FAKE_SEARCH_RESULTS)
        searcher.search_crossref.return_value = []

        # Write stage — chat_routed returns section content or summary
        section_contents = [
            "# 1 引言\n\n深度学习是一种重要的机器学习方法 [1]。近年来取得了显著进展 [2]。",
            "# 2 方法与模型\n\nTransformer架构 [2] 彻底改变了NLP领域。BERT [3] 是代表性模型。",
        ]
        call_count = {"n": 0}

        def fake_chat_routed(messages, task_type="writing", routing_metadata=None):
            if task_type == "summary":
                return _make_chat_response("摘要内容", 50, 50)
            if task_type == "review":
                section_number = 2
                return _make_chat_response(
                    f"# {section_number} 方法与模型\n\nTransformer架构 [2] 彻底改变了NLP领域。BERT [3] 是代表性模型。"
                )
            idx = call_count["n"]
            call_count["n"] += 1
            if idx < len(section_contents):
                return _make_chat_response(section_contents[idx])
            return _make_chat_response("Section content")

        llm.chat_routed.side_effect = fake_chat_routed
        llm._get_router.return_value = FakeRouter()

        result = pipeline.generate("深度学习综述")

        assert result["status"] == "success"
        assert result["content"]
        assert result["word_count"] > 0
        assert result["filename"] == "深度学习综述.md"
        assert "参考文献" in result["content"]

    def test_plan_produces_outline(self):
        """plan() delegates to OutlinePlanner and returns ReportOutline."""
        pipeline, llm, searcher, planner = self._make_pipeline_with_mocks()
        planner.plan.return_value = FAKE_OUTLINE

        result = pipeline.plan("深度学习综述")

        assert isinstance(result, ReportOutline)
        assert len(result.sections) == 3
        assert result.title == "深度学习综述"
        planner.plan.assert_called_once()
        args, kwargs = planner.plan.call_args
        assert args == ("深度学习综述", "", "", "")
        assert kwargs == {"evidence_summary": ""}

    def test_generate_passes_planning_evidence_to_planner(self):
        """generate() builds lightweight evidence and passes it to planner."""
        pipeline, llm, searcher, planner = self._make_pipeline_with_mocks()
        planner.plan.return_value = FAKE_OUTLINE
        llm.translate_to_keywords.return_value = FAKE_KEYWORDS
        searcher.search_crossref.return_value = [FAKE_SEARCH_RESULTS[0]]

        with patch.object(pipeline, "retrieve", return_value=("context", [])) as mock_retrieve, \
             patch.object(
                 pipeline, "write",
                 return_value=(["# 1 引言\n\n内容。"], {"prompt": 0, "completion": 0, "total": 0}),
             ), \
             patch.object(pipeline, "normalize", return_value="# 1 引言\n\n内容。"):
            result = pipeline.generate("深度学习综述")

        assert result["status"] == "success"
        planner_kwargs = planner.plan.call_args.kwargs
        assert "Deep Learning" in planner_kwargs["evidence_summary"]
        assert planner_kwargs["evidence_summary"].startswith("Seed queries:")
        assert mock_retrieve.call_args.kwargs["queries"] == FAKE_KEYWORDS

    @pytest.mark.parametrize("user_kwargs", [
        {"template": "1. 背景\n2. 方法\n3. 结论"},
        {"outline": "1. 背景\n2. 方法\n3. 结论"},
    ])
    def test_generate_skips_planning_evidence_for_user_structure(self, user_kwargs):
        """User template/outline should bypass extra planning evidence search."""
        pipeline, llm, searcher, planner = self._make_pipeline_with_mocks()
        planner.plan.return_value = FAKE_OUTLINE

        with patch.object(pipeline, "retrieve", return_value=("context", [])), \
             patch.object(
                 pipeline, "write",
                 return_value=(["# 1 引言\n\n内容。"], {"prompt": 0, "completion": 0, "total": 0}),
             ), \
             patch.object(pipeline, "normalize", return_value="# 1 引言\n\n内容。"):
            result = pipeline.generate("深度学习综述", **user_kwargs)

        assert result["status"] == "success"
        assert planner.plan.call_args.kwargs["evidence_summary"] == ""
        llm.translate_to_keywords.assert_not_called()
        searcher.search_crossref.assert_not_called()

    def test_retrieve_registers_citations_in_registry(self):
        """retrieve() registers web search results in the citation registry."""
        pipeline, llm, searcher, planner = self._make_pipeline_with_mocks()
        llm.translate_to_keywords.return_value = FAKE_KEYWORDS
        searcher.run_ensemble_search.return_value = list(FAKE_SEARCH_RESULTS)

        registry = CitationRegistry()
        context_str, web_results = pipeline.retrieve(
            "深度学习综述", FAKE_OUTLINE, None, registry
        )

        assert registry.count == 3
        assert len(web_results) == 3
        # Results keep the search service's fused ranking before registration
        for entry in registry.get_all():
            assert entry.number in (1, 2, 3)
            assert entry.title in [r["title"] for r in FAKE_SEARCH_RESULTS]
        assert [entry.title for entry in registry.get_all()] == [
            r["title"] for r in FAKE_SEARCH_RESULTS
        ]

        # Context string should contain reference numbers
        assert "[1]" in context_str
        assert "[2]" in context_str
        assert "[3]" in context_str

    def test_write_produces_sections_with_citations(self):
        """write() generates section content via LLM with citation markers."""
        pipeline, llm, searcher, planner = self._make_pipeline_with_mocks()

        registry = CitationRegistry()
        for r in SORTED_SEARCH_RESULTS:
            registry.register(r["title"], r["authors"], r["year"],
                              r["link"], r["source"], r["snippet"])
        llm.chat_json_with_metrics.side_effect = _make_multi_pass_json_side_effect()

        section_text = "# 1 引言\n\n深度学习 [1] 是重要技术 [2]。"

        def fake_chat_routed(messages, task_type="writing", routing_metadata=None):
            if task_type == "summary":
                return _make_chat_response("摘要")
            return _make_chat_response(section_text)

        llm.chat_routed.side_effect = fake_chat_routed
        llm._get_router.return_value = FakeRouter()
        searcher.search_crossref.return_value = []

        # Use only non-reference sections
        outline = ReportOutline(
            title="深度学习综述",
            sections=[FAKE_OUTLINE.sections[0], FAKE_OUTLINE.sections[2]],
        )

        context_str = "【Web References】\n[1] Deep Learning\n[2] Attention\n"
        sections, tokens = pipeline.write(
            "深度学习综述", outline, context_str,
            web_results=list(FAKE_SEARCH_RESULTS),
            registry=registry,
        )

        # First section has content, references section is placeholder
        assert len(sections) == 2
        assert "[1]" in sections[0]
        assert sections[1] == ""  # references placeholder

    def test_write_skips_references_section(self):
        """write() produces empty placeholder for 参考文献 section."""
        pipeline, llm, searcher, planner = self._make_pipeline_with_mocks()

        registry = CitationRegistry()
        registry.register("Paper", "A", "2024", "http://a.com", "Test")
        llm.chat_json_with_metrics.side_effect = _make_multi_pass_json_side_effect()

        def fake_chat_routed(messages, task_type="writing", routing_metadata=None):
            if task_type == "summary":
                return _make_chat_response("摘要")
            if task_type == "review":
                return _make_chat_response("# 2 方法与模型\n\n内容 [1]。")
            return _make_chat_response("# 1 引言\n\n内容 [1]。")

        llm.chat_routed.side_effect = fake_chat_routed
        llm._get_router.return_value = FakeRouter()
        searcher.search_crossref.return_value = []

        sections, _ = pipeline.write(
            "测试", FAKE_OUTLINE, "context",
            registry=registry,
        )

        # Section at index 2 is 参考文献 → empty placeholder
        assert sections[2] == ""

    def test_normalize_validates_and_builds_references(self):
        """normalize() fixes invalid citations and builds reference list."""
        pipeline, llm, searcher, planner = self._make_pipeline_with_mocks()

        registry = CitationRegistry()
        registry.register("Deep Learning", "LeCun", "2015",
                          "https://doi.org/10.1038/nature14539", "Crossref")
        registry.register("Attention Is All You Need", "Vaswani",
                          "2017", "https://arxiv.org/abs/1706.03762", "ArXiv")

        sections = [
            "# 1 引言\n\n深度学习很重要 [1]。注意力机制 [2]。无效引用 [99]。",
            "# 2 方法\n\nTransformer [2] 改变了NLP。",
            "",  # references placeholder
        ]

        result = pipeline.normalize(sections, FAKE_OUTLINE, registry)

        # Invalid [99] should be removed
        assert "[99]" not in result
        # Valid citations preserved
        assert "[1]" in result
        assert "[2]" in result
        # References section built from registry
        assert "参考文献" in result
        assert "Deep Learning" in result
        assert "Attention Is All You Need" in result

    def test_write_adds_missing_heading(self):
        """write() adds heading when LLM omits it."""
        pipeline, llm, searcher, planner = self._make_pipeline_with_mocks()

        registry = CitationRegistry()
        registry.register("Paper", "A", "2024", "http://a.com", "Test")
        llm.chat_json_with_metrics.side_effect = _make_multi_pass_json_side_effect()

        # LLM returns content WITHOUT heading
        def fake_chat_routed(messages, task_type="writing", routing_metadata=None):
            if task_type == "summary":
                return _make_chat_response("摘要")
            return _make_chat_response("这是引言内容 [1]。深度学习很重要。")

        llm.chat_routed.side_effect = fake_chat_routed
        llm._get_router.return_value = FakeRouter()
        searcher.search_crossref.return_value = []

        outline = ReportOutline(
            title="Test",
            sections=[
                OutlineSection(number="1", title="引言",
                               instruction="Write intro", target_words=1000),
                OutlineSection(number="2", title="参考文献",
                               instruction="References", target_words=500),
            ],
        )

        sections, _ = pipeline.write(
            "Test", outline, "context", registry=registry,
        )

        # Heading should be added automatically
        assert sections[0].startswith("# 1 引言")

    def test_write_passes_dynamic_routing_metadata(self):
        """write() attaches routing hints across plan, draft, and summary passes."""
        pipeline, llm, searcher, planner = self._make_pipeline_with_mocks()

        registry = CitationRegistry()
        registry.register("Paper", "A", "2024", "http://a.com", "Test")
        routed_calls = []
        json_calls = []

        def fake_chat_json_with_metrics(messages, schema, max_retries=2,
                                        task_type="planning", routing_metadata=None):
            json_calls.append({
                "task_type": task_type,
                "routing_metadata": routing_metadata,
                "prompt": messages[-1].content,
            })
            if task_type == "planning":
                return _make_grounding_plan(), {
                    "prompt_tokens": 12,
                    "completion_tokens": 8,
                    "total_tokens": 20,
                }
            if task_type == "review":
                return _make_review_result(), {
                    "prompt_tokens": 6,
                    "completion_tokens": 4,
                    "total_tokens": 10,
                }
            raise AssertionError(f"Unexpected task_type: {task_type}")

        def fake_chat_routed(messages, task_type="writing", routing_metadata=None):
            routed_calls.append({
                "task_type": task_type,
                "routing_metadata": routing_metadata,
            })
            if task_type == "summary":
                return _make_chat_response("摘要")
            return _make_chat_response("# 1 引言\n\n内容 [1]。")

        llm.chat_json_with_metrics.side_effect = fake_chat_json_with_metrics
        llm.chat_routed.side_effect = fake_chat_routed
        llm._get_router.return_value = FakeRouter()
        searcher.search_crossref.return_value = []

        outline = ReportOutline(
            title="Test",
            sections=[FAKE_OUTLINE.sections[0], FAKE_OUTLINE.sections[2]],
        )

        pipeline.write("Test", outline, "context", registry=registry)

        planning_call = next(call for call in json_calls if call["task_type"] == "planning")
        review_call = next(call for call in json_calls if call["task_type"] == "review")
        writing_call = next(call for call in routed_calls if call["task_type"] == "writing")
        summary_call = next(call for call in routed_calls if call["task_type"] == "summary")

        assert planning_call["task_type"] == "planning"
        assert planning_call["routing_metadata"] == {
            "section_index": 0,
            "target_words": 1500,
        }
        assert writing_call["routing_metadata"] == {
            "section_index": 0,
            "target_words": 1500,
            "has_review_pass": False,
        }
        assert review_call["routing_metadata"] == {
            "section_index": 0,
            "target_words": 1500,
            "has_review_pass": False,
        }
        assert "Rubric:" in review_call["prompt"]
        assert summary_call["routing_metadata"]["section_index"] == 0
        assert summary_call["routing_metadata"]["target_words"] == 1500
        assert summary_call["routing_metadata"]["context_size"] > 0
        assert summary_call["routing_metadata"]["has_review_pass"] is True

    def test_write_uses_multi_pass_grounding_before_drafting(self):
        """write() performs grounding plan, rubric review, targeted rewrite, then summary."""
        pipeline, llm, searcher, planner = self._make_pipeline_with_mocks()

        registry = CitationRegistry()
        registry.register("Deep Learning", "A", "2024", "http://a.com", "Test", "Intro")
        registry.register("Attention", "B", "2024", "http://b.com", "Test", "Methods")

        outline = ReportOutline(
            title="Test",
            sections=[
                OutlineSection(number="1", title="方法与模型", instruction="Write methods", target_words=2200),
                OutlineSection(number="2", title="参考文献", instruction="Refs", target_words=500),
            ],
        )
        call_order = []

        def fake_chat_json_with_metrics(messages, schema, max_retries=2,
                                        task_type="planning", routing_metadata=None):
            if task_type == "planning":
                call_order.append("plan")
                assert messages[0].content.count("[1]") >= 1
                return _make_grounding_plan(
                    ("Transformer成为主流架构", [2]),
                    ("预训练模型提升迁移能力", [1, 2]),
                    ("多层表示学习支撑性能提升", [1]),
                ), {"prompt_tokens": 15, "completion_tokens": 10, "total_tokens": 25}
            if task_type == "review":
                call_order.append("review-check")
                assert "Rubric:" in messages[-1].content
                return _make_review_result(
                    needs_revision=True,
                    verdict="Section needs targeted revision.",
                    sparse_citations=True,
                    issues=[
                        SectionReviewIssue(
                            code="sparse_citations",
                            detail="Several factual statements need tighter citation coverage.",
                            severity="medium",
                        )
                    ],
                    rewrite_instructions=[
                        "Tighten unsupported statements and keep citations attached to grounded claims."
                    ],
                ), {"prompt_tokens": 7, "completion_tokens": 5, "total_tokens": 12}
            raise AssertionError(f"Unexpected task_type: {task_type}")

        def fake_chat_routed(messages, task_type="writing", routing_metadata=None):
            call_order.append(task_type)
            if task_type == "review":
                assert "Flagged issues:" in messages[-1].content
                return _make_chat_response("# 1 方法与模型\n\n润色后的内容 [1][2]。")
            if task_type == "summary":
                return _make_chat_response("摘要")
            assert "Grounded section plan" in messages[-1].content
            return _make_chat_response("# 1 方法与模型\n\n初稿内容 [1][2]。")

        llm.chat_json_with_metrics.side_effect = fake_chat_json_with_metrics
        llm.chat_routed.side_effect = fake_chat_routed
        llm._get_router.return_value = FakeRouter()
        searcher.search_crossref.return_value = []

        sections, tokens = pipeline.write("Test", outline, "context", registry=registry)

        assert sections[0] == "# 1 方法与模型\n\n润色后的内容 [1][2]。"
        assert sections[1] == ""
        assert call_order == ["plan", "writing", "review-check", "review", "summary"]
        assert tokens["total"] > 0

    def test_write_skips_targeted_rewrite_when_rubric_passes(self):
        """A passing rubric review should skip the rewrite call."""
        pipeline, llm, searcher, planner = self._make_pipeline_with_mocks()

        registry = CitationRegistry()
        registry.register("Paper", "A", "2024", "http://a.com", "Test", "Snippet")

        outline = ReportOutline(
            title="Test",
            sections=[FAKE_OUTLINE.sections[0], FAKE_OUTLINE.sections[2]],
        )
        routed_calls = []

        llm.chat_json_with_metrics.side_effect = _make_multi_pass_json_side_effect(
            review=_make_review_result(needs_revision=False, verdict="Section passes the rubric."),
        )

        def fake_chat_routed(messages, task_type="writing", routing_metadata=None):
            routed_calls.append({
                "task_type": task_type,
                "routing_metadata": routing_metadata,
            })
            if task_type == "summary":
                return _make_chat_response("摘要")
            return _make_chat_response("# 1 引言\n\n保留初稿 [1]。")

        llm.chat_routed.side_effect = fake_chat_routed
        llm._get_router.return_value = FakeRouter()
        searcher.search_crossref.return_value = []

        sections, _ = pipeline.write("Test", outline, "context", registry=registry)

        assert sections[0] == "# 1 引言\n\n保留初稿 [1]。"
        assert [call["task_type"] for call in routed_calls] == ["writing", "summary"]
        summary_call = next(call for call in routed_calls if call["task_type"] == "summary")
        assert summary_call["routing_metadata"]["has_review_pass"] is True

    def test_write_preserves_citations_and_references_after_targeted_rewrite(self):
        """Targeted rewrite keeps citations valid and normalize still builds references."""
        pipeline, llm, searcher, planner = self._make_pipeline_with_mocks()

        registry = CitationRegistry()
        registry.register("Used Paper", "A", "2024", "http://a.com", "Test")
        registry.register("Unused Paper", "B", "2024", "http://b.com", "Test")

        outline = ReportOutline(
            title="Test",
            sections=[
                OutlineSection(number="1", title="引言", instruction="Intro", target_words=600),
                OutlineSection(number="2", title="参考文献", instruction="Refs", target_words=300),
            ],
        )

        llm.chat_json_with_metrics.side_effect = _make_multi_pass_json_side_effect(
            review=_make_review_result(
                needs_revision=True,
                verdict="Section needs a tighter rewrite.",
                issues=[
                    SectionReviewIssue(
                        code="weak_transitions",
                        detail="The flow is abrupt and needs a cleaner transition.",
                        severity="medium",
                    )
                ],
                rewrite_instructions=[
                    "Smooth the transition while preserving the valid citation."
                ],
            ),
        )

        def fake_chat_routed(messages, task_type="writing", routing_metadata=None):
            if task_type == "summary":
                return _make_chat_response("摘要")
            if task_type == "review":
                return _make_chat_response("# 1 引言\n\n改写后仍保留关键证据 [1]。")
            return _make_chat_response("# 1 引言\n\n初稿内容 [1]。")

        llm.chat_routed.side_effect = fake_chat_routed
        llm._get_router.return_value = FakeRouter()
        searcher.search_crossref.return_value = []

        sections, _ = pipeline.write("Test", outline, "context", registry=registry)
        normalized = pipeline.normalize(sections, outline, registry)

        assert sections[0] == "# 1 引言\n\n改写后仍保留关键证据 [1]。"
        assert "Used Paper" in normalized
        assert "Unused Paper" not in normalized
        assert "# 2 参考文献" in normalized

    def test_write_keeps_draft_when_rubric_review_fails(self):
        """If rubric review fails, keep the draft and continue to summary."""
        pipeline, llm, searcher, planner = self._make_pipeline_with_mocks()

        registry = CitationRegistry()
        registry.register("Paper", "A", "2024", "http://a.com", "Test", "Snippet")

        outline = ReportOutline(
            title="Test",
            sections=[FAKE_OUTLINE.sections[0], FAKE_OUTLINE.sections[2]],
        )
        routed_calls = []

        llm.chat_json_with_metrics.side_effect = _make_multi_pass_json_side_effect(
            review_error=RuntimeError("review failed"),
        )

        def fake_chat_routed(messages, task_type="writing", routing_metadata=None):
            routed_calls.append({
                "task_type": task_type,
                "routing_metadata": routing_metadata,
            })
            if task_type == "summary":
                return _make_chat_response("摘要")
            if task_type == "review":
                raise AssertionError("rewrite should not run when review JSON fails")
            return _make_chat_response("# 1 引言\n\n保留草稿 [1]。")

        llm.chat_routed.side_effect = fake_chat_routed
        llm._get_router.return_value = FakeRouter()
        searcher.search_crossref.return_value = []

        sections, _ = pipeline.write("Test", outline, "context", registry=registry)

        assert sections[0] == "# 1 引言\n\n保留草稿 [1]。"
        assert [call["task_type"] for call in routed_calls] == ["writing", "summary"]
        summary_call = next(call for call in routed_calls if call["task_type"] == "summary")
        assert summary_call["routing_metadata"].get("has_review_pass") is None

    def test_write_falls_back_to_direct_draft_when_grounding_plan_fails(self):
        """Grounding-plan failures should degrade to direct drafting, not abort the section."""
        pipeline, llm, searcher, planner = self._make_pipeline_with_mocks()

        registry = CitationRegistry()
        registry.register("Paper", "A", "2024", "http://a.com", "Test", "Snippet")

        outline = ReportOutline(
            title="Test",
            sections=[FAKE_OUTLINE.sections[0], FAKE_OUTLINE.sections[2]],
        )

        llm.chat_json_with_metrics.side_effect = _make_multi_pass_json_side_effect(
            plan_error=RuntimeError("planning failed"),
        )

        draft_messages = []

        def fake_chat_routed(messages, task_type="writing", routing_metadata=None):
            draft_messages.append((task_type, messages[-1].content))
            if task_type == "summary":
                return _make_chat_response("摘要")
            return _make_chat_response("# 1 引言\n\n回退草稿 [1]。")

        llm.chat_routed.side_effect = fake_chat_routed
        llm._get_router.return_value = FakeRouter()
        searcher.search_crossref.return_value = []

        sections, _ = pipeline.write("Test", outline, "context", registry=registry)

        assert sections[0] == "# 1 引言\n\n回退草稿 [1]。"
        assert any("Most relevant references for this section" in prompt for task_type, prompt in draft_messages if task_type == "writing")


# ======================================================================
# Citation Integration Tests
# ======================================================================
class TestCitationIntegration:
    """Cross-stage citation tracking between retrieve, write, normalize."""

    def _make_pipeline_with_mocks(self):
        with patch("app.modules.generation.services.report_pipeline.LLMService"), \
             patch("app.modules.generation.services.report_pipeline.UnifiedAcademicSearcher"), \
             patch("app.modules.generation.services.report_pipeline.OutlinePlanner"):
            pipeline = _import_pipeline_class()()
        return pipeline

    def test_search_results_get_sequential_numbers_after_ranked_retrieval(self):
        """retrieve() preserves the fused ranking order when numbering citations."""
        pipeline = self._make_pipeline_with_mocks()
        pipeline.llm.translate_to_keywords.return_value = FAKE_KEYWORDS
        pipeline.searcher.run_ensemble_search.return_value = list(FAKE_SEARCH_RESULTS)

        registry = CitationRegistry()
        pipeline.retrieve("深度学习", FAKE_OUTLINE, None, registry)

        entries = registry.get_all()
        assert entries[0].title == "Deep Learning"
        assert entries[0].number == 1
        assert entries[1].title == "Attention Is All You Need"
        assert entries[1].number == 2
        assert entries[2].title == "BERT: Pre-training of Deep Bidirectional Transformers"
        assert entries[2].number == 3

    def test_local_rag_registered_after_web_results(self):
        """Local RAG documents get numbers after web results."""
        pipeline = self._make_pipeline_with_mocks()
        pipeline.llm.translate_to_keywords.return_value = FAKE_KEYWORDS
        pipeline.searcher.run_ensemble_search.return_value = list(FAKE_SEARCH_RESULTS)

        # Mock LocalDocManager
        mock_rag = MagicMock()
        mock_rag.query_raw.return_value = [
            {"source": "local_paper.pdf", "content": "Local document content about deep learning."},
        ]

        registry = CitationRegistry()
        context_str, _ = pipeline.retrieve("深度学习", FAKE_OUTLINE, mock_rag, registry)

        # 3 web results + 1 local = 4 total
        assert registry.count == 4
        # Local doc gets number 4
        local_entry = registry.get(4)
        assert local_entry is not None
        assert local_entry.source == "Local Knowledge Base"
        assert "Local Knowledge Base" in context_str

    def test_dedup_same_source_file_from_local_rag(self):
        """Multiple chunks from the same local file get one citation number."""
        pipeline = self._make_pipeline_with_mocks()
        pipeline.llm.translate_to_keywords.return_value = FAKE_KEYWORDS
        pipeline.searcher.run_ensemble_search.return_value = []

        mock_rag = MagicMock()
        mock_rag.query_raw.return_value = [
            {"source": "paper.pdf", "content": "Chunk 1 about deep learning."},
            {"source": "paper.pdf", "content": "Chunk 2 about neural networks."},
            {"source": "other.pdf", "content": "Another document."},
        ]

        registry = CitationRegistry()
        pipeline.retrieve("deep learning", FAKE_OUTLINE, mock_rag, registry)

        # paper.pdf → 1 entry, other.pdf → 1 entry = 2 total
        assert registry.count == 2

    def test_dedup_web_result_with_same_url(self):
        """Same URL from different sources deduplicates in registry."""
        pipeline = self._make_pipeline_with_mocks()
        pipeline.llm.translate_to_keywords.return_value = FAKE_KEYWORDS

        # Two results with same URL (different protocols)
        duplicated_results = [
            {"title": "Paper A", "authors": "A", "year": "2024",
             "link": "https://doi.org/10.1234", "source": "Crossref",
             "snippet": "From Crossref"},
            {"title": "Paper B", "authors": "B", "year": "2024",
             "link": "http://doi.org/10.1234", "source": "OpenAlex",
             "snippet": "From OpenAlex"},
        ]
        pipeline.searcher.run_ensemble_search.return_value = duplicated_results

        registry = CitationRegistry()
        pipeline.retrieve("test", FAKE_OUTLINE, None, registry)

        # Same URL → deduplicated to 1 entry
        assert registry.count == 1

    def test_normalize_removes_invalid_citations(self):
        """normalize() strips [N] where N is not in registry."""
        pipeline = self._make_pipeline_with_mocks()

        registry = CitationRegistry()
        registry.register("Valid Paper", "A", "2024", "http://a.com", "Test")

        sections = [
            "# 1 引言\n\n有效引用 [1]。无效引用 [5] 和 [10]。",
            "",  # references placeholder
        ]
        outline = ReportOutline(
            title="Test",
            sections=[
                OutlineSection(number="1", title="引言",
                               instruction="Intro", target_words=1000),
                OutlineSection(number="2", title="参考文献",
                               instruction="Refs", target_words=500),
            ],
        )

        result = pipeline.normalize(sections, outline, registry)

        assert "[1]" in result
        assert "[5]" not in result
        assert "[10]" not in result

    def test_references_built_from_used_citations_only(self):
        """Reference section contains only actually-cited papers."""
        pipeline = self._make_pipeline_with_mocks()

        registry = CitationRegistry()
        registry.register("Used Paper", "A", "2024", "http://a.com", "Test")
        registry.register("Unused Paper", "B", "2023", "http://b.com", "Test")

        # Only [1] is cited in the text
        sections = [
            "# 1 引言\n\n内容 [1]。",
            "",
        ]
        outline = ReportOutline(
            title="Test",
            sections=[
                OutlineSection(number="1", title="引言",
                               instruction="Intro", target_words=1000),
                OutlineSection(number="2", title="参考文献",
                               instruction="Refs", target_words=500),
            ],
        )

        result = pipeline.normalize(sections, outline, registry)

        assert "Used Paper" in result
        assert "Unused Paper" not in result

    def test_section_search_registers_additional_citations(self):
        """Section-level search via search_crossref adds to registry."""
        pipeline = self._make_pipeline_with_mocks()

        registry = CitationRegistry()
        registry.register("Initial Paper", "A", "2024", "http://a.com", "Test")

        # Section search returns additional papers
        pipeline.searcher.search_crossref.return_value = [
            {"title": "Extra Paper", "authors": "X", "year": "2024",
             "link": "http://x.com", "source": "Crossref", "snippet": "Extra"},
        ]

        section = OutlineSection(
            number="1", title="引言", instruction="Intro",
            target_words=1000, search_queries=["deep learning"],
        )

        pipeline._run_section_search(section, registry)

        assert registry.count == 2
        assert registry.get(2).title == "Extra Paper"


# ======================================================================
# Error Handling Tests
# ======================================================================
class TestErrorHandling:
    """Pipeline error handling and graceful degradation."""

    def _make_pipeline_with_mocks(self):
        with patch("app.modules.generation.services.report_pipeline.LLMService"), \
             patch("app.modules.generation.services.report_pipeline.UnifiedAcademicSearcher"), \
             patch("app.modules.generation.services.report_pipeline.OutlinePlanner"):
            pipeline = _import_pipeline_class()()
        return pipeline

    def test_generate_handles_llm_failure(self):
        """generate() sanitizes provider timeouts during writing."""
        pipeline = self._make_pipeline_with_mocks()
        pipeline.planner.plan.return_value = FAKE_OUTLINE
        pipeline.llm.translate_to_keywords.return_value = FAKE_KEYWORDS
        pipeline.searcher.run_ensemble_search.return_value = list(FAKE_SEARCH_RESULTS)
        pipeline.searcher.search_crossref.return_value = []
        pipeline.llm._get_router.return_value = FakeRouter()
        pipeline.llm.chat_json_with_metrics.side_effect = _make_multi_pass_json_side_effect()

        # First chat_routed call for writing fails
        pipeline.llm.chat_routed.side_effect = RuntimeError("LLM API timeout")

        result = pipeline.generate("深度学习综述")

        assert result["status"] == "error"
        assert result["message"] == "生成引擎暂时不可用，请稍后重试。"
        assert result["errorCategory"] == "engine_unavailable"
        assert "timeout" not in result["message"].lower()

    def test_generate_handles_quota_error(self):
        """generate() sanitizes quota-related failures."""
        pipeline = self._make_pipeline_with_mocks()
        pipeline.planner.plan.return_value = FAKE_OUTLINE
        pipeline.llm.translate_to_keywords.return_value = FAKE_KEYWORDS
        pipeline.searcher.run_ensemble_search.return_value = list(FAKE_SEARCH_RESULTS)
        pipeline.searcher.search_crossref.return_value = []
        pipeline.llm._get_router.return_value = FakeRouter()
        pipeline.llm.chat_json_with_metrics.side_effect = _make_multi_pass_json_side_effect()

        pipeline.llm.chat_routed.side_effect = Exception("模型额度不足，请联系管理员充值")

        result = pipeline.generate("深度学习综述")

        assert result["status"] == "error"
        assert result["message"] == "生成额度已用尽，请稍后重试或联系管理员。"
        assert result["errorCategory"] == "quota_exceeded"

    def test_retrieve_handles_empty_search_results(self):
        """retrieve() succeeds with empty web search results."""
        pipeline = self._make_pipeline_with_mocks()
        pipeline.llm.translate_to_keywords.return_value = FAKE_KEYWORDS
        pipeline.searcher.run_ensemble_search.return_value = []

        registry = CitationRegistry()
        context_str, web_results = pipeline.retrieve(
            "深度学习", FAKE_OUTLINE, None, registry
        )

        assert web_results == []
        assert registry.count == 0
        assert "Web References" in context_str

    def test_retrieve_ignores_local_rag_failure(self):
        """retrieve() continues when local RAG query fails."""
        pipeline = self._make_pipeline_with_mocks()
        pipeline.llm.translate_to_keywords.return_value = FAKE_KEYWORDS
        pipeline.searcher.run_ensemble_search.return_value = list(FAKE_SEARCH_RESULTS)

        mock_rag = MagicMock()
        mock_rag.query_raw.side_effect = RuntimeError("RAG database error")

        registry = CitationRegistry()
        context_str, web_results = pipeline.retrieve(
            "深度学习", FAKE_OUTLINE, mock_rag, registry
        )

        # Web results still registered despite RAG failure
        assert registry.count == 3
        assert len(web_results) == 3

    def test_section_search_failure_is_tolerated(self):
        """_run_section_search() logs warning but does not raise."""
        pipeline = self._make_pipeline_with_mocks()
        pipeline.searcher.search_crossref.side_effect = RuntimeError("Network error")

        registry = CitationRegistry()
        section = OutlineSection(
            number="1", title="Test", instruction="Test",
            target_words=1000, search_queries=["query1"],
        )

        # Should not raise
        pipeline._run_section_search(section, registry)
        assert registry.count == 0

    def test_generate_handles_plan_failure(self):
        """generate() returns error when planning stage fails."""
        pipeline = self._make_pipeline_with_mocks()
        pipeline.planner.plan.side_effect = RuntimeError("LLM planning failed at C:\\provider\\internal.log")

        result = pipeline.generate("失败测试")

        assert result["status"] == "error"
        assert result["message"] == "报告生成失败，请稍后重试。"
        assert result["errorCategory"] == "generation_failed"
        assert "internal.log" not in result["message"]

    def test_build_error_payload_classifies_rag_failures(self):
        result = build_error_payload(
            RuntimeError("Failed to build index for uploaded file: no such file"),
        )

        assert result["status"] == "error"
        assert result["message"] == "上传文件暂时无法建立索引，请检查文件后重试。"
        assert result["errorCategory"] == "rag_index_error"


# ======================================================================
# Context Manager Tests
# ======================================================================
class TestContextManager:
    """Token estimation and context window management."""

    def _make_mock_llm(self):
        llm = MagicMock()
        llm.chat_routed.return_value = _make_chat_response("摘要内容", 50, 50)
        return llm

    def test_estimate_tokens_chinese(self):
        """Chinese text: ~1.5 chars per token."""
        llm = self._make_mock_llm()
        ctx = ContextManager(llm, max_tokens=32768)

        text = "深度学习是人工智能的一个分支"  # 14 Chinese chars
        tokens = ctx.estimate_tokens(text)

        # 14 / 1.5 ≈ 9.33 → 9
        assert tokens == int(14 / 1.5)

    def test_estimate_tokens_english(self):
        """English text: ~4 chars per token."""
        llm = self._make_mock_llm()
        ctx = ContextManager(llm, max_tokens=32768)

        text = "Deep learning is a branch of artificial intelligence"  # 52 chars
        tokens = ctx.estimate_tokens(text)

        # 52 / 4.0 = 13
        assert tokens == int(52 / 4.0)

    def test_estimate_tokens_mixed(self):
        """Mixed Chinese/English text."""
        llm = self._make_mock_llm()
        ctx = ContextManager(llm, max_tokens=32768)

        text = "深度学习(deep learning)是AI的核心"
        chinese_chars = sum(1 for c in text if '\u4e00' <= c <= '\u9fff')
        other_chars = len(text) - chinese_chars
        expected = int(chinese_chars / 1.5 + other_chars / 4.0)

        assert ctx.estimate_tokens(text) == expected

    def test_build_messages_basic_structure(self):
        """build_messages() returns [SystemMessage, ..., HumanMessage]."""
        from langchain_core.messages import SystemMessage, HumanMessage

        llm = self._make_mock_llm()
        ctx = ContextManager(llm, max_tokens=32768)
        ctx.set_immutable_context(
            system_prefix="You are a writer.",
            outline_text="1. Introduction\n2. Methods",
            retrieval_summary="[1] Paper A\n[2] Paper B",
        )

        messages = ctx.build_messages(0, "Write section 1")

        assert len(messages) >= 2
        assert isinstance(messages[0], SystemMessage)
        assert isinstance(messages[-1], HumanMessage)
        assert "Write section 1" in messages[-1].content
        assert "You are a writer." in messages[0].content

    def test_build_messages_can_override_source_material(self):
        """build_messages() can swap full retrieval context for section-specific refs."""
        llm = self._make_mock_llm()
        ctx = ContextManager(llm, max_tokens=32768)
        ctx.set_immutable_context(
            system_prefix="You are a writer.",
            outline_text="1. Introduction\n2. Methods",
            retrieval_summary="[1] Full corpus context\n[2] Another paper",
        )

        messages = ctx.build_messages(
            0,
            "Write section 1",
            source_material_override="[8] Section-specific ref",
        )

        assert "[8] Section-specific ref" in messages[0].content
        assert "[1] Full corpus context" not in messages[0].content

    def test_on_section_complete_tracks_citations(self):
        """on_section_complete() extracts [N] from content."""
        llm = self._make_mock_llm()
        ctx = ContextManager(llm, max_tokens=32768)

        ctx.on_section_complete(0, "Introduction",
                                "Content with [1] and [3] citations.",
                                summary="Summary text")

        assert ctx.used_citations == [1, 3]

    def test_sliding_window_evicts_oldest(self):
        """Window keeps last 3 sections, evicts oldest."""
        llm = self._make_mock_llm()
        ctx = ContextManager(llm, max_tokens=32768)

        for i in range(5):
            ctx.on_section_complete(
                i, f"Section {i+1}", f"Content {i+1}", summary=f"Summary {i+1}"
            )

        assert len(ctx._window) == 3
        assert ctx._window[0]["index"] == 2  # oldest kept
        assert ctx._window[-1]["index"] == 4  # newest

    def test_context_budget_respects_reserve(self):
        """Context budget = max_tokens * (1 - RESPONSE_RESERVE_RATIO)."""
        llm = self._make_mock_llm()
        ctx = ContextManager(llm, max_tokens=32768)

        expected_budget = int(32768 * 0.70)
        assert ctx._context_budget == expected_budget

    def test_restore_from_checkpoints(self):
        """restore_from_checkpoints() rebuilds window and summaries."""
        llm = self._make_mock_llm()
        ctx = ContextManager(llm, max_tokens=32768)

        checkpoints = [
            {"section_index": 0, "title": "Intro", "content": "Content [1]", "summary": "Sum1"},
            {"section_index": 1, "title": "Methods", "content": "Content [2]", "summary": "Sum2"},
        ]

        ctx.restore_from_checkpoints(checkpoints)

        assert len(ctx.section_summaries) == 2
        assert ctx.used_citations == [1, 2]
        assert len(ctx._window) == 2


# ======================================================================
# Helper / Utility Tests
# ======================================================================
class TestPipelineHelpers:
    """Test helper methods on ReportPipeline."""

    def _make_pipeline(self):
        with patch("app.modules.generation.services.report_pipeline.LLMService"), \
             patch("app.modules.generation.services.report_pipeline.UnifiedAcademicSearcher"), \
             patch("app.modules.generation.services.report_pipeline.OutlinePlanner"):
            return _import_pipeline_class()()

    def test_tokenize_english(self):
        """_tokenize() extracts lowercase alphanumeric tokens ≥2 chars."""
        from app.modules.generation.services.report_pipeline import ReportPipeline
        tokens = ReportPipeline._tokenize("Deep Learning for NLP 2024")
        assert "deep" in tokens
        assert "learning" in tokens
        assert "nlp" in tokens
        assert "2024" in tokens

    def test_tokenize_chinese(self):
        """_tokenize() extracts CJK multi-char runs."""
        from app.modules.generation.services.report_pipeline import ReportPipeline
        tokens = ReportPipeline._tokenize("深度学习与自然语言处理")
        assert "深度学习" in tokens or any(
            t for t in tokens if "深度" in t
        )

    def test_remove_duplicate_paragraphs(self):
        """Duplicate long paragraphs across sections are removed."""
        from app.modules.generation.services.report_pipeline import ReportPipeline
        dup_text = "A" * 100  # long enough to trigger dedup (≥80 chars)
        sections = [
            f"# Section 1\n\n{dup_text}\n\nUnique paragraph 1.",
            f"# Section 2\n\n{dup_text}\n\nUnique paragraph 2.",
        ]

        cleaned = ReportPipeline._remove_duplicate_paragraphs(sections)

        # First section keeps duplicate, second removes it
        assert dup_text in cleaned[0]
        assert dup_text not in cleaned[1]
        assert "Unique paragraph 1." in cleaned[0]
        assert "Unique paragraph 2." in cleaned[1]

    def test_build_filename(self):
        """_build_filename() sanitizes topic for filesystem."""
        pipeline = self._make_pipeline()
        assert pipeline._build_filename("深度学习综述") == "深度学习综述.md"
        assert pipeline._build_filename('test:"file"') == "test__file_.md"

    def test_rerank_for_section_with_registry(self):
        """_rerank_for_section() selects relevant references."""
        pipeline = self._make_pipeline()

        registry = CitationRegistry()
        registry.register("Deep Learning Methods", "A", "2024",
                          "http://a.com", "Test",
                          snippet="Methods for deep learning neural networks")
        registry.register("Climate Change Report", "B", "2023",
                          "http://b.com", "Test",
                          snippet="Global warming and climate policy")
        registry.register("Neural Network Architecture", "C", "2024",
                          "http://c.com", "Test",
                          snippet="Architectures for neural network models")

        section = OutlineSection(
            number="1", title="深度学习方法",
            instruction="Describe deep learning methods",
            target_words=1500,
            search_queries=["deep learning methods", "neural network"],
        )

        result = pipeline._rerank_for_section(section, [], registry, top_k=2)

        # Deep learning and neural network papers should rank higher
        assert "[1]" in result  # Deep Learning Methods
        assert "[3]" in result  # Neural Network Architecture


# ======================================================================
# Callbacks Tests
# ======================================================================
class TestCallbacks:
    """Verify progress and checkpoint callbacks."""

    def _make_pipeline_with_mocks(self):
        with patch("app.modules.generation.services.report_pipeline.LLMService"), \
             patch("app.modules.generation.services.report_pipeline.UnifiedAcademicSearcher"), \
             patch("app.modules.generation.services.report_pipeline.OutlinePlanner"):
            pipeline = _import_pipeline_class()()
        return pipeline

    def test_progress_callback_called_for_each_section(self):
        """progress_callback receives (current, total) for each section."""
        pipeline = self._make_pipeline_with_mocks()

        registry = CitationRegistry()
        registry.register("Paper", "A", "2024", "http://a.com", "Test")
        pipeline.llm.chat_json_with_metrics.side_effect = _make_multi_pass_json_side_effect()

        def fake_chat_routed(messages, task_type="writing", routing_metadata=None):
            if task_type == "summary":
                return _make_chat_response("摘要")
            return _make_chat_response("# 1 引言\n\n内容 [1]。")

        pipeline.llm.chat_routed.side_effect = fake_chat_routed
        pipeline.llm._get_router.return_value = FakeRouter()
        pipeline.searcher.search_crossref.return_value = []

        progress_calls = []
        pipeline.write(
            "Test", FAKE_OUTLINE, "context",
            registry=registry,
            progress_callback=lambda cur, total, **kwargs: progress_calls.append((cur, total)),
        )

        total_sections = len(FAKE_OUTLINE.sections)
        assert len(progress_calls) == total_sections
        # Last call should be (3, 3)
        assert progress_calls[-1] == (total_sections, total_sections)

    def test_checkpoint_callback_called_for_content_sections(self):
        """checkpoint_callback is called for non-reference sections only."""
        pipeline = self._make_pipeline_with_mocks()

        registry = CitationRegistry()
        registry.register("Paper", "A", "2024", "http://a.com", "Test")
        review_usage = {"prompt_tokens": 6, "completion_tokens": 4, "total_tokens": 10}
        pipeline.llm.chat_json_with_metrics.side_effect = _make_multi_pass_json_side_effect(
            review_usage=review_usage,
        )

        draft_response = _make_chat_response("# 1 引言\n\n内容 [1]。", 8, 9)
        summary_response = _make_chat_response("摘要", 7, 5)

        def fake_chat_routed(messages, task_type="writing", routing_metadata=None):
            if task_type == "summary":
                return summary_response
            return draft_response

        pipeline.llm.chat_routed.side_effect = fake_chat_routed
        pipeline.llm._get_router.return_value = FakeRouter()
        pipeline.searcher.search_crossref.return_value = []

        checkpoint_calls = []

        def on_checkpoint(**kwargs):
            checkpoint_calls.append(kwargs)

        pipeline.write(
            "Test", FAKE_OUTLINE, "context",
            registry=registry,
            checkpoint_callback=on_checkpoint,
        )

        # 2 content sections (引言, 方法与模型), 参考文献 is skipped
        assert len(checkpoint_calls) == 2
        assert checkpoint_calls[0]["title"] == "引言"
        assert checkpoint_calls[1]["title"] == "方法与模型"
        assert checkpoint_calls[0]["tokens"] == 20 + review_usage["total_tokens"] + draft_response["total_tokens"] + summary_response["total_tokens"]
        assert checkpoint_calls[1]["tokens"] == 20 + review_usage["total_tokens"] + draft_response["total_tokens"] + summary_response["total_tokens"]
