from decimal import Decimal
from pathlib import Path

import numpy as np
from numpy.testing import assert_array_equal

from sta.common.filesystem import FileSystemPath
from sta.common.spatial import OptionalVector3, Transform
from sta.services.config import AppConfig
from sta.services.domain.source.groups import create_group
from sta.services.filesystem import filesystem_ctx
from sta.services.models.source.group import SourceGroupCreate, SourceGroupPublic
from sta.services.models.user import UserPublic
from sta.services.session import session_ctx
from sta_pcd.domain.source.data import metadata as metadata_domain
from sta_pcd.domain.source.data.data import open_data
from sta_pcd.domain.source.spec import specs as specs_domain
from sta_pcd.filesystem import PointCloudData
from sta_pcd.models.configs import PointCloudConfig
from sta_pcd.models.configs.pcd import CropBoxConfig
from sta_pcd.models.source.data import PointCloudMetadataCreate, PointCloudMetadataUpdate
from sta_pcd.models.source.spec import PointCloudSpecCreate, PointCloudSpecUpdate
from sta_pcd.ops.preprocessing import CropBoxParams, PreprocessingOperationType


def _assert_point_cloud_data(point_cloud_data: PointCloudData, *, expected: list[list[float]]) -> None:
    assert point_cloud_data.channel_headers == ("x", "y", "z", "intensity")
    assert_array_equal(
        point_cloud_data.pointwise_data,
        np.array(expected, dtype=np.float64),
    )


def test_register_point_cloud_and_update_processing_and_transform(
    app_config: AppConfig,
    root_user: UserPublic,
    source_group: SourceGroupPublic,
    tmp_path: Path,
):
    _ = source_group

    with filesystem_ctx(app_config):
        point_cloud_path = FileSystemPath.from_uri(f"{tmp_path.name}/sample.npy")
        point_cloud_path.parent.mkdir(parents=True, exist_ok=True)
        with point_cloud_path.open("wb") as point_cloud_file:
            np.save(
                point_cloud_file,
                np.array(
                    [
                        [0, 0, 0, 0],
                        [1, 1, 1, 0],
                        [3, 3, 3, 0],
                    ],
                    dtype=np.float32,
                ),
            )

        with session_ctx(app_config) as session:
            target_group = create_group(
                current_user=root_user,
                session=session,
                data=SourceGroupCreate(name="secondary"),
            )
            session.commit()

            point_cloud_source = specs_domain.create_spec(
                current_user=root_user,
                session=session,
                data=PointCloudSpecCreate(
                    name="test point cloud",
                    description="",
                    group_ids=[target_group.id],
                    config=PointCloudConfig.default(),
                ),
            )
            session.commit()

            point_cloud = metadata_domain.create_data(
                current_user=root_user,
                session=session,
                data=PointCloudMetadataCreate(
                    uri=point_cloud_path.as_uri(),
                    group_id=target_group.id,
                    weather=None,
                ).update_from_transform(Transform.from_optional()),
            )
            session.commit()

            point_cloud = metadata_domain.read_data(
                current_user=root_user,
                session=session,
                id=point_cloud.id,
            )
            _assert_point_cloud_data(
                open_data(root_user, session, point_cloud),
                expected=[
                    [0, 0, 0, 0],
                    [1, 1, 1, 0],
                    [3, 3, 3, 0],
                ],
            )

            point_cloud_config = PointCloudConfig(
                channel_headers=["x", "y", "z", "intensity"],
                dtype="float32",
                preprocessors=[
                    CropBoxConfig(
                        op_name=PreprocessingOperationType.CROP_BOX,
                        op_params=CropBoxParams(
                            keep=True,
                            box_min=OptionalVector3(x=0.5, y=0.5, z=0.5),
                            box_max=OptionalVector3(x=1.5, y=1.5, z=1.5),
                        ),
                    ),
                ],
            )
            specs_domain.update_spec(
                current_user=root_user,
                session=session,
                id=point_cloud_source.id,
                data=PointCloudSpecUpdate(config=point_cloud_config),
            )
            session.commit()

            point_cloud = metadata_domain.read_data(
                current_user=root_user,
                session=session,
                id=point_cloud.id,
            )
            _assert_point_cloud_data(
                open_data(root_user, session, point_cloud),
                expected=[
                    [1, 1, 1, 0],
                ],
            )

            point_cloud = metadata_domain.update_data(
                current_user=root_user,
                session=session,
                id=point_cloud.id,
                data=PointCloudMetadataUpdate(
                    translate_x=Decimal("10"),
                    translate_y=Decimal("20"),
                    translate_z=Decimal("30"),
                ),
            )
            session.commit()

            _assert_point_cloud_data(
                open_data(root_user, session, point_cloud),
                expected=[
                    [11, 21, 31, 0],
                ],
            )
