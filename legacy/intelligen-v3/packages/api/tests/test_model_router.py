"""Tests for dynamic model routing heuristics."""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.modules.generation.services.model_router import ModelProfile, ModelRouter


CONFIG_PATH = os.path.join(
    os.path.dirname(__file__),
    "..",
    "app",
    "config_files",
    "model_config.yaml",
)


class TestModelRouter:

    def test_route_profile_without_metadata_matches_static_profile(self):
        router = ModelRouter(config_path=CONFIG_PATH)

        base = router.get_profile("writing")
        routed = router.route_profile("writing")

        assert routed == base
        assert routed is not base

    def test_writing_route_scales_budget_for_section_complexity(self):
        router = ModelRouter(config_path=CONFIG_PATH)
        base = router.get_profile("writing")

        compact = router.route_profile(
            "writing",
            {"target_words": 400, "section_index": 0, "context_size": 1200},
        )
        expanded = router.route_profile(
            "writing",
            {
                "target_words": 2800,
                "section_index": 4,
                "retry_count": 2,
                "context_size": 12000,
            },
        )

        assert compact.max_tokens < expanded.max_tokens < base.max_tokens
        assert compact.timeout <= expanded.timeout <= base.timeout + 120
        assert expanded.temperature < base.temperature

    def test_planning_route_adjusts_json_retries(self):
        router = ModelRouter(config_path=CONFIG_PATH)
        base = router.get_profile("planning")

        first_attempt = router.route_profile(
            "planning",
            {"expected_json": True, "context_size": 1200},
        )
        retry_attempt = router.route_profile(
            "planning",
            {"expected_json": True, "context_size": 1200, "retry_count": 2},
        )

        assert first_attempt.max_tokens < base.max_tokens
        assert retry_attempt.max_tokens > first_attempt.max_tokens
        assert retry_attempt.temperature <= first_attempt.temperature <= base.temperature

    def test_summary_route_uses_compact_budget(self):
        router = ModelRouter(config_path=CONFIG_PATH)
        base = router.get_profile("summary")

        routed = router.route_profile(
            "summary",
            {"target_words": 600, "context_size": 1200},
        )

        assert 384 <= routed.max_tokens < base.max_tokens
        assert 30 <= routed.timeout <= base.timeout + 30

    def test_review_route_can_prefer_fallback_model(self):
        router = ModelRouter(config_path=CONFIG_PATH)
        router._profiles["review"] = ModelProfile(
            model="fast-review-model",
            temperature=0.1,
            max_tokens=8192,
            timeout=180,
            fallback_model="quality-review-model",
            fallback_temperature=0.0,
        )

        routed = router.route_profile(
            "review",
            {"context_size": 6000, "prefer_fallback_model": True},
        )

        assert routed.model == "quality-review-model"
        assert routed.fallback_model == "fast-review-model"
        assert routed.temperature == 0.0
