import json
import uuid
from datetime import datetime, timezone
from pathlib import Path

import click
from click.testing import CliRunner, Result

import numpy as np

import pytest

from sta import entrypoints
from sta.cli import plugins_cli, porter
from sta.common.spatial import DecimalCoord3, Transform
from sta.config import AppConfig
from sta.filesystem import filesystem_ctx
from sta.models.label.repo import LabelsetBranchPublic
from sta.models.label.spec import ObjectClassSelectionPublic
from sta.models.source.group import SourceGroupPublic
from sta.models.user import UserPublic
from sta.session import session_ctx
from sta.testing.plugin_import import cli_app_ctx
from sta_pcd.domain.source.data import metadata as pcd_domain
from sta_pcd.domain.source.spec import specs as pcd_specs_domain
from sta_pcd.models.source.data import PointCloudMetadataCreate
from sta_pcd.models.source.spec import PointCloudConfig, PointCloudSpecCreate
from sta_segmentation import plugin as segmentation_plugin
from sta_segmentation.domain.label.data import element as element_domain, entity as entity_domain
from sta_segmentation.models.label.data import (
    DistinctiveLevel,
    LabelInstance,
    LabelSelection,
    OcclusionLevel,
)
from sta_segmentation.plugin import register

TIMESTAMP = datetime(2024, 1, 1, tzinfo=timezone.utc)

POINTS = np.array(
    [
        [1.0, 2.0, 3.0, 0.5],
        [4.0, 5.0, 6.0, 0.6],
    ],
    dtype=np.float32,
)


def export_by_src_command() -> click.Command:
    if "segmentation" not in plugins_cli.commands:
        register()

    return plugins_cli.commands["segmentation"].commands["export-by-src"]


def invoke_label_export(
    monkeypatch: pytest.MonkeyPatch,
    command: click.Command,
    *,
    app_config: AppConfig,
    root_user: UserPublic,
    label_branch: LabelsetBranchPublic,
    source_group: SourceGroupPublic,
    export_dir: str,
) -> Result:
    monkeypatch.setattr(entrypoints, "load_plugins", lambda: None)
    monkeypatch.setattr(porter, "app_ctx", cli_app_ctx)
    monkeypatch.setattr(porter, "prompt_login", lambda session: root_user)
    monkeypatch.setattr(porter, "prompt_label_branch", lambda user, session: label_branch)
    monkeypatch.setattr(
        segmentation_plugin,
        "prompt_source_group",
        lambda user, session: source_group,
    )

    return CliRunner().invoke(command, [export_dir], obj=app_config)


def seed_labels(
    test_app_config: AppConfig,
    root_user: UserPublic,
    labelset_branch: LabelsetBranchPublic,
    object_class_selection: ObjectClassSelectionPublic,
) -> dict[str, LabelInstance | LabelSelection]:
    """Seed an instance plus six selections at the branch head.

    - `main` belongs to the instance and carries both classes;
    - `instanceless` has no entity but a perceived class;
    - `no_perceived` belongs to the instance but has no perceived class;
    - `classless` has neither and must be skipped by the exporter;
    - `orphan` references a nonexistent entity and must be skipped. It is
      seeded bypassing the domain, simulating a pre-existing row from before
      entity_id validation;
    - `unmatched` lies outside every source's bounds and must not be exported.
    """
    gt_class_id = object_class_selection.objclasses[0].id

    instance = LabelInstance(
        group_id=labelset_branch.group_id,
        commit_hash=labelset_branch.head_hash,
        is_black=True,
        gt_class_id=gt_class_id,
    )

    def selection(points: list[DecimalCoord3], **rest) -> LabelSelection:
        return LabelSelection.from_points(
            group_id=labelset_branch.group_id,
            commit_hash=labelset_branch.head_hash,
            points=points,
            timestamp=TIMESTAMP,
            **rest,
        )

    selections = {
        "main": selection(
            [DecimalCoord3(x=1, y=2, z=3), DecimalCoord3(x=4, y=5, z=6)],
            entity_id=instance.id,
            perceived_class_id=gt_class_id,
            distinctive_lv=DistinctiveLevel.SATISFACTORY,
            occlusion_lv=OcclusionLevel.POOR,
        ),
        "instanceless": selection(
            [DecimalCoord3(x=2, y=3, z=4)],
            perceived_class_id=gt_class_id,
        ),
        "no_perceived": selection(
            [DecimalCoord3(x=1.5, y=2.5, z=3.5)],
            entity_id=instance.id,
        ),
        "classless": selection([DecimalCoord3(x=3, y=4, z=5)]),
        "orphan": selection(
            [DecimalCoord3(x=4, y=5, z=6)],
            entity_id=uuid.uuid4(),
            perceived_class_id=gt_class_id,
        ),
        "unmatched": selection(
            [DecimalCoord3(x=100, y=100, z=100)],
            entity_id=instance.id,
            perceived_class_id=gt_class_id,
        ),
    }

    orphan = selections.pop("orphan")

    with session_ctx(test_app_config) as session:
        entity_domain.bulk_create_datas(
            current_user=root_user,
            session=session,
            data=[instance],
        )
        element_domain.bulk_create_datas(
            current_user=root_user,
            session=session,
            data=list(selections.values()),
        )
        session.add(orphan)

        session.commit()

    return {"instance": instance, "orphan": orphan, **selections}


