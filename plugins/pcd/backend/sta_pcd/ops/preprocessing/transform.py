from __future__ import annotations

from scipy.spatial.transform import Rotation

from pydantic import BaseModel, Field

from sta.common.spatial import OptionalVector3, Vector3

from ...filesystem import PointCloudData
from ..operation import Operation

__all__ = ['Transform', 'TransformParams']


class TransformParams(BaseModel):
    rotate: OptionalVector3 = Field(default_factory=OptionalVector3.empty)
    """If provided, performs the specified extrinsic rotation in X-Y-Z order (before translation). You may omit some axes, in which case they are set to zero."""

    translate: OptionalVector3 = Field(default_factory=OptionalVector3.empty)
    """If provided, performs the specified translation (after rotation). You may omit some axes, in which case they are set to zero."""


class Transform(Operation[TransformParams]):
    DEFAULT_ROTATE = 0
    DEFAULT_TRANSLATE = 0

    def __init__(self, name: str, params: TransformParams) -> None:
        super().__init__(name, params)

        rotate = params.rotate
        rotate_vector = rotate.filled(self.DEFAULT_ROTATE)
        self._rotate = rotate_vector.to_array()

        translate = params.translate
        translate_vector = translate.filled(self.DEFAULT_TRANSLATE)
        self._translate = translate_vector.to_array()

    def apply_inverse_to_vector(self, v: Vector3) -> Vector3:
        xyz = v.to_array()

        rotation = Rotation.from_euler('xyz', self._rotate)
        xyz = rotation.inv().apply(xyz - self._translate)

        return Vector3.from_array(xyz)

    def apply(self, pcd: PointCloudData) -> PointCloudData:
        pcd = pcd.clone()

        rotation = Rotation.from_euler('xyz', self._rotate)
        pcd.xyz = rotation.apply(pcd.xyz) + self._translate

        return pcd
