"""Writing schemas for report generation."""

from typing import List

from pydantic import BaseModel, Field


class SectionContent(BaseModel):
    """Structured content for a single generated section."""
    number: str = Field(description="Section number")
    title: str = Field(description="Section title")
    content: str = Field(description="Markdown content of the section")
    references_used: List[int] = Field(default_factory=list, description="Reference numbers cited")


class SectionClaim(BaseModel):
    """A grounded claim or evidence point for one section."""
    claim: str = Field(description="Specific factual claim or evidence-backed point", min_length=1)
    citations: List[int] = Field(default_factory=list, description="Supporting reference numbers from the registry")


class SectionGroundingPlan(BaseModel):
    """Compact section plan used to constrain multi-pass drafting."""
    focus: str = Field(description="Main goal or angle of the section", min_length=1)
    bullet_plan: List[str] = Field(default_factory=list, description="Ordered paragraph or subsection bullets")
    claims: List[SectionClaim] = Field(default_factory=list, description="Grounded claims to cover in the section")