def seed_source_metadata(
    test_app_config: AppConfig,
    plugin_import_app_config: AppConfig,
    root_user: UserPublic,
    source_group: SourceGroupPublic,
    *,
    tmp_path: Path,
) -> None:
    (tmp_path / "points.bin").write_bytes(POINTS.tobytes())

    with filesystem_ctx(plugin_import_app_config), session_ctx(test_app_config) as session:
        pcd_specs_domain.create_spec(
            current_user=root_user,
            session=session,
            data=PointCloudSpecCreate(
                name="test point cloud",
                group_ids=[source_group.id],
                config=PointCloudConfig.default(),
            ),
        )
        pcd_domain.create_data(
            current_user=root_user,
            session=session,
            data=PointCloudMetadataCreate(
                uri="points.bin",
                group_id=source_group.id,
                weather=None,
            ).update_from_transform(Transform.from_optional()),
        )

        session.commit()


def test_export_by_src_writes_label_files_per_source(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    test_app_config: AppConfig,
    plugin_import_app_config: AppConfig,
    root_user: UserPublic,
    labelset_branch: LabelsetBranchPublic,
    object_class_selection: ObjectClassSelectionPublic,
    source_group: SourceGroupPublic,
):
    objclass = object_class_selection.objclasses[0]
    seeded = seed_labels(test_app_config, root_user, labelset_branch, object_class_selection)
    seed_source_metadata(
        test_app_config,
        plugin_import_app_config,
        root_user,
        source_group,
        tmp_path=tmp_path,
    )

    result = invoke_label_export(
        monkeypatch,
        export_by_src_command(),
        app_config=plugin_import_app_config,
        root_user=root_user,
        label_branch=labelset_branch,
        source_group=source_group,
        export_dir="exports",
    )

    assert result.exit_code == 0, result.output

    export_path = tmp_path / "exports" / "points.bin.json"
    assert export_path.is_file()
    payload = json.loads(export_path.read_text(encoding="utf-8"))

    exported_ids = {selection["id"] for selection in payload["selections"]}
    assert exported_ids == {
        seeded["main"].id.int,
        seeded["instanceless"].id.int,
        seeded["no_perceived"].id.int,
    }

    by_id = {selection["id"]: selection for selection in payload["selections"]}

    main = by_id[seeded["main"].id.int]
    assert main["points"] == [
        {"x": 1.0, "y": 2.0, "z": 3.0},
        {"x": 4.0, "y": 5.0, "z": 6.0},
    ]
    assert main["distinctive_lv"] == DistinctiveLevel.SATISFACTORY
    assert main["occlusion_lv"] == OcclusionLevel.POOR
    assert main["instance"] == {
        "id": seeded["instance"].id.int,
        "gt_class": {"name": objclass.name, "id": objclass.id},
        "is_black": True,
    }
    assert main["perceived_class"] == {"name": objclass.name, "id": objclass.id}

    instanceless = by_id[seeded["instanceless"].id.int]
    assert instanceless["instance"] is None
    assert instanceless["perceived_class"] == {"name": objclass.name, "id": objclass.id}

    # The instance's class keeps the export alive even when the selection
    # itself carries no perceived class.
    no_perceived = by_id[seeded["no_perceived"].id.int]
    assert no_perceived["instance"] is not None
    assert no_perceived["perceived_class"] is None

    # Exporting again into the same directory must fail instead of overwriting.
    rerun_result = invoke_label_export(
        monkeypatch,
        export_by_src_command(),
        app_config=plugin_import_app_config,
        root_user=root_user,
        label_branch=labelset_branch,
        source_group=source_group,
        export_dir="exports",
    )
    assert rerun_result.exit_code != 0
    assert isinstance(rerun_result.exception, RuntimeError)
    assert "already exists" in str(rerun_result.exception)


def test_export_by_src_without_labels_errors(
    monkeypatch: pytest.MonkeyPatch,
    test_app_config: AppConfig,
    plugin_import_app_config: AppConfig,
    root_user: UserPublic,
    labelset_branch: LabelsetBranchPublic,
    source_group: SourceGroupPublic,
):
    result = invoke_label_export(
        monkeypatch,
        export_by_src_command(),
        app_config=plugin_import_app_config,
        root_user=root_user,
        label_branch=labelset_branch,
        source_group=source_group,
        export_dir="exports",
    )

    assert result.exit_code != 0
    assert isinstance(result.exception, RuntimeError)
    assert "No labels found" in str(result.exception)


def test_export_by_src_without_source_data_errors(
    monkeypatch: pytest.MonkeyPatch,
    test_app_config: AppConfig,
    plugin_import_app_config: AppConfig,
    root_user: UserPublic,
    labelset_branch: LabelsetBranchPublic,
    object_class_selection: ObjectClassSelectionPublic,
    source_group: SourceGroupPublic,
):
    seed_labels(test_app_config, root_user, labelset_branch, object_class_selection)

    result = invoke_label_export(
        monkeypatch,
        export_by_src_command(),
        app_config=plugin_import_app_config,
        root_user=root_user,
        label_branch=labelset_branch,
        source_group=source_group,
        export_dir="exports",
    )

    assert result.exit_code != 0
    assert isinstance(result.exception, RuntimeError)
    assert "No source data found" in str(result.exception)


def test_export_by_src_accepts_source_records_from_the_domain(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    test_app_config: AppConfig,
    plugin_import_app_config: AppConfig,
    root_user: UserPublic,
    labelset_branch: LabelsetBranchPublic,
    object_class_selection: ObjectClassSelectionPublic,
    source_group: SourceGroupPublic,
):
    seed_labels(test_app_config, root_user, labelset_branch, object_class_selection)
    seed_source_metadata(
        test_app_config,
        plugin_import_app_config,
        root_user,
        source_group,
        tmp_path=tmp_path,
    )

    result = invoke_label_export(
        monkeypatch,
        export_by_src_command(),
        app_config=plugin_import_app_config,
        root_user=root_user,
        label_branch=labelset_branch,
        source_group=source_group,
        export_dir="exports",
    )

    if result.exception is not None:
        raise result.exception

    assert result.exit_code == 0, result.output
