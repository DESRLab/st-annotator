"""Coverage for the `vector export-by-src` CLI command (`sta_vector.plugin.vector_export_by_arc`).

The command matches label elements to source data by spatiotemporal overlap and writes
one labels JSON file per source instance. These tests run the command through CliRunner
with the login/branch/source-group prompts monkeypatched, against the real database and a
temporary filesystem root, and assert on the files written (the plugin's write path).
"""

from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path

from click.testing import CliRunner

import pytest

from sta import entrypoints
from sta.cli import plugins_cli, porter
from sta.common.filesystem import FileSystemPath
from sta.common.spatial import (
    DecimalCoord3,
    OptionalDecimalCoord3,
    PartialSTBounds,
    Transform,
)
from sta.config import AppConfig
from sta.domain.label.repo.branches import read_branch
from sta.domain.label.repo.graph import push_commits
from sta.domain.label.repo.ops import OperationRegistry
from sta.domain.label.repo.ops.special import register_special_ops
from sta.filesystem import filesystem_ctx
from sta.models.label.repo import LabelsetBranchPublic, LabelsetCommitInstruction
from sta.models.source.group import SourceGroupPublic
from sta.models.user import UserPublic
from sta.session import session_ctx
from sta.testing.plugin_import import cli_app_ctx
from sta_pcd.models.source.data import PointCloudMetadata
from sta_vector import plugin as vector_plugin
from sta_vector.domain.label.repo.ops.vector import (
    CreateParams,
    VectorOperationType,
    register_vector_ops,
)
from sta_vector.filesystem import LabelsFileIO
from sta_vector.models.label.data import PolygonVertices, VectorType

TIMESTAMP = datetime(2024, 1, 1, tzinfo=timezone.utc)
EXPORT_DIR = "exports"


def _polygon(offset: Decimal) -> PolygonVertices:
    return PolygonVertices(
        type=VectorType.POLYGON,
        coords=[
            DecimalCoord3(x=offset, y=offset, z=Decimal(0)),
            DecimalCoord3(x=offset + 10, y=offset, z=Decimal(0)),
            DecimalCoord3(x=offset + 10, y=offset + 10, z=Decimal(0)),
            DecimalCoord3(x=offset, y=offset + 10, z=Decimal(0)),
        ],
    )


def _export_command():
    # The entry-point registration (via the DB fixtures) has already added the group.
    return plugins_cli.commands["vector"].commands["export-by-src"]


def _seed_source_metadata(
    config: AppConfig,
    root_user: UserPublic,
    source_group: SourceGroupPublic,
    *,
    uri: str,
) -> None:
    with session_ctx(config) as session:
        record = PointCloudMetadata(
            group_id=source_group.id,
            uri=uri,
            min_x=Decimal(0),
            min_y=Decimal(0),
            min_z=Decimal(0),
            max_x=Decimal(20),
            max_y=Decimal(20),
            max_z=Decimal(20),
            min_timestamp=TIMESTAMP,
            max_timestamp=TIMESTAMP,
        )
        record.update_from_transform(Transform.from_optional())
        session.add(record)
        session.commit()


def _seed_vectors(
    config: AppConfig,
    root_user: UserPublic,
    branch: LabelsetBranchPublic,
    offsets: list[Decimal],
) -> LabelsetBranchPublic:
    registry = OperationRegistry()
    register_special_ops(registry)
    register_vector_ops(registry)

    with session_ctx(config) as session:
        push_commits(
            current_user=root_user,
            session=session,
            op_registry=registry,
            branch_id=branch.id,
            commit_instrs=[
                LabelsetCommitInstruction(
                    op_name=VectorOperationType.CREATE,
                    op_params=CreateParams(vertices=_polygon(offset), timestamp=TIMESTAMP),
                )
                for offset in offsets
            ],
        )
        session.commit()

        # The export command only reads ``group_id``/``head_hash`` off the branch, so the
        # refreshed record (with the advanced head) is returned directly.
        return read_branch(current_user=root_user, session=session, id=branch.id)


def _invoke_export(
    monkeypatch: pytest.MonkeyPatch,
    *,
    app_config: AppConfig,
    root_user: UserPublic,
    label_branch: LabelsetBranchPublic,
    source_group: SourceGroupPublic,
) -> object:
    monkeypatch.setattr(entrypoints, "load_plugins", lambda: None)
    monkeypatch.setattr(porter, "app_ctx", cli_app_ctx)
    monkeypatch.setattr(porter, "prompt_login", lambda session: root_user)
    monkeypatch.setattr(porter, "prompt_label_branch", lambda user, session: label_branch)
    monkeypatch.setattr(vector_plugin, "prompt_source_group", lambda user, session: source_group)

    return CliRunner().invoke(_export_command(), [EXPORT_DIR], obj=app_config)


