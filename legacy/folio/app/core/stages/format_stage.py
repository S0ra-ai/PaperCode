# SPDX-License-Identifier: MPL-2.0
"""FormatStage — extract a typed FormatSpec from a sample PDF.

Cache-aware: if a `FormatSpec` for the given `custom_key` (or `venue_label`)
already exists, the stage is a no-op (still emits a `StageRecord`). Otherwise
it asks the configured LLM to produce strict JSON, validates, and writes the
result back into the appropriate cache tier.
"""

from __future__ import annotations

import json
import time
from datetime import UTC, datetime
from pathlib import Path

from app.core.contract import StageMessage, StageRecord
from app.core.formats import FormatSpec, custom_key_for, get, put
from app.core.formats.refresh import decide
from app.core.prompts import render
from app.providers.base import ChatMessage, ChatRequest
from app.providers.factory import first_provider
from app.providers.registry import ProviderRegistry
from app.tools.pdf_ingest import extract_structure

STAGE = "format"

_STYLE_TO_VENUE: dict[str, str] = {
    "ieee": "IEEE",
    "acm": "ACM",
    "cjc": "CJC",
    "计算机学报": "CJC",
    "springer-lncs": "Springer-LNCS",
    "springer": "Springer-LNCS",
    "lncs": "Springer-LNCS",
    "nature": "Nature",
}


def _strip_code_fence(s: str) -> str:
    s = s.strip()
    if s.startswith("```"):
        s = s.split("\n", 1)[1] if "\n" in s else s[3:]
        if s.endswith("```"):
            s = s[:-3]
    return s.strip()


def _venue_hint_from_message(msg: StageMessage) -> str | None:
    clarify = msg.payload.get("clarify")
    if not isinstance(clarify, dict):
        return None
    for key in ("style", "venue"):
        raw = str(clarify.get(key) or "").strip().lower()
        if not raw:
            continue
        for needle, label in _STYLE_TO_VENUE.items():
            if needle in raw:
                return label
    return None


async def run(
    msg: StageMessage,
    *,
    pdf_path: Path,
    registry: ProviderRegistry,
    venue_label: str | None = None,
    user_forced_refresh: bool = False,
) -> StageMessage:
    started = datetime.now(UTC)
    t0 = time.perf_counter()

    custom_key = custom_key_for(pdf_path)
    effective_venue_label = venue_label or _venue_hint_from_message(msg)
    if effective_venue_label:
        cached = get(venue_label=effective_venue_label)
    else:
        cached = get(custom_key=custom_key)
    decision = decide(
        cached[0] if cached else None,
        user_forced=user_forced_refresh and not effective_venue_label,
    )

    spec: FormatSpec | None = cached[0] if cached else None
    note: str | None = None

    if spec is not None and cached is not None and not decision.refresh:
        note = f"cache hit ({cached[1]}); {decision.reason}"
        provider_label = None
        model = None
        prompt_tokens = 0
        completion_tokens = 0
    else:
        provider = first_provider(registry)
        provider_label = provider.label
        model = provider.capability.default_model
        struct = extract_structure(pdf_path)
        prompt = render(
            "format_extract.j2",
            first_page_text=struct.first_page_text[:4000],
            font_histogram=", ".join(
                f"{round(k, 1)}:{v}" for k, v in struct.font_histogram.items()
            ),
            page_count=struct.page_count,
            columns_hint=struct.columns_hint,
            language="English",
        )
        req = ChatRequest(
            messages=(ChatMessage(role="user", content=prompt),),
            model=model,
            response_format={"type": "json_object"},
        )
        resp = await provider.chat(req)
        prompt_tokens = resp.prompt_tokens
        completion_tokens = resp.completion_tokens
        try:
            data = json.loads(_strip_code_fence(resp.content))
        except json.JSONDecodeError as exc:
            raise RuntimeError(
                f"FormatStage: LLM did not return valid JSON: {exc}"
            ) from exc
        spec = FormatSpec.model_validate({**data, "extracted_at": datetime.now(UTC)})
        tier = "venue" if effective_venue_label else "custom"
        key = effective_venue_label or custom_key
        put(spec, tier=tier, key=key)  # type: ignore[arg-type]
        note = f"extracted; written to {tier}/{key}"

    finished = datetime.now(UTC)
    record = StageRecord(
        stage=STAGE,
        started_at=started,
        finished_at=finished,
        provider_label=provider_label,
        model=model,
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        note=note,
    )
    new = msg.with_record(record)
    new.payload["format_spec"] = spec.model_dump(mode="json")
    new.payload["format_pdf_path"] = str(pdf_path)
    new.payload.setdefault("_timing", {})["format_ms"] = int(
        (time.perf_counter() - t0) * 1000
    )
    return new
