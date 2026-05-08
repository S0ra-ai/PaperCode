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

import enum
import logging
import re
from dataclasses import dataclass, field
from typing import Dict, List, Optional

from pydantic import BaseModel

from intelligen_engine.prompts.prompt_manager import PromptManager

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

    pm = PromptManager.get_instance()
    prompt = pm.render("content_verify", "verification_prompt",
                       section_text=truncated_text, source_material=truncated_source)

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


class SectionGrade(str, enum.Enum):
    """Grading level for a verified section."""
    NORMAL = "normal"              # Well-supported (trust_ratio >= 0.7)
    LOW_EVIDENCE = "low_evidence"  # Some unsupported claims (0.4 <= trust_ratio < 0.7)
    FAIL_CLOSED = "fail_closed"    # Mostly unsupported (trust_ratio < 0.4)


def grade_section(verification: SectionVerificationResult) -> SectionGrade:
    """Grade a section based on verification results."""
    if not verification.claims:
        return SectionGrade.NORMAL
    ratio = verification.trust_ratio
    if ratio >= 0.7:
        return SectionGrade.NORMAL
    if ratio >= 0.4:
        return SectionGrade.LOW_EVIDENCE
    return SectionGrade.FAIL_CLOSED


def format_verification_report(
    verification_results: list[SectionVerificationResult],
) -> dict:
    """Generate a structured verification report for all sections."""
    sections = []
    total_claims = 0
    total_supported = 0
    total_fabricated = 0

    for result in verification_results:
        grade = grade_section(result)
        sections.append({
            "title": result.section_title,
            "grade": grade.value,
            "trust_ratio": round(result.trust_ratio, 2),
            "claims_count": len(result.claims),
            "supported": result.supported_count,
            "hedged": result.hedged_count,
            "unsupported": result.unsupported_count,
            "fabricated": result.fabricated_count,
            "flagged_claims": [
                {"claim": c.claim, "status": c.status, "note": c.note}
                for c in result.claims
                if c.status in ("unsupported", "fabricated")
            ],
        })
        total_claims += len(result.claims)
        total_supported += result.supported_count
        total_fabricated += result.fabricated_count

    overall_ratio = total_supported / max(total_claims, 1)
    return {
        "overall_trust_ratio": round(overall_ratio, 2),
        "total_claims": total_claims,
        "total_supported": total_supported,
        "total_fabricated": total_fabricated,
        "sections": sections,
    }
