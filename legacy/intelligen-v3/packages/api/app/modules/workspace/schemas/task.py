"""Task schemas."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from enum import Enum

from pydantic import BaseModel, Field


# ─── Inline Clarification Message Types ───────────────────
class InlineMessageType(str, Enum):
    """消息类型枚举，用于内联澄清对话流"""
    user_text = "user_text"
    system_question = "system_question"
    user_answer = "user_answer"
    task_card = "task_card"
    progress_update = "progress_update"


class InlineClarifyMessage(BaseModel):
    """内联澄清消息结构"""
    type: InlineMessageType
    content: str = ""
    options: list[str] = []
    allow_custom: bool = True
    multi_select: bool = False
    question_id: str = ""


class CreateTaskRequest(BaseModel):
    userInput: str = Field(..., min_length=1)
    outline: str | None = None
    templateFileId: str | None = None
    fileIds: list[str] = []
    requirement: str | None = None  # refined requirement from clarification
    citationStyle: str = "gb"  # "apa" | "mla" | "chicago" | "gb" (GB/T 7714)
    targetWordCount: int | None = None  # 目标字数，None 表示使用引擎默认值(20000-30000)
    generationMode: str = "legacy_report"
    venueLabel: str | None = None
    venueVariant: str | None = None
    authors: list[str] = []
    controlMode: str = "batch_autopilot"
    manualCitationOverrides: list[str] = []


class ClarifyCheckRequest(BaseModel):
    userInput: str = Field(..., min_length=1)
    hasOutline: bool = False
    hasTemplate: bool = False
    hasFiles: bool = False


class ClarificationQuestionItem(BaseModel):
    id: str
    question: str
    hint: str = ""
    options: list[str] = []
    priority: str = "medium"  # "high" | "medium" | "low"
    required: bool = False


class ClarifyCheckResponse(BaseModel):
    needsClarification: bool
    reason: str = ""
    questions: list[ClarificationQuestionItem] = []


class ClarifyRefineRequest(BaseModel):
    userInput: str = Field(..., min_length=1)
    answers: dict[str, str] = {}


class ClarifyRefineResponse(BaseModel):
    topic: str
    requirements: str
    suggestedOutline: list[str] = []
    targetWords: int = 0
    language: str = "zh"
    safetyWarning: str | None = None


class TaskFileResponse(BaseModel):
    fileId: str
    fileNameSnapshot: str

    model_config = {"from_attributes": True}


class TaskStatusResponse(BaseModel):
    taskId: str
    sessionId: str
    status: str
    userInput: str
    outline: str | None = None
    templateFileId: str | None = None
    templateFileName: str | None = None
    templateFileType: str | None = None
    progress: Decimal | None = None
    currentSection: int | None = None
    totalSections: int | None = None
    resultMarkdown: str | None = None
    resultFileId: str | None = None
    resultFileName: str | None = None
    resultFileType: str | None = None
    errorMessage: str | None = None
    errorCategory: str | None = None
    retryCount: int = 0
    maxRetries: int = 3
    createdAt: datetime
    updatedAt: datetime
    completedAt: datetime | None = None
    stage: str | None = None
    stageName: str | None = None
    currentSectionTitle: str | None = None
    estimatedSecondsLeft: int | None = None
    artifactPaths: dict[str, str] = {}
    files: list[TaskFileResponse] = []

    model_config = {"from_attributes": True}


class TaskProgressEventResponse(BaseModel):
    taskId: str
    sessionId: str
    status: str
    userInput: str | None = None
    outline: str | None = None
    templateFileId: str | None = None
    templateFileName: str | None = None
    templateFileType: str | None = None
    progress: float | None = None
    currentSection: int | None = None
    totalSections: int | None = None
    resultFileId: str | None = None
    resultFileName: str | None = None
    resultFileType: str | None = None
    errorMessage: str | None = None
    errorCategory: str | None = None
    retryCount: int = 0
    maxRetries: int = 3
    createdAt: datetime
    updatedAt: datetime
    completedAt: datetime | None = None
    stage: str | None = None
    stageName: str | None = None
    currentSectionTitle: str | None = None
    estimatedSecondsLeft: int | None = None
    artifactPaths: dict[str, str] = {}


class PreviewOutlineRequest(BaseModel):
    userInput: str = Field(..., min_length=1)
    requirement: str | None = None


class OutlineSectionPreview(BaseModel):
    title: str
    description: str = ""
    targetWords: int = 0


class PreviewOutlineResponse(BaseModel):
    sections: list[OutlineSectionPreview] = []


class RegenerateSectionRequest(BaseModel):
    customPrompt: str | None = None


# ─── Progressive Clarification Schemas ───────────────────────

class ClarifyNextRequest(BaseModel):
    topic: str = Field(..., min_length=1)
    history: list[dict] = []
    documentInfo: dict | None = None


class ClarifyNextQuestionItem(BaseModel):
    question: str
    options: list[str] = []
    allowMultiple: bool = False
    allowCustom: bool = True
    explanation: str = ""
    isComplete: bool = False


class ClarifyNextResponse(BaseModel):
    question: ClarifyNextQuestionItem | None = None
    isComplete: bool = False
    step: int = 0


class ClarifyAnswerRequest(BaseModel):
    topic: str = Field(..., min_length=1)
    answer: str = ""
    history: list[dict] = []
    documentInfo: dict | None = None


class ClarifySkipRequest(BaseModel):
    topic: str = Field(..., min_length=1)
    history: list[dict] = []
    documentInfo: dict | None = None


class ClarifyFinishRequest(BaseModel):
    topic: str = Field(..., min_length=1)
    history: list[dict] = []
    documentInfo: dict | None = None


class ClarifyFinishResponse(BaseModel):
    summary: dict = {}
    requirement: str = ""


class DocumentExtractRequest(BaseModel):
    textExcerpt: str = Field(..., min_length=1)
    fileName: str = ""


class DocumentExtractResponse(BaseModel):
    title: str = ""
    abstract: str = ""
    keywords: list[str] = []
    methodology: str = ""


class RewriteSectionRequest(BaseModel):
    feedback: str = Field(..., min_length=1)
    originalContent: str = Field(..., min_length=1)
    context: dict = {}


class RewriteSectionResponse(BaseModel):
    newContent: str = ""
    diffText: str = ""
    wordCount: int = 0
