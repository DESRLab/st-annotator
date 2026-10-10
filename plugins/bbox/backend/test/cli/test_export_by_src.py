import uuid
from decimal import Decimal
from pathlib import Path

import click
from click.testing import CliRunner

import numpy as np

import pytest

import sta_bbox.plugin as bbox_plugin
from sta.cli import plugins_cli
from sta.common.filesystem import FileSystemPath
from sta.common.spatial import Transform
from sta.config import AppConfig
from sta.domain.label.repo.branches import read_branch
from sta.domain.label.repo.graph import push_commits
from sta.domain.label.repo.ops import OperationRegistry
from sta.filesystem import filesystem_ctx
from sta.models.label.repo import (
    LabelsetBranchPublic,
    LabelsetCommitInstruction,
)
from sta.models.label.spec import ObjectClassSelectionPublic
from sta.models.source.group import SourceGroupPublic
from sta.models.user import UserPublic
from sta.session import session_ctx
from sta.testing.plugin_import import cli_app_ctx
from sta_bbox.domain.label.repo.ops.box import (
    AssignEntityParams,
    BoxOperationType,
    CreateParams as BoxCreateParams,
    register_box_ops,
)
from sta_bbox.domain.label.repo.ops.track import (
    CreateParams as TrackCreateParams,
    TrackOperationType,
    register_track_ops,
)
from sta_bbox.filesystem import LabelsFileIO
from sta_bbox.models.label.data import (
    BoxType,
    TruncDecimalCoord3,
    TruncDecimalSize3,
)
from sta_pcd.domain.source.data import metadata as pcd_domain
from sta_pcd.domain.source.spec import specs as pcd_specs_domain
from sta_pcd.models.configs import PointCloudConfig
from sta_pcd.models.source.data import PointCloudMetadataCreate
from sta_pcd.models.source.spec import PointCloudSpecCreate


def _export_by_src_command() -> click.Command:
    if "bbox" not in plugins_cli.commands:
        bbox_plugin.register()
    return plugins_cli.commands["bbox"].commands["export-by-src"]


def _seed_labels(
    session,
    *,
    root_user: UserPublic,
    op_registry: OperationRegistry,
    branch: LabelsetBranchPublic,
    objclass_id: int,
):
    """Pushes one track plus boxes near, mid and far from the source data."""
    register_box_ops(op_registry)
    register_track_ops(op_registry)

    ones = TruncDecimalCoord3.ones()
    size = TruncDecimalSize3.from_tuple(ones.to_tuple())

    (track_id, near_box_id, mid_box_id, far_box_id) = push_commits(
        current_user=root_user,
        session=session,
        op_registry=op_registry,
        branch_id=branch.id,
        commit_instrs=[
            LabelsetCommitInstruction(
                op_name=TrackOperationType.CREATE,
                op_params=TrackCreateParams(gt_class_id=objclass_id),
            ),
            LabelsetCommitInstruction(
                op_name=BoxOperationType.CREATE,
                op_params=BoxCreateParams(
                    type=BoxType.CUBOID,
                    center=ones,
                    angle=Decimal("0"),
                    size=size,
                    perceived_class_id=objclass_id,
                ),
            ),
            LabelsetCommitInstruction(
                op_name=BoxOperationType.CREATE,
                op_params=BoxCreateParams(
                    type=BoxType.CUBOID,
                    center=TruncDecimalCoord3.from_tuple((Decimal("2"),) * 3),
                    angle=Decimal("0"),
                    size=size,
                    perceived_class_id=objclass_id,
                ),
            ),
            LabelsetCommitInstruction(
                op_name=BoxOperationType.CREATE,
                op_params=BoxCreateParams(
                    type=BoxType.CUBOID,
                    center=TruncDecimalCoord3.from_tuple((Decimal("10"),) * 3),
                    angle=Decimal("0"),
                    size=size,
                    perceived_class_id=objclass_id,
                ),
            ),
        ],
    )
    assert isinstance(track_id, uuid.UUID)
    assert isinstance(near_box_id, uuid.UUID)
    assert isinstance(mid_box_id, uuid.UUID)
    assert isinstance(far_box_id, uuid.UUID)

    push_commits(
        current_user=root_user,
        session=session,
        op_registry=op_registry,
        branch_id=branch.id,
        commit_instrs=[
            LabelsetCommitInstruction(
                op_name=BoxOperationType.ASSIGN_ENTITY,
                op_params=AssignEntityParams(
                    box_id=near_box_id,
                    entity_id=track_id,
                ),
            ),
        ],
    )

    session.commit()

    branch = LabelsetBranchPublic.model_validate(
        read_branch(
            current_user=root_user,
            session=session,
            id=branch.id,
        ),
    )

    return track_id, near_box_id, mid_box_id, far_box_id, branch


