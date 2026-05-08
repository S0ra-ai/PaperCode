"""模型路由：根据任务类型选择最优 LLM 配置。

基于任务特征（写作/规划/审阅等）选择模型、温度和 token 上限。
"""
import logging
import os
from dataclasses import dataclass, replace
from typing import Any, Dict, Mapping, Optional

import yaml

from app.platform.config import settings


@dataclass
class ModelProfile:
    """特定任务类型的模型参数配置。"""
    model: str
    temperature: float = 0.1
    max_tokens: int = 32768
    timeout: int = 300
    fallback_model: Optional[str] = None
    fallback_temperature: Optional[float] = None


# 任务类型 → 模型档位（"chat" = 重型, "fast" = 轻量）
_TASK_MODEL_TIER: Dict[str, str] = {
    "planning": "chat",
    "writing":  "chat",
    "review":   "chat",
    "summary":  "fast",
    "keyword":  "fast",
    "clarify":  "fast",
}

_DEFAULT_PROFILES: Dict[str, Dict] = {
    "planning": {"temperature": 0.1, "max_tokens": 4096, "timeout": 120},
    "writing": {"temperature": 0.3, "max_tokens": 32768, "timeout": 300},
    "summary": {"temperature": 0.0, "max_tokens": 2048, "timeout": 60},
    "keyword": {"temperature": 0.0, "max_tokens": 1024, "timeout": 60},
    "review": {"temperature": 0.0, "max_tokens": 8192, "timeout": 180},
    "clarify": {"temperature": 0.2, "max_tokens": 2048, "timeout": 60},
}

_MODEL_TOKEN_LIMITS: Dict[str, int] = {
    "qwen/qwen3-235b-a22b": 131072,
    "qwen/qwen3-30b-a3b": 131072,
    "perplexity/sonar-pro": 8192,
}


