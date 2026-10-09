from __future__ import annotations

import math
from copy import deepcopy
from pathlib import Path
from tempfile import TemporaryDirectory

import numpy as np
import numpy.typing as npt

import CSF
import open3d as o3d

from sta.common.spatial import Transform, Vector3
from sta_pcd.filesystem import PointCloudData
from sta_pcd.ops.preprocessing import Denoise, DenoiseParams

__all__ = ['GroundMeshData']


class GroundMeshData:
    @classmethod
    def from_pcd(
        cls,
        pcd: PointCloudData,
        *,
        denoise_pcd: bool = True,
        cloth_resolution: float = 1.0,
        time_step: float = 0.65,
        rigidness: int = 3,
        smoothing: bool = True,
        class_threshold: float = 0.55,
        iterations: int = 500,
    ):
        """
        Create a mesh representing the ground level of a point cloud. This mesh is
        generated using Cloth Simulation Filtering (CSF) algorithm [1]_.

        Parameters
        ----------
        denoise_pcd : bool, default True
            Whether to remove outliers from the point cloud before applying CSF.
        cloth_resolution: float, default 1.0
            The grid resolution, i.e. horizontal distance between neighboring particles.
        time_step : float, default 0.65
            The displacement of particles from gravity during each iteration.
        rigidness: int, default 3
            The rigidness of the simulated cloth.
        smoothing : bool, default True
            Whether to apply post-processing for handling steep slopes.
        class_threshold : float, default 0.55
            The distance threshold for classifying between ground and non-ground points.
        iterations : int, default 500
            The number of iterations to run the CSF algorithm for.

        References
        ----------
        .. [1] Zhang, Wuming, Jianbo Qi, Peng Wan, Hongtao Wang, Donghui Xie, Xiaoyan Wang, and
           Guangjian Yan. 2016. "An Easy-to-Use Airborne LiDAR Data Filtering Method Based on Cloth
           Simulation" Remote Sensing 8, no. 6: 501. https://doi.org/10.3390/rs8060501
        """
        if denoise_pcd:
            params = DenoiseParams(nb_neighbours=20, std_ratio=20)
            pcd = Denoise("denoise", params).apply(pcd)

        csv = CSF.CSF()
        csv.params.bSloopSmooth = smoothing
        csv.params.time_step = time_step
        csv.params.class_threshold = class_threshold
        csv.params.cloth_resolution = cloth_resolution
        csv.params.rigidness = rigidness
        csv.params.iterations = iterations

        xyz = pcd.xyz
        csv.setPointCloud(xyz)
        vertices = np.asarray(csv.do_cloth_export()).reshape(-1, 3)

        x_min, y_min, _ = xyz.min(axis=0)
        x_max, y_max, _ = xyz.max(axis=0)

        # https://github.com/jianboqi/CSF/blob/v1.2.6/src/CSF.cpp
        cloth_buffer = 2
        grid_width = int(math.floor(x_max - x_min) / cloth_resolution) + 2 * cloth_buffer
        grid_height = int(math.floor(y_max - y_min) / cloth_resolution) + 2 * cloth_buffer

        # https://github.com/CloudCompare/CloudCompare/blob/v2.13.2/plugins/core/Standard/qCSF/src/Cloth.cpp
        triangles: list[tuple[int, int, int]] = []
        for x in range(grid_width - 1):
            for y in range(grid_height - 1):
                # A -- B
                # |    |
                # D -- C
                idx_a = y * grid_width + x
                idx_d = idx_a + grid_width
                idx_b = idx_a + 1
                idx_c = idx_d + 1

                triangles.append((idx_a, idx_b, idx_d))
                triangles.append((idx_d, idx_b, idx_c))

        mesh_o3d = o3d.geometry.TriangleMesh(
            vertices=o3d.utility.Vector3dVector(vertices),
            triangles=o3d.utility.Vector3iVector(triangles),
        )

        return cls(mesh_o3d)

    def __init__(self, mesh: o3d.geometry.TriangleMesh) -> None:
        super().__init__()

        self._mesh = mesh

    @property
    def num_points(self) -> int:
        return np.asarray(self._mesh.vertices).shape[0]

    @property
    def num_faces(self) -> int:
        return np.asarray(self._mesh.triangles).shape[0]

    @property
    def xyz(self) -> npt.NDArray[np.float64]:
        """
        An array containing the coordinates of each point in this mesh.

        Shape: `(num_points, 3)`
        """
        return np.asarray(self._mesh.vertices)

    @xyz.setter
    def xyz(self, value: npt.NDArray[np.float64]) -> None:
        self._mesh.vertices = o3d.utility.Vector3dVector(value)

    @property
    def faces(self) -> npt.NDArray[np.int_]:
        """
        An array specifying the vertices of each face in this mesh.

        Each face is represented as a triangle; it is stored as a 3-tuple
        specifying the index of the point for each vertex in the triangle.

        Shape: `(num_faces, 3)`
        """
        return np.asarray(self._mesh.triangles)

    @property
    def bbox(self) -> tuple[Vector3, Vector3]:
        """A tuple `(min_xyz, max_xyz)` specifiying the bounding box of this mesh."""
        bbox = self._mesh.get_axis_aligned_bounding_box()
        return Vector3.from_array(bbox.min_bound), Vector3.from_array(bbox.max_bound)

    def as_bytes(self, file_suffix: str) -> bytes:
        """Converts this mesh into binary data with its format indicated by the given file suffix."""
        with TemporaryDirectory() as tempdir:
            temppath = Path(tempdir) / f'tmp{file_suffix}'
            o3d.io.write_triangle_mesh(str(temppath), self._mesh)
            return temppath.read_bytes()

    def apply_transformation(self, transform: Transform):
        self.xyz = transform.apply_to_array(self.xyz)

    def merge(self, *others: GroundMeshData) -> GroundMeshData:
        """
        Merges a number of meshes into a new mesh containing all of the vertices, faces and voxels.

        Returns
        -------
        A new mesh that includes each input mesh.
        """
        merged_mesh = deepcopy(self._mesh)
        for other in others:
            merged_mesh += other

        return GroundMeshData(merged_mesh)

    def clone(self) -> GroundMeshData:
        """Creates a deep clone of this object."""
        return GroundMeshData(deepcopy(self._mesh))
