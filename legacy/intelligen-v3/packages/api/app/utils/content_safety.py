"""
Content Safety — sensitive lexicon checker with normalized matching.
Supports word-boundary awareness, intent-sensitive handling, and academic context.
"""
import logging
import re
import unicodedata
from typing import List, Dict, Tuple, Set
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

logger = logging.getLogger(__name__)


@dataclass
class SafetyCheckResult:
    is_safe: bool
    risk_level: str   # 'safe', 'low', 'medium', 'high', 'critical'
    action: str       # 'allow', 'warn', 'review', 'block'
    detected_keywords: List[str]
    categories: List[str]
    message: str
    timestamp: str

    def to_dict(self) -> Dict:
        return {
            "is_safe": self.is_safe, "risk_level": self.risk_level,
            "action": self.action, "detected_keywords": self.detected_keywords,
            "categories": self.categories, "message": self.message,
            "timestamp": self.timestamp,
        }


def _normalize_text(text: str) -> str:
    """Normalize text for matching: lowercase, remove extra spaces, normalize unicode."""
    text = unicodedata.normalize("NFKC", text)
    text = text.lower()
    # Collapse whitespace and common separators used for evasion
    text = re.sub(r"[\s\u200b\u200c\u200d\ufeff]+", "", text)
    return text


