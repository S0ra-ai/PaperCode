"""章节局部重写 — 根据用户反馈重新生成指定章节并生成 diff。"""

import difflib
import logging
from typing import Dict, Optional

from langchain_core.messages import SystemMessage, HumanMessage

from intelligen_engine.pipeline.shared.llm_service import LLMService
from intelligen_engine.prompts.prompt_manager import PromptManager

logger = logging.getLogger(__name__)


class SectionRewriter:
    """根据用户反馈对指定章节进行局部重写。"""

    def __init__(self, llm: Optional[LLMService] = None):
        self.llm = llm or LLMService()
        self.pm = PromptManager.get_instance()

    def rewrite(self, original: str, feedback: str, context: Dict) -> Dict:
        """重写章节并生成 unified diff。

        Args:
            original: 原始章节 Markdown 内容
            feedback: 用户反馈/修改指令
            context: 上下文信息 (title, section_title 等)

        Returns:
            {"new_content": str, "diff_text": str, "word_count": int}
        """
        title = context.get("title", "")
        section_title = context.get("section_title", "")

        system_prompt = self.pm.render("section_rewrite", "system")
        user_prompt = self.pm.render(
            "section_rewrite", "user",
            original_content=original,
            feedback=feedback,
            title=title,
            section_title=section_title,
        )

        if not system_prompt or not user_prompt:
            logger.warning("section_rewrite 提示词缺失，使用内联回退")
            system_prompt = (
                "你是学术论文写作专家。根据用户反馈修改指定章节内容。"
                "保持学术写作风格，确保与论文其他部分的连贯性。"
            )
            user_prompt = (
                f"## 原始内容\n{original}\n\n"
                f"## 用户反馈\n{feedback}\n\n"
                f"## 上下文信息\n论文标题: {title}\n所属章节: {section_title}\n\n"
                "请根据反馈重写该章节。只输出修改后的完整章节内容，不要添加额外说明。"
            )

        messages = [
            SystemMessage(content=system_prompt),
            HumanMessage(content=user_prompt),
        ]

        logger.info("📝 SectionRewriter: 重写章节 '%s'", section_title)
        result = self.llm.chat_routed(messages, task_type="writing")
        new_content = result.get("content", "").strip()

        diff_text = self._generate_diff(original, new_content, section_title)

        return {
            "new_content": new_content,
            "diff_text": diff_text,
            "word_count": len(new_content),
        }

    @staticmethod
    def _generate_diff(old: str, new: str, label: str = "") -> str:
        """生成 unified diff 文本。"""
        old_lines = old.splitlines(keepends=True)
        new_lines = new.splitlines(keepends=True)
        diff = difflib.unified_diff(
            old_lines, new_lines,
            fromfile=f"原始: {label}",
            tofile=f"重写: {label}",
            lineterm="",
        )
        return "".join(diff)
