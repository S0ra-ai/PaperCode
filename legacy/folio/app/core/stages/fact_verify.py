# SPDX-License-Identifier: MPL-2.0
"""FactVerifier stage (M4).

For each (claim, source_id) pair extracted from the draft, asks an
independently-routed LLM whether the source actually supports the
claim. Mismatches land in ``payload['fact_flags']``.

Sampling: at most ``FACT_SAMPLE_LIMIT`` claims per run. If the draft
contains more, a deterministic head sample is used (so cassettes are
stable). The full count is recorded in the stage note.
"""

from __future__ import annotations

import json
import re
from datetime import UTC, datetime
from typing import Any

from app.core.contract import StageMessage, StageRecord
from app.core.prompts import render
from app.providers.base import ChatMessage, ChatRequest
from app.providers.factory import first_provider
from app.providers.registry import ProviderRegistry

STAGE = "fact_verify"
FACT_SAMPLE_LIMIT = 20

# Capture sentences that contain a \cite{...} reference.
_SENT_SPLIT = re.compile(r"(?<=[\.\!\?])\s+")
_CITE_RE = re.compile(r"\\cite\{([^}]+)\}")


def _extract_pairs(sections: list[dict[str, Any]]) -> list[dict[str, str]]:
    pairs: list[dict[str, str]] = []
    for sec in sections:
        text = sec.get("text", "")
        for sentence in _SENT_SPLIT.split(text):
            sentence = sentence.strip()
            if not sentence:
                continue
            keys = _CITE_RE.findall(sentence)
            for key in keys:
                pairs.append(
                    {
                        "section": sec.get("name", ""),
                        "claim": sentence,
                        "key": key.strip(),
                    }
                )
    return pairs


def _parse_decision(text: str) -> dict[str, Any]:
    """Tolerant JSON extraction: { supports: bool, reason: str }."""
    try:
        obj = json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if not match:
            return {"supports": False, "reason": f"unparseable: {text[:120]}"}
        try:
            obj = json.loads(match.group(0))
        except json.JSONDecodeError:
            return {"supports": False, "reason": f"unparseable: {text[:120]}"}
    return {
        "supports": bool(obj.get("supports", False)),
        "reason": str(obj.get("reason", "")),
    }


async def run(
    msg: StageMessage,
    *,
    registry: ProviderRegistry,
    sources: dict[str, str] | None = None,
    sample_limit: int = FACT_SAMPLE_LIMIT,
) -> StageMessage:
    """Run fact-roundtrip verification.

    Args:
        msg: incoming message; must have ``payload['draft']['sections']``
            and ``payload['citations']``.
        registry: provider registry, used to pick a ``chat`` capability.
        sources: optional ``{citation_key: source_text}``. Pairs whose
            key has no source text are skipped (recorded as
            ``status='no_source'``, not flagged).
        sample_limit: maximum pairs to verify.
    """
    started = datetime.now(UTC)
    sources = sources or {}
    sections = msg.payload.get("draft", {}).get("sections", [])
    pairs = _extract_pairs(sections)
    total = len(pairs)
    sampled = pairs[:sample_limit]

    flags: list[dict[str, Any]] = []
    skipped = 0
    provider = first_provider(registry)

    for pair in sampled:
        source_text = sources.get(pair["key"])
        if not source_text:
            skipped += 1
            continue
        prompt = render(
            "fact_verify.j2",
            claim=pair["claim"],
            source_id=pair["key"],
            source_text=source_text,
        )
        req = ChatRequest(
            messages=(ChatMessage(role="user", content=prompt),),
            model=provider.capability.default_model,
            temperature=0.0,
            response_format={"type": "json_object"},
        )
        resp = await provider.chat(req)
        decision = _parse_decision(resp.content)
        if not decision["supports"]:
            flags.append(
                {
                    "section": pair["section"],
                    "key": pair["key"],
                    "claim": pair["claim"],
                    "reason": decision["reason"],
                }
            )

    new = msg.model_copy(deep=True)
    new.payload["fact_flags"] = flags
    new.payload["fact_audit"] = {
        "total_pairs": total,
        "sampled": len(sampled),
        "skipped_no_source": skipped,
        "flagged": len(flags),
    }
    record = StageRecord(
        stage=STAGE,
        started_at=started,
        finished_at=datetime.now(UTC),
        provider_label=provider.label,
        model=provider.capability.default_model,
        note=(
            f"verified {len(sampled) - skipped}/{total} claims; {len(flags)} flagged"
        ),
    )
    return new.with_record(record)
