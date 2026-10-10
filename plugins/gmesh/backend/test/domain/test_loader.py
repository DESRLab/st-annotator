from pathlib import Path

import numpy as np
from numpy.testing import assert_array_equal

import pytest

from sta.common.filesystem import FileSystemPath
from sta.common.spatial import Transform
from sta.config import AppConfig
from sta.domain.editor.loader import SOURCE_DATA_LOADERS
from sta.domain.source.groups import create_group
from sta.filesystem import filesystem_ctx
from sta.models.frame import FramePublic, WorkType
from sta.models.source.group import SourceGroupCreate, SourceGroupPublic
from sta.models.user import UserPublic
from sta.session import session_ctx
from sta_gmesh.domain.source.data import metadata as metadata_domain
from sta_gmesh.models.source.data import GroundMeshMetadataCreate


def _write_triangle_obj(fs_root: Path, name: str, *, offset: float = 0.0) -> None:
    (fs_root / name).write_text(
        "\n".join(
            [
                f"v {offset} 0 0",
                f"v {offset + 1} 0 0",
                f"v {offset} 1 0",
                "f 1 2 3",
            ],
        ),
        encoding="utf-8",
    )


def _make_frame(*, source_group_id: int | None, frame_id: int = 1) -> FramePublic:
    return FramePublic(
        id=frame_id,
        task_id=1,
        account_id=1,
        work_type=WorkType.ANNOTATE,
        source_group_id=source_group_id,
        label_branch_id=None,
    )


def test_get_data_bulk_returns_merged_mesh_bytes(
    test_app_config: AppConfig,
    plugin_import_app_config: AppConfig,
    root_user: UserPublic,
    source_group: SourceGroupPublic,
    tmp_path: Path,
):
    loader = SOURCE_DATA_LOADERS["gmesh"]

    with filesystem_ctx(plugin_import_app_config):
        _write_triangle_obj(tmp_path, "mesh_a.obj")
        _write_triangle_obj(tmp_path, "mesh_b.obj", offset=10.0)
        _write_triangle_obj(tmp_path, "mesh_missing.obj", offset=20.0)

        with session_ctx(test_app_config) as session:
            metadata_domain.create_data(
                current_user=root_user,
                session=session,
                data=GroundMeshMetadataCreate(
                    uri="mesh_a.obj",
                    group_id=source_group.id,
                ).update_from_transform(Transform.from_optional()),
            )
            session.commit()

            frame = _make_frame(source_group_id=source_group.id)

            # A single registered mesh is returned as binary vertex + face buffers
            response = loader.get_data_bulk(
                current_user=root_user,
                session=session,
                frames=[frame],
                other_args={},
            )
            assert response.headers["X-Vertices-ByteLength"] == "36"
            assert response.headers["X-Faces-ByteLength"] == "12"

            content = response.body
            vertices = np.frombuffer(content[:36], dtype=np.float32).reshape(-1, 3)
            faces = np.frombuffer(content[36:], dtype=np.int32).reshape(-1, 3)
            assert_array_equal(
                vertices,
                np.array([[0, 0, 0], [1, 0, 0], [0, 1, 0]], dtype=np.float32),
            )
            assert_array_equal(faces, np.array([[0, 1, 2]], dtype=np.int32))

            # A frame for a group without any registered meshes returns an empty response
            empty_group = create_group(
                current_user=root_user,
                session=session,
                data=SourceGroupCreate(name="empty"),
            )
            session.commit()

            empty_response = loader.get_data_bulk(
                current_user=root_user,
                session=session,
                frames=[_make_frame(source_group_id=empty_group.id, frame_id=2)],
                other_args={},
            )
            assert empty_response.body == b""
            assert empty_response.headers["X-Vertices-ByteLength"] == "0"
            assert empty_response.headers["X-Faces-ByteLength"] == "0"

            # Missing mesh files are skipped; the remaining meshes are still returned
            metadata_domain.create_data(
                current_user=root_user,
                session=session,
                data=GroundMeshMetadataCreate(
                    uri="mesh_missing.obj",
                    group_id=source_group.id,
                ).update_from_transform(Transform.from_optional()),
            )
            session.commit()
            FileSystemPath.from_uri("mesh_missing.obj").unlink()

            partial_response = loader.get_data_bulk(
                current_user=root_user,
                session=session,
                frames=[frame],
                other_args={},
            )
            assert partial_response.headers["X-Vertices-ByteLength"] == "36"
            assert partial_response.headers["X-Faces-ByteLength"] == "12"

            # A group whose only mesh file is missing also returns an empty response
            metadata_domain.create_data(
                current_user=root_user,
                session=session,
                data=GroundMeshMetadataCreate(
                    uri="mesh_b.obj",
                    group_id=empty_group.id,
                ).update_from_transform(Transform.from_optional()),
            )
            session.commit()
            FileSystemPath.from_uri("mesh_b.obj").unlink()

            all_missing_response = loader.get_data_bulk(
                current_user=root_user,
                session=session,
                frames=[_make_frame(source_group_id=empty_group.id, frame_id=5)],
                other_args={},
            )
            assert all_missing_response.body == b""
            assert all_missing_response.headers["X-Vertices-ByteLength"] == "0"
            assert all_missing_response.headers["X-Faces-ByteLength"] == "0"

            with pytest.raises(NotImplementedError, match="Multiple frames"):
                loader.get_data_bulk(
                    current_user=root_user,
                    session=session,
                    frames=[frame, _make_frame(source_group_id=source_group.id, frame_id=3)],
                    other_args={},
                )

            with pytest.raises(RuntimeError, match="No source group"):
                loader.get_data_bulk(
                    current_user=root_user,
                    session=session,
                    frames=[_make_frame(source_group_id=None, frame_id=4)],
                    other_args={},
                )
