"""Post-generation quality checks for report sections.

Performs lightweight, dependency-free checks on generated content:
  - Word count vs target
  - Citation presence
  - Near-duplicate detection between sections
"""
import re
import logging
from dataclasses import dataclass, field
from typing import Dict, List, Optional


@dataclass
class SectionQuality:
    """Quality report for a single section."""
    section_index: int
    title: str
    word_count: int = 0
    target_words: int = 0
    word_count_ok: bool = True
    citation_count: int = 0
    citation_ok: bool = True
    issues: List[str] = field(default_factory=list)


@dataclass
class ReportQuality:
    """Aggregate quality report for the whole document."""
    sections: List[SectionQuality] = field(default_factory=list)
    duplicate_pairs: List[Dict] = field(default_factory=list)
    overall_pass: bool = True

    @property
    def summary(self) -> str:
        total = len(self.sections)
        failed = sum(1 for s in self.sections if s.issues)
        dupes = len(self.duplicate_pairs)
        if failed == 0 and dupes == 0:
            return f"质量检查通过 ({total} 个章节)"
        parts = []
        if failed:
            parts.append(f"{failed}/{total} 章节存在问题")
        if dupes:
            parts.append(f"{dupes} 对章节内容高度相似")
        return "质量警告: " + ", ".join(parts)


_CITATION_PATTERN = re.compile(r"\[(\d+)\]")


def check_word_count(text: str, target: int, threshold: float = 0.5) -> tuple[int, bool]:
    """Check if text meets minimum word count (Chinese char + English words)."""
    # Count Chinese characters + English words
    chinese_chars = len(re.findall(r"[\u4e00-\u9fff]", text))
    english_words = len(re.findall(r"[a-zA-Z]+", text))
    total = chinese_chars + english_words
    ok = target <= 0 or total >= int(target * threshold)
    return total, ok


def check_citations(text: str, min_count: int = 1) -> tuple[int, bool]:
    """Count citation references [N] in text."""
    refs = set(_CITATION_PATTERN.findall(text))
    count = len(refs)
    return count, count >= min_count


def _tokenize(text: str) -> set:
    """Simple tokenizer for Jaccard similarity."""
    tokens = re.findall(r"[\u4e00-\u9fff]|[a-zA-Z]+", text.lower())
    # Use 2-grams for Chinese, words for English
    result = set()
    for i, t in enumerate(tokens):
        result.add(t)
        if i + 1 < len(tokens):
            result.add(f"{t}_{tokens[i + 1]}")
    return result


def check_duplicates(sections: List[str], threshold: float = 0.8) -> List[Dict]:
    """Find near-duplicate section pairs using Jaccard similarity."""
    tokenized = [_tokenize(s) for s in sections]
    pairs = []
    for i in range(len(tokenized)):
        for j in range(i + 1, len(tokenized)):
            if not tokenized[i] or not tokenized[j]:
                continue
            intersection = len(tokenized[i] & tokenized[j])
            union = len(tokenized[i] | tokenized[j])
            similarity = intersection / union if union else 0
            if similarity >= threshold:
                pairs.append({
                    "section_a": i,
                    "section_b": j,
                    "similarity": round(similarity, 3),
                })
    return pairs


def run_quality_checks(
    sections_text: List[str],
    sections_meta: List[Dict],
) -> ReportQuality:
    """Run all quality checks and return a structured report.

    Args:
        sections_text: List of generated section markdown strings.
        sections_meta: List of dicts with at least ``title`` and ``target_words``.
    """
    report = ReportQuality()

    for idx, (text, meta) in enumerate(zip(sections_text, sections_meta)):
        title = meta.get("title", f"Section {idx + 1}")
        target = meta.get("target_words", 0)

        sq = SectionQuality(section_index=idx, title=title, target_words=target)
        sq.word_count, sq.word_count_ok = check_word_count(text, target)
        sq.citation_count, sq.citation_ok = check_citations(text)

        if not sq.word_count_ok:
            sq.issues.append(
                f"字数不足: {sq.word_count}/{target} (需≥{int(target * 0.5)})"
            )
        if not sq.citation_ok:
            sq.issues.append("缺少引用标记 [N]")

        report.sections.append(sq)

    report.duplicate_pairs = check_duplicates(sections_text)
    for pair in report.duplicate_pairs:
        a_title = sections_meta[pair["section_a"]].get("title", "?")
        b_title = sections_meta[pair["section_b"]].get("title", "?")
        report.sections[pair["section_a"]].issues.append(
            f"与「{b_title}」内容相似度 {pair['similarity']}"
        )

    report.overall_pass = all(not s.issues for s in report.sections) and not report.duplicate_pairs

    # Log results
    if not report.overall_pass:
        logging.warning(f"📊 {report.summary}")
        for sq in report.sections:
            if sq.issues:
                logging.warning(f"   {sq.title}: {'; '.join(sq.issues)}")
    else:
        logging.info(f"📊 {report.summary}")

    return report
