"""LLM 服务 — 通过 OpenRouter 处理所有 LLM 交互

集成 LLM 密钥池实现多 Key 管理和限流，
并在可用时委托给多供应商 ProviderRegistry。
"""
import json
import httpx
import logging
import structlog
import time
import threading
from typing import List, Dict, Optional, Type, TypeVar
from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage
from pydantic import BaseModel, ValidationError

from intelligen_engine.core.config import settings
from intelligen_engine.core.exceptions import LLMConfigError, LLMGenerationError, LLMRateLimitError

T = TypeVar('T', bound=BaseModel)


def _get_pool_key_sync() -> Optional[str]:
    """同步获取池化 API Key，失败时回退到 settings.OPENROUTER_API_KEY"""
    try:
        import asyncio
        from intelligen_engine.core.llm_pool import get_llm_pool
        pool = get_llm_pool()
        loop = asyncio.get_event_loop()
        if loop.is_running():
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as executor:
                future = executor.submit(asyncio.run, pool.acquire_key())
                return future.result(timeout=10)
        else:
            return loop.run_until_complete(pool.acquire_key())
    except Exception:
        return None


def _record_pool_usage_sync(key: str, tokens: int):
    """同步记录密钥池用量"""
    try:
        import asyncio
        from intelligen_engine.core.llm_pool import get_llm_pool
        pool = get_llm_pool()
        loop = asyncio.get_event_loop()
        if loop.is_running():
            loop.create_task(pool.record_usage(key, tokens))
        else:
            loop.run_until_complete(pool.record_usage(key, tokens))
    except Exception:
        pass


def _mark_pool_healthy_sync(key: str):
    """成功后标记密钥为健康"""
    try:
        import asyncio
        from intelligen_engine.core.llm_pool import get_llm_pool
        pool = get_llm_pool()
        loop = asyncio.get_event_loop()
        if loop.is_running():
            loop.create_task(pool.mark_healthy(key))
        else:
            loop.run_until_complete(pool.mark_healthy(key))
    except Exception:
        pass


def _mark_pool_unhealthy_sync(key: str, error: str):
    """出错后标记密钥为不健康"""
    try:
        import asyncio
        from intelligen_engine.core.llm_pool import get_llm_pool
        pool = get_llm_pool()
        loop = asyncio.get_event_loop()
        if loop.is_running():
            loop.create_task(pool.mark_unhealthy(key, error))
        else:
            loop.run_until_complete(pool.mark_unhealthy(key, error))
    except Exception:
        pass


def _is_retryable_error(error: Exception) -> bool:
    """判断是否为值得重试的瞬态 API 错误"""
    if isinstance(error, (ConnectionError, TimeoutError)):
        return True
    if isinstance(error, (httpx.TimeoutException, httpx.ConnectError)):
        return True
    if isinstance(error, httpx.HTTPStatusError):
        if error.response.status_code in (429, 502, 503, 504):
            return True
    error_str = str(error)
    for code in ("429", "502", "503", "504"):
        if code in error_str:
            return True
    return False


