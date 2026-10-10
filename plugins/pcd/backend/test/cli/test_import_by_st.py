from pathlib import Path

import numpy as np

from sqlmodel import select

import pytest

from sta.common.database.execution import sql_column
from sta.common.spatial import OptionalVector3
from sta.config import AppConfig
from sta.models.job import Job
from sta.models.source.group import SourceGroupPublic
from sta.models.user import UserPublic
from sta.session import session_ctx
from sta.testing.plugin_import import (
    import_by_st_command,
    invoke_source_import,
    write_data_info,
)
from sta_pcd.domain.source.data import metadata as metadata_domain
from sta_pcd.domain.source.data.data import bounds_config_identity
from sta_pcd.domain.source.spec import specs as specs_domain
from sta_pcd.models.configs import PointCloudConfig
from sta_pcd.models.configs.pcd import CropBoxConfig
from sta_pcd.models.source.spec import PointCloudSpecCreate
from sta_pcd.ops.preprocessing import CropBoxParams, PreprocessingOperationType
from sta_pcd.plugin import register


def test_import_by_st_reads_point_cloud_and_creates_metadata(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    test_app_config: AppConfig,
    plugin_import_app_config: AppConfig,
    root_user: UserPublic,
    source_group: SourceGroupPublic,
):
    points_path = tmp_path / "points.bin"
    np.array(
        [
            [1.0, 2.0, 3.0, 0.5],
            [4.0, 5.0, 6.0, 0.6],
        ],
        dtype=np.float32,
    ).tofile(points_path)
    data_info_path = write_data_info(tmp_path, points_path)

    with session_ctx(test_app_config) as session:
        specs_domain.create_spec(
            current_user=root_user,
            session=session,
            data=PointCloudSpecCreate(
                name="test point cloud",
                group_ids=[source_group.id],
                config=PointCloudConfig.default(),
            ),
        )
        session.commit()

    result = invoke_source_import(
        monkeypatch,
        import_by_st_command("pcd", register),
        app_config=plugin_import_app_config,
        root_user=root_user,
        source_group=source_group,
        data_info_path=data_info_path,
    )

    assert result.exit_code == 0, result.output
    with session_ctx(test_app_config) as session:
        (metadata,) = metadata_domain.list_datas(
            current_user=root_user,
            session=session,
            group_id=source_group.id,
        )

    assert metadata.uri == "points.bin"
    assert metadata.min_x == 1
    assert metadata.max_x == 4
    assert metadata.min_timestamp == metadata.max_timestamp
    assert metadata.bounds_config_hash == bounds_config_identity(PointCloudConfig.default()), (
        "the import drained the sweep it queued, so the box is vouched for"
    )
    assert metadata.bounds_error is None


def test_import_by_st_derives_bounds_under_the_group_configuration(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    test_app_config: AppConfig,
    plugin_import_app_config: AppConfig,
    root_user: UserPublic,
    source_group: SourceGroupPublic,
):
    """An imported scan's box is the configured reading's result, not the importer's guess.

    The importer reads a scan and transforms it directly, applying no preprocessor, so its
    box is an approximation whenever the group's configuration crops. Deferral reconciles
    them: the import leaves each record awaiting derivation and drains the queue before it
    returns, so what lands in the database is the cropped box -- and a scan the crop keeps
    only one point of collapses to that point.
    """
    points_path = tmp_path / "crop-me.bin"
    np.array(
        [
            [1.0, 2.0, 3.0, 0.5],
            [4.0, 5.0, 6.0, 0.6],
        ],
        dtype=np.float32,
    ).tofile(points_path)
    data_info_path = write_data_info(tmp_path, points_path)

    config = PointCloudConfig(
        channel_headers=["x", "y", "z", "intensity"],
        dtype="float32",
        preprocessors=[
            CropBoxConfig(
                op_name=PreprocessingOperationType.CROP_BOX,
                op_params=CropBoxParams(
                    keep=True,
                    box_min=OptionalVector3(x=-0.5, y=-0.5, z=-0.5),
                    box_max=OptionalVector3(x=2.5, y=3.5, z=4.5),
                ),
            ),
        ],
    )
    with session_ctx(test_app_config) as session:
        specs_domain.create_spec(
            current_user=root_user,
            session=session,
            data=PointCloudSpecCreate(
                name="cropping point cloud",
                group_ids=[source_group.id],
                config=config,
            ),
        )
        session.commit()

    result = invoke_source_import(
        monkeypatch,
        import_by_st_command("pcd", register),
        app_config=plugin_import_app_config,
        root_user=root_user,
        source_group=source_group,
        data_info_path=data_info_path,
    )

    assert result.exit_code == 0, result.output
    with session_ctx(test_app_config) as session:
        (metadata,) = metadata_domain.list_datas(
            current_user=root_user,
            session=session,
            group_id=source_group.id,
        )

        assert (metadata.min_x, metadata.max_x) == (1.0, 1.0), (
            "the importer's own reading saw both points; only the configured crop collapses them"
        )
        assert metadata.bounds_config_hash == bounds_config_identity(config)
        assert not metadata_domain.pending_bounds_group_ids(
            session=session, group_ids={source_group.id}
        )
        assert (
            session.exec(
                select(Job.id).where(
                    sql_column(Job.kind) == metadata_domain.reconcile_kind,
                    sql_column(Job.state) == "pending",
                )
            ).all()
            == []
        )