class ModelRouter:
    """根据任务类型路由 LLM 调用，支持动态参数调优。"""

    def __init__(self, config_path: Optional[str] = None):
        self._profiles: Dict[str, ModelProfile] = {}
        self._base_temperature = settings.LLM_TEMPERATURE
        self._base_max_tokens = settings.LLM_MAX_TOKENS
        self._base_timeout = settings.LLM_TIMEOUT
        self._load_config(config_path)

    def _load_config(self, config_path: Optional[str] = None):
        if config_path is None:
            config_path = os.path.join(
                os.path.dirname(os.path.dirname(__file__)),
                'config_files', 'model_config.yaml'
            )

        if os.path.exists(config_path):
            try:
                with open(config_path, 'r', encoding='utf-8') as f:
                    data = yaml.safe_load(f) or {}
                profiles_data = data.get('profiles', {})
                for name, cfg in profiles_data.items():
                    tier = _TASK_MODEL_TIER.get(name, "chat")
                    default_model = settings.resolved_chat_model if tier == "chat" else settings.resolved_fast_model
                    self._profiles[name] = ModelProfile(
                        model=cfg.get('model', default_model),
                        temperature=cfg.get('temperature', self._base_temperature),
                        max_tokens=cfg.get('max_tokens', self._base_max_tokens),
                        timeout=cfg.get('timeout', self._base_timeout),
                        fallback_model=cfg.get('fallback_model'),
                        fallback_temperature=cfg.get('fallback_temperature'),
                    )
                logging.info(f"ModelRouter: loaded {len(self._profiles)} profiles from {config_path}")
                return
            except Exception as e:
                logging.warning(f"ModelRouter: failed to load {config_path}: {e}")

        for name, cfg in _DEFAULT_PROFILES.items():
            tier = _TASK_MODEL_TIER.get(name, "chat")
            model = settings.resolved_chat_model if tier == "chat" else settings.resolved_fast_model
            self._profiles[name] = ModelProfile(
                model=model,
                temperature=cfg.get('temperature', self._base_temperature),
                max_tokens=cfg.get('max_tokens', self._base_max_tokens),
                timeout=cfg.get('timeout', self._base_timeout),
            )
        logging.info(f"ModelRouter: using {len(self._profiles)} default profiles")

    def get_profile(self, task_type: str) -> ModelProfile:
        if task_type in self._profiles:
            return self._profiles[task_type]
        logging.warning(f"ModelRouter: unknown task_type '{task_type}', using 'writing'")
        return self._profiles.get('writing', ModelProfile(
            model=settings.resolved_chat_model,
            temperature=self._base_temperature,
            max_tokens=self._base_max_tokens,
            timeout=self._base_timeout,
        ))

    def route_profile(self, task_type: str,
                      metadata: Optional[Mapping[str, Any]] = None) -> ModelProfile:
        """返回经上下文启发式调优后的任务配置。"""
        base_profile = self.get_profile(task_type)
        routed = replace(base_profile)
        if not metadata:
            return routed

        hints = self._normalize_metadata(metadata)
        routed = self._maybe_route_model(routed, base_profile, hints)

        handler = getattr(self, f"_apply_{task_type}_heuristics", None)
        if callable(handler):
            routed = handler(routed, hints)

        # 将 max_tokens 限制在模型输出上限内
        model_limit = _MODEL_TOKEN_LIMITS.get(routed.model, 32768)
        safe_max = int(model_limit * 0.85)
        routed.max_tokens = min(routed.max_tokens, safe_max)

        # 自适应超时：确保在合理范围内
        routed.timeout = max(60, min(600, routed.timeout))

        logging.debug(
            "ModelRouter: routed %s with %s -> model=%s temp=%.2f max_tokens=%s timeout=%s",
            task_type,
            hints,
            routed.model,
            routed.temperature,
            routed.max_tokens,
            routed.timeout,
        )
        return routed

    def get_model_name(self, task_type: str,
                       metadata: Optional[Mapping[str, Any]] = None) -> str:
        return self.route_profile(task_type, metadata).model if metadata else self.get_profile(task_type).model

    def get_temperature(self, task_type: str,
                        metadata: Optional[Mapping[str, Any]] = None) -> float:
        return self.route_profile(task_type, metadata).temperature if metadata else self.get_profile(task_type).temperature

    def get_max_tokens(self, task_type: str,
                       metadata: Optional[Mapping[str, Any]] = None) -> int:
        return self.route_profile(task_type, metadata).max_tokens if metadata else self.get_profile(task_type).max_tokens

    def get_timeout(self, task_type: str,
                    metadata: Optional[Mapping[str, Any]] = None) -> int:
        return self.route_profile(task_type, metadata).timeout if metadata else self.get_profile(task_type).timeout

    @staticmethod
    def _normalize_metadata(metadata: Mapping[str, Any]) -> Dict[str, Any]:
        return {
            "target_words": ModelRouter._to_non_negative_int(metadata.get("target_words")),
            "section_index": ModelRouter._to_non_negative_int(metadata.get("section_index")),
            "retry_count": ModelRouter._to_non_negative_int(metadata.get("retry_count")) or 0,
            "context_size": ModelRouter._to_non_negative_int(metadata.get("context_size")),
            "has_review_pass": bool(metadata.get("has_review_pass")),
            "expected_json": bool(metadata.get("expected_json")),
            "prefer_fallback_model": bool(metadata.get("prefer_fallback_model")),
        }

    @staticmethod
    def _to_non_negative_int(value: Any) -> Optional[int]:
        if value is None:
            return None
        try:
            parsed = int(value)
        except (TypeError, ValueError):
            return None
        return max(parsed, 0)

    @staticmethod
    def _clamp_int(value: int, minimum: int, maximum: int) -> int:
        return max(minimum, min(value, maximum))

    @staticmethod
    def _clamp_float(value: float, minimum: float = 0.0, maximum: float = 1.0) -> float:
        return max(minimum, min(value, maximum))

    def _maybe_route_model(self, profile: ModelProfile, base_profile: ModelProfile,
                           metadata: Dict[str, Any]) -> ModelProfile:
        if not metadata.get("prefer_fallback_model") or not base_profile.fallback_model:
            return profile

        fallback_temp = (
            base_profile.fallback_temperature
            if base_profile.fallback_temperature is not None
            else base_profile.temperature
        )
        profile.model = base_profile.fallback_model
        profile.temperature = fallback_temp
        profile.fallback_model = base_profile.model
        profile.fallback_temperature = base_profile.temperature
        return profile

    def _apply_planning_heuristics(self, profile: ModelProfile,
                                   metadata: Dict[str, Any]) -> ModelProfile:
        base_max_tokens = profile.max_tokens
        base_timeout = profile.timeout
        context_size = metadata.get("context_size") or 0
        retry_count = metadata.get("retry_count") or 0

        budget = 2048
        if context_size:
            budget = max(budget, 2048 + int(min(context_size, 12000) / 4))
        if metadata.get("expected_json"):
            budget += 256
        if retry_count:
            budget += retry_count * 384
        profile.max_tokens = self._clamp_int(budget, 1536, base_max_tokens)

        temperature = profile.temperature
        if metadata.get("expected_json"):
            temperature -= 0.02
        if retry_count:
            temperature -= min(0.10, retry_count * 0.03)
        profile.temperature = self._clamp_float(temperature)

        timeout = 45 + int(profile.max_tokens / 48)
        if context_size:
            timeout += min(45, int(context_size / 500))
        if retry_count:
            timeout += retry_count * 10
        profile.timeout = self._clamp_int(timeout, 45, base_timeout + 60)
        return profile

    def _apply_writing_heuristics(self, profile: ModelProfile,
                                  metadata: Dict[str, Any]) -> ModelProfile:
        base_max_tokens = profile.max_tokens
        base_timeout = profile.timeout
        target_words = metadata.get("target_words") or 0
        section_index = metadata.get("section_index") or 0
        retry_count = metadata.get("retry_count") or 0
        context_size = metadata.get("context_size") or 0

        budget = 2048
        if target_words:
            budget = max(budget, int(target_words * 2.2))
            if target_words >= 1800:
                budget += 512
            if target_words >= 2600:
                budget += 512
        if context_size:
            budget += min(4096, int(context_size / 10))
        if section_index > 0:
            budget += min(768, section_index * 128)
        if retry_count:
            budget += retry_count * 512
        profile.max_tokens = self._clamp_int(budget, 2048, base_max_tokens)

        temperature = profile.temperature
        if context_size > 12000:
            temperature -= 0.05
        if metadata.get("has_review_pass"):
            temperature -= 0.05
        if retry_count:
            temperature -= min(0.15, retry_count * 0.05)
        profile.temperature = self._clamp_float(temperature)

        timeout = 90 + int(profile.max_tokens / 40)
        if context_size:
            timeout += min(90, int(context_size / 400))
        if retry_count:
            timeout += retry_count * 15
        profile.timeout = self._clamp_int(timeout, 90, base_timeout + 120)
        return profile

    def _apply_summary_heuristics(self, profile: ModelProfile,
                                  metadata: Dict[str, Any]) -> ModelProfile:
        base_max_tokens = profile.max_tokens
        base_timeout = profile.timeout
        target_words = metadata.get("target_words") or 0
        retry_count = metadata.get("retry_count") or 0
        context_size = metadata.get("context_size") or 0

        budget = 384
        if target_words:
            budget = max(budget, int(target_words * 0.7))
        if context_size:
            budget = max(budget, 384 + int(min(context_size, 6000) / 8))
        if metadata.get("has_review_pass"):
            budget = int(budget * 0.9)
        if retry_count:
            budget += retry_count * 128
        profile.max_tokens = self._clamp_int(budget, 384, base_max_tokens)

        temperature = profile.temperature
        if retry_count:
            temperature -= min(0.05, retry_count * 0.02)
        profile.temperature = self._clamp_float(temperature)

        timeout = 30 + int(profile.max_tokens / 28)
        if context_size:
            timeout += min(20, int(context_size / 500))
        if retry_count:
            timeout += retry_count * 5
        profile.timeout = self._clamp_int(timeout, 30, base_timeout + 30)
        return profile

    def _apply_review_heuristics(self, profile: ModelProfile,
                                 metadata: Dict[str, Any]) -> ModelProfile:
        base_max_tokens = profile.max_tokens
        base_timeout = profile.timeout
        retry_count = metadata.get("retry_count") or 0
        context_size = metadata.get("context_size") or 0

        budget = 2048
        if context_size:
            budget = max(budget, 3072 + int(min(context_size, 16000) / 3))
        if metadata.get("has_review_pass"):
            budget += 512
        if retry_count:
            budget += retry_count * 512
        profile.max_tokens = self._clamp_int(budget, 2048, base_max_tokens)

        temperature = profile.temperature
        if retry_count:
            temperature -= min(0.10, retry_count * 0.02)
        profile.temperature = self._clamp_float(temperature)

        timeout = 60 + int(profile.max_tokens / 36)
        if context_size:
            timeout += min(60, int(context_size / 400))
        if retry_count:
            timeout += retry_count * 10
        profile.timeout = self._clamp_int(timeout, 60, base_timeout + 90)
        return profile
