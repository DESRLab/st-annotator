from pathlib import Path

import numpy as np
from numpy.testing import assert_array_equal

import open3d as o3d

from sta.common.filesystem import FileSystemPath
from sta.config import AppConfig
from sta.filesystem import filesystem_ctx
from sta_gmesh.filesystem import GroundMeshData, GroundMeshFileIO


def _make_triangle_mesh() -> GroundMeshData:
    mesh = o3d.geometry.TriangleMesh(
        vertices=o3d.utility.Vector3dVector(
            np.array(
                [
                    [0.0, 0.0, 0.0],
                    [1.0, 0.0, 0.0],
                    [0.0, 1.0, 0.0],
                ],
                dtype=np.float64,
            ),
        ),
        triangles=o3d.utility.Vector3iVector([[0, 1, 2]]),
    )
    return GroundMeshData(mesh)


def test_write_and_read_round_trip(
    plugin_import_app_config: AppConfig,
    tmp_path: Path,
):
    gmesh_io = GroundMeshFileIO()
    gmesh = _make_triangle_mesh()

    with filesystem_ctx(plugin_import_app_config):
        path = FileSystemPath.from_uri("meshes/round_trip.obj")
        assert not path.exists()

        gmesh_io.write(path, gmesh)
        assert path.exists()
        assert (tmp_path / "meshes" / "round_trip.obj").is_file()

        loaded = gmesh_io.read(path)

    assert loaded.num_points == 3
    assert loaded.num_faces == 1
    assert_array_equal(loaded.xyz, gmesh.xyz)
    assert_array_equal(loaded.faces, gmesh.faces)
