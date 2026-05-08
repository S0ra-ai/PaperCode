# SPDX-License-Identifier: MPL-2.0
# ruff: noqa: RUF001
"""Slash-command catalogue + simple prefix completer for the TUI.

Used for both the ``:help`` overlay and the input suggester. Keeping
the table here means tests can introspect it without importing Textual.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Command:
    name: str  # without leading colon
    usage: str
    summary: str  # one-line Chinese summary


COMMANDS: tuple[Command, ...] = (
    Command("pdf", ":pdf <path> [topic...]", "用一份样张 PDF 启动 format_to_paper"),
    Command("survey", ":survey <domain>", "启动 survey 综述流水线"),
    Command("resume", ":resume [<uuid_prefix>]", "续跑某次未完成的 run"),
    Command("endpoints", ":endpoints", "打开 endpoints 设置面板"),
    Command("refine", ":refine <instruction>", "对最后一次产出进行追加修改"),
    Command("retry", ":retry", "从上一个失败的 stage 处继续重跑（含自动修复）"),
    Command("open", ":open <section>", "在主区预览某个章节文本"),
    Command("abort", ":abort", "中断当前 stage（=Ctrl+C）"),
    Command("help", ":help", "显示命令与键位帮助（=?）"),
    Command("quit", ":quit", "退出 Folio"),
)

COMMAND_NAMES: tuple[str, ...] = tuple(c.name for c in COMMANDS)


def complete(prefix: str) -> list[str]:
    """Return matching command strings (with leading ``:``)."""
    if not prefix.startswith(":"):
        return []
    needle = prefix[1:]
    return [f":{c.name}" for c in COMMANDS if c.name.startswith(needle)]


def find(name: str) -> Command | None:
    for c in COMMANDS:
        if c.name == name:
            return c
    return None


def help_text() -> str:
    """Return a Markdown/Rich-friendly help block (Chinese)."""
    lines = ["[bold]命令[/]"]
    for c in COMMANDS:
        lines.append(f"  [cyan]{c.usage:<28}[/] {c.summary}")
    lines.append("")
    lines.append("[bold]键位[/]")
    lines.append("  [cyan]↑ / ↓                       [/] 翻历史输入")
    lines.append("  [cyan]Ctrl+C                      [/] 中断当前 stage / 退出")
    lines.append("  [cyan]Ctrl+E                      [/] 打开 endpoints 设置")
    lines.append("  [cyan]?                           [/] 显示本帮助")
    lines.append("  [cyan]Tab                         [/] 在 ``:`` 提示中补全命令")
    return "\n".join(lines)
