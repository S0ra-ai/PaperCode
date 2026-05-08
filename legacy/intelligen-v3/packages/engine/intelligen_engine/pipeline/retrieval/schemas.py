"""检索数据模型 — 关键词翻译等结构化模型。"""

from pydantic import BaseModel, Field


class KeywordTranslation(BaseModel):
    """用户输入翻译后的多平台检索关键词。"""
    precise: str = Field(description="面向 Crossref/OpenAlex 的精确学术检索词")
    general: str = Field(description="面向 Google Scholar 的通用检索词")
    arxiv: str = Field(description="ArXiv 专用关键词")
