from __future__ import annotations

from open3d import open3d as o3d

from pydantic import BaseModel, StrictFloat, StrictInt

from ...filesystem import PointCloudData
from ..operation import Operation

__all__ = ["Denoise", "DenoiseParams"]


class DenoiseParams(BaseModel):
    nb_neighbours: StrictInt
    std_ratio: StrictInt | StrictFloat


class Denoise(Operation[DenoiseParams]):
    def __init__(self, name: str, params: DenoiseParams) -> None:
        super().__init__(name, params)

        self._nb_neighbours = params.nb_neighbours
        self._std_ratio = params.std_ratio

    def apply(self, pcd: PointCloudData) -> PointCloudData:
        o3d_pcd = o3d.geometry.PointCloud(
            points=o3d.utility.Vector3dVector(pcd.xyz),
        )

        _, idx = o3d_pcd.remove_statistical_outlier(
            nb_neighbors=self._nb_neighbours,
            std_ratio=self._std_ratio,
        )

        return pcd.take_points(idx)
