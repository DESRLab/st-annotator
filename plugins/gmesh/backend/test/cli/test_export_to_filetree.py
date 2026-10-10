from pathlib import Path

from click.testing import CliRunner

import pytest

from sta import entrypoints
from sta.cli import plugins_cli, porter
from sta.common.spatial import Transform
from sta.config import AppConfig
from sta.filesystem import filesystem_ctx
from sta.models.source.group import SourceGroupPublic
from sta.models.user import UserPublic
from sta.session import session_ctx
from sta.testing.plugin_import import cli_app_ctx
from sta_gmesh.domain.source.data import metadata as metadata_domain
from sta_gmesh.models.source.data import GroundMeshMetadataCreate
from sta_gmesh.plugin import register


def _export_to_filetree_command():
    if "gmesh" not in plugins_cli.commands:
        register()
    return plugins_cli.commands["gmesh"].commands["export-to-filetree"]


def _invoke_source_export(
    monkeypatch: pytest.MonkeyPatch,
    *,
    app_config: AppConfig,
    root_user: UserPublic,
    source_group: SourceGroupPublic,
    export_dir: str,
):
    monkeypatch.setattr(entrypoints, "load_plugins", lambda: None)
    monkeypatch.setattr(porter, "app_ctx", cli_app_ctx)
    monkeypatch.setattr(porter, "prompt_login", lambda session: root_user)
    monkeypatch.setattr(porter, "prompt_source_group", lambda user, session: source_group)

    return CliRunner().invoke(_export_to_filetree_command(), [export_dir], obj=app_config)


def test_export_to_filetree_writes_obj_files(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    test_app_config: AppConfig,
    plugin_import_app_config: AppConfig,
    root_user: UserPublic,
    source_group: SourceGroupPublic,
):
    with filesystem_ctx(plugin_import_app_config):
        (tmp_path / "mesh.obj").write_text(
            "\n".join(
                [
                    "v 0 0 0",
                    "v 1 0 0",
                    "v 0 1 0",
                    "f 1 2 3",
                ],
            ),
            encoding="utf-8",
        )

        with session_ctx(test_app_config) as session:
            metadata_domain.create_data(
                current_user=root_user,
                session=session,
                data=GroundMeshMetadataCreate(
                    uri="mesh.obj",
                    group_id=source_group.id,
                ).update_from_transform(Transform.from_optional()),
            )
            session.commit()

        result = _invoke_source_export(
            monkeypatch,
            app_config=plugin_import_app_config,
            root_user=root_user,
            source_group=source_group,
            export_dir="export",
        )

    assert result.exit_code == 0, (result.output, result.exception)
    assert (tmp_path / "export" / "mesh.obj").is_file()
