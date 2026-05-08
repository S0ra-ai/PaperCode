"""Research-context planning primitives for paper-mode workflows."""

from __future__ import annotations

import re
from dataclasses import asdict, dataclass, field
from typing import Literal


InputKind = Literal["topic", "material", "code"]


@dataclass(frozen=True)
class ResearchContext:
    input_kind: InputKind
    topic: str
    uploaded_files: list[str] = field(default_factory=list)
    code_files: list[str] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


def route_input(
    user_input: str,
    *,
    uploaded_files: list[str] | None = None,
    code_files: list[str] | None = None,
) -> ResearchContext:
    uploaded = uploaded_files or []
    code = code_files or []
    if code or any(_is_code_file(name) for name in uploaded):
        kind: InputKind = "code"
    elif uploaded:
        kind = "material"
    else:
        kind = "topic"

    topic = _normalize_topic(user_input) or _topic_from_files(uploaded + code)
    notes = []
    if kind == "code":
        notes.append("code workflow should ask the user to choose paper direction before drafting")
    if kind == "material":
        notes.append("material workflow should extract claims, format requirements, and research cues")
    return ResearchContext(
        input_kind=kind,
        topic=topic or "Untitled research topic",
        uploaded_files=uploaded,
        code_files=code,
        notes=notes,
    )


def plan_questions(context: ResearchContext, *, control_mode: str = "batch_autopilot") -> dict[str, object]:
    questions = [
        {
            "id": "paper_type",
            "question": "这篇论文更接近方法、系统、综述、应用研究还是实验评测？",
            "reason": "论文类型会决定章节结构、数据来源和实验设计。",
            "required": True,
        },
        {
            "id": "venue_variant",
            "question": "IEEE 目标是 conference 还是 journal？",
            "reason": "IEEE 不同变体会影响模板选项和长度约束。",
            "required": True,
        },
        {
            "id": "data_source",
            "question": "是否已有数据集、实验日志或可公开引用的数据来源？",
            "reason": "没有真实数据时不能编造实验结果，只能输出实验设计或待补充结果。",
            "required": False,
        },
    ]
    if context.input_kind == "code":
        questions.insert(
            0,
            {
                "id": "code_paper_direction",
                "question": "这份代码要写成系统/工具论文、算法方法论文，还是实验评测论文？",
                "reason": "代码入口必须先确定论文方向，避免把工程说明误写成研究贡献。",
                "required": True,
            },
        )
    if context.input_kind == "material":
        questions.append(
            {
                "id": "material_role",
                "question": "上传资料是参考论文、格式要求、已有草稿，还是数据说明？",
                "reason": "不同资料角色会进入不同的抽取与验证流程。",
                "required": True,
            }
        )
    return {
        "mode": control_mode,
        "batch_recommended": control_mode == "batch_autopilot",
        "questions": questions,
    }


def prefill_metadata(text: str) -> dict[str, object]:
    authors = []
    institutions = []
    author_match = re.search(r"(?:authors?|作者)[:：]\s*([^\n]+)", text, flags=re.IGNORECASE)
    if author_match:
        authors = [item.strip() for item in re.split(r"[,，;；]", author_match.group(1)) if item.strip()]
    institution_match = re.search(r"(?:institution|affiliation|单位|院校)[:：]\s*([^\n]+)", text, flags=re.IGNORECASE)
    if institution_match:
        institutions = [item.strip() for item in re.split(r"[,，;；]", institution_match.group(1)) if item.strip()]
    ambiguous = []
    if not authors:
        ambiguous.append("authors")
    if not institutions:
        ambiguous.append("institutions")
    return {
        "authors": authors,
        "institutions": institutions,
        "ambiguous_fields": ambiguous,
    }


def plan_research(context: ResearchContext) -> dict[str, object]:
    if context.input_kind == "code":
        paper_types = ["system_tool", "method_algorithm", "experimental_evaluation"]
        data_strategy = "inspect repository tests, examples, logs, and benchmark scripts before claiming results"
    elif context.input_kind == "material":
        paper_types = ["survey", "application_research", "method_algorithm"]
        data_strategy = "extract datasets, claims, and citations from uploaded materials, then verify externally"
    else:
        paper_types = ["method_algorithm", "survey", "application_research"]
        data_strategy = "search public datasets and literature before finalizing experiments"
    return {
        "topic": context.topic,
        "input_kind": context.input_kind,
        "recommended_paper_types": paper_types,
        "data_strategy": data_strategy,
        "experiment_policy": "do not fabricate results; emit proposed experiments until real execution traces exist",
        "next_stage": "literature_search",
    }


def ingest_materials(files: list[str]) -> dict[str, object]:
    items = []
    for file_name in files:
        lower = file_name.lower()
        if lower.endswith((".pdf", ".docx")):
            role = "document"
        elif lower.endswith((".csv", ".json", ".xlsx")):
            role = "data_source"
        elif lower.endswith((".tex", ".cls", ".sty")):
            role = "format_requirement"
        else:
            role = "supporting_material"
        items.append({"file": file_name, "role": role})
    return {
        "materials": items,
        "next_actions": [
            "extract topic, claims, and constraints",
            "verify cited sources externally before drafting",
            "treat uploaded samples as context, not as an override for explicit venue",
        ],
    }


