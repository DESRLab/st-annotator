from __future__ import annotations

from importlib import metadata
from unittest.mock import Mock

import pytest

from sta import plugin as sta_plugin


def test_load_plugins_has_stable_registration_order(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    loaded: list[str] = []

    def discovered_plugin(value: str) -> Mock:
        plugin = Mock(value=value)
        plugin.load.return_value = lambda: loaded.append(value)
        return plugin

    plugins = [
        discovered_plugin("sta_z.plugin:register"),
        discovered_plugin("sta_a.plugin:register"),
        discovered_plugin("sta_m.plugin:register"),
    ]
    monkeypatch.setattr(metadata, "entry_points", lambda *, group: plugins)
    monkeypatch.setattr(sta_plugin, "_loaded_plugins", set())

    sta_plugin.load_plugins()

    assert loaded == [
        "sta_a.plugin:register",
        "sta_m.plugin:register",
        "sta_z.plugin:register",
    ]