class LLMService:
    """LLM 服务 — 封装翻译、推理和写作等 LLM 交互

    管理 API Key 池、模型路由和请求重试，
    提供 chat / chat_routed / chat_json 三级调用接口。
    """

    def __init__(self):
        self.api_key = settings.OPENROUTER_API_KEY
        self.model_name = settings.resolved_chat_model
        self._llm = None
        self._llm_cache: Dict[str, ChatOpenAI] = {}
        self._cache_lock = threading.Lock()
        self._router = None
        self._current_key: Optional[str] = None  # 当前调用使用的 Key

    @property
    def llm(self):
        if self._llm is None and self.api_key:
            with self._cache_lock:
                if self._llm is None:
                    http_client = httpx.Client(verify=settings.SSL_VERIFY, timeout=settings.LLM_TIMEOUT)
                    self._llm = ChatOpenAI(
                        model=self.model_name,
                        temperature=settings.LLM_TEMPERATURE,
                        openai_api_base=settings.OPENROUTER_BASE_URL,
                        openai_api_key=self.api_key,
                        max_tokens=settings.LLM_MAX_TOKENS,
                        timeout=settings.LLM_TIMEOUT,
                        http_client=http_client
                    )
        return self._llm

    def _get_router(self):
        if self._router is None:
            from intelligen_engine.pipeline.shared.model_router import ModelRouter
            self._router = ModelRouter()
        return self._router

    def _get_llm(self, model: str = None, temperature: float = None,
                 max_tokens: int = None, timeout: int = None) -> ChatOpenAI:
        model = model or self.model_name
        temperature = temperature if temperature is not None else settings.LLM_TEMPERATURE
        max_tokens = max_tokens or settings.LLM_MAX_TOKENS
        timeout = timeout or settings.LLM_TIMEOUT

        # 从密钥池获取 Key 以实现负载均衡
        pool_key = _get_pool_key_sync()
        api_key = pool_key or self.api_key
        self._current_key = api_key

        cache_key = f"{model}|{temperature}|{max_tokens}|{timeout}|{api_key[-8:]}"
        with self._cache_lock:
            if cache_key not in self._llm_cache:
                http_client = httpx.Client(verify=settings.SSL_VERIFY, timeout=timeout)
                self._llm_cache[cache_key] = ChatOpenAI(
                    model=model,
                    temperature=temperature,
                    openai_api_base=settings.OPENROUTER_BASE_URL,
                    openai_api_key=api_key,
                    max_tokens=max_tokens,
                    timeout=timeout,
                    http_client=http_client,
                )
        return self._llm_cache[cache_key]

    @staticmethod
    def _estimate_message_size(messages: List) -> int:
        return sum(len(str(getattr(message, "content", ""))) for message in messages)

    def chat(self, messages: List) -> Dict:
        if not self.api_key:
            raise LLMConfigError(
                detail="未配置 API 密钥，请在管理后台添加 LLM Provider 或在 .env 中设置 OPENROUTER_API_KEY"
            )
        try:
            response = self.llm.invoke(messages)
            return self._extract_response(response, messages)

        except (LLMConfigError, LLMGenerationError, LLMRateLimitError):
            raise
        except Exception as e:
            logging.error(f"LLM 调用失败: {e}")
            error_str = str(e)
            if "429" in error_str:
                raise LLMRateLimitError(detail=error_str)
            if "402" in error_str and "credits" in error_str:
                raise LLMGenerationError(message="模型额度不足，请联系管理员充值", detail=error_str)
            raise LLMGenerationError(detail=error_str)

    def chat_routed(self, messages: List, task_type: str,
                    routing_metadata: Optional[Dict] = None) -> Dict:
        """通过 ModelRouter 路由后调用 LLM"""
        log = structlog.get_logger()
        router = self._get_router()
        effective_metadata = dict(routing_metadata or {})
        effective_metadata.setdefault("context_size", self._estimate_message_size(messages))
        profile = router.route_profile(task_type, effective_metadata)

        if not self.api_key:
            return self.chat(messages)

        llm = self._get_llm(
            model=profile.model,
            temperature=profile.temperature,
            max_tokens=profile.max_tokens,
            timeout=profile.timeout,
        )

        max_attempts = 3
        last_error = None
        for attempt in range(max_attempts):
            try:
                response = llm.invoke(messages)
                return self._extract_response(response, messages)
            except Exception as e:
                last_error = e
                if self._current_key:
                    _mark_pool_unhealthy_sync(self._current_key, str(e))
                if _is_retryable_error(e) and attempt < max_attempts - 1:
                    delay = 2 ** (attempt + 1)
                    log.warning(
                        "chat_routed retrying on transient error",
                        task_type=task_type,
                        attempt=attempt + 1,
                        max_attempts=max_attempts,
                        delay_seconds=delay,
                        error=str(e),
                    )
                    time.sleep(delay)
                    # 获取新 Key 重试
                    llm = self._get_llm(
                        model=profile.model,
                        temperature=profile.temperature,
                        max_tokens=profile.max_tokens,
                        timeout=profile.timeout,
                    )
                    continue
                break

        logging.error(f"chat_routed({task_type}) 失败: {last_error}")
        if profile.fallback_model:
            logging.info(f"尝试回退模型: {profile.fallback_model}")
            fallback_llm = self._get_llm(
                model=profile.fallback_model,
                temperature=profile.fallback_temperature or profile.temperature,
                max_tokens=profile.max_tokens,
                timeout=profile.timeout,
            )
            try:
                response = fallback_llm.invoke(messages)
                return self._extract_response(response, messages)
            except Exception as fe:
                logging.error(f"回退模型也失败: {fe}")
                raise LLMGenerationError(detail=str(last_error)) from fe
        # 将原始异常包装为 LLMGenerationError（若尚未包装）
        if isinstance(last_error, (LLMConfigError, LLMGenerationError, LLMRateLimitError)):
            raise last_error
        error_str = str(last_error)
        if "429" in error_str:
            raise LLMRateLimitError(detail=error_str) from last_error
        raise LLMGenerationError(detail=error_str) from last_error

    def _extract_response(self, response, messages: List) -> Dict:
        prompt_tokens = 0
        completion_tokens = 0
        total_tokens = 0

        meta = response.response_metadata or {}
        if 'usage' in meta:
            usage = meta['usage']
            prompt_tokens = usage.get('prompt_tokens', 0)
            completion_tokens = usage.get('completion_tokens', 0)
            total_tokens = usage.get('total_tokens', 0)
        elif 'token_usage' in meta:
            usage = meta['token_usage']
            prompt_tokens = usage.get('prompt_tokens', 0)
            completion_tokens = usage.get('completion_tokens', 0)
            total_tokens = usage.get('total_tokens', 0)

        if prompt_tokens == 0 and completion_tokens == 0:
            completion_tokens = len(response.content)
            prompt_tokens = sum(len(m.content) for m in messages)
            total_tokens = prompt_tokens + completion_tokens

        # 记录用量并标记 Key 健康
        if self._current_key:
            _record_pool_usage_sync(self._current_key, total_tokens)
            _mark_pool_healthy_sync(self._current_key)

        return {
            "content": response.content.strip(),
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "total_tokens": total_tokens,
        }

    def chat_json(self, messages: List, schema: Type[T], max_retries: int = 2,
                  task_type: str = None, routing_metadata: Optional[Dict] = None) -> T:
        """调用 LLM 并返回经校验的 Pydantic 模型"""
        result, _ = self.chat_json_with_metrics(
            messages,
            schema,
            max_retries=max_retries,
            task_type=task_type,
            routing_metadata=routing_metadata,
        )
        return result

    def chat_json_with_metrics(self, messages: List, schema: Type[T], max_retries: int = 2,
                               task_type: str = None,
                               routing_metadata: Optional[Dict] = None) -> tuple[T, Dict[str, int]]:
        """调用 LLM 并返回解析后的模型和 token 用量"""
        schema_hint = json.dumps(schema.model_json_schema(), ensure_ascii=False, indent=2)
        format_instruction = (
            "\n\n**IMPORTANT: Return ONLY valid JSON matching this schema (no markdown fences, no extra text):**\n"
            f"```\n{schema_hint}\n```"
        )

        working_messages = list(messages)
        last_msg = working_messages[-1]
        working_messages[-1] = HumanMessage(content=last_msg.content + format_instruction)

        last_error = None
        base_routing_metadata = dict(routing_metadata or {})
        token_usage = {
            "prompt_tokens": 0,
            "completion_tokens": 0,
            "total_tokens": 0,
        }
        for attempt in range(1 + max_retries):
            if task_type:
                attempt_metadata = dict(base_routing_metadata)
                attempt_metadata.setdefault("expected_json", True)
                attempt_metadata["retry_count"] = attempt
                result = self.chat_routed(
                    working_messages,
                    task_type,
                    routing_metadata=attempt_metadata,
                )
            else:
                result = self.chat(working_messages)
            token_usage["prompt_tokens"] += int(result.get("prompt_tokens", 0) or 0)
            token_usage["completion_tokens"] += int(result.get("completion_tokens", 0) or 0)
            token_usage["total_tokens"] += int(result.get("total_tokens", 0) or 0)
            raw = result.get("content", "")

            cleaned = raw.strip()
            if cleaned.startswith("```"):
                lines = cleaned.split("\n")
                lines = lines[1:]
                if lines and lines[-1].strip() == "```":
                    lines = lines[:-1]
                cleaned = "\n".join(lines).strip()

            try:
                data = json.loads(cleaned)
                return schema.model_validate(data), token_usage
            except (json.JSONDecodeError, ValidationError) as e:
                last_error = e
                logging.warning(f"chat_json attempt {attempt + 1} failed: {e}")
                if attempt < max_retries:
                    working_messages.append(HumanMessage(
                        content=f"Your previous response was not valid JSON. Error: {e}\n"
                                f"Please return ONLY valid JSON matching the schema. No markdown fences."
                    ))

        raise ValueError(f"Failed to get valid JSON after {1 + max_retries} attempts: {last_error}")

    def translate_to_keywords(self, text: str) -> Dict[str, str]:
        """将用户输入翻译为优化后的英文学术关键词"""
        from intelligen_engine.pipeline.retrieval.schemas import KeywordTranslation
        try:
            result = self.chat_json(
                [
                    SystemMessage(content="You are an expert academic search query optimizer."),
                    HumanMessage(content=f"""Convert the research topic "{text}" into optimized search keywords.

Return JSON:
{{
  "precise": "precise academic English query for Crossref/OpenAlex",
  "general": "general English query for Google Scholar",
  "arxiv": "strict ArXiv keyword list"
}}""")
                ],
                schema=KeywordTranslation,
                task_type="keyword",
            )
            return result.model_dump()
        except Exception as e:
            logging.error(f"关键词翻译失败: {e}")
            error_str = str(e)
            if "模型额度不足" in error_str:
                raise
            return {"precise": text, "general": text, "arxiv": text}

    # ── Provider Registry 集成 ─────────────────────────────

    async def chat_via_registry(self, messages: List, stage: str = "writing",
                                temperature: float = 0.0,
                                max_tokens: int = 4096) -> Dict:
        """通过 ProviderRegistry 调用 (带 fallback)，返回与 chat() 相同格式的 dict"""
        from intelligen_engine.core.providers.registry import get_provider_registry
        from intelligen_engine.core.providers.base import LLMMessage

        registry = get_provider_registry()
        llm_messages = self._to_llm_messages(messages)
        resp = await registry.chat_with_fallback(
            messages=llm_messages,
            stage=stage,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        return {
            "content": resp.content,
            "prompt_tokens": resp.prompt_tokens,
            "completion_tokens": resp.completion_tokens,
            "total_tokens": resp.total_tokens,
        }

    @staticmethod
    def _to_llm_messages(messages: List) -> List:
        """将 langchain Message 对象转为 LLMMessage"""
        from intelligen_engine.core.providers.base import LLMMessage
        result = []
        for m in messages:
            if isinstance(m, SystemMessage):
                result.append(LLMMessage(role="system", content=m.content))
            elif isinstance(m, HumanMessage):
                result.append(LLMMessage(role="user", content=m.content))
            else:
                result.append(LLMMessage(role="assistant", content=m.content))
        return result
