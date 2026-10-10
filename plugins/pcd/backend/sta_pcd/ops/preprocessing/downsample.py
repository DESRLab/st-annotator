from __future__ import annotations

import numpy as np

from pydantic import BaseModel, Field, StrictFloat, StrictInt

from ...filesystem import PointCloudData
from ..operation import Operation

__all__ = ["RandomDownsample", "RandomDownsampleParams"]


class RandomDownsampleParams(BaseModel):
    proportion: StrictInt | StrictFloat = Field(ge=0, le=1)


class RandomDownsample(Operation[RandomDownsampleParams]):
    def __init__(self, name: str, params: RandomDownsampleParams) -> None:
        super().__init__(name, params)

        self._proportion = params.proportion
        self._rng = np.random.default_rng()

    def apply(self, pcd: PointCloudData) -> PointCloudData:
        idx = self._rng.choice(
            pcd.num_points, size=int(self._proportion * pcd.num_points), replace=False
        )
        return pcd.take_points(idx)
