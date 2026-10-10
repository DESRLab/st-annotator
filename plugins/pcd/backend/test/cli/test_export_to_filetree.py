"""Tests for the pcd ``export-to-filetree`` CLI command.

The command reads every point cloud referenced by the group's metadata, applies the stored
transform, and writes it under the export directory. It is exercised through :class:`CliRunner`
with the login/source-group prompts monkeypatched, mirroring the import-by-st test.
"""

from __future__ import annotations

from pathlib import Path

from click.testing import CliRunner

import numpy as np
from numpy.testing import assert_array_equal

from sqlmodel import Session

import pytest

from sta.cli import plugins_cli
from sta.common.filesystem import FileSystemPath
from sta.common.spatial import Transform
from sta.config import AppConfig
from sta.filesystem import filesystem_ctx
from sta.models.source.group import SourceGroupPublic
from sta.models.user import UserPublic
from sta.testing.plugin_import import cli_app_ctx
from sta_pcd.domain.source.data import metadata as metadata_domain
from sta_pcd.domain.source.spec import specs as specs_domain
from sta_pcd.models.configs import PointCloudConfig
from sta_pcd.models.source.data import PointCloudMetadataCreate
from sta_pcd.models.source.spec import PointCloudSpecCreate

from ..register_plugin import register_pcd_once

POINTS = np.array(
    [
        [1.0, 2.0, 3.0, 0.5],
        [4.0, 5.0, 6.0, 0.6],
    ],
    dtype=np.float32,
)


def export_command():
    register_pcd_once()
    return plugins_cli.commands["pcd"].commands["export-to-filetree"]


def seed_point_cloud(
    *,
    app_config: AppConfig,
    root_user: UserPublic,
    session: Session,
    source_group: SourceGroupPublic,
) -> str:
    """Writes a .bin point file and creates the matching spec and metadata; returns the URI."""
    uri = "points.bin"
    with filesystem_ctx(app_config):
        with FileSystemPath.from_uri(uri).open("wb") as f:
            POINTS.tofile(f)

        specs_domain.create_spec(
            current_user=root_user,
            session=session,
            data=PointCloudSpecCreate(
                name="export point cloud",
                group_ids=[source_group.id],
                config=PointCloudConfig.default(),
            ),
        )
        session.commit()

        metadata_domain.create_data(
            current_user=root_user,
            session=session,
            data=PointCloudMetadataCreate(
                uri=uri,
                group_id=source_group.id,
                weather=None,
            ).update_from_transform(Transform.from_optional()),
        )
        session.commit()

    return uri


def invoke_source_export(
    monkeypatch: pytest.MonkeyPatch,
    *,
    app_config: AppConfig,
    root_user: UserPublic,
    source_group: SourceGroupPublic,
    export_dir: str,
):
    from sta import entrypoints
    from sta.cli import porter

    monkeypatch.setattr(entrypoints, "load_plugins", lambda: None)
    monkeypatch.setattr(porter, "app_ctx", cli_app_ctx)
    monkeypatch.setattr(porter, "prompt_login", lambda session: root_user)
    monkeypatch.setattr(porter, "prompt_source_group", lambda user, session: source_group)

    return CliRunner().invoke(export_command(), [export_dir], obj=app_config)


def test_export_to_filetree_writes_point_clouds(
    monkeypatch: pytest.MonkeyPatch,
    test_app_config: AppConfig,
    plugin_import_app_config: AppConfig,
    root_user: UserPublic,
    source_group: SourceGroupPublic,
    session: Session,
    tmp_path: Path,
):
    _ = test_app_config
    seed_point_cloud(
        app_config=plugin_import_app_config,
        root_user=root_user,
        session=session,
        source_group=source_group,
    )

    result = invoke_source_export(
        monkeypatch,
        app_config=plugin_import_app_config,
        root_user=root_user,
        source_group=source_group,
        export_dir="export",
    )

    assert result.exit_code == 0, result.output

    exported = tmp_path / "export" / "points.bin"
    assert exported.is_file()
    assert_array_equal(np.fromfile(exported, dtype=np.float32).reshape(POINTS.shape), POINTS)
