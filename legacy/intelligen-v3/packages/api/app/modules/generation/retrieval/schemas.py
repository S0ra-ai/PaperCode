"""Retrieval schemas for report generation."""

from pydantic import BaseModel, Field


class KeywordTranslation(BaseModel):
    """Translated search keywords from user input."""
    precise: str = Field(description="Precise academic query for Crossref/OpenAlex")
    general: str = Field(description="General query for Google Scholar")
    arxiv: str = Field(description="ArXiv-specific keywords")
