# SPDX-License-Identifier: MPL-2.0
"""Headless TUI tests for the Settings → Endpoints screen.

Uses Textual's `Pilot` to drive the UI. No real network: the "Test"
action is monkeypatched to return a synthetic Capability.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from textual.app import App

from app.config import providers_store
from app.config.providers_store import StoredEndpoint
from app.core.contract.capability import Capability, CapFlag
from app.tui.endpoints import EndpointsScreen


@pytest.fixture(autouse=True)
def _master_pass(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("FOLIO_MASTER_PASSPHRASE", "tui-test-pass")
    import keyring
    from keyring.backends.fail import Keyring as FailKeyring

    keyring.set_keyring(FailKeyring())


class _Harness(App[None]):
    def on_mount(self) -> None:
        self.push_screen(EndpointsScreen())


@pytest.mark.asyncio
async def test_screen_renders_existing_endpoint(_isolate_folio_home: Path) -> None:
    providers_store.upsert(
        StoredEndpoint(label="alpha", base_url="https://a/v1", default_model="m1"),
        api_key="sk-a",
    )
    async with _Harness().run_test() as pilot:
        await pilot.pause()
        screen = pilot.app.screen
        assert isinstance(screen, EndpointsScreen)
        # 1 endpoint, 5 columns rendered.
        assert screen._table.row_count == 1


@pytest.mark.asyncio
async def test_add_flow_persists_endpoint(_isolate_folio_home: Path) -> None:
    async with _Harness().run_test() as pilot:
        await pilot.pause()
        await pilot.press("a")  # action_add
        await pilot.pause()

        screen = pilot.app.screen
        assert isinstance(screen, EndpointsScreen)
        from textual.widgets import Input

        screen._form.query_one("#f-label", Input).value = "beta"
        screen._form.query_one("#f-base-url", Input).value = "https://b/v1"
        screen._form.query_one("#f-api-key", Input).value = "sk-beta"
        screen._form.query_one("#f-default-model", Input).value = "mb"
        await pilot.pause()
        await pilot.click("#f-save")
        await pilot.pause()

    # After the app exits, verify side effects on disk.
    ep = providers_store.get("beta")
    assert ep is not None and ep.base_url == "https://b/v1"
    assert providers_store.has_secret("beta")


@pytest.mark.asyncio
async def test_delete_removes_endpoint(_isolate_folio_home: Path) -> None:
    providers_store.upsert(
        StoredEndpoint(label="gamma", base_url="u", default_model="m"), api_key="sk"
    )
    async with _Harness().run_test() as pilot:
        await pilot.pause()
        await pilot.press("d")
        await pilot.pause()
    assert providers_store.get("gamma") is None


@pytest.mark.asyncio
async def test_env_endpoint_cannot_be_deleted(
    _isolate_folio_home: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("FOLIO_LLM_ENDPOINTS", "envep")
    monkeypatch.setenv("FOLIO_LLM_ENVEP_BASE_URL", "https://e/v1")
    monkeypatch.setenv("FOLIO_LLM_ENVEP_API_KEY", "k")
    monkeypatch.setenv("FOLIO_LLM_ENVEP_DEFAULT_MODEL", "m")

    async with _Harness().run_test() as pilot:
        await pilot.pause()
        await pilot.press("d")  # should refuse silently in the status line
        await pilot.pause()
        screen = pilot.app.screen
        assert isinstance(screen, EndpointsScreen)
        assert "read-only" in screen._last_status or screen._table.row_count == 1


@pytest.mark.asyncio
async def test_test_action_calls_probe(
    _isolate_folio_home: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    providers_store.upsert(
        StoredEndpoint(label="probed", base_url="u", default_model="m"), api_key="sk"
    )

    async def fake_probe(label: str) -> Capability:
        return Capability(
            label=label,
            base_url="u",
            default_model="m",
            flags=frozenset({CapFlag.JSON_SCHEMA}),
            context_window=128_000,
        )

    monkeypatch.setattr(providers_store, "probe", fake_probe)

    async with _Harness().run_test() as pilot:
        await pilot.pause()
        await pilot.press("t")
        await pilot.pause()
        await pilot.pause()
        screen = pilot.app.screen
        assert isinstance(screen, EndpointsScreen)
        text = screen._last_status
        assert "probed" in text
        assert "json_schema" in text
