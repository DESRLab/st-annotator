from decimal import Decimal
from pathlib import Path

import numpy as np
from numpy.testing import assert_array_equal

from sta.common.filesystem import FileSystemPath
from sta.common.spatial import Transform
from sta.services.config import AppConfig
from sta.services.filesystem import filesystem_ctx
from sta.services.models.source.group import SourceGroupPublic
from sta.services.models.user import UserPublic
from sta.services.session import session_ctx
from sta_gmesh.domain.source.data import metadata as metadata_domain
from sta_gmesh.domain.source.data.data import open_data
from sta_gmesh.filesystem import GroundMeshData
from sta_gmesh.models.source.data import GroundMeshMetadataCreate, GroundMeshMetadataUpdate


def _assert_ground_mesh_data(data: GroundMeshData, *, expected_xyz: list[list[float]]) -> None:
    assert_array_equal(
        data.xyz,
        np.array(expected_xyz, dtype=np.float64),
    )
    assert_array_equal(
        data.faces,
        np.array([[0, 1, 2]], dtype=np.int32),
    )


def test_register_ground_mesh_and_update_transform(
    app_config: AppConfig,
    root_user: UserPublic,
    source_group: SourceGroupPublic,
    tmp_path: Path,
) -> None:
    with filesystem_ctx(app_config):
        mesh_path = FileSystemPath.from_uri(f"{tmp_path.name}/sample_mesh.obj")
        mesh_path.parent.mkdir(parents=True, exist_ok=True)
        with mesh_path.open("w") as mesh_file:
            mesh_file.write("v 0 0 0\n")
            mesh_file.write("v 1 0 0\n")
            mesh_file.write("v 0 1 0\n")
            mesh_file.write("f 1 2 3\n")

        with session_ctx(app_config) as session:
            ground_mesh = metadata_domain.create_data(
                current_user=root_user,
                session=session,
                data=GroundMeshMetadataCreate(
                    uri=mesh_path.as_uri(),
                    group_id=source_group.id,
                ).update_from_transform(Transform.from_optional()),
            )
            session.commit()

            ground_mesh = metadata_domain.read_data(
                current_user=root_user,
                session=session,
                id=ground_mesh.id,
            )
            _assert_ground_mesh_data(
                open_data(root_user, session, ground_mesh),
                expected_xyz=[
                    [0, 0, 0],
                    [1, 0, 0],
                    [0, 1, 0],
                ],
            )

            ground_mesh = metadata_domain.update_data(
                current_user=root_user,
                session=session,
                id=ground_mesh.id,
                data=GroundMeshMetadataUpdate(
                    translate_x=Decimal("10"),
                    translate_y=Decimal("20"),
                    translate_z=Decimal("30"),
                ),
            )
            session.commit()

            _assert_ground_mesh_data(
                open_data(root_user, session, ground_mesh),
                expected_xyz=[
                    [10, 20, 30],
                    [11, 20, 30],
                    [10, 21, 30],
                ],
            )