class SensitiveLexiconLoader:
    def __init__(self, lexicon_path: str = None):
        if lexicon_path is None:
            current_file = Path(__file__).resolve()
            backend_root = current_file.parent.parent.parent
            lexicon_path = backend_root / "Sensitive-lexicon" / "Vocabulary"
            if not lexicon_path.exists():
                lexicon_path = Path("/app/Sensitive-lexicon/Vocabulary")

        self.lexicon_path = Path(lexicon_path)
        self.all_keywords: set = set()
        self.categorized_keywords: Dict[str, set] = {}
        # Normalized versions for matching
        self._normalized_map: Dict[str, str] = {}  # normalized -> original
        self._normalized_by_category: Dict[str, Set[str]] = {}
        # Short keywords that need word-boundary matching to avoid false positives
        self._short_keyword_threshold = 2
        self._load_all_lexicons()

    def _load_all_lexicons(self):
        if not self.lexicon_path.exists():
            logger.warning(f"词库路径不存在: {self.lexicon_path}")
            return
        loaded_files = []
        for file_path in self.lexicon_path.glob("*.txt"):
            category = file_path.stem
            self._load_lexicon_file(file_path, category)
            loaded_files.append(category)
        logger.info(f"敏感词库加载完成: {len(loaded_files)} 个分类, 共 {len(self.all_keywords)} 个敏感词")

    def _load_lexicon_file(self, file_path: Path, category: str):
        try:
            count = 0
            with open(file_path, 'r', encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith('#'):
                        self.all_keywords.add(line)
                        if category not in self.categorized_keywords:
                            self.categorized_keywords[category] = set()
                            self._normalized_by_category[category] = set()
                        self.categorized_keywords[category].add(line)
                        norm = _normalize_text(line)
                        self._normalized_map[norm] = line
                        self._normalized_by_category[category].add(norm)
                        count += 1
            logger.info(f"加载 {category}: {count} 个词")
        except Exception as e:
            logger.error(f"加载词库文件失败 {file_path}: {e}")

    def check_text(self, text: str) -> List[Tuple[str, str]]:
        """Check text against lexicon with normalized matching."""
        matches = []
        norm_text = _normalize_text(text)

        for category, norm_keywords in self._normalized_by_category.items():
            for norm_kw in norm_keywords:
                original = self._normalized_map.get(norm_kw, norm_kw)
                # For very short keywords (<=2 chars), require exact phrase match
                # in original text to avoid false positives
                if len(original) <= self._short_keyword_threshold:
                    # Check as standalone phrase in original (non-normalized) text
                    pattern = re.compile(re.escape(original))
                    if pattern.search(text):
                        matches.append((original, category))
                else:
                    # Normal substring match on normalized text
                    if norm_kw in norm_text:
                        matches.append((original, category))
        return matches


# Intent patterns: distinguish "write harmful content" from "study harmful topic"
_HARMFUL_INTENT_PATTERNS = [
    re.compile(p) for p in [
        r"(请|帮我?|给我?)(写|生成|创作|制作|编写)",
        r"(如何|怎么|怎样)(制作|制造|合成|获取|购买)",
        r"(详细|具体)(步骤|方法|教程|流程)",
        r"(代写|代做|ghostwrit)",
    ]
]
_ACADEMIC_STUDY_PATTERNS = [
    re.compile(p) for p in [
        r"(分析|研究|探讨|综述|评估|调查|治理|防范|检测)",
        r"(对策|机制|现状|趋势|影响|案例|防控|监管)",
        r"(review|analysis|study|survey|evaluation|prevention|detection)",
    ]
]


class ContentSafetyChecker:
    def __init__(self):
        self.lexicon_loader = SensitiveLexiconLoader()
        self.strict_categories = ["暴恐词库", "色情词库", "涉枪涉爆"]
        self.review_categories = ["反动词库", "学术不端", "违规生成"]
        self.warn_categories = ["广告类型", "其他词库"]
        self.critical_keywords = {
            "恐怖袭击", "恐怖主义", "制造炸弹", "自杀式袭击",
            "制造毒品", "制毒", "制造枪支", "制造炸药",
        }

    def check_input(self, text: str) -> SafetyCheckResult:
        return self._check_content(text, "input")

    def _check_content(self, text: str, check_type: str) -> SafetyCheckResult:
        keyword_matches = self.lexicon_loader.check_text(text)
        if not keyword_matches:
            return SafetyCheckResult(
                is_safe=True, risk_level="safe", action="allow",
                detected_keywords=[], categories=[],
                message=f"{check_type}内容安全检查通过",
                timestamp=datetime.now().isoformat()
            )
        risk_level, action, message = self._determine_risk(keyword_matches, text)
        detected_keywords = list(set([m[0] for m in keyword_matches]))
        categories = list(set([m[1] for m in keyword_matches]))
        is_safe = action in ["allow", "warn"]
        return SafetyCheckResult(
            is_safe=is_safe, risk_level=risk_level, action=action,
            detected_keywords=detected_keywords, categories=categories,
            message=message, timestamp=datetime.now().isoformat()
        )

    def _has_harmful_intent(self, text: str) -> bool:
        """Check if text contains intent to create harmful content."""
        return any(p.search(text) for p in _HARMFUL_INTENT_PATTERNS)

    def _has_academic_context(self, text: str) -> bool:
        """Check if text is about studying/analyzing a topic (not producing it)."""
        return any(p.search(text) for p in _ACADEMIC_STUDY_PATTERNS)

    def _determine_risk(self, keyword_matches, text: str):
        has_harmful_intent = self._has_harmful_intent(text)
        has_academic_context = self._has_academic_context(text)

        category_counts = {}
        critical_count = 0
        for keyword, category in keyword_matches:
            category_counts[category] = category_counts.get(category, 0) + 1
            if keyword in self.critical_keywords:
                critical_count += 1

        has_strict = any(cat in self.strict_categories for cat in category_counts)
        has_review = any(cat in self.review_categories for cat in category_counts)

        # Critical: harmful intent + critical keywords → always block
        if critical_count > 0 and has_harmful_intent:
            return "critical", "block", f"检测到{critical_count}个严重敏感词，且包含有害意图，已阻止"

        # Strict category + harmful intent → block
        if has_strict and has_harmful_intent:
            kws = [k for k, v in keyword_matches if v in self.strict_categories][:3]
            return "high", "block", f"检测到敏感内容且包含有害意图: {', '.join(kws)}"

        # Strict category but academic context → downgrade to review
        if has_strict and has_academic_context:
            kws = [k for k, v in keyword_matches if v in self.strict_categories][:3]
            return "medium", "review", f"检测到敏感词用于学术研究语境，建议审核: {', '.join(kws)}"

        # Strict category, no clear intent → block by default
        if has_strict:
            kws = [k for k, v in keyword_matches if v in self.strict_categories][:3]
            return "high", "block", f"检测到严格类别敏感词: {', '.join(kws)}"

        # Review categories → review (with intent awareness)
        if has_review:
            cats = set(v for k, v in keyword_matches if v in self.review_categories)
            if has_academic_context:
                return "low", "warn", f"检测到敏感话题，用于学术讨论: {', '.join(cats)}"
            return "medium", "review", f"检测到需要审核的内容，涉及类别: {', '.join(cats)}"

        # Warn-level categories
        if category_counts:
            kws = [k for k, v in keyword_matches][:5]
            return "low", "warn", f"检测到敏感词，请确认内容合规: {', '.join(kws)}"

        return "safe", "allow", "内容安全检查通过"


_safety_checker = None

def get_safety_checker() -> ContentSafetyChecker:
    global _safety_checker
    if _safety_checker is None:
        _safety_checker = ContentSafetyChecker()
    return _safety_checker

def check_content_safety(text: str, check_type: str = "input") -> SafetyCheckResult:
    return get_safety_checker().check_input(text)
