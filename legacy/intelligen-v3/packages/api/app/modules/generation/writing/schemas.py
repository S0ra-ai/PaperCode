"""撰写模块的数据模型。"""

from typing import List

from pydantic import BaseModel, Field


class SectionContent(BaseModel):
    """单个章节的结构化内容。"""
    number: str = Field(description="章节编号")
    title: str = Field(description="章节标题")
    content: str = Field(description="章节的 Markdown 内容")
    references_used: List[int] = Field(default_factory=list, description="引用的参考文献编号")


class SectionClaim(BaseModel):
    """章节中的有据声明或论据。"""
    claim: str = Field(description="具体的事实声明或有证据支持的论点", min_length=1)
    citations: List[int] = Field(default_factory=list, description="引用注册表中的支持性参考文献编号")


class SectionGroundingPlan(BaseModel):
    """用于约束多轮撰写的章节计划。"""
    focus: str = Field(description="章节的核心目标或切入角度", min_length=1)
    bullet_plan: List[str] = Field(default_factory=list, description="有序的段落或子章节要点")
    claims: List[SectionClaim] = Field(default_factory=list, description="章节中需覆盖的有据声明")
