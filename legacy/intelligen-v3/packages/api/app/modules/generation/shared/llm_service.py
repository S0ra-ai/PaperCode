"""
LLM Service — handles all LLM interactions via OpenRouter.
Migrated from model_strategy/app/services/llm_service.py
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

from app.platform.config import settings
from app.platform.exceptions import LLMConfigError, LLMGenerationError, LLMRateLimitError

T = TypeVar('T', bound=BaseModel)


def _is_retryable_error(error: Exception) -> bool:
    """Return True for transient API errors worth retrying."""
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
    """LLM service: handles translation, reasoning, and writing."""

    def __init__(self):
        self.api_key = settings.OPENROUTER_API_KEY
        self.base_url = settings.OPENROUTER_BASE_URL
        self.model_name = settings.resolved_chat_model
        self._llm = None
        self._llm_cache: Dict[str, ChatOpenAI] = {}
        self._cache_lock = threading.Lock()
        self._router = None
        # 若未配置 OPENROUTER_API_KEY，回退到数据库里的第一个激活 Provider
        if not self.api_key:
            try:
                self._load_from_db_provider()
            except Exception as _e:
                logging.warning(f"LLMService DB fallback failed: {_e}")

    def _load_from_db_provider(self):
        """Best-effort：从 DB 读取第一个激活的 LLMProvider 作为回退配置。"""
        from app.platform.database import SessionLocal
        from app.modules.llm.models import LLMProvider
        from app.modules.llm.api import _get_fernet

        db = SessionLocal()
        try:
            provider = (
                db.query(LLMProvider)
                .filter(LLMProvider.is_active == True)  # noqa: E712
                .order_by(LLMProvider.priority.desc())
                .first()
            )
            if not provider or not provider.api_key_encrypted:
                return
            try:
                key = _get_fernet().decrypt(provider.api_key_encrypted.encode("utf-8")).decode("utf-8")
            except Exception as e:
                logging.warning(f"LLMService DB provider decrypt failed: {e}")
                return
            self.api_key = key
            self.base_url = provider.base_url or self.base_url
            if provider.models_json:
                models = provider.models_json if isinstance(provider.models_json, list) else []
                if models and not self.model_name:
                    self.model_name = models[0]
            logging.info(f"LLMService fell back to DB provider: {provider.name}")
        finally:
            db.close()

    @property
    def llm(self):
        if self._llm is None and self.api_key:
            with self._cache_lock:
                if self._llm is None:
                    http_client = httpx.Client(verify=settings.SSL_VERIFY, timeout=settings.LLM_TIMEOUT)
                    self._llm = ChatOpenAI(
                        model=self.model_name,
                        temperature=settings.LLM_TEMPERATURE,
                        openai_api_base=self.base_url,
                        openai_api_key=self.api_key,
                        max_tokens=settings.LLM_MAX_TOKENS,
                        timeout=settings.LLM_TIMEOUT,
                        http_client=http_client
                    )
        return self._llm

    def _get_router(self):
        if self._router is None:
            from app.modules.generation.shared.model_router import ModelRouter
            self._router = ModelRouter()
        return self._router

    def _get_llm(self, model: str = None, temperature: float = None,
                 max_tokens: int = None, timeout: int = None) -> ChatOpenAI:
        model = model or self.model_name
        temperature = temperature if temperature is not None else settings.LLM_TEMPERATURE
        max_tokens = max_tokens or settings.LLM_MAX_TOKENS
        timeout = timeout or settings.LLM_TIMEOUT

        cache_key = f"{model}|{temperature}|{max_tokens}|{timeout}"
        with self._cache_lock:
            if cache_key not in self._llm_cache:
                http_client = httpx.Client(verify=settings.SSL_VERIFY, timeout=timeout)
                self._llm_cache[cache_key] = ChatOpenAI(
                    model=model,
                    temperature=temperature,
                    openai_api_base=self.base_url,
                    openai_api_key=self.api_key,
                    max_tokens=max_tokens,
                    timeout=timeout,
                    http_client=http_client,
                )
        return self._llm_cache[cache_key]

    @staticmethod
    def _estimate_message_size(messages: List) -> int:
        return sum(len(str(getattr(message, "content", ""))) for message in messages)

    def chat(self, messages: List) -> Dict:
        try:
            if not self.api_key:
                raise LLMConfigError(detail="未配置 LLM 凭据：请设置 OPENROUTER_API_KEY 或在后台添加 Provider")

            response = self.llm.invoke(messages)
            return self._extract_response(response, messages)

        except (LLMConfigError, LLMGenerationError, LLMRateLimitError):
            raise
        except Exception as e:
            logging.error(f"LLM 调用失败: {e}")
            error_str = str(e)
            if "402" in error_str and "credits" in error_str:
                raise Exception("模型额度不足，请联系管理员充值")
            if "429" in error_str or "rate" in error_str.lower():
                raise LLMRateLimitError(detail=error_str)
            raise LLMGenerationError(detail=error_str)

    def chat_routed(self, messages: List, task_type: str,
                    routing_metadata: Optional[Dict] = None) -> Dict:
        """Call LLM with parameters determined by a routed ModelRouter profile."""
        log = structlog.get_logger()
        router = self._get_router()
        effective_metadata = dict(routing_metadata or {})
        effective_metadata.setdefault("context_size", self._estimate_message_size(messages))
        profile = router.route_profile(task_type, effective_metadata)

        if not self.api_key:
            raise LLMConfigError(detail="未配置 LLM 凭据：请设置 OPENROUTER_API_KEY 或在后台添加 Provider")

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
                    continue
                break

        logging.error(f"chat_routed({task_type}) failed: {last_error}")
        if profile.fallback_model:
            logging.info(f"Trying fallback model: {profile.fallback_model}")
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
                logging.error(f"Fallback also failed: {fe}")
                last_error = fe

        error_str = str(last_error)
        if isinstance(last_error, (LLMConfigError, LLMGenerationError, LLMRateLimitError)):
            raise last_error
        if "429" in error_str or "rate" in error_str.lower():
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

        return {
            "content": response.content.strip(),
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "total_tokens": total_tokens,
        }

    def chat_json(self, messages: List, schema: Type[T], max_retries: int = 2,
                  task_type: str = None, routing_metadata: Optional[Dict] = None) -> T:
        """Call LLM and return a validated Pydantic model."""
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
        """Call LLM, validate JSON, and return both parsed model and token metrics."""
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
        """Translate user input into optimized English academic keywords."""
        from app.modules.generation.retrieval.schemas import KeywordTranslation
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
