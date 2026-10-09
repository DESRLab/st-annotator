from __future__ import annotations

from typing import Any

import numpy as np
import numpy.typing as npt

from pydantic import BaseModel, RootModel, StrictStr

from sta.common.filesystem import FileSystemPath, NumPyFileIO

from ...filesystem import PointCloudData
from ..operation import Operation

__all__ = ['RemoveBackground', 'RemoveBackgroundParams', 'RemoveBackgroundParamsItem']


class RemoveBackgroundParamsItem(BaseModel):
    min_values_uri: StrictStr
    """A path to the file containing the minimum intensity of each point (exclusive) in the `i`th point cloud."""

    max_values_uri: StrictStr
    """A path to the file containing the maximum intensity of each point (exclusive) in the `i`th point cloud."""

class RemoveBackgroundParams(RootModel[list[RemoveBackgroundParamsItem]]):
    root: list[RemoveBackgroundParamsItem]

    def __iter__(self):  # pyright: ignore[reportIncompatibleMethodOverride]
        return iter(self.root)

    def __getitem__(self, item: int):
        return self.root[item]

    def __len__(self):
        return len(self.root)

    def __bool__(self):
        return bool(self.root)


class RemoveBackground(Operation[RemoveBackgroundParams]):
    @classmethod
    def _get_stats(cls, uri: str) -> npt.NDArray[Any]:
        file_io = NumPyFileIO()

        if not FileSystemPath.from_uri(uri).exists():
            msg = 'There is no file at the provided URI'
            raise ValueError(msg)

        return file_io.read(uri)

    def __init__(self, name: str, params: RemoveBackgroundParams) -> None:
        super().__init__(name, params)

        if params:
            min_stats = [self._get_stats(e.min_values_uri) for e in params]
            max_stats = [self._get_stats(e.max_values_uri) for e in params]

            min_stats = np.concatenate(min_stats, axis=0)
            max_stats = np.concatenate(max_stats, axis=0)
        else:
            min_stats = np.array([])
            max_stats = np.array([])

        self._min_stats = min_stats
        self._max_stats = max_stats

    def apply(self, pcd: PointCloudData) -> PointCloudData:
        if len(self._min_stats) == 0 or len(self._max_stats) == 0:
            return pcd

        is_background = (self._min_stats < pcd.intensity) & (pcd.intensity < self._max_stats)

        return pcd.apply_pointwise_mask(~is_background)