def browse_code(files: list[str]) -> dict[str, object]:
    languages = sorted({_language_from_file(path) for path in files if _language_from_file(path)})
    return {
        "file_count": len(files),
        "languages": languages,
        "entrypoint_candidates": [
            path for path in files if path.lower().endswith(("main.py", "app.py", "index.ts", "index.js"))
        ],
        "directions": suggest_code_directions(files),
        "warnings": ["static file-name analysis only; run repository inspection before claiming implementation details"],
    }


def classify_paper_type(context: ResearchContext, hint: str = "") -> dict[str, object]:
    text = f"{context.topic} {hint}".lower()
    if any(word in text for word in ("survey", "review", "综述", "调研")):
        selected = "survey"
    elif any(word in text for word in ("experiment", "benchmark", "评测", "实验")):
        selected = "experimental_evaluation"
    elif context.input_kind == "code" or any(word in text for word in ("system", "platform", "工具", "系统")):
        selected = "system_tool"
    else:
        selected = "method_algorithm"
    return {
        "paper_type": selected,
        "confidence": "medium",
        "requires_confirmation": context.input_kind == "code",
    }


def assess_novelty(context: ResearchContext) -> dict[str, object]:
    return {
        "topic": context.topic,
        "status": "requires_literature_search",
        "search_queries": [
            context.topic,
            f"{context.topic} survey",
            f"{context.topic} benchmark",
        ],
        "policy": "do not claim novelty until search results are verified",
    }


def plan_experiment(context: ResearchContext) -> dict[str, object]:
    return {
        "research_questions": [f"Does the proposed work improve or clarify {context.topic}?"],
        "datasets": ["user-provided or verified public dataset required"],
        "baselines": ["strong published baseline required before final claims"],
        "metrics": ["accuracy/quality metric", "efficiency metric", "ablation metric"],
        "execution_status": "planned_not_run",
        "policy": "results must remain pending until real execution traces exist",
    }


def plan_experiment_adjustment(reason: str) -> dict[str, object]:
    return {
        "reason": reason,
        "decision_required": True,
        "options": [
            "adjust dataset or preprocessing",
            "adjust method or hyperparameters",
            "revise research question",
            "ask user before continuing",
        ],
    }


def audit_question_quality(plan: dict[str, object]) -> dict[str, object]:
    questions = plan.get("questions") if isinstance(plan, dict) else []
    items = questions if isinstance(questions, list) else []
    missing_reason = [item.get("id", "unknown") for item in items if isinstance(item, dict) and not item.get("reason")]
    return {
        "passed": bool(items) and not missing_reason,
        "question_count": len(items),
        "missing_reason": missing_reason,
    }


def audit_metadata_consistency(metadata: dict[str, object]) -> dict[str, object]:
    authors = metadata.get("authors") if isinstance(metadata, dict) else []
    institutions = metadata.get("institutions") if isinstance(metadata, dict) else []
    return {
        "passed": bool(authors) and bool(institutions),
        "missing": [
            field
            for field, value in (("authors", authors), ("institutions", institutions))
            if not value
        ],
    }


def audit_figures_tables(items: list[dict[str, object]]) -> dict[str, object]:
    failures = []
    for index, item in enumerate(items):
        if not item.get("caption"):
            failures.append(f"item {index}: missing caption")
        if not item.get("source"):
            failures.append(f"item {index}: missing source")
    return {
        "passed": not failures,
        "checked_items": len(items),
        "failures": failures,
    }


def suggest_code_directions(files: list[str]) -> list[dict[str, str]]:
    languages = sorted({_language_from_file(path) for path in files if _language_from_file(path)})
    language_text = ", ".join(languages) if languages else "unknown"
    return [
        {
            "id": "system_tool",
            "title": "系统/工具实现论文",
            "description": f"围绕项目架构、模块设计和工程流程展开；检测到语言: {language_text}。",
        },
        {
            "id": "method_algorithm",
            "title": "方法/算法论文",
            "description": "聚焦核心算法、模型或优化策略，需要定位关键实现并补充对比实验。",
        },
        {
            "id": "experimental_evaluation",
            "title": "实验评测论文",
            "description": "围绕性能、准确率、消融或基准测试展开，需要真实运行日志和指标。",
        },
    ]


def _normalize_topic(user_input: str) -> str:
    return re.sub(r"\s+", " ", user_input or "").strip()


def _topic_from_files(files: list[str]) -> str:
    if not files:
        return ""
    return f"Research based on {', '.join(files[:3])}"


def _is_code_file(name: str) -> bool:
    return bool(re.search(r"\.(py|js|ts|tsx|jsx|java|go|rs|c|cpp|h|hpp|zip)$", name.lower()))


def _language_from_file(name: str) -> str:
    suffix = name.rsplit(".", 1)[-1].lower() if "." in name else ""
    return {
        "py": "Python",
        "js": "JavaScript",
        "ts": "TypeScript",
        "tsx": "TypeScript",
        "jsx": "JavaScript",
        "java": "Java",
        "go": "Go",
        "rs": "Rust",
        "c": "C",
        "cpp": "C++",
    }.get(suffix, "")
