"""
Outline Planner — generates structured report outlines via LLM.
Migrated from model_strategy/app/services/outline_planner.py
"""
import logging
import re
from difflib import SequenceMatcher
from typing import List, Tuple

from langchain_core.messages import HumanMessage, SystemMessage

from intelligen_engine.pipeline.planning.schemas import OutlineSection, ReportOutline
from intelligen_engine.pipeline.shared.llm_service import LLMService
from intelligen_engine.prompts.prompt_manager import PromptManager
from intelligen_engine.core.exceptions import LLMGenerationError


class OutlinePlanner:
    """Generates a ReportOutline from user input, optional template, or existing outline text."""

    INTRO_KEYWORDS = ("引言", "绪论", "前言", "概述", "introduction", "overview")
    CONCLUSION_KEYWORDS = ("结论", "总结", "展望", "conclusion", "future")
    REFERENCE_KEYWORDS = ("参考文献", "references", "bibliography")
    GENERIC_TITLE_TOKENS = {
        "研究", "分析", "综述", "报告", "概述", "review", "analysis", "study", "report", "overview",
    }

    def __init__(self, llm: LLMService):
        self.llm = llm

    def plan(self, topic: str, template: str = "", outline: str = "",
             requirement: str = "", evidence_summary: str = "",
             target_word_count: int | None = None) -> ReportOutline:
        if outline and outline.strip():
            return self._from_outline_text(topic, outline, target_word_count=target_word_count)
        if template and template.strip():
            return self._from_template(topic, template, requirement, target_word_count=target_word_count)
        return self._generate(topic, requirement, evidence_summary, target_word_count=target_word_count)

    def _generate(self, topic: str, requirement: str = "",
                  evidence_summary: str = "",
                  target_word_count: int | None = None) -> ReportOutline:
        req_block = f"\n\nAdditional user requirements:\n{requirement}" if requirement else ""
        evidence_block = ""
        if evidence_summary:
            evidence_block = f"""

Planning evidence summary:
{evidence_summary}

Use this evidence to make the outline more specific, reduce overlap, and improve section search_queries.
"""
        pm = PromptManager.get_instance()
        word_count_block = ""
        if target_word_count:
            word_count_block = f"\n\n论文总字数目标为 {target_word_count} 字，请据此合理分配各章节的 target_words。"
        messages = [
            SystemMessage(content=pm.render("planning", "generate_system")),
            HumanMessage(content=pm.render("planning", "generate_human",
                                           topic=topic, req_block=req_block,
                                           evidence_block=evidence_block,
                                           word_count_block=word_count_block)),
        ]
        try:
            result = self.llm.chat_json(messages, schema=ReportOutline, task_type="planning")
            result = self._review_outline(result, topic, evidence_summary=evidence_summary,
                                          target_word_count=target_word_count)
            logging.info(f"✅ LLM generated outline with {len(result.sections)} sections")
            return result
        except Exception as e:
            logging.error(f"Outline generation failed: {e}")
            raise LLMGenerationError(detail=str(e)) from e

    def _from_outline_text(self, topic: str, outline_text: str,
                           target_word_count: int | None = None) -> ReportOutline:
        pm = PromptManager.get_instance()
        messages = [
            SystemMessage(content=pm.render("planning", "from_outline_system")),
            HumanMessage(content=pm.render("planning", "from_outline_human",
                                           topic=topic, outline_text=outline_text)),
        ]
        try:
            result = self.llm.chat_json(messages, schema=ReportOutline, task_type="planning")
            result = self._review_outline(result, topic, preserve_user_structure=True,
                                          target_word_count=target_word_count)
            logging.info(f"✅ Converted outline text to {len(result.sections)} sections")
            return result
        except Exception as e:
            logging.error(f"Outline text conversion failed: {e}")
            raise LLMGenerationError(detail=str(e)) from e

    def _from_template(self, topic: str, template: str,
                       requirement: str = "",
                       target_word_count: int | None = None) -> ReportOutline:
        req_block = f"\n\nUser requirements:\n{requirement}" if requirement else ""
        pm = PromptManager.get_instance()
        messages = [
            SystemMessage(content=pm.render("planning", "from_template_system")),
            HumanMessage(content=pm.render("planning", "from_template_human",
                                           topic=topic,
                                           template_content=template[:5000],
                                           req_block=req_block)),
        ]
        try:
            result = self.llm.chat_json(messages, schema=ReportOutline, task_type="planning")
            return self._review_outline(result, topic, preserve_user_structure=True,
                                        target_word_count=target_word_count)
        except Exception as e:
            logging.error(f"Template-based outline failed: {e}")
            return self._generate(topic, requirement, target_word_count=target_word_count)

    def _review_outline(self, outline: ReportOutline, topic: str,
                        evidence_summary: str = "",
                        preserve_user_structure: bool = False,
                        target_word_count: int | None = None) -> ReportOutline:
        sections = self._merge_overlapping_sections(outline.sections)
        if not sections:
            raise LLMGenerationError(detail="LLM 返回的大纲为空，无法继续生成")

        seed_queries = self._extract_seed_queries(evidence_summary) or [topic]
        references = None
        intro = None
        conclusion = None
        body_sections: List[OutlineSection] = []

        for section in sections:
            role = self._classify_role(section.title)
            if role == "references":
                references = self._merge_sections(references, section) if references else section
            elif role == "introduction":
                intro = self._merge_sections(intro, section) if intro else section
            elif role == "conclusion":
                conclusion = self._merge_sections(conclusion, section) if conclusion else section
            else:
                body_sections.append(section)

        if preserve_user_structure:
            final_sections = [
                self._sanitize_section(section, topic, seed_queries, self._classify_role(section.title), target_word_count=target_word_count)
                for section in sections
                if self._classify_role(section.title) != "references"
            ]
            final_sections.append(self._sanitize_section(
                references or self._default_section(topic, "references", seed_queries),
                topic, seed_queries, "references", target_word_count=target_word_count,
            ))
        else:
            intro = self._sanitize_section(
                intro or self._default_section(topic, "introduction", seed_queries),
                topic, seed_queries, "introduction", target_word_count=target_word_count,
            )
            conclusion = self._sanitize_section(
                conclusion or self._default_section(topic, "conclusion", seed_queries),
                topic, seed_queries, "conclusion", target_word_count=target_word_count,
            )
            references = self._sanitize_section(
                references or self._default_section(topic, "references", seed_queries),
                topic, seed_queries, "references", target_word_count=target_word_count,
            )
            body_sections = [
                self._sanitize_section(section, topic, seed_queries, "body", target_word_count=target_word_count)
                for section in body_sections
            ]
            if len(body_sections) < 2:
                body_sections.extend(self._build_default_body_sections(
                    topic, body_sections, seed_queries, needed=2 - len(body_sections),
                ))
            body_sections = body_sections[:5]
            final_sections = [intro, *body_sections, conclusion, references]

        numbered_sections = []
        for index, section in enumerate(final_sections, start=1):
            numbered_sections.append(OutlineSection(
                number=str(index),
                title=section.title,
                instruction=section.instruction,
                target_words=section.target_words,
                search_queries=section.search_queries,
            ))

        return ReportOutline(title=outline.title or topic, sections=numbered_sections)

    def _merge_overlapping_sections(self, sections: List[OutlineSection]) -> List[OutlineSection]:
        merged: List[OutlineSection] = []
        for section in sections:
            if not section.title.strip():
                continue
            normalized = OutlineSection(
                number=str(section.number).strip() or str(len(merged) + 1),
                title=section.title.strip(),
                instruction=(section.instruction or "").strip(),
                target_words=section.target_words,
                search_queries=[q for q in section.search_queries if self._clean_query(q)],
            )
            for idx, existing in enumerate(merged):
                if self._titles_overlap(existing.title, normalized.title):
                    merged[idx] = self._merge_sections(existing, normalized)
                    break
            else:
                merged.append(normalized)
        return merged

    def _sanitize_section(self, section: OutlineSection, topic: str,
                          seed_queries: List[str], role: str,
                          target_word_count: int | None = None) -> OutlineSection:
        title = section.title.strip()
        if role == "references":
            title = "参考文献"

        instruction = (section.instruction or "").strip()
        if not instruction:
            instruction = self._default_instruction(topic, title, role)

        target_words = self._sanitize_target_words(section.target_words, role,
                                                     target_word_count=target_word_count)
        search_queries = self._sanitize_queries(section.search_queries, topic, title, role, seed_queries)

        return OutlineSection(
            number=str(section.number or ""),
            title=title,
            instruction=instruction,
            target_words=target_words,
            search_queries=search_queries,
        )

    def _sanitize_target_words(self, target_words: int, role: str,
                               target_word_count: int | None = None) -> int:
        if role == "references":
            return 500

        if target_word_count and target_word_count > 0:
            # Proportional allocation: intro/conclusion ~10% each, body sections share ~80%
            body_count = 5  # typical body section count
            if role in {"introduction", "conclusion"}:
                default = int(target_word_count * 0.10)
                lower = max(400, int(default * 0.5))
                upper = int(default * 1.5)
            else:
                default = int(target_word_count * 0.80 / body_count)
                lower = max(500, int(default * 0.5))
                upper = int(default * 1.5)
        else:
            default = 1200 if role in {"introduction", "conclusion"} else 1500
            lower, upper = ((800, 1800) if role in {"introduction", "conclusion"} else (900, 2200))

        value = target_words if isinstance(target_words, int) and target_words > 0 else default
        return max(lower, min(value, upper))

    def _sanitize_queries(self, queries: List[str], topic: str, title: str,
                          role: str, seed_queries: List[str]) -> List[str]:
        if role == "references":
            return []

        cleaned = self._dedupe_strings(self._clean_query(q) for q in (queries or []))
        if cleaned:
            return cleaned[:3]

        candidates: List[str] = []
        if role == "introduction":
            candidates.extend(seed_queries[:2])
            candidates.append(f"{topic} research overview")
        elif role == "conclusion":
            if seed_queries:
                candidates.append(f"{seed_queries[0]} future directions")
            candidates.extend(seed_queries[:1])
            candidates.append(topic)
        else:
            candidates.extend(seed_queries[:2])
            if title and title != topic:
                candidates.append(f"{topic} {title}")
            candidates.append(topic)

        return self._dedupe_strings(self._clean_query(q) for q in candidates)[:3]

    def _default_section(self, topic: str, role: str,
                         seed_queries: List[str]) -> OutlineSection:
        title_map = {
            "introduction": "引言",
            "conclusion": "结论与展望",
            "references": "参考文献",
            "body": f"{topic}的关键研究议题",
        }
        title = title_map[role]
        return OutlineSection(
            number="",
            title=title,
            instruction=self._default_instruction(topic, title, role),
            target_words=self._sanitize_target_words(0, role),
            search_queries=self._sanitize_queries([], topic, title, role, seed_queries),
        )

    def _build_default_body_sections(self, topic: str, existing: List[OutlineSection],
                                     seed_queries: List[str], needed: int) -> List[OutlineSection]:
        templates = [
            ("研究基础与问题界定", f"界定“{topic}”的核心概念、研究范围、关键问题与评价维度。"),
            ("关键方法与证据分析", f"梳理“{topic}”的代表性方法、主要证据、性能表现与适用边界。"),
            ("应用场景与挑战", f"分析“{topic}”在典型应用场景中的实践效果、局限性与未来挑战。"),
        ]
        built: List[OutlineSection] = []
        for title, instruction in templates:
            if len(built) >= needed:
                break
            if any(self._titles_overlap(title, section.title) for section in [*existing, *built]):
                continue
            built.append(OutlineSection(
                number="",
                title=title,
                instruction=instruction,
                target_words=1500,
                search_queries=self._sanitize_queries([], topic, title, "body", seed_queries),
            ))
        return built[:needed]

    def _default_instruction(self, topic: str, title: str, role: str) -> str:
        if role == "introduction":
            return f"介绍“{topic}”的研究背景、核心问题、报告范围与后续章节安排。"
        if role == "conclusion":
            return f"总结“{topic}”的关键发现、现有限制与后续研究方向。"
        if role == "references":
            return "整理并列出报告中所有引用的参考文献，按引用顺序排列。"
        return f"围绕“{title}”分析与“{topic}”相关的关键概念、代表性研究、主要证据与实践启示。"

    def _merge_sections(self, left: OutlineSection, right: OutlineSection) -> OutlineSection:
        if left is None:
            return right
        if right is None:
            return left

        left_title = self._normalize_title(left.title)
        right_title = self._normalize_title(right.title)
        preferred_title = right.title if len(right_title) > len(left_title) else left.title

        instruction = left.instruction or right.instruction
        if left.instruction and right.instruction and right.instruction not in left.instruction:
            instruction = left.instruction if len(left.instruction) >= len(right.instruction) else right.instruction

        queries = self._dedupe_strings([*left.search_queries, *right.search_queries])
        return OutlineSection(
            number=left.number,
            title=preferred_title,
            instruction=instruction,
            target_words=max(left.target_words, right.target_words),
            search_queries=queries,
        )

    def _classify_role(self, title: str) -> str:
        lowered = title.lower()
        if any(keyword in lowered for keyword in self.REFERENCE_KEYWORDS):
            return "references"
        if any(keyword in lowered for keyword in self.CONCLUSION_KEYWORDS):
            return "conclusion"
        if any(keyword in lowered for keyword in self.INTRO_KEYWORDS):
            return "introduction"
        return "body"

    def _titles_overlap(self, left: str, right: str) -> bool:
        if not left or not right:
            return False

        left_role = self._classify_role(left)
        right_role = self._classify_role(right)
        if left_role == right_role and left_role in {"introduction", "conclusion", "references"}:
            return True

        norm_left = self._normalize_title(left)
        norm_right = self._normalize_title(right)
        if not norm_left or not norm_right:
            return False
        if norm_left == norm_right or norm_left in norm_right or norm_right in norm_left:
            return True
        if SequenceMatcher(None, norm_left, norm_right).ratio() >= 0.82:
            return True

        left_tokens = self._title_tokens(left)
        right_tokens = self._title_tokens(right)
        if left_tokens and right_tokens:
            overlap = len(left_tokens & right_tokens) / min(len(left_tokens), len(right_tokens))
            if overlap >= 0.8:
                return True
        return False

    def _title_tokens(self, title: str) -> set:
        tokens = set(re.findall(r"[a-zA-Z]{2,}", title.lower()))
        for run in re.findall(r"[\u4e00-\u9fff]{2,}", title):
            tokens.add(run)
            tokens.update(run[i:i + 2] for i in range(len(run) - 1))
        return {token for token in tokens if token not in self.GENERIC_TITLE_TOKENS}

    @staticmethod
    def _normalize_title(title: str) -> str:
        return re.sub(r"[\W_]+", "", title.lower())

    @staticmethod
    def _clean_query(query: str) -> str:
        if not query:
            return ""
        cleaned = re.sub(r"\s+", " ", str(query)).strip(" \t\r\n,;，；")
        return cleaned if len(cleaned) >= 3 else ""

    @staticmethod
    def _dedupe_strings(values) -> List[str]:
        seen = set()
        deduped = []
        for value in values:
            if not value:
                continue
            key = value.lower()
            if key in seen:
                continue
            seen.add(key)
            deduped.append(value)
        return deduped

    @staticmethod
    def _extract_seed_queries(evidence_summary: str) -> List[str]:
        if not evidence_summary:
            return []
        matches = re.findall(r"(?im)^\s*-\s*(?:precise|general|arxiv)\s*:\s*(.+)$", evidence_summary)
        return [match.strip() for match in matches if match.strip()]

    def to_legacy_sections(self, outline: ReportOutline) -> List[Tuple[str, str]]:
        return [(f"{s.number}. {s.title}", s.instruction) for s in outline.sections]