def test_export_by_src_writes_label_files_per_source(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    test_app_config: AppConfig,
    plugin_import_app_config: AppConfig,
    root_user: UserPublic,
    labelset_branch: LabelsetBranchPublic,
    source_group: SourceGroupPublic,
):
    """Exports one label file per source whose bounds overlap the vectors."""
    _seed_source_metadata(
        test_app_config,
        root_user,
        source_group,
        uri="data/points.bin",
    )
    # One vector inside the source bounds, one far outside them.
    branch = _seed_vectors(
        test_app_config,
        root_user,
        labelset_branch,
        [Decimal(0), Decimal(100)],
    )

    result = _invoke_export(
        monkeypatch,
        app_config=plugin_import_app_config,
        root_user=root_user,
        label_branch=branch,
        source_group=source_group,
    )

    assert result.exit_code == 0, (result.output, result.exception)

    # The export mirrors the source filetree, naming each label file after its source.
    with filesystem_ctx(plugin_import_app_config):
        labels = LabelsFileIO().read(FileSystemPath.from_uri(f"{EXPORT_DIR}/data/points.bin.json"))

    (vector,) = labels.vectors
    assert vector.vector_type == VectorType.POLYGON
    # The WKB round trip closes the polygon ring, repeating the first point.
    assert [v.to_tuple() for v in vector.vertices] == [
        (0.0, 0.0, 0.0),
        (10.0, 0.0, 0.0),
        (10.0, 10.0, 0.0),
        (0.0, 10.0, 0.0),
        (0.0, 0.0, 0.0),
    ]


@dataclass(frozen=True)
class _HashableSource:
    """A hashable stand-in for a source metadata row."""

    id: int
    uri: str
    st_bounds: PartialSTBounds


def _source_bounds() -> PartialSTBounds:
    return PartialSTBounds(
        min_coords=OptionalDecimalCoord3(x=Decimal(0), y=Decimal(0), z=Decimal(0)),
        max_coords=OptionalDecimalCoord3(x=Decimal(20), y=Decimal(20), z=Decimal(20)),
        min_timestamp=TIMESTAMP,
        max_timestamp=TIMESTAMP,
    )


def test_export_by_src_errors_when_destination_exists(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    test_app_config: AppConfig,
    plugin_import_app_config: AppConfig,
    root_user: UserPublic,
    labelset_branch: LabelsetBranchPublic,
    source_group: SourceGroupPublic,
):
    branch = _seed_vectors(
        test_app_config,
        root_user,
        labelset_branch,
        [Decimal(0)],
    )

    dst = tmp_path / EXPORT_DIR / "data" / "points.bin.json"
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text("{}", encoding="utf-8")

    source = _HashableSource(id=1, uri="data/points.bin", st_bounds=_source_bounds())
    monkeypatch.setattr(vector_plugin.pcd_domain, "list_datas", lambda **_: [source])

    result = _invoke_export(
        monkeypatch,
        app_config=plugin_import_app_config,
        root_user=root_user,
        label_branch=branch,
        source_group=source_group,
    )

    assert result.exit_code != 0
    assert isinstance(result.exception, RuntimeError)
    assert "File already exists" in str(result.exception)


def test_export_by_src_errors_when_no_labels(
    monkeypatch: pytest.MonkeyPatch,
    test_app_config: AppConfig,
    plugin_import_app_config: AppConfig,
    root_user: UserPublic,
    labelset_branch: LabelsetBranchPublic,
    source_group: SourceGroupPublic,
):
    result = _invoke_export(
        monkeypatch,
        app_config=plugin_import_app_config,
        root_user=root_user,
        label_branch=labelset_branch,
        source_group=source_group,
    )

    assert result.exit_code != 0
    assert isinstance(result.exception, RuntimeError)
    assert "No labels found" in str(result.exception)


def test_export_by_src_errors_when_no_source_data(
    monkeypatch: pytest.MonkeyPatch,
    test_app_config: AppConfig,
    plugin_import_app_config: AppConfig,
    root_user: UserPublic,
    labelset_branch: LabelsetBranchPublic,
    source_group: SourceGroupPublic,
):
    branch = _seed_vectors(
        test_app_config,
        root_user,
        labelset_branch,
        [Decimal(0)],
    )

    result = _invoke_export(
        monkeypatch,
        app_config=plugin_import_app_config,
        root_user=root_user,
        label_branch=branch,
        source_group=source_group,
    )

    assert result.exit_code != 0
    assert isinstance(result.exception, RuntimeError)
    assert "No source data found" in str(result.exception)
