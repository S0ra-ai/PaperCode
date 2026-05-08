"""
Structured context manager for report generation.
Migrated from model_strategy/app/services/context_manager.py — no Flask deps.
"""
import logging
import re
from typing import List, Dict, Optional
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage

from intelligen_engine.pipeline.shared.llm_service import LLMService


class ContextManager:
    """Token-budget-aware context builder for section-by-section generation."""

    # Chinese text: ~1-2 chars/token; English: ~4 chars/token
    # Mixed academic Chinese/English: ~2.0 is a reasonable estimate
    CHARS_PER_TOKEN = 2.0
    RESPONSE_RESERVE_RATIO = 0.30
    COMPRESS_THRESHOLD = 0.85
    SUMMARY_MAX_CHARS = 600

    def __init__(self, llm: LLMService, max_tokens: int = 32768):
        self.llm = llm
        self.max_tokens = max_tokens
        self._context_budget = int(max_tokens * (1 - self.RESPONSE_RESERVE_RATIO))

        self._system_prefix: str = ""
        self._outline_text: str = ""
        self._retrieval_summary: str = ""

        self._section_summaries: List[Dict] = []
        self._citation_ids: List[int] = []
        self._window: List[Dict] = []
        self._window_size = 3

    def set_immutable_context(self, system_prefix: str, outline_text: str,
                              retrieval_summary: str):
        self._system_prefix = system_prefix
        self._outline_text = outline_text
        self._retrieval_summary = retrieval_summary

    def on_section_complete(self, index: int, title: str, content: str,
                            summary: str = "", target_words: Optional[int] = None):
        if not summary:
            summary, _ = self._generate_summary(
                title,
                content,
                section_index=index,
                target_words=target_words,
            )

        self._section_summaries.append({
            "index": index, "title": title, "summary": summary,
        })

        refs = re.findall(r'\[(\d+)\]', content)
        for r in refs:
            rid = int(r)
            if rid not in self._citation_ids:
                self._citation_ids.append(rid)

        self._window.append({"index": index, "title": title, "content": content})
        if len(self._window) > self._window_size:
            self._window.pop(0)

    def restore_from_checkpoints(self, checkpoints: List[Dict]):
        for cp in sorted(checkpoints, key=lambda x: x["section_index"]):
            self.on_section_complete(
                index=cp["section_index"],
                title=cp.get("title", f"Section {cp['section_index'] + 1}"),
                content=cp.get("content", ""),
                summary=cp.get("summary", ""),
            )

    def build_messages(self, section_index: int, section_prompt: str, *,
                       source_material_override: Optional[str] = None,
                       include_recent_sections: bool = True) -> List:
        system_content = self._build_system_content(source_material_override=source_material_override)
        messages = [SystemMessage(content=system_content)]

        window_entries = self._window if include_recent_sections else []
        window_indices = {w["index"] for w in window_entries}
        history_summaries = [
            s for s in self._section_summaries
            if s["index"] not in window_indices
        ]
        if history_summaries:
            history_text = "\n".join(
                f"- Section {s['index']+1} ({s['title']}): {s['summary']}"
                for s in history_summaries
            )
            messages.append(HumanMessage(content=f"[Previous sections summary]\n{history_text}"))
            messages.append(AIMessage(content="Understood. I'll maintain consistency with the above."))

        for w in window_entries:
            messages.append(HumanMessage(content=f"[Section {w['index']+1}: {w['title']}]"))
            messages.append(AIMessage(content=w["content"]))

        messages.append(HumanMessage(content=section_prompt))

        while include_recent_sections and len(self._window) > 1:
            total_text = "".join(m.content for m in messages)
            estimated_tokens = self.estimate_tokens(total_text)
            if estimated_tokens <= self._context_budget * self.COMPRESS_THRESHOLD:
                break
            messages = self._compress_messages(messages)

        return messages

    def estimate_tokens(self, text: str) -> int:
        """Estimate token count for mixed Chinese/English text."""
        chinese_chars = sum(1 for c in text if '\u4e00' <= c <= '\u9fff')
        other_chars = len(text) - chinese_chars
        # Chinese: ~1.5 chars per token; English/other: ~4 chars per token
        return int(chinese_chars / 1.5 + other_chars / 4.0)

    def _generate_summary(self, title: str, content: str, *,
                          section_index: Optional[int] = None,
                          target_words: Optional[int] = None,
                          has_review_pass: bool = False) -> tuple:
        summary_source = content[:4000]
        routing_metadata = {"context_size": len(summary_source)}
        if section_index is not None:
            routing_metadata["section_index"] = section_index
        if target_words:
            routing_metadata["target_words"] = target_words
        if has_review_pass:
            routing_metadata["has_review_pass"] = True
        try:
            result = self.llm.chat_routed([
                SystemMessage(content="You are a concise summarizer. Output ONLY the summary, no preamble."),
                HumanMessage(content=f"Summarize the following academic section in 200-300 Chinese characters. "
                             f"Include: core argument, key data points, and reference numbers [N] used. "
                             f"Preserve important English technical terms as-is.\n\n"
                             f"Section: {title}\n{summary_source}")
            ], task_type="summary", routing_metadata=routing_metadata)
            summary = result.get("content", "")[:self.SUMMARY_MAX_CHARS]
            tokens = result.get("total_tokens", 0)
            return summary, tokens
        except Exception as e:
            logging.warning(f"Summary generation failed for '{title}': {e}")
            fallback = content[:300].rsplit('。', 1)[0] + '。' if '。' in content[:300] else content[:300]
            return fallback, 0

    def _build_system_content(self, *,
                              source_material_override: Optional[str] = None) -> str:
        parts = [self._system_prefix]
        if self._outline_text:
            parts.append(f"\n**Report Structure:**\n{self._outline_text}")
        source_material = (
            source_material_override
            if source_material_override is not None
            else self._retrieval_summary
        )
        if source_material:
            parts.append(f"\n**Source Material:**\n{source_material}")
        if self._citation_ids:
            parts.append(f"\n**References already cited:** {sorted(self._citation_ids)}")
        return "\n".join(parts)

    def _compress_messages(self, messages: List) -> List:
        if len(self._window) <= 1:
            return messages
        oldest = self._window[0]
        compressed = []
        skip_next_ai = False
        for msg in messages:
            if skip_next_ai and isinstance(msg, AIMessage):
                skip_next_ai = False
                continue
            if isinstance(msg, HumanMessage) and f"[Section {oldest['index']+1}:" in msg.content:
                skip_next_ai = True
                continue
            compressed.append(msg)
        self._window.pop(0)
        logging.info(f"Compressed context: removed window section {oldest['index']+1}")
        return compressed

    @property
    def used_citations(self) -> List[int]:
        return sorted(self._citation_ids)

    @property
    def section_summaries(self) -> List[Dict]:
        return list(self._section_summaries)
