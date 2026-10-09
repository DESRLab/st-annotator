from __future__ import annotations

import numpy as np
import numpy.typing as npt
from scipy.spatial.transform import Rotation

from pydantic import BaseModel, Field, StrictBool, StrictStr

from sta.common.filesystem import FileSystemPath
from sta.common.spatial import OptionalVector3

from ...filesystem import PointCloudData, PolygonFileIO
from ..operation import Operation
from ..points_in_polygon import pip_mask

__all__ = [
    'CropBox',
    'CropBoxParams',
    'CropPolygon',
    'CropPolygonParams',
]


class CropPolygonParams(BaseModel):
    keep: StrictBool
    """If `true`, the region outside the specified area is removed; otherwise, the region within the specified area is removed."""

    uri: StrictStr
    """A path to the file containing the vertices of the 2D polygon (in anticlockwise order). Vertices are in the space of the source file (not the database)."""

    min_z: float | None = None
    """If provided, specifies the minimum z-coordinate of the area, in the space of the source file (not the database)."""

    max_z: float | None = None
    """If provided, specifies the maximum z-coordinate of the area, in the space of the source file (not the database)."""


class CropPolygon(Operation[CropPolygonParams]):
    def __init__(self, name: str, params: CropPolygonParams) -> None:
        super().__init__(name, params)

        self._keep = params.keep

        uri = params.uri
        file_io = PolygonFileIO()

        if not FileSystemPath.from_uri(uri).exists():
            msg = 'There is no file at the provided URI'
            raise ValueError(msg)

        self._polygon = file_io.read(uri)
        self._uri = uri

        self._min_z = -np.inf if params.min_z is None else params.min_z

        self._max_z = np.inf if params.max_z is None else params.max_z

    def _apply_mask(self, pcd: PointCloudData, mask: npt.NDArray[np.bool_]) -> PointCloudData:
        return pcd.apply_pointwise_mask(mask if self._keep else ~mask)

    def apply(self, pcd: PointCloudData) -> PointCloudData:
        is_in_polygon = pip_mask(pcd.xyz, self._polygon.xy, inside=True) \
            & ((self._min_z < pcd.z) & (pcd.z < self._max_z))

        return self._apply_mask(pcd, is_in_polygon)


class CropBoxParams(BaseModel):
    keep: StrictBool
    """If `true`, the region outside the specified area is removed; otherwise, the region within the specified area is removed."""

    box_min: OptionalVector3 = Field(default_factory=OptionalVector3.empty)
    """The minimum coordinates of the area (exclusive), in the space of the source file (not the database). You may omit some axes to leave them unbounded."""

    box_max: OptionalVector3 = Field(default_factory=OptionalVector3.empty)
    """The maximum coordinates of the area (exclusive), in the space of the source file (not the database). You may omit some axes to leave them unbounded."""

    rotate_area: OptionalVector3 = Field(default_factory=OptionalVector3.empty)
    """If provided, performs the specified extrinsic rotation on the area in X-Y-Z order. You may omit some axes, in which case they are set to zero."""

class CropBox(Operation[CropBoxParams]):
    DEFAULT_TRANSFORM = 0

    def __init__(self, name: str, params: CropBoxParams) -> None:
        super().__init__(name, params)

        self._keep = params.keep

        box_min = params.box_min
        box_min_vector = box_min.filled(-np.inf)
        self._min_xyz = box_min_vector.to_array()

        box_max = params.box_max
        box_max_vector = box_max.filled(np.inf)
        self._max_xyz = box_max_vector.to_array()

        rotate_area = params.rotate_area
        rotate_area_vector = rotate_area.filled(self.DEFAULT_TRANSFORM)
        self._rotation: Rotation = Rotation.from_euler('xyz', rotate_area_vector.to_array())

    def _apply_mask(self, pcd: PointCloudData, mask: npt.NDArray[np.bool_]) -> PointCloudData:
        return pcd.apply_pointwise_mask(mask if self._keep else ~mask)

    def apply(self, pcd: PointCloudData) -> PointCloudData:
        local_xyz = self._rotation.apply(pcd.xyz, inverse=True)
        is_in_box = ((self._min_xyz < local_xyz) & (local_xyz < self._max_xyz)).all(axis=1)

        return self._apply_mask(pcd, is_in_box)
