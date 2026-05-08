"""Engine Client — HTTP client for communicating with the Generation Engine.

The API Gateway uses this client to forward generation requests
to the standalone Engine service.  Includes a cached health check so
callers can quickly decide whether to fall back to in-process generation.
"""

import logging
import time

import httpx
from typing import Optional, AsyncGenerator

logger = logging.getLogger(__name__)


class EngineError(Exception):
    """Engine 返回的 LLM 错误，携带结构化信息"""
    def __init__(self, status_code: int, code: str, message: str, detail: str = ""):
        self.status_code = status_code
        self.code = code
        self.message = message
        self.detail = detail
        super().__init__(message)


def _parse_llm_error(resp: httpx.Response) -> Optional[EngineError]:
    """若 Engine 返回 LLM 错误 JSON，解析为 EngineError；否则返回 None"""
    if resp.status_code < 400:
        return None
    try:
        body = resp.json()
        if isinstance(body, dict) and "code" in body and "message" in body:
            return EngineError(
                status_code=resp.status_code,
                code=body["code"],
                message=body["message"],
                detail=body.get("detail", ""),
            )
    except Exception:
        pass
    return None


class EngineClient:
    """Async HTTP client for the IntelliGen Engine service."""

    _HEALTH_TTL = 5  # seconds to cache health-check result

    def __init__(self, base_url: str = None):
        if base_url is None:
            try:
                from app.platform.config import settings
                base_url = settings.ENGINE_BASE_URL
            except Exception:
                base_url = "http://127.0.0.1:9993"
        self.base_url = base_url
        self._client: Optional[httpx.AsyncClient] = None
        self._health_ok: bool = False
        self._health_checked_at: float = 0.0

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                base_url=self.base_url,
                timeout=httpx.Timeout(300.0, connect=10.0),
                trust_env=False,
            )
        return self._client

    async def close(self):
        if self._client and not self._client.is_closed:
            await self._client.aclose()

    # ─── Health / availability ─────────────────────────────

    async def health_check(self) -> bool:
        """Ping the Engine /health endpoint. Returns True if responsive."""
        try:
            client = await self._get_client()
            resp = await client.get("/health", timeout=3.0)
            return resp.status_code == 200
        except Exception:
            return False

    @property
    def engine_available(self) -> bool:
        """Return cached health status (TTL = _HEALTH_TTL seconds).

        NOTE: This is a *synchronous* property backed by the last async
        health_check result.  Call ``await refresh_availability()`` to
        refresh the cache from an async context.
        """
        if time.monotonic() - self._health_checked_at > self._HEALTH_TTL:
            # Cache expired — assume unavailable until next async refresh
            return False
        return self._health_ok

    async def refresh_availability(self) -> bool:
        """Perform a live health check and update the cache."""
        self._health_ok = await self.health_check()
        self._health_checked_at = time.monotonic()
        return self._health_ok

    # ─── Task Management ───────────────────────────────────

    async def submit_task(self, task_data: dict) -> dict:
        """Submit a generation task to the engine."""
        client = await self._get_client()
        resp = await client.post("/engine/tasks", json=task_data)
        llm_err = _parse_llm_error(resp)
        if llm_err:
            raise llm_err
        resp.raise_for_status()
        return resp.json()

    async def get_task_status(self, task_id: str) -> dict:
        """Get task status from engine."""
        client = await self._get_client()
        resp = await client.get(f"/engine/tasks/{task_id}/status")
        resp.raise_for_status()
        return resp.json()

    async def cancel_task(self, task_id: str) -> dict:
        """Cancel a running task."""
        client = await self._get_client()
        resp = await client.post(f"/engine/tasks/{task_id}/cancel")
        resp.raise_for_status()
        return resp.json()

    async def export_task(self, task_id: str, fmt: str) -> tuple[bytes, str, str]:
        """Download an exported task artifact from the engine."""
        client = await self._get_client()
        resp = await client.post(f"/engine/tasks/{task_id}/export", params={"fmt": fmt})
        resp.raise_for_status()
        return (
            resp.content,
            resp.headers.get("content-type", "application/octet-stream"),
            resp.headers.get("content-disposition", ""),
        )

    async def get_paper_stages(self) -> dict:
        client = await self._get_client()
        resp = await client.get("/engine/paper/stages")
        resp.raise_for_status()
        return resp.json()

    async def resolve_paper_format(self, payload: dict) -> dict:
        client = await self._get_client()
        resp = await client.post("/engine/paper/format/resolve", json=payload)
        resp.raise_for_status()
        return resp.json()

    async def audit_paper_citations(self, payload: dict) -> dict:
        client = await self._get_client()
        resp = await client.post("/engine/paper/citations/audit", json=payload)
        resp.raise_for_status()
        return resp.json()

    async def plan_paper_intervention(self, payload: dict) -> dict:
        client = await self._get_client()
        resp = await client.post("/engine/paper/interventions/plan", json=payload)
        resp.raise_for_status()
        return resp.json()

    async def route_paper_input(self, payload: dict) -> dict:
        client = await self._get_client()
        resp = await client.post("/engine/paper/input/route", json=payload)
        resp.raise_for_status()
        return resp.json()

    async def plan_paper_questions(self, payload: dict) -> dict:
        client = await self._get_client()
        resp = await client.post("/engine/paper/questions/plan", json=payload)
        resp.raise_for_status()
        return resp.json()

    async def plan_paper_research(self, payload: dict) -> dict:
        client = await self._get_client()
        resp = await client.post("/engine/paper/research/plan", json=payload)
        resp.raise_for_status()
        return resp.json()

    async def prefill_paper_metadata(self, payload: dict) -> dict:
        client = await self._get_client()
        resp = await client.post("/engine/paper/metadata/prefill", json=payload)
        resp.raise_for_status()
        return resp.json()

    async def suggest_paper_code_directions(self, payload: dict) -> dict:
        client = await self._get_client()
        resp = await client.post("/engine/paper/code/directions", json=payload)
        resp.raise_for_status()
        return resp.json()

    async def post_paper_endpoint(self, path: str, payload: dict) -> dict:
        client = await self._get_client()
        resp = await client.post(f"/engine/paper/{path.strip('/')}", json=payload)
        resp.raise_for_status()
        return resp.json()

    async def stream_task_progress(self, task_id: str) -> AsyncGenerator[str, None]:
        """Stream SSE progress events from engine.

        Yields individual SSE event strings (e.g. ``data: {...}\\n\\n``).
        """
        client = await self._get_client()
        async with client.stream(
            "GET",
            f"/engine/tasks/{task_id}/stream",
            headers={"Accept": "text/event-stream"},
        ) as resp:
            async for line in resp.aiter_lines():
                if line:  # skip empty keep-alive lines
                    yield line

    # ─── Clarification ─────────────────────────────────────

    async def clarify(self, task_id: str, user_input: str, context: dict = None) -> dict:
        """Get next clarification question."""
        client = await self._get_client()
        resp = await client.post("/engine/clarify", json={
            "task_id": task_id,
            "user_input": user_input,
            "context": context or {},
        })
        llm_err = _parse_llm_error(resp)
        if llm_err:
            raise llm_err
        resp.raise_for_status()
        return resp.json()

    async def clarify_next(self, task_id: str, topic: str,
                           history: list = None, document_info: dict = None) -> dict:
        """Get next progressive clarification question."""
        client = await self._get_client()
        resp = await client.post("/engine/clarify/next", json={
            "task_id": task_id,
            "topic": topic,
            "history": history or [],
            "document_info": document_info,
        })
        llm_err = _parse_llm_error(resp)
        if llm_err:
            raise llm_err
        resp.raise_for_status()
        return resp.json()

    async def clarify_answer(self, task_id: str, topic: str, answer: str,
                             history: list = None, document_info: dict = None) -> dict:
        """Submit answer and get next question."""
        client = await self._get_client()
        resp = await client.post("/engine/clarify/answer", json={
            "task_id": task_id,
            "topic": topic,
            "answer": answer,
            "history": history or [],
            "document_info": document_info,
        })
        llm_err = _parse_llm_error(resp)
        if llm_err:
            raise llm_err
        resp.raise_for_status()
        return resp.json()

    async def clarify_skip(self, task_id: str, topic: str,
                           history: list = None, document_info: dict = None) -> dict:
        """Skip current question and get next."""
        client = await self._get_client()
        resp = await client.post("/engine/clarify/skip", json={
            "task_id": task_id,
            "topic": topic,
            "history": history or [],
            "document_info": document_info,
        })
        llm_err = _parse_llm_error(resp)
        if llm_err:
            raise llm_err
        resp.raise_for_status()
        return resp.json()

    async def clarify_finish(self, task_id: str, topic: str,
                             history: list = None, document_info: dict = None) -> dict:
        """Finish clarification and get summary."""
        client = await self._get_client()
        resp = await client.post("/engine/clarify/finish", json={
            "task_id": task_id,
            "topic": topic,
            "history": history or [],
            "document_info": document_info,
        })
        llm_err = _parse_llm_error(resp)
        if llm_err:
            raise llm_err
        resp.raise_for_status()
        return resp.json()

    async def extract_document_info(self, task_id: str, text_excerpt: str,
                                     file_name: str = "") -> dict:
        """Extract key info from a document via engine."""
        client = await self._get_client()
        resp = await client.post("/engine/clarify/extract-doc", json={
            "task_id": task_id,
            "text_excerpt": text_excerpt,
            "file_name": file_name,
        })
        llm_err = _parse_llm_error(resp)
        if llm_err:
            raise llm_err
        resp.raise_for_status()
        return resp.json()

    # ─── Outline ───────────────────────────────────────────

    async def rewrite_section(self, task_id: str, section_id: str,
                               feedback: str, original_content: str,
                               context: dict = None) -> dict:
        """调用引擎重写指定章节。"""
        client = await self._get_client()
        resp = await client.post(
            f"/engine/tasks/{task_id}/sections/{section_id}/rewrite",
            json={
                "feedback": feedback,
                "original_content": original_content,
                "context": context or {},
            },
        )
        llm_err = _parse_llm_error(resp)
        if llm_err:
            raise llm_err
        resp.raise_for_status()
        return resp.json()

    async def generate_outline(self, task_id: str, topic: str,
                                answers: dict = None, template_id: str = None) -> dict:
        """Generate report outline."""
        client = await self._get_client()
        resp = await client.post("/engine/outline", json={
            "task_id": task_id,
            "topic": topic,
            "clarification_answers": answers or {},
            "template_id": template_id,
        })
        llm_err = _parse_llm_error(resp)
        if llm_err:
            raise llm_err
        resp.raise_for_status()
        return resp.json()

    # ─── Models & Metrics ──────────────────────────────────

    async def analyze_archive(self, file_content: bytes, filename: str) -> dict:
        """Forward ZIP archive to engine for analysis."""
        client = await self._get_client()
        resp = await client.post(
            "/engine/archive/analyze",
            files={"file": (filename, file_content, "application/zip")},
            timeout=60.0,
        )
        resp.raise_for_status()
        return resp.json()

    async def list_models(self) -> dict:
        """List available models."""
        client = await self._get_client()
        resp = await client.get("/engine/models")
        resp.raise_for_status()
        return resp.json()

    async def get_metrics(self) -> dict:
        """Get engine metrics."""
        client = await self._get_client()
        resp = await client.get("/engine/metrics")
        resp.raise_for_status()
        return resp.json()

    async def health(self) -> dict:
        """Check engine health."""
        client = await self._get_client()
        resp = await client.get("/health")
        resp.raise_for_status()
        return resp.json()


# Singleton instance
engine_client = EngineClient()
