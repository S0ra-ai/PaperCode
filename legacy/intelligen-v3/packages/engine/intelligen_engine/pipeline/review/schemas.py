"""审阅数据模型 — 章节评审问题与评分结构。"""

from typing import List

from pydantic import BaseModel, Field, field_validator


class SectionReviewIssue(BaseModel):
    """章节评审中发现的具体问题。"""
    code: str = Field(description="评审问题编码", min_length=1)
    detail: str = Field(description="问题的具体描述", min_length=1)
    severity: str = Field(default="medium", description="严重程度: low / medium / high")

    @field_validator("severity")
    @classmethod
    def normalize_severity(cls, value: str) -> str:
        normalized = (value or "medium").strip().lower()
        if normalized not in {"low", "medium", "high"}:
            raise ValueError("severity must be low, medium, or high")
        return normalized


class SectionRubricReview(BaseModel):
    """章节评审的结构化评分结果。"""
    needs_revision: bool = Field(description="是否需要定向重写")
    verdict: str = Field(default="", description="总体评审结论")
    unsupported_claims: bool = Field(default=False, description="是否包含缺乏依据的论断")
    sparse_citations: bool = Field(default=False, description="引用密度是否过低")
    repetition: bool = Field(default=False, description="是否存在影响质量的重复内容")
    length_mismatch: bool = Field(default=False, description="是否明显偏离目标字数")
    weak_transitions: bool = Field(default=False, description="段落过渡与连贯性是否需要改进")
    issues: List[SectionReviewIssue] = Field(default_factory=list, description="需要处理的具体评审问题列表")
    rewrite_instructions: List[str] = Field(default_factory=list, description="如需修订, 可执行的重写步骤")
