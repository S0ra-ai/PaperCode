# SPDX-License-Identifier: MPL-2.0
"""Settings → Endpoints panel (TUI).

Per AGENTS.md § 1.1 this widget is *dumb*: it renders the current
config snapshot, captures user input, and delegates every persistent
side effect to ``app.config.providers_store``. No HTTP and no LLM
logic live here — the "Test" action calls ``Provider.probe()`` via
the registry, which itself goes through the standard provider stack.

Layout
------

::

    ┌─ Endpoints ───────────────────────────────────────────────┐
    │ label    source  base_url               default_model     │
    │ deepseek env     api.deepseek.com/v1    deepseek-chat     │
    │ openai   tui     api.openai.com/v1      gpt-4o-mini   ✓   │
    └───────────────────────────────────────────────────────────┘
    [a]dd  [e]dit  [d]elete  [t]est  [r]efresh  [esc] back

Endpoints sourced from ``.env`` (``source == "env"``) are read-only
and rendered with an "(env)" tag. TUI-managed endpoints (``"tui"``)
land in ``~/.folio/config.yml`` for the static fields and the
secrets backend (``app.config.secrets``) for the API key.
"""

from __future__ import annotations

import asyncio
from typing import ClassVar

from textual.app import ComposeResult
from textual.binding import BindingType
from textual.containers import Horizontal, Vertical
from textual.screen import Screen
from textual.widgets import (
    Button,
    DataTable,
    Footer,
    Header,
    Input,
    Label,
    Static,
)

from app.config import providers_store
from app.config.providers_store import StoredEndpoint


class _EndpointForm(Vertical):
    """Add/edit form. Pure widget — never writes config itself."""

    DEFAULT_CSS = """
    _EndpointForm { padding: 1 2; border: round $accent; height: auto; }
    _EndpointForm > Horizontal { height: auto; }
    _EndpointForm Label { width: 18; }
    _EndpointForm Input { width: 1fr; }
    """

    def __init__(self, *, initial: StoredEndpoint | None = None) -> None:
        super().__init__()
        self._initial = initial

    def compose(self) -> ComposeResult:
        i = self._initial
        yield Label("[b]Add / edit endpoint[/]")
        yield Horizontal(
            Label("label"), Input(value=i.label if i else "", id="f-label")
        )
        yield Horizontal(
            Label("base_url"), Input(value=i.base_url if i else "", id="f-base-url")
        )
        yield Horizontal(
            Label("api_key"),
            Input(
                value="",
                id="f-api-key",
                placeholder="(unchanged)" if i else "sk-...",
                password=True,
            ),
        )
        yield Horizontal(
            Label("default_model"),
            Input(value=i.default_model if i else "", id="f-default-model"),
        )
        yield Horizontal(
            Label("models (comma)"),
            Input(value=",".join(i.models) if i else "", id="f-models"),
        )
        yield Horizontal(
            Button("Save", id="f-save", variant="success"),
            Button("Cancel", id="f-cancel"),
        )


