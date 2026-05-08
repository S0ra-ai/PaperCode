"""
Content Verifier — post-generation verification of LLM-generated text.

Extracts factual claims from generated content and verifies each against
the evidence used during generation. This catches:
- Hallucinated facts with no evidence support
- Incorrect citation references (e.g. [3] doesn't support the claim)
- Over-generalized statements that go beyond source material

Uses an independent LLM call (not self-check) to avoid confirmation bias.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from typing import Dict, List, Optional

from pydantic import BaseModel

logger = logging.getLogger(__name__)


class _ClaimSchema(BaseModel):
    claim: str = ""
    cited_refs: list[int] = []
    status: str = "unverified"
    confidence: float = 0.0
    note: str = ""


class _VerificationSchema(BaseModel):
    claims: list[_ClaimSchema] = []


@dataclass
class ClaimVerification:
    """Result of verifying a single factual claim."""
    claim: str
    cited_refs: list[int] = field(default_factory=list)
    status: str = "unverified"  # supported | unsupported | fabricated | hedged
    confidence: float = 0.0
    note: str = ""


@dataclass
class SectionVerificationResult:
    """Verification result for one generated section."""
    section_title: str
    claims: list[ClaimVerification] = field(default_factory=list)
    supported_count: int = 0
    unsupported_count: int = 0
    fabricated_count: int = 0
    hedged_count: int = 0

    @property
    def trust_ratio(self) -> float:
        total = len(self.claims)
        if total == 0:
            return 1.0
        return (self.supported_count + self.hedged_count) / total


VERIFICATION_PROMPT = """You are a fact-checking reviewer. Given a section of a generated academic report
and the source material that was used to write it, extract and verify each factual claim.

For each factual claim in the text:
1. Identify the claim text
2. Note which citation numbers [N] are attached
3. Check if the source material for those citations actually supports the claim
4. Classify as:
   - "supported": Claim is directly backed by the cited source material
   - "hedged": Claim uses cautious language ("may", "suggests", "据相关研究") — acceptable
   - "unsupported": Claim cites a source but the source doesn't clearly support it
   - "fabricated": Claim has no citation AND no supporting evidence in the source material

Return a JSON object with this schema:
{{
  "claims": [
    {{
      "claim": "the factual claim text",
      "cited_refs": [1, 3],
      "status": "supported",
      "confidence": 0.9,
      "note": "optional explanation"
    }}
  ]
}}

**Section text:**
{section_text}

**Source material used:**
{source_material}
"""


def verify_section(
    llm_service,
    section_title: str,
    section_text: str,
    source_material: str,
) -> SectionVerificationResult:
    """Verify claims in a generated section against source material.

    Args:
        llm_service: LLMService instance for making the verification LLM call.
        section_title: Title of the section being verified.
        section_text: The generated text to verify.
        source_material: The evidence/references that were available to the writer.

    Returns:
        SectionVerificationResult with per-claim verification.
    """
    result = SectionVerificationResult(section_title=section_title)

    if not section_text or len(section_text.strip()) < 50:
        return result

    # Truncate inputs to fit in context
    text_limit = 3000
    source_limit = 4000
    truncated_text = section_text[:text_limit]
    truncated_source = source_material[:source_limit]

    prompt = VERIFICATION_PROMPT.format(
        section_text=truncated_text,
        source_material=truncated_source,
    )

    try:
        from langchain_core.messages import HumanMessage
        parsed: _VerificationSchema = llm_service.chat_json(
            [HumanMessage(content=prompt)],
            schema=_VerificationSchema,
            task_type="planning",
        )

        claims_data = parsed.claims if isinstance(parsed, _VerificationSchema) else []

        for c in claims_data:
            cv = ClaimVerification(
                claim=c.claim[:200],
                cited_refs=c.cited_refs if isinstance(c.cited_refs, list) else [],
                status=c.status or "unverified",
                confidence=float(c.confidence),
                note=c.note[:200] if c.note else "",
            )
            # Normalize status
            if cv.status not in ("supported", "unsupported", "fabricated", "hedged"):
                cv.status = "unverified"

            result.claims.append(cv)

            if cv.status == "supported":
                result.supported_count += 1
            elif cv.status == "unsupported":
                result.unsupported_count += 1
            elif cv.status == "fabricated":
                result.fabricated_count += 1
            elif cv.status == "hedged":
                result.hedged_count += 1

    except Exception as e:
        logger.warning(f"Content verification failed for '{section_title}': {e}")

    logger.info(
        f"🔍 Verified '{section_title}': "
        f"{result.supported_count} supported, "
        f"{result.hedged_count} hedged, "
        f"{result.unsupported_count} unsupported, "
        f"{result.fabricated_count} fabricated "
        f"(trust={result.trust_ratio:.0%})"
    )
    return result


def flag_low_trust_sections(
    verification_results: list[SectionVerificationResult],
    threshold: float = 0.5,
) -> list[str]:
    """Return section titles with trust ratio below threshold.

    These sections may need regeneration or additional evidence.
    """
    return [
        r.section_title
        for r in verification_results
        if r.trust_ratio < threshold and len(r.claims) > 0
    ]
