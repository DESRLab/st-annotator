from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from unittest.mock import MagicMock

import click
import pytz
from click.testing import CliRunner

import pytest

from sta.cli import porter
from sta.common.filesystem import FileSystemPath
from sta.config import AppConfig
from sta.models.label.repo import LabelsetBranchPublic
from sta.models.source.group import SourceGroupPublic
from sta.models.user import UserPublic
from sta.testing.plugin_import import cli_app_ctx


def patch_porter_ctx(
    monkeypatch: pytest.MonkeyPatch,
) -> tuple[MagicMock, list[AppConfig]]:
    """Replaces the porter's app/session contexts with DB-less equivalents."""
    monkeypatch.setattr(porter, "app_ctx", cli_app_ctx)

    session = MagicMock(name="session")
    entered_configs: list[AppConfig] = []

    @contextmanager
    def fake_session_ctx(config: AppConfig) -> Iterator[MagicMock]:
        entered_configs.append(config)
        yield session

    monkeypatch.setattr(porter, "session_ctx", fake_session_ctx)

    return session, entered_configs


def test_extract_config_returns_app_config(app_config: AppConfig):
    ctx = click.Context(click.Command("stub"), obj=app_config)

    assert porter.extract_config(ctx) is app_config


def test_extract_config_asserts_when_app_config_missing():
    ctx = click.Context(click.Command("stub"))

    with pytest.raises(AssertionError):
        porter.extract_config(ctx)


@pytest.mark.parametrize(
    ("extra_args", "expected_tz"),
    [
        ([], None),
        (["--tz", "UTC"], pytz.utc),
        (["--tz", "Asia/Tokyo"], pytz.timezone("Asia/Tokyo")),
    ],
    ids=["no-tz", "tz-utc", "tz-tokyo"],
)
def test_source_import_by_st_command(
    extra_args: list[str],
    expected_tz: object,
    app_config: AppConfig,
    stub_user: UserPublic,
    stub_source_group: SourceGroupPublic,
    monkeypatch: pytest.MonkeyPatch,
):
    session, entered_configs = patch_porter_ctx(monkeypatch)
    monkeypatch.setattr(porter, "prompt_login", lambda _: stub_user)
    monkeypatch.setattr(porter, "prompt_source_group", lambda *_: stub_source_group)

    calls: list[dict[str, object]] = []
    plugin = click.Group("mock-source-plugin")
    command = porter.source_import_by_st_command(plugin)(lambda **kwargs: calls.append(kwargs))
    assert plugin.commands["import-by-st"] is command

    result = CliRunner().invoke(command, ["data_info.csv", *extra_args], obj=app_config)

    assert result.exit_code == 0, result.output
    assert calls == [
        {
            "current_user": stub_user,
            "session": session,
            "source_group": stub_source_group,
            "data_info_path": "data_info.csv",
            "data_tz": expected_tz,
        }
    ]
    assert entered_configs == [app_config]
    session.commit.assert_called_once_with()


def test_source_import_by_st_command_rejects_unknown_timezone(
    app_config: AppConfig,
    stub_user: UserPublic,
    stub_source_group: SourceGroupPublic,
    monkeypatch: pytest.MonkeyPatch,
):
    session, _ = patch_porter_ctx(monkeypatch)
    monkeypatch.setattr(porter, "prompt_login", lambda _: stub_user)
    monkeypatch.setattr(porter, "prompt_source_group", lambda *_: stub_source_group)

    calls: list[dict[str, object]] = []
    command = porter.source_import_by_st_command(click.Group("mock-source-plugin"))(
        lambda **kwargs: calls.append(kwargs),
    )

    result = CliRunner().invoke(command, ["data_info.csv", "--tz", "Not/AZone"], obj=app_config)

    assert result.exit_code != 0
    assert isinstance(result.exception, pytz.UnknownTimeZoneError)
    assert calls == []
    session.commit.assert_not_called()


