"""生成模块 schema 向后兼容导出。"""

from app.modules.generation.planning.schemas import OutlineSection, ReportOutline
from app.modules.generation.retrieval.schemas import KeywordTranslation
from app.modules.generation.review.schemas import SectionReviewIssue, SectionRubricReview
from app.modules.generation.writing.schemas import SectionClaim, SectionContent, SectionGroundingPlan

__all__ = [
    "KeywordTranslation",
    "OutlineSection",
    "ReportOutline",
    "SectionClaim",
    "SectionContent",
    "SectionGroundingPlan",
    "SectionReviewIssue",
    "SectionRubricReview",
]
