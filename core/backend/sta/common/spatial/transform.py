from __future__ import annotations

from collections.abc import Sequence
from decimal import Decimal
from functools import cached_property
from typing import Any, ClassVar
from typing_extensions import Self

import numpy as np
import numpy.typing as npt
from scipy.spatial.transform import Rotation

from pydantic import BaseModel, ConfigDict

from .vectors import BaseOptionalVector3, DecimalCoord3, OptionalDecimalCoord3, Vector3

__all__ = ["Transform"]


class Transform(BaseModel):
    """
    Helper class to apply a transformation in 3D space.

    Its components are applied in the following order:

    - Translation
    - Scale
    - Extrinsic rotation in X-Y-Z order
    """

    model_config = ConfigDict(frozen=True)

    translation: DecimalCoord3
    rotation: DecimalCoord3
    scale: DecimalCoord3

    DEFAULT_TRANSLATION: ClassVar[Decimal] = Decimal(0)
    DEFAULT_ROTATION: ClassVar[Decimal] = Decimal(0)
    DEFAULT_SCALE: ClassVar[Decimal] = Decimal(1)

    @classmethod
    def _to_filled_vector(
        cls, vector: DecimalCoord3 | OptionalDecimalCoord3 | None, fill_value: Decimal
    ) -> DecimalCoord3:
        if vector is None:
            vector = OptionalDecimalCoord3.empty()
        if isinstance(vector, BaseOptionalVector3):
            filled = vector.filled(fill_value)
            vector = DecimalCoord3.model_construct(x=filled.x, y=filled.y, z=filled.z)

        return vector

    @classmethod
    def from_optional(
        cls,
        translation: DecimalCoord3 | OptionalDecimalCoord3 | None = None,
        rotation: DecimalCoord3 | OptionalDecimalCoord3 | None = None,
        scale: DecimalCoord3 | OptionalDecimalCoord3 | None = None,
    ) -> Self:
        translation = cls._to_filled_vector(translation, cls.DEFAULT_TRANSLATION)
        rotation = cls._to_filled_vector(rotation, cls.DEFAULT_ROTATION)
        scale = cls._to_filled_vector(scale, cls.DEFAULT_SCALE)

        return cls(translation=translation, rotation=rotation, scale=scale)

    @cached_property
    def matrix(self) -> npt.NDArray[np.float64]:
        translation = np.eye(4)
        translation[:3, 3] = self.translation.to_array()

        rotation = np.eye(4)
        rotation[:3, :3] = Rotation.from_euler("xyz", self.rotation.to_array()).as_matrix()

        scale = np.eye(4)
        scale[:3, :3] = np.diag(self.scale.to_array())

        return rotation @ scale @ translation

    def _is_transform_required(self) -> bool:
        return not np.allclose(self.matrix, np.eye(4))

    def apply_to_array(self, array: npt.NDArray[Any]) -> npt.NDArray[np.float64]:
        if self._is_transform_required():
            # convert to homogeneous coordinates
            array_homogeneous = np.hstack((array, np.ones((*array.shape[:-1], 1))))
            transformed_array_homogeneous = np.dot(array_homogeneous, self.matrix.T)

            # convert back to Euclidean coordinates
            return transformed_array_homogeneous[..., :-1]

        return array

    def apply_to_vector(self, vector: Vector3) -> Vector3:
        if self._is_transform_required():
            array = vector.to_array()
            transformed_array = self.apply_to_array(array)

            return Vector3(x=transformed_array[0], y=transformed_array[1], z=transformed_array[2])

        return vector

    def apply_to_vertices(self, vectors: Sequence[Vector3]) -> list[Vector3]:
        if self._is_transform_required():
            return [self.apply_to_vector(v) for v in vectors]

        return list(vectors)