def test_source_export_to_filetree_command(
    app_config: AppConfig,
    stub_user: UserPublic,
    stub_source_group: SourceGroupPublic,
    monkeypatch: pytest.MonkeyPatch,
):
    session, entered_configs = patch_porter_ctx(monkeypatch)
    monkeypatch.setattr(porter, "prompt_login", lambda _: stub_user)
    monkeypatch.setattr(porter, "prompt_source_group", lambda *_: stub_source_group)

    calls: list[dict[str, object]] = []
    plugin = click.Group("mock-source-plugin")
    command = porter.source_export_to_filetree_command(plugin)(
        lambda **kwargs: calls.append(kwargs)
    )
    assert plugin.commands["export-to-filetree"] is command

    result = CliRunner().invoke(command, ["exports"], obj=app_config)

    assert result.exit_code == 0, result.output
    assert len(calls) == 1
    assert calls[0]["current_user"] is stub_user
    assert calls[0]["session"] is session
    assert calls[0]["source_group"] is stub_source_group
    assert isinstance(calls[0]["export_dir"], FileSystemPath)
    assert calls[0]["export_dir"].path == Path("exports")
    assert entered_configs == [app_config]
    session.commit.assert_called_once_with()


@pytest.mark.parametrize(
    ("extra_args", "expected_tz"),
    [
        ([], None),
        (["--tz", "UTC"], pytz.utc),
    ],
    ids=["no-tz", "tz-utc"],
)
def test_label_import_by_st_command(
    extra_args: list[str],
    expected_tz: object,
    app_config: AppConfig,
    stub_user: UserPublic,
    stub_label_branch: LabelsetBranchPublic,
    monkeypatch: pytest.MonkeyPatch,
):
    session, entered_configs = patch_porter_ctx(monkeypatch)
    monkeypatch.setattr(porter, "prompt_login", lambda _: stub_user)
    monkeypatch.setattr(porter, "prompt_label_branch", lambda *_: stub_label_branch)

    calls: list[dict[str, object]] = []
    plugin = click.Group("mock-label-plugin")
    command = porter.label_import_by_st_command(plugin)(lambda **kwargs: calls.append(kwargs))
    assert plugin.commands["import-by-st"] is command

    result = CliRunner().invoke(command, ["data_info.csv", *extra_args], obj=app_config)

    assert result.exit_code == 0, result.output
    assert calls == [
        {
            "current_user": stub_user,
            "session": session,
            "label_branch": stub_label_branch,
            "data_info_path": "data_info.csv",
            "data_tz": expected_tz,
        }
    ]
    assert entered_configs == [app_config]
    session.commit.assert_called_once_with()


def test_label_export_by_src_command(
    app_config: AppConfig,
    stub_user: UserPublic,
    stub_label_branch: LabelsetBranchPublic,
    monkeypatch: pytest.MonkeyPatch,
):
    session, entered_configs = patch_porter_ctx(monkeypatch)
    monkeypatch.setattr(porter, "prompt_login", lambda _: stub_user)
    monkeypatch.setattr(porter, "prompt_label_branch", lambda *_: stub_label_branch)

    calls: list[dict[str, object]] = []
    plugin = click.Group("mock-label-plugin")
    command = porter.label_export_by_src_command(plugin)(lambda **kwargs: calls.append(kwargs))
    assert plugin.commands["export-by-src"] is command

    result = CliRunner().invoke(command, ["exports"], obj=app_config)

    assert result.exit_code == 0, result.output
    assert len(calls) == 1
    assert calls[0]["current_user"] is stub_user
    assert calls[0]["session"] is session
    assert calls[0]["label_branch"] is stub_label_branch
    assert isinstance(calls[0]["export_dir"], FileSystemPath)
    assert calls[0]["export_dir"].path == Path("exports")
    assert entered_configs == [app_config]
    session.commit.assert_called_once_with()
