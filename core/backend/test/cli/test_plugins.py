from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import click
from click.testing import CliRunner

import pytest

from sta import plugin as sta_plugin
from sta.cli import plugins_cli
from sta.common.database import InMemoryDatabaseConfig
from sta.common.filesystem import FilesystemConfig
from sta.config import AppConfig

IN_MEMORY_DB_PATH = "sta.common.database.config:InMemoryDatabaseConfig"
FS_FACTORY_PATH = f"{__name__}:fs_config_factory"

_fs_factory_root: Path | None = None


def fs_config_factory() -> FilesystemConfig:
    """A zero-argument factory resolving to a filesystem config rooted at a test-controlled path."""
    assert _fs_factory_root is not None
    return FilesystemConfig(root=_fs_factory_root)


@pytest.fixture
def fs_factory_root(tmp_path, monkeypatch) -> Path:
    root = tmp_path / "fs-root"
    monkeypatch.setattr(sys.modules[__name__], "_fs_factory_root", root)
    return root


def test_help():
    assert subprocess.call(["python", "-m", "sta", "plugins", "--help"]) == 0
    assert subprocess.call(["sta", "plugins", "--help"]) == 0


def write_app_config_file(tmp_path: Path, *, db: str, fs: str) -> Path:
    path = tmp_path / "app-config.json"
    path.write_text(json.dumps({"db": db, "fs": fs}))
    return path


@pytest.fixture
def no_plugin_discovery(monkeypatch: pytest.MonkeyPatch) -> None:
    """Keep the tests identical whether or not plugin packages are installed."""
    monkeypatch.setattr(sta_plugin, "load_plugins", lambda: None)


def test_plugins_echoes_help_when_invoked_without_subcommand(
    tmp_path, fs_factory_root, no_plugin_discovery
):
    config_path = write_app_config_file(tmp_path, db=IN_MEMORY_DB_PATH, fs=FS_FACTORY_PATH)

    result = CliRunner().invoke(plugins_cli, ["-c", str(config_path)])

    assert result.exit_code == 0, result.output
    assert "Usage:" in result.output
    assert "Access the command-line interface of a ST Annotator plugin." in result.output


def test_plugins_stores_app_config_in_ctx_obj(tmp_path, fs_factory_root, no_plugin_discovery):
    config_path = write_app_config_file(tmp_path, db=IN_MEMORY_DB_PATH, fs=FS_FACTORY_PATH)

    captured: list[object] = []

    @click.command()
    @click.pass_context
    def probe(ctx: click.Context) -> None:
        captured.append(ctx.obj)

    plugins_cli.add_command(probe, name="probe")
    try:
        result = CliRunner().invoke(plugins_cli, ["-c", str(config_path), "probe"])
    finally:
        del plugins_cli.commands["probe"]

    assert result.exit_code == 0, result.output
    (config,) = captured
    assert isinstance(config, AppConfig)
    assert isinstance(config.db_config, InMemoryDatabaseConfig)
    assert isinstance(config.fs_config, FilesystemConfig)
    assert config.fs_config.root == fs_factory_root


def test_plugins_rejects_unparseable_config_file(tmp_path, no_plugin_discovery):
    bad_path = tmp_path / "app-config.json"
    bad_path.write_text("this is not json")

    result = CliRunner().invoke(plugins_cli, ["-c", str(bad_path)])

    assert result.exit_code != 0
    assert isinstance(result.exception, ValueError)
    assert "Failed to parse application config" in str(result.exception)


def test_plugins_requires_config_option(no_plugin_discovery):
    result = CliRunner().invoke(plugins_cli, [])

    assert result.exit_code == 2
    assert "Missing option" in result.output
