"""规划数据模型 — 大纲章节与报告结构定义。"""

from typing import List

from pydantic import BaseModel, Field, field_validator


class OutlineSection(BaseModel):
    """报告大纲中的单个章节。"""
    number: str = Field(description="章节编号, 如 '1', '2'")
    title: str = Field(description="章节标题", min_length=1)
    instruction: str = Field(description="该章节的详细写作指令")
    target_words: int = Field(default=1500, description="目标字数", ge=0)
    search_queries: List[str] = Field(default_factory=list, description="该章节专用的检索关键词")

    @field_validator("target_words", mode="before")
    @classmethod
    def coerce_zero_target_words(cls, v):
        if isinstance(v, (int, float)) and v <= 0:
            return 200  # 短章节 / 参考文献的最低字数
        return v


class ReportOutline(BaseModel):
    """LLM 生成的完整报告大纲。"""
    title: str = Field(description="报告标题", min_length=1)
    sections: List[OutlineSection] = Field(description="按顺序排列的章节列表", min_length=1)

    @field_validator("sections")
    @classmethod
    def sections_have_unique_numbers(cls, value):
        numbers = [section.number for section in value]
        if len(numbers) != len(set(numbers)):
            raise ValueError("Duplicate section numbers in outline")
        return value
