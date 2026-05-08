# SPDX-License-Identifier: MPL-2.0
"""Unit tests for the slash-command catalogue."""

from __future__ import annotations

from app.tui.commands import COMMANDS, complete, find, help_text


def test_all_commands_unique_names() -> None:
    names = [c.name for c in COMMANDS]
    assert len(names) == len(set(names))


def test_find_returns_command() -> None:
    cmd = find("pdf")
    assert cmd is not None and cmd.name == "pdf"
    assert find("nope") is None


def test_complete_prefix_matches() -> None:
    sugg = complete(":p")
    # both pdf-style and PDF-suggestion candidates start with :p
    assert ":pdf" in sugg


def test_complete_empty_prefix() -> None:
    sugg = complete("")
    assert sugg == []


def test_complete_non_colon_returns_empty() -> None:
    assert complete("hello") == []


def test_help_text_lists_all_commands() -> None:
    txt = help_text()
    for cmd in COMMANDS:
        assert cmd.name in txt