class EndpointsScreen(Screen[None]):
    """Settings → Endpoints panel."""

    BINDINGS: ClassVar[list[BindingType]] = [
        ("a", "add", "Add"),
        ("e", "edit", "Edit"),
        ("d", "delete", "Delete"),
        ("t", "test", "Test"),
        ("r", "refresh", "Refresh"),
        ("escape", "app.pop_screen", "Back"),
    ]

    DEFAULT_CSS = """
    EndpointsScreen DataTable { height: 1fr; }
    EndpointsScreen #status { dock: bottom; padding: 0 1; }
    """

    def __init__(self) -> None:
        super().__init__()
        self._table: DataTable[str] = DataTable(zebra_stripes=True, cursor_type="row")
        self._status = Static("", id="status")
        self._form: _EndpointForm | None = None
        self._editing: StoredEndpoint | None = None
        self._last_status: str = ""

    # ----- compose / render -----

    def compose(self) -> ComposeResult:
        yield Header()
        yield self._table
        yield self._status
        yield Footer()

    def on_mount(self) -> None:
        self._table.add_columns("label", "source", "base_url", "default_model", "key?")
        self._refresh_table()

    def _refresh_table(self) -> None:
        self._table.clear()
        for ep in providers_store.list_all():
            tag = ep.source
            display_url = ep.base_url
            has_key = (
                "✓"
                if (ep.source == "env" or providers_store.has_secret(ep.label))
                else " "
            )
            self._table.add_row(
                ep.label,
                f"({tag})" if tag != "tui" else tag,
                display_url,
                ep.default_model,
                has_key,
                key=ep.label,
            )
        self._status.update(
            f"{self._table.row_count} endpoint(s). "
            f"[dim]a/e/d/t/r — esc to go back. (env) entries are read-only.[/]"
        )

    # ----- helpers -----

    def _selected_label(self) -> str | None:
        if self._table.row_count == 0:
            return None
        try:
            row_key = self._table.coordinate_to_cell_key(
                self._table.cursor_coordinate
            ).row_key
        except Exception:
            return None
        return str(row_key.value) if row_key.value is not None else None

    def _selected_endpoint(self) -> StoredEndpoint | None:
        label = self._selected_label()
        if label is None:
            return None
        return providers_store.get(label)

    def _flash(self, msg: str) -> None:
        self._last_status = msg
        self._status.update(msg)

    def _open_form(self, *, initial: StoredEndpoint | None) -> None:
        if self._form is not None:
            self._form.remove()
        self._editing = initial
        self._form = _EndpointForm(initial=initial)
        self.mount(self._form, before=self._status)

    def _close_form(self) -> None:
        if self._form is not None:
            self._form.remove()
            self._form = None
        self._editing = None

    # ----- actions -----

    def action_add(self) -> None:
        self._open_form(initial=None)

    def action_edit(self) -> None:
        ep = self._selected_endpoint()
        if ep is None:
            self._flash("[yellow]Nothing selected.[/]")
            return
        if ep.source == "env":
            self._flash("[yellow]env-sourced endpoints are read-only.[/]")
            return
        self._open_form(initial=ep)

    def action_delete(self) -> None:
        ep = self._selected_endpoint()
        if ep is None:
            self._flash("[yellow]Nothing selected.[/]")
            return
        if ep.source == "env":
            self._flash("[yellow]env-sourced endpoints can't be deleted via TUI.[/]")
            return
        providers_store.delete(ep.label)
        self._refresh_table()
        self._flash(f"[green]Deleted[/] {ep.label}.")

    def action_test(self) -> None:
        ep = self._selected_endpoint()
        if ep is None:
            self._flash("[yellow]Nothing selected.[/]")
            return
        self._flash(f"Probing {ep.label}…")
        self.run_worker(self._do_probe(ep.label), exclusive=True)

    def action_refresh(self) -> None:
        self._refresh_table()
        self._flash("[green]Refreshed.[/]")

    async def _do_probe(self, label: str) -> None:
        try:
            cap = await providers_store.probe(label)
        except Exception as exc:
            self._flash(f"[red]probe {label} failed:[/] {exc!r}")
            return
        flags = ",".join(sorted(f.value for f in cap.flags)) or "(none)"
        ctx = cap.context_window or "?"
        self._flash(f"[green]{label}[/] flags={flags} ctx={ctx}")

    # ----- form callbacks -----

    def on_button_pressed(self, event: Button.Pressed) -> None:
        if self._form is None:
            return
        if event.button.id == "f-cancel":
            self._close_form()
            return
        if event.button.id != "f-save":
            return
        try:
            label = self._form.query_one("#f-label", Input).value.strip()
            base_url = self._form.query_one("#f-base-url", Input).value.strip()
            api_key = self._form.query_one("#f-api-key", Input).value.strip()
            default_model = self._form.query_one(
                "#f-default-model", Input
            ).value.strip()
            models_raw = self._form.query_one("#f-models", Input).value.strip()
        except Exception as exc:
            self._flash(f"[red]form error:[/] {exc!r}")
            return

        if not label or not base_url or not default_model:
            self._flash("[red]label, base_url and default_model are required.[/]")
            return
        models = tuple(m.strip() for m in models_raw.split(",") if m.strip())

        keep_existing_key = self._editing is not None and not api_key
        try:
            providers_store.upsert(
                StoredEndpoint(
                    label=label,
                    base_url=base_url,
                    default_model=default_model,
                    models=models,
                    source="tui",
                ),
                api_key=None if keep_existing_key else api_key,
            )
        except providers_store.ReadOnlyEndpointError as exc:
            self._flash(f"[red]{exc}[/]")
            return
        self._close_form()
        self._refresh_table()
        self._flash(f"[green]Saved[/] {label}.")


def run() -> None:
    """Standalone launcher (useful for `folio settings endpoints`)."""
    from textual.app import App

    class _Standalone(App[None]):
        def on_mount(self) -> None:
            self.push_screen(EndpointsScreen())

    asyncio.run(_Standalone().run_async())
