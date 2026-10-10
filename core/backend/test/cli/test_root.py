from __future__ import annotations

import subprocess
from unittest.mock import MagicMock

import click
from click.testing import CliRunner

import pytest

from sta import plugin as sta_plugin
from sta.cli import PluginCLIGroup, cli as sta_cli


def test_help():
    assert subprocess.call(["python", "-m", "sta", "--help"]) == 0
    assert subprocess.call(["sta", "--help"]) == 0


def test_load_plugins_guard_runs_loader_only_once(monkeypatch: pytest.MonkeyPatch):
    load_plugins = MagicMock(name="load_plugins")
    monkeypatch.setattr(sta_plugin, "load_plugins", load_plugins)

    group = PluginCLIGroup(name="stub")
    group._load_plugins()
    group._load_plugins()

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
