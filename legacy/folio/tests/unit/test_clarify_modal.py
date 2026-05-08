# SPDX-License-Identifier: MPL-2.0
"""Unit tests for the Copilot-style ClarifyModal."""

from __future__ import annotations

import pytest
from textual.app import App, ComposeResult
from textual.widgets import Input, OptionList

from app.tui.clarify_modal import ClarifyModal


class _Host(App):
    def __init__(self, pending: dict) -> None:
        super().__init__()
        self._pending = pending
        self.result: str | None = None

    def compose(self) -> ComposeResult:  # pragma: no cover - trivial
        return iter(())

    async def on_mount(self) -> None:
        async def _resolved(value: str | None) -> None:
            self.result = value
            self.exit()

        self.push_screen(ClarifyModal(self._pending), _resolved)


@pytest.mark.asyncio
async def test_clarify_modal_select_option_via_enter() -> None:
    pending = {
        "field": "venue",
        "question": "选择目标会议",
        "options": [
            {"value": "ieee", "label": "IEEE", "description": "工科顶刊"},
            {"value": "acm", "label": "ACM", "description": "SIG 系列"},
        ],
        "allow_other": True,
    }
    app = _Host(pending)
    async with app.run_test() as pilot:
        await pilot.pause()
        await pilot.press("down", "enter")
        await pilot.pause()
    assert app.result == "acm"


@pytest.mark.asyncio
async def test_clarify_modal_other_input_via_tab() -> None:
    pending = {
        "field": "venue",
        "question": "venue?",
        "options": [{"value": "ieee", "label": "IEEE"}],
        "allow_other": True,
    }
    app = _Host(pending)
    async with app.run_test() as pilot:
        await pilot.pause()
        await pilot.press("tab")
        for ch in "custom":
            await pilot.press(ch)
        await pilot.press("enter")
        await pilot.pause()
    assert app.result == "custom"


@pytest.mark.asyncio
async def test_clarify_modal_escape_skips() -> None:
    pending = {
        "field": "x",
        "question": "?",
        "options": [{"value": "a", "label": "A"}],
        "allow_other": False,
    }
    app = _Host(pending)
    async with app.run_test() as pilot:
        await pilot.pause()
        await pilot.press("escape")
        await pilot.pause()
    assert app.result == ""


@pytest.mark.asyncio
async def test_clarify_modal_no_options_only_input() -> None:
    pending = {
        "field": "topic",
        "question": "topic?",
        "options": [],
        "allow_other": True,
    }
    app = _Host(pending)
    async with app.run_test() as pilot:
        await pilot.pause()
        # Input should be focused immediately
        focused = app.screen.focused
        assert isinstance(focused, Input)
        for ch in "llm":
            await pilot.press(ch)
        await pilot.press("enter")
        await pilot.pause()
    assert app.result == "llm"


@pytest.mark.asyncio
async def test_clarify_modal_renders_description() -> None:
    pending = {
        "field": "venue",
        "question": "q",
        "description": "决定后续模板",
        "options": [{"value": "a", "label": "A"}],
        "allow_other": False,
    }
    app = _Host(pending)
    async with app.run_test() as pilot:
        await pilot.pause()
        modal = app.screen
        assert isinstance(modal, ClarifyModal)
        # OptionList exists
        assert modal.query_one(OptionList) is not None
        await pilot.press("escape")
        await pilot.pause()
