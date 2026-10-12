"""Exercise plugin registration and configuration inheritance without a database."""

from pathlib import Path

import click
from click.testing import CliRunner

from sta.cli import plugins_cli

from sta_datasets import common, plugin
from sta_datasets.cli import cli


def test_standalone_commands_are_available_without_configuration():
    result = CliRunner().invoke(cli, ["--help"])
    assert result.exit_code == 0
    assert "3rscan" in result.output
    assert "semantickitti" in result.output
    for command in ("3rscan", "semantickitti"):
        result = CliRunner().invoke(cli, [command, "--help"])
        assert result.exit_code == 0, result.output
        assert "--config" in result.output


def test_register_adds_the_same_group_to_the_plugin_host():
    plugin.register()
    assert plugins_cli.commands["datasets"] is cli


def test_importer_inherits_parent_configuration_and_accepts_override(tmp_path: Path):
    inherited = tmp_path / "inherited.json"
    override = tmp_path / "override.json"
    inherited.touch()
    override.touch()
    received: list[Path | None] = []

    @click.group()
    @click.option("-c", "--config", "config_path", type=click.Path(path_type=Path))
    def host(config_path: Path):
        pass

    @host.command()
    @common.config_path_option()
    def dataset(config_path: Path | None):
        received.append(common.resolve_config_path(config_path))

    result = CliRunner().invoke(host, ["-c", str(inherited), "dataset"])
    assert result.exit_code == 0, result.output
    result = CliRunner().invoke(host, ["-c", str(inherited), "dataset", "-c", str(override)])
    assert result.exit_code == 0, result.output
    assert received == [inherited, override]
