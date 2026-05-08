"""评审模块数据模型。"""

from typing import List

from pydantic import BaseModel, Field, field_validator


class SectionReviewIssue(BaseModel):
    """章节评审中发现的具体评分问题。"""
    code: str = Field(description="评分问题简码", min_length=1)
    detail: str = Field(description="问题的具体说明", min_length=1)
    severity: str = Field(default="medium", description="严重程度：low、medium 或 high")

    @field_validator("severity")
    @classmethod
    def normalize_severity(cls, value: str) -> str:
        normalized = (value or "medium").strip().lower()
        if normalized not in {"low", "medium", "high"}:
            raise ValueError("severity must be low, medium, or high")
        return normalized


class SectionRubricReview(BaseModel):
    """章节评分审查的结构化结论。"""
    needs_revision: bool = Field(description="该章节是否需要定向重写")
    verdict: str = Field(default="", description="简短的总体结论")
    unsupported_claims: bool = Field(default=False, description="草稿是否包含缺乏依据的论断")
    sparse_citations: bool = Field(default=False, description="引用密度是否过低")
    repetition: bool = Field(default=False, description="重复或冗余是否严重影响质量")
    length_mismatch: bool = Field(default=False, description="篇幅是否明显偏离目标字数")
    weak_transitions: bool = Field(default=False, description="过渡或连贯性是否需要改进")
    issues: List[SectionReviewIssue] = Field(default_factory=list, description="值得处理的具体评分问题")
    rewrite_instructions: List[str] = Field(default_factory=list, description="需要修订时的可执行重写步骤")
