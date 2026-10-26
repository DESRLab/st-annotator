from __future__ import annotations

import logging
import subprocess
from importlib import metadata
from unittest.mock import MagicMock

import click
from click.testing import CliRunner

import pytest

from sta import plugin as sta_plugin
from sta.cli import PluginCLIGroup, cli as sta_cli
from sta.config import AppConfig
from sta.entrypoints import app_ctx


def test_help():
    assert subprocess.call(["python", "-m", "sta", "--help"]) == 0
    assert subprocess.call(["sta", "--help"]) == 0


def test_builtin_serve_defers_plugin_loading_until_application_logging_is_configured(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture, app_config: AppConfig
):
    plugin = MagicMock(value="sta_datasets.plugin:register")
    plugin.load.return_value = lambda: None
    monkeypatch.setattr(metadata, "entry_points", lambda *, group: [plugin])
    monkeypatch.setattr(sta_plugin, "_loaded_plugins", set())
    monkeypatch.setattr(sta_plugin.logger, "handlers", [caplog.handler])
    monkeypatch.setattr(sta_plugin.logger, "propagate", False)

    group = PluginCLIGroup(name="stub")

    @group.command()
    def serve():
        assert not sta_plugin._loaded_plugins
        with app_ctx(app_config):
            pass

    previous_level = sta_plugin.logger.level
    try:
        with caplog.at_level(logging.INFO):
            # The built-in command leaves plugin loading to app_ctx, which sets INFO.
            sta_plugin.logger.setLevel(logging.WARNING)
            result = CliRunner().invoke(group, ["serve"])
    finally:
        sta_plugin.logger.setLevel(previous_level)

    assert result.exit_code == 0, result.output
    assert sta_plugin._loaded_plugins == {"sta_datasets.plugin:register"}
    assert [record.getMessage() for record in caplog.records if record.name == "sta"] == [
        "Loading plugin: sta_datasets.plugin:register"
    ]


def test_serve_help_does_not_load_plugins(monkeypatch: pytest.MonkeyPatch):
    load_plugins = MagicMock(name="load_plugins")
    monkeypatch.setattr(sta_plugin, "load_plugins", load_plugins)
    monkeypatch.setattr(sta_cli, "_plugins_loaded", False)

    result = CliRunner().invoke(sta_cli, ["serve", "--help"])

    assert result.exit_code == 0, result.output
    assert "--config" in result.output
    load_plugins.assert_not_called()


def test_unregistered_command_loads_plugins_and_dispatches(monkeypatch: pytest.MonkeyPatch):
    group = PluginCLIGroup(name="stub")

    def register_command():
        @group.command()
        def contributed():
            click.echo("Plugin command executed")

    load_plugins = MagicMock(side_effect=register_command)
    monkeypatch.setattr(sta_plugin, "load_plugins", load_plugins)

    result = CliRunner().invoke(group, ["contributed"])

    assert result.exit_code == 0, result.output
    assert "Plugin command executed" in result.output
    load_plugins.assert_called_once_with()


def test_plugin_cli_group_dispatch_paths_share_one_plugin_load(monkeypatch: pytest.MonkeyPatch):
    load_plugins = MagicMock(name="load_plugins")
    monkeypatch.setattr(sta_plugin, "load_plugins", load_plugins)

    group = PluginCLIGroup(name="stub")

    @group.command()
    def noop():
        pass

    runner = CliRunner()

    # `--help` formats the command listing, which goes through `list_commands`.
    help_result = runner.invoke(group, ["--help"])
    assert help_result.exit_code == 0, help_result.output
    assert "noop" in help_result.output

    ctx = click.Context(group)
    assert group.list_commands(ctx) == ["noop"]
    assert group.get_command(ctx, "noop") is group.commands["noop"]
    assert group.get_command(ctx, "missing") is None

    # Invoking a subcommand goes through `get_command` and `invoke`.
    run_result = runner.invoke(group, ["noop"])
    assert run_result.exit_code == 0, run_result.output

    load_plugins.assert_called_once_with()


def test_cli_help_lists_core_commands_and_loads_plugins_once(monkeypatch: pytest.MonkeyPatch):
    load_plugins = MagicMock(name="load_plugins")
    monkeypatch.setattr(sta_plugin, "load_plugins", load_plugins)
    monkeypatch.setattr(sta_cli, "_plugins_loaded", False)

    runner = CliRunner()

    result = runner.invoke(sta_cli, ["--help"])
    assert result.exit_code == 0, result.output
    for name in ("init", "serve", "plugins", "bench"):
        assert name in result.output

    # Invoking a subcommand through the group runs the root group callback
    # and must not load the plugins a second time.
    result = runner.invoke(sta_cli, ["serve", "--help"])
    assert result.exit_code == 0, result.output

    load_plugins.assert_called_once_with()


def test_cli_rejects_unknown_command(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(sta_plugin, "load_plugins", lambda: None)

    result = CliRunner().invoke(sta_cli, ["definitely-not-a-command"])

    assert result.exit_code == 2
    assert "definitely-not-a-command" in result.output
