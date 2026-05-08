"""Engine metrics collection and reporting to Redis."""

from __future__ import annotations

import json
import logging
import time
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Optional

from intelligen_engine.core.redis import get_redis

logger = logging.getLogger(__name__)

# Redis key patterns
_METRICS_LLM_PREFIX = "metrics:llm:{date}"
_METRICS_COUNTER_REQUESTS = "metrics:counter:requests:{model}:{date}"
_METRICS_COUNTER_TOKENS_IN = "metrics:counter:tokens_in:{model}:{date}"
_METRICS_COUNTER_TOKENS_OUT = "metrics:counter:tokens_out:{model}:{date}"
_METRICS_COUNTER_ERRORS = "metrics:counter:errors:{model}:{date}"
_METRICS_LATENCY_SUM = "metrics:latency_sum:{model}:{date}"
_METRICS_RPM_WINDOW = "metrics:rpm_window:{model}"

_DAY_TTL = 86400 * 30  # Keep metrics 30 days


@dataclass
class RequestMetric:
    model: str
    tokens_in: int
    tokens_out: int
    latency_ms: float
    success: bool
    error: Optional[str] = None
    timestamp: float = field(default_factory=time.time)


class MetricsCollector:
    """Collects and stores metrics in Redis for admin dashboard."""

    async def record_llm_call(self, metric: RequestMetric):
        """Record an LLM API call metric."""
        try:
            r = get_redis()
            date_str = datetime.fromtimestamp(
                metric.timestamp, tz=timezone.utc
            ).strftime("%Y-%m-%d")
            model = metric.model or "unknown"
            pipe = r.pipeline(transaction=False)

            # Store individual metric in sorted set keyed by date
            key = _METRICS_LLM_PREFIX.format(date=date_str)
            pipe.zadd(key, {json.dumps(asdict(metric), ensure_ascii=False): metric.timestamp})
            pipe.expire(key, _DAY_TTL)

            # Increment request counter
            req_key = _METRICS_COUNTER_REQUESTS.format(model=model, date=date_str)
            pipe.incr(req_key)
            pipe.expire(req_key, _DAY_TTL)

            # Increment token counters
            tin_key = _METRICS_COUNTER_TOKENS_IN.format(model=model, date=date_str)
            pipe.incrby(tin_key, metric.tokens_in)
            pipe.expire(tin_key, _DAY_TTL)

            tout_key = _METRICS_COUNTER_TOKENS_OUT.format(model=model, date=date_str)
            pipe.incrby(tout_key, metric.tokens_out)
            pipe.expire(tout_key, _DAY_TTL)

            # Latency accumulator (for average calculation)
            lat_key = _METRICS_LATENCY_SUM.format(model=model, date=date_str)
            pipe.incrbyfloat(lat_key, metric.latency_ms)
            pipe.expire(lat_key, _DAY_TTL)

            # Error counter
            if not metric.success:
                err_key = _METRICS_COUNTER_ERRORS.format(model=model, date=date_str)
                pipe.incr(err_key)
                pipe.expire(err_key, _DAY_TTL)

            # Sliding-window RPM tracker (last 60s)
            rpm_key = _METRICS_RPM_WINDOW.format(model=model)
            now = time.time()
            pipe.zadd(rpm_key, {f"{now}:{model}": now})
            pipe.zremrangebyscore(rpm_key, "-inf", now - 60)
            pipe.expire(rpm_key, 120)

            await pipe.execute()
        except Exception as exc:
            logger.warning("Failed to record metric: %s", exc)

    async def get_realtime_rpm(self, model: str | None = None) -> dict:
        """Get real-time RPM per model (last 60 seconds)."""
        try:
            r = get_redis()
            now = time.time()
            result: dict[str, int] = {}

            if model:
                models = [model]
            else:
                from intelligen_engine.core.config import settings
                models = [
                    settings.LLM_CHAT_MODEL,
                    settings.LLM_FAST_MODEL,
                    settings.LLM_CODE_MODEL,
                    settings.SEARCH_MODEL_NAME,
                ]

            for m in models:
                rpm_key = _METRICS_RPM_WINDOW.format(model=m)
                await r.zremrangebyscore(rpm_key, "-inf", now - 60)
                count = await r.zcard(rpm_key)
                result[m] = count

            return result
        except Exception as exc:
            logger.warning("Failed to get RPM: %s", exc)
            return {}

    async def get_daily_stats(self, date: str | None = None) -> dict:
        """Get daily stats: total requests, tokens, errors, avg latency."""
        try:
            r = get_redis()
            if not date:
                date = datetime.now(timezone.utc).strftime("%Y-%m-%d")

            from intelligen_engine.core.config import settings
            models = [
                settings.LLM_CHAT_MODEL,
                settings.LLM_FAST_MODEL,
                settings.LLM_CODE_MODEL,
                settings.SEARCH_MODEL_NAME,
            ]

            total_requests = 0
            total_tokens_in = 0
            total_tokens_out = 0
            total_errors = 0
            total_latency = 0.0

            for m in models:
                reqs = await r.get(_METRICS_COUNTER_REQUESTS.format(model=m, date=date))
                tin = await r.get(_METRICS_COUNTER_TOKENS_IN.format(model=m, date=date))
                tout = await r.get(_METRICS_COUNTER_TOKENS_OUT.format(model=m, date=date))
                errs = await r.get(_METRICS_COUNTER_ERRORS.format(model=m, date=date))
                lat = await r.get(_METRICS_LATENCY_SUM.format(model=m, date=date))

                total_requests += int(reqs or 0)
                total_tokens_in += int(tin or 0)
                total_tokens_out += int(tout or 0)
                total_errors += int(errs or 0)
                total_latency += float(lat or 0)

            avg_latency = total_latency / total_requests if total_requests else 0.0

            return {
                "date": date,
                "total_requests": total_requests,
                "total_tokens_in": total_tokens_in,
                "total_tokens_out": total_tokens_out,
                "total_errors": total_errors,
                "avg_latency_ms": round(avg_latency, 2),
                "success_rate": round(
                    (total_requests - total_errors) / total_requests * 100, 2
                ) if total_requests else 100.0,
            }
        except Exception as exc:
            logger.warning("Failed to get daily stats: %s", exc)
            return {"date": date, "total_requests": 0, "total_tokens_in": 0,
                    "total_tokens_out": 0, "total_errors": 0,
                    "avg_latency_ms": 0.0, "success_rate": 100.0}

    async def get_model_usage(self, days: int = 7) -> list[dict]:
        """Get per-model usage breakdown over N days."""
        try:
            r = get_redis()
            from intelligen_engine.core.config import settings
            models = [
                settings.LLM_CHAT_MODEL,
                settings.LLM_FAST_MODEL,
                settings.LLM_CODE_MODEL,
                settings.SEARCH_MODEL_NAME,
            ]
            results = []
            now = datetime.now(timezone.utc)

            for m in models:
                model_data = {"model": m, "daily": []}
                for i in range(days):
                    from datetime import timedelta
                    d = (now - timedelta(days=i)).strftime("%Y-%m-%d")
                    reqs = await r.get(_METRICS_COUNTER_REQUESTS.format(model=m, date=d))
                    tin = await r.get(_METRICS_COUNTER_TOKENS_IN.format(model=m, date=d))
                    tout = await r.get(_METRICS_COUNTER_TOKENS_OUT.format(model=m, date=d))
                    errs = await r.get(_METRICS_COUNTER_ERRORS.format(model=m, date=d))
                    model_data["daily"].append({
                        "date": d,
                        "requests": int(reqs or 0),
                        "tokens_in": int(tin or 0),
                        "tokens_out": int(tout or 0),
                        "errors": int(errs or 0),
                    })
                results.append(model_data)
            return results
        except Exception as exc:
            logger.warning("Failed to get model usage: %s", exc)
            return []

    async def get_system_health(self) -> dict:
        """Check Redis, DB, Engine health."""
        health: dict = {"redis": "unknown", "database": "unknown", "engine": "up"}
        try:
            r = get_redis()
            await r.ping()
            health["redis"] = "up"
        except Exception:
            health["redis"] = "down"

        try:
            from intelligen_engine.core.database import async_session
            async with async_session() as session:
                from sqlalchemy import text
                await session.execute(text("SELECT 1"))
            health["database"] = "up"
        except Exception:
            health["database"] = "down"

        return health


# Global singleton
_collector: MetricsCollector | None = None


def get_metrics_collector() -> MetricsCollector:
    """Return the global MetricsCollector instance."""
    global _collector
    if _collector is None:
        _collector = MetricsCollector()
    return _collector


def init_metrics() -> MetricsCollector:
    """Initialize the global MetricsCollector."""
    global _collector
    _collector = MetricsCollector()
    return _collector
