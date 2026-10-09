from __future__ import annotations

import numpy as np
import numpy.typing as npt
import pandas as pd

__all__ = ['PolygonData']


class PolygonData:
    def __init__(self, df: pd.DataFrame) -> None:
        super().__init__()

        self._df = df

    @property
    def num_points(self) -> int:
        return len(self._df.index)

    @property
    def xy(self) -> npt.NDArray[np.float64]:
        """
        Am array containing the 2D coordinates of each vertex in this polygon.

        Shape: `(num_points, 2)`
        """
        return self._df[['x', 'y']].to_numpy()

    @xy.setter
    def xy(self, value: npt.NDArray[np.float64]) -> None:
        self._df[['x', 'y']] = value

    @property
    def xyz(self) -> npt.NDArray[np.float64]:
        """
        An array containing the 3D coordinates of each vertex in this polygon.

        Shape: `(num_points, 3)`
        """
        return self._df[['x', 'y', 'z']].to_numpy()

    @xyz.setter
    def xyz(self, value: npt.NDArray[np.float64]) -> None:
        self._df[['x', 'y', 'z']] = value
