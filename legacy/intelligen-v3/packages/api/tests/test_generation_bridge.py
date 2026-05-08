import os
import sys
from types import SimpleNamespace

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.modules.generation.services import generation_bridge
from app.modules.generation.services.regeneration_context import (
    build_grounded_regeneration_prompt,
    build_regeneration_context,
    split_markdown_sections,
)


def _make_pipeline(response_text: str, captured: dict | None = None):
    def fake_chat_routed(messages, task_type="writing", routing_metadata=None):
        if captured is not None:
            captured["messages"] = messages
            captured["task_type"] = task_type
            captured["routing_metadata"] = routing_metadata
        return {"content": response_text}

    return SimpleNamespace(llm=SimpleNamespace(chat_routed=fake_chat_routed))


def test_regenerate_section_builds_citation_aware_prompt(monkeypatch):
    captured = {}
    pipeline = _make_pipeline("重写后的方法分析，继续保留证据[1][2]。", captured)
    monkeypatch.setattr(generation_bridge, "get_pipeline", lambda: pipeline)

    full_markdown = """# 1 引言

引言部分概述了研究背景[3]。

# 2 方法

该部分比较了两类方法，并指出基线模型的局限[1][2]。

# 3 结果

结果部分总结了实验观察和误差来源[2]。

# 4 参考文献

[1] Author A. Method Paper. Journal, 2022. https://example.com/method

[2] Author B. Baseline Study. Conference, 2021. https://example.com/baseline

[3] Author C. Background Survey. Review, 2020. https://example.com/survey
"""

    result = generation_bridge.regenerate_section(
        task_id="task-1",
        section_index=1,
        full_markdown=full_markdown,
        custom_prompt="请强化方法比较，并保留原有证据链。",
    )

    prompt = captured["messages"][-1].content
    assert captured["task_type"] == "writing"
    assert captured["routing_metadata"] == {"section_index": 1}
    assert "请强化方法比较，并保留原有证据链。" in prompt
    assert "Target section heading:\n# 2 方法" in prompt
    assert "Previous section: # 1 引言" in prompt
    assert "Next section: # 3 结果" in prompt
    assert "[1] Author A. Method Paper." in prompt
    assert "[2] Author B. Baseline Study." in prompt
    assert "[3] Author C. Background Survey." not in prompt
    assert result["section_content"].startswith("# 2 方法")


def test_regenerate_section_reconstructs_full_markdown(monkeypatch):
    pipeline = _make_pipeline("# 2 方法\n\n这是新的方法章节内容[1]。")
    monkeypatch.setattr(generation_bridge, "get_pipeline", lambda: pipeline)

    full_markdown = """# 1 引言

原始引言内容。

# 2 方法

旧的方法章节。

# 3 结论

原始结论内容。
"""

    result = generation_bridge.regenerate_section(
        task_id="task-2",
        section_index=1,
        full_markdown=full_markdown,
    )

    assert result["full_markdown"] == """# 1 引言

原始引言内容。

# 2 方法

这是新的方法章节内容[1]。

# 3 结论

原始结论内容。"""


@pytest.mark.parametrize(
    "model_output",
    [
        "没有标题，但补充了新的论述[1]。",
        "# 完全不同的标题\n\n换了标题但内容仍然有效[1]。",
    ],
)
def test_regenerate_section_preserves_original_heading(monkeypatch, model_output):
    pipeline = _make_pipeline(model_output)
    monkeypatch.setattr(generation_bridge, "get_pipeline", lambda: pipeline)

    result = generation_bridge.regenerate_section(
        task_id="task-3",
        section_index=0,
        full_markdown="# 引言\n\n原始内容[1]。",
    )

    assert result["section_content"].splitlines()[0] == "# 引言"


def test_grounded_prompt_handles_missing_references_section():
    sections = split_markdown_sections(
        """# 1 引言

研究背景说明。

# 2 讨论

本节没有显式引用，但需要重写。
"""
    )
    context = build_regeneration_context(sections, 1)
    prompt = build_grounded_regeneration_prompt(context)

    assert "No references section was found in the current report." in prompt
    assert "Original section:\n# 2 讨论" in prompt
    assert "Previous section: # 1 引言" in prompt
