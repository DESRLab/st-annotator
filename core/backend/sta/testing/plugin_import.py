from __future__ import annotations

import csv
from collections.abc import Callable
from contextlib import contextmanager
from dataclasses import replace
from pathlib import Path
from typing import Any, cast

import click
from click.testing import CliRunner, Result

import pytest

from sta.cli import plugins_cli
from sta.common.filesystem import FilesystemConfig
from sta.config import AppConfig
from sta.filesystem import filesystem_ctx
from sta.models.label.repo import LabelsetBranchPublic
from sta.models.source.group import SourceGroupPublic
from sta.models.user import UserPublic

TIMESTAMP = "2024-01-01T00:00:00+00:00"


def app_config_with_fs_root(app_config: AppConfig, fs_root: Path) -> AppConfig:
    return replace(app_config, fs_config=FilesystemConfig(root=fs_root))


@pytest.fixture
def plugin_import_app_config(test_app_config: AppConfig, tmp_path: Path) -> AppConfig:
    return app_config_with_fs_root(test_app_config, tmp_path)


def write_data_info(fs_root: Path, data_path: Path, *, stem: str = "data_info") -> str:
    data_info_path = fs_root / f"{stem}.csv"
    with data_info_path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["file_uri", "min_timestamp", "max_timestamp"])
        writer.writeheader()
        writer.writerow(
            {
                "file_uri": data_path.relative_to(fs_root).as_posix(),
                "min_timestamp": TIMESTAMP,
                "max_timestamp": TIMESTAMP,
            }
        )

    # Import metadata is CLI input, so relative paths resolve from the caller's
    # working directory rather than the configured data filesystem root.
    return str(data_info_path)


def import_by_st_command(plugin_name: str, register: Callable[[], Any]) -> click.Command:
    if plugin_name not in plugins_cli.commands:
        register()
    plugin_group = cast(click.Group, plugins_cli.commands[plugin_name])
    return plugin_group.commands["import-by-st"]


@contextmanager
def cli_app_ctx(app_config: AppConfig, *, debug: bool = False):
    del debug
    with filesystem_ctx(app_config):
        yield


def invoke_source_import(
    monkeypatch: Any,
    command: click.Command,
    *,
    app_config: AppConfig,
    root_user: UserPublic,
    source_group: SourceGroupPublic,
    data_info_path: str,
) -> Result:
    from sta import entrypoints
    from sta.cli import porter

    monkeypatch.setattr(entrypoints, "load_plugins", lambda: None)
    monkeypatch.setattr(porter, "app_ctx", cli_app_ctx)
    monkeypatch.setattr(porter, "prompt_login", lambda session: root_user)
    monkeypatch.setattr(porter, "prompt_source_group", lambda user, session: source_group)

    return CliRunner().invoke(command, [data_info_path], obj=app_config)


def invoke_label_import(
    monkeypatch: Any,
    command: click.Command,
    *,
    app_config: AppConfig,
    root_user: UserPublic,
    label_branch: LabelsetBranchPublic,
    data_info_path: str,
) -> Result:
    from sta import entrypoints
    from sta.cli import porter

    monkeypatch.setattr(entrypoints, "load_plugins", lambda: None)
    monkeypatch.setattr(porter, "app_ctx", cli_app_ctx)
    monkeypatch.setattr(porter, "prompt_login", lambda session: root_user)
    monkeypatch.setattr(porter, "prompt_label_branch", lambda user, session: label_branch)

    return CliRunner().invoke(command, [data_info_path], obj=app_config)