def test_export_by_src_writes_label_files_by_source(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    test_app_config: AppConfig,
    plugin_import_app_config: AppConfig,
    root_user: UserPublic,
    op_registry: OperationRegistry,
    labelset_branch: LabelsetBranchPublic,
    object_class_selection: ObjectClassSelectionPublic,
    source_group: SourceGroupPublic,
):
    """Exports one label file per source whose bounds overlap the labels."""
    objclass = object_class_selection.objclasses[0]

    # Write a point cloud whose bounds ([0, 2]^3) overlap only the
    # near and mid boxes, then register it as source data.
    with filesystem_ctx(plugin_import_app_config):
        pcd_path = FileSystemPath.from_uri("scene/frame1.npy")
        pcd_path.parent.mkdir(parents=True, exist_ok=True)
        with pcd_path.open("wb") as pcd_file:
            np.save(
                pcd_file,
                np.array(
                    [
                        [0, 0, 0, 0],
                        [2, 2, 2, 0],
                    ],
                    dtype=np.float32,
                ),
            )

    # The FileURI validation of `PointCloudMetadataCreate` requires
    # an active filesystem context, even outside of the command itself.
    with filesystem_ctx(plugin_import_app_config), session_ctx(test_app_config) as session:
        pcd_specs_domain.create_spec(
            current_user=root_user,
            session=session,
            data=PointCloudSpecCreate(
                name="test point cloud",
                description="",
                group_ids=[source_group.id],
                config=PointCloudConfig.default(),
            ),
        )
        session.commit()

        pcd_domain.create_data(
            current_user=root_user,
            session=session,
            data=PointCloudMetadataCreate(
                uri=pcd_path.as_uri(),
                group_id=source_group.id,
                weather=None,
            ).update_from_transform(Transform.from_optional()),
        )
        session.commit()

        track_id, near_box_id, mid_box_id, _, branch = _seed_labels(
            session,
            root_user=root_user,
            op_registry=op_registry,
            branch=labelset_branch,
            objclass_id=objclass.id,
        )

    from sta import entrypoints
    from sta.cli import porter

    monkeypatch.setattr(entrypoints, "load_plugins", lambda: None)
    monkeypatch.setattr(porter, "app_ctx", cli_app_ctx)
    monkeypatch.setattr(porter, "prompt_login", lambda session: root_user)
    monkeypatch.setattr(porter, "prompt_label_branch", lambda user, session: branch)
    monkeypatch.setattr(bbox_plugin, "prompt_source_group", lambda user, session: source_group)

    result = CliRunner().invoke(_export_by_src_command(), ["export"], obj=plugin_import_app_config)

    assert result.exit_code == 0, (result.output, result.exception)

    # The export mirrors the source filetree, naming each label file after its source.
    with filesystem_ctx(plugin_import_app_config):
        labels = LabelsFileIO().read(FileSystemPath.from_uri("export/scene/frame1.npy.json"))

    # Only the near and mid boxes overlap the source bounds; the far one is excluded.
    assert sorted(box.id for box in labels.bounding_boxes) == sorted(
        [near_box_id.int, mid_box_id.int]
    )

    # The track assigned to the near box is exported alongside it.
    (near_box,) = (box for box in labels.bounding_boxes if box.id == near_box_id.int)
    assert near_box.track is not None
    assert near_box.track.id == track_id.int


def test_export_by_src_errors_when_source_group_is_empty(
    monkeypatch: pytest.MonkeyPatch,
    test_app_config: AppConfig,
    plugin_import_app_config: AppConfig,
    root_user: UserPublic,
    op_registry: OperationRegistry,
    labelset_branch: LabelsetBranchPublic,
    object_class_selection: ObjectClassSelectionPublic,
    source_group: SourceGroupPublic,
):
    objclass = object_class_selection.objclasses[0]

    with session_ctx(test_app_config) as session:
        _, _, _, _, branch = _seed_labels(
            session,
            root_user=root_user,
            op_registry=op_registry,
            branch=labelset_branch,
            objclass_id=objclass.id,
        )

    from sta import entrypoints
    from sta.cli import porter

    monkeypatch.setattr(entrypoints, "load_plugins", lambda: None)
    monkeypatch.setattr(porter, "app_ctx", cli_app_ctx)
    monkeypatch.setattr(porter, "prompt_login", lambda session: root_user)
    monkeypatch.setattr(porter, "prompt_label_branch", lambda user, session: branch)
    monkeypatch.setattr(bbox_plugin, "prompt_source_group", lambda user, session: source_group)

    result = CliRunner().invoke(_export_by_src_command(), ["export"], obj=plugin_import_app_config)
    assert result.exit_code != 0
    assert "No source data found" in result.output or "No source data found" in str(
        result.exception
    )


def test_export_by_src_errors_when_branch_has_no_labels(
    monkeypatch: pytest.MonkeyPatch,
    plugin_import_app_config: AppConfig,
    root_user: UserPublic,
    labelset_branch: LabelsetBranchPublic,
):
    from sta import entrypoints
    from sta.cli import porter

    monkeypatch.setattr(entrypoints, "load_plugins", lambda: None)
    monkeypatch.setattr(porter, "app_ctx", cli_app_ctx)
    monkeypatch.setattr(porter, "prompt_login", lambda session: root_user)
    monkeypatch.setattr(porter, "prompt_label_branch", lambda user, session: labelset_branch)

    result = CliRunner().invoke(_export_by_src_command(), ["export"], obj=plugin_import_app_config)
    assert result.exit_code != 0
    assert "No labels found" in result.output or "No labels found" in str(result.exception)
