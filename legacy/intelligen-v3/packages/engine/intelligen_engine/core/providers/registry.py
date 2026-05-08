"""Provider 注册中心 — 管理所有已注册的 LLM 提供商"""

import logging
from typing import Dict, List, Optional, Tuple

from intelligen_engine.core.exceptions import LLMConfigError, LLMGenerationError
from intelligen_engine.core.providers.base import BaseLLMProvider, LLMMessage, LLMResponse

logger = logging.getLogger(__name__)

# 支持的 stage 列表
VALID_STAGES = (
    "clarification",
    "planning",
    "writing",
    "review",
    "search",
    "code_analysis",
)


class ProviderRegistry:
    """Provider 注册中心 — 管理所有已注册的 LLM 提供商"""

    def __init__(self):
        self._providers: Dict[str, BaseLLMProvider] = {}
        # stage -> (provider_name, model)
        self._stage_config: Dict[str, Tuple[str, str]] = {}
        # 全局 fallback 链: [(provider_name, model), ...]
        self._fallback_chain: List[Tuple[str, str]] = []

    # ── 注册 / 获取 ────────────────────────────────────────

    def register(self, name: str, provider: BaseLLMProvider) -> None:
        """注册一个提供商实例"""
        self._providers[name] = provider
        logger.info("已注册 LLM 提供商: %s (%s)", name, provider.__class__.__name__)

    def get(self, name: str) -> BaseLLMProvider:
        """按名称获取提供商"""
        if name not in self._providers:
            raise LLMConfigError(detail=f"提供商 '{name}' 未注册")
        return self._providers[name]

    def list_providers(self) -> Dict[str, BaseLLMProvider]:
        return dict(self._providers)

    # ── Stage 配置 ─────────────────────────────────────────

    def set_stage_config(self, stage: str, provider_name: str, model: str) -> None:
        """为某个 stage 指定默认 provider + model"""
        self._stage_config[stage] = (provider_name, model)

    def get_for_stage(self, stage: str) -> Tuple[BaseLLMProvider, str]:
        """获取 stage 对应的 (provider, model)，找不到则用 fallback 链首项"""
        if stage in self._stage_config:
            pname, model = self._stage_config[stage]
            return self.get(pname), model
        # 回退到 fallback 链
        if self._fallback_chain:
            pname, model = self._fallback_chain[0]
            return self.get(pname), model
        raise LLMConfigError(detail=f"Stage '{stage}' 未配置且无 fallback 链")

    # ── Fallback 链 ────────────────────────────────────────

    def set_fallback_chain(self, chain: List[Tuple[str, str]]) -> None:
        """设置全局 fallback 链"""
        self._fallback_chain = list(chain)

    # ── 带 fallback 的调用 ─────────────────────────────────

    async def chat_with_fallback(
        self,
        messages: List[LLMMessage],
        stage: str,
        temperature: float = 0.0,
        max_tokens: int = 4096,
        **kwargs,
    ) -> LLMResponse:
        """优先使用 stage 配置的 provider, 失败后沿 fallback 链重试"""
        tried: list[str] = []
        last_error: Optional[Exception] = None

        # 构建尝试顺序: stage 配置 + fallback 链
        candidates: List[Tuple[str, str]] = []
        if stage in self._stage_config:
            candidates.append(self._stage_config[stage])
        for item in self._fallback_chain:
            if item not in candidates:
                candidates.append(item)

        if not candidates:
            raise LLMConfigError(detail=f"Stage '{stage}' 未配置且无 fallback 链")

        for pname, model in candidates:
            tried.append(f"{pname}/{model}")
            try:
                provider = self.get(pname)
                resp = await provider.chat(
                    messages=messages,
                    model=model,
                    temperature=temperature,
                    max_tokens=max_tokens,
                    **kwargs,
                )
                return resp
            except Exception as exc:
                last_error = exc
                logger.warning(
                    "Provider %s/%s 调用失败, 尝试下一个: %s",
                    pname, model, exc,
                )

        raise LLMGenerationError(
            detail=f"所有提供商均失败 (尝试: {', '.join(tried)}): {last_error}",
        )

    # ── 健康检测 ───────────────────────────────────────────

    async def health_check_all(self) -> Dict[str, bool]:
        """检测所有已注册提供商的连通性"""
        results: Dict[str, bool] = {}
        for name, provider in self._providers.items():
            try:
                results[name] = await provider.health_check()
            except Exception:
                results[name] = False
        return results


# ── 全局单例 ─────────────────────────────────────────────────

_registry: Optional[ProviderRegistry] = None


def get_provider_registry() -> ProviderRegistry:
    """获取全局 ProviderRegistry 单例"""
    global _registry
    if _registry is None:
        _registry = ProviderRegistry()
    return _registry


def init_provider_registry() -> ProviderRegistry:
    """初始化并返回全局 ProviderRegistry"""
    global _registry
    _registry = ProviderRegistry()
    return _registry
