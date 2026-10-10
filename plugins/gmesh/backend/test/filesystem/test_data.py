import numpy as np
import pandas as pd

import open3d as o3d

import pytest

from sta_gmesh.filesystem import GroundMeshData
from sta_pcd.filesystem import PointCloudData

# A 5x5 planar grid spanning [0, 4] x [0, 4] at z = 0. With the default
# cloth_resolution=1.0, CSF lays out an 8x8 cloth grid over this point cloud
# (see the cloth_buffer in GroundMeshData.from_pcd), giving a deterministic mesh.
GRID_SIZE = 5
EXPECTED_NUM_POINTS = 64
EXPECTED_NUM_FACES = 98


def _make_grid_pcd() -> PointCloudData:
    xs, ys = np.meshgrid(
        np.arange(GRID_SIZE, dtype=np.float64), np.arange(GRID_SIZE, dtype=np.float64)
    )
    df = pd.DataFrame(
        {
            "x": xs.ravel(),
            "y": ys.ravel(),
            "z": np.zeros(GRID_SIZE * GRID_SIZE),
            "intensity": np.zeros(GRID_SIZE * GRID_SIZE),
        }
    )
    return PointCloudData(df)


def _assert_ground_mesh(gmesh: GroundMeshData) -> None:
    assert gmesh.num_points == EXPECTED_NUM_POINTS
    assert gmesh.num_faces == EXPECTED_NUM_FACES
    assert gmesh.xyz.shape == (EXPECTED_NUM_POINTS, 3)
    assert gmesh.faces.shape == (EXPECTED_NUM_FACES, 3)

    # Face indices must reference valid vertices
    assert gmesh.faces.min() == 0
    assert gmesh.faces.max() == EXPECTED_NUM_POINTS - 1

    # The simulated cloth of a planar point cloud must itself be planar
    assert np.abs(gmesh.xyz[:, 2]).max() == pytest.approx(0.0, abs=1e-6)

    # The cloth extends 2 cells beyond the point cloud bounds on each side
    min_coords, max_coords = gmesh.bbox
    assert min_coords.x == pytest.approx(-2.0)
    assert min_coords.y == pytest.approx(-2.0)
    assert max_coords.x == pytest.approx(5.0)
    assert max_coords.y == pytest.approx(5.0)


def test_from_pcd_generates_ground_mesh():
    gmesh = GroundMeshData.from_pcd(_make_grid_pcd(), denoise_pcd=False)
    _assert_ground_mesh(gmesh)


def test_from_pcd_denoises_point_cloud_by_default():
    # Denoising must not change the outcome for a clean, planar point cloud
    gmesh = GroundMeshData.from_pcd(_make_grid_pcd())
    _assert_ground_mesh(gmesh)


def test_from_pcd_uses_resolution_when_building_triangle_stride():
    coords = np.array([0.0, 4.5], dtype=np.float64)
    xs, ys = np.meshgrid(coords, coords)
    pcd = PointCloudData(
        pd.DataFrame(
            {
                "x": xs.ravel(),
                "y": ys.ravel(),
                "z": np.zeros(4),
                "intensity": np.zeros(4),
            }
        )
    )

    mesh = GroundMeshData.from_pcd(
        pcd,
        denoise_pcd=False,
        cloth_resolution=0.7,
    )

    # Every exported cloth vertex must participate in the triangle grid. The old
    # operation order produced an undersized stride with valid indices, silently
    # leaving the final rows and columns disconnected.
    assert mesh.faces.max() == mesh.num_points - 1


def _make_triangle_mesh(offset: float) -> GroundMeshData:
    mesh = o3d.geometry.TriangleMesh(
        vertices=o3d.utility.Vector3dVector(
            np.array(
                [
                    [offset, 0, 0],
                    [offset + 1, 0, 0],
                    [offset, 1, 0],
                ],
                dtype=np.float64,
            )
        ),
        triangles=o3d.utility.Vector3iVector([(0, 1, 2)]),
    )
    return GroundMeshData(mesh)


def test_merge_combines_vertices_and_faces():
    a = _make_triangle_mesh(0.0)
    b = _make_triangle_mesh(10.0)

    merged = a.merge(b)

    assert merged.num_points == a.num_points + b.num_points
    assert merged.num_faces == a.num_faces + b.num_faces
    # Face indices must be offset to reference the combined vertex array
    assert merged.faces.min() == 0
    assert merged.faces.max() == merged.num_points - 1
    # The inputs must not be mutated
    assert a.num_points == 3
    assert b.num_points == 3
