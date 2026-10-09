from __future__ import annotations

from collections.abc import Collection
from typing_extensions import Self

import numpy as np
import numpy.typing as npt
import pandas as pd

from sta.common.spatial import Transform, Vector3

__all__ = ['PointCloudData']


class PointCloudData:
    @classmethod
    def _find_xyzi(cls, columns: Collection[str]) -> tuple[str, str, str, str | None]:
        columns_by_lowercase = {header.lower(): header for header in columns}

        col_x = columns_by_lowercase.get('x')
        col_y = columns_by_lowercase.get('y')
        col_z = columns_by_lowercase.get('z')
        col_intensity = columns_by_lowercase.get('intensity')

        if col_x is None:
            msg = 'Could not find column for x values'
            raise ValueError(msg)
        if col_y is None:
            msg = 'Could not find column for y values'
            raise ValueError(msg)
        if col_z is None:
            msg = 'Could not find column for z values'
            raise ValueError(msg)

        return col_x, col_y, col_z, col_intensity

    def __init__(self, df: pd.DataFrame) -> None:
        super().__init__()

        self._df = df

        self._col_x, self._col_y, self._col_z, self._col_intensity = self._find_xyzi(df.columns)

    @property
    def pointwise_data(self) -> npt.NDArray[np.float64]:
        """
        An array containing each point in this point cloud.

        Shape: `(num_points, num_channels)`
        """
        return self._df.to_numpy()

    @property
    def channel_headers(self) -> tuple[str, ...]:
        return tuple(str(c) for c in self._df.columns)

    @property
    def num_channels(self) -> int:
        return len(self._df.columns)

    @property
    def num_points(self) -> int:
        return len(self._df.index)

    @property
    def x(self) -> npt.NDArray[np.float64]:
        """
        An array containing the `x`-coordinate of each point in this point cloud.

        Shape: `(num_points,)`
        """
        return self._df[self._col_x].to_numpy()

    @x.setter
    def x(self, value: npt.NDArray[np.float64]) -> None:
        self._df[self._col_x] = value

    @property
    def y(self) -> npt.NDArray[np.float64]:
        """
        An array containing the `y`-coordinate of each point in this point cloud.

        Shape: `(num_points,)`
        """
        return self._df[self._col_y].to_numpy()

    @y.setter
    def y(self, value: npt.NDArray[np.float64]) -> None:
        self._df[self._col_y] = value

    @property
    def z(self) -> npt.NDArray[np.float64]:
        """
        An array containing the `z`-coordinate of each point in this point cloud.

        Shape: `(num_points,)`
        """
        return self._df[self._col_z].to_numpy()

    @z.setter
    def z(self, value: npt.NDArray[np.float64]) -> None:
        self._df[self._col_z] = value

    @property
    def xyz(self) -> npt.NDArray[np.float64]:
        """
        An array containing the coordinates of each point in this point cloud.

        Shape: `(num_points, 3)`
        """
        return self._df[[self._col_x, self._col_y, self._col_z]].to_numpy()

    @xyz.setter
    def xyz(self, value: npt.NDArray[np.float64]) -> None:
        self._df[[self._col_x, self._col_y, self._col_z]] = value

    @property
    def bbox(self) -> tuple[Vector3, Vector3]:
        """A tuple `(min_xyz, max_xyz)` specifiying the bounding box of this point cloud."""
        mins = self.xyz.min(axis=0)
        maxs = self.xyz.max(axis=0)
        return Vector3.from_array(mins), Vector3.from_array(maxs)

    @property
    def intensity(self) -> npt.NDArray[np.float64] | None:
        """
        An array containing the intensity of each point in this point cloud.

        Shape: `(num_points,)`
        """
        if self._col_intensity is not None:
            return self._df[self._col_intensity].to_numpy()

    @intensity.setter
    def intensity(self, value: npt.NDArray[np.float64]) -> None:
        if self._col_intensity is not None:
            self._df[self._col_intensity] = value

    def apply_transformation(self, transform: Transform):
        self.xyz = transform.apply_to_array(self.xyz)

    def apply_pointwise_mask(self, mask: npt.NDArray[np.bool_]) -> Self:
        """
        Applies a boolean mask to this point cloud to filter out points.

        Parameters
        ----------
        mask : array of bool
            An array with shape `(num_points,)`. For each element, `True` indicates that the point
            should remain while `False` indicates that the point should be removed.

        Returns
        -------
        A new point cloud that is a filtered view of this point cloud.
        """
        return PointCloudData(df=self._df[mask])  # pyright: ignore[reportReturnType]

    def take_points(self, idx: npt.NDArray[np.int_]) -> Self:
        """
        Extracts the specified points from this point cloud.

        Parameters
        ----------
        idx : array of int
            An array with shape `(num_points,)`. For each element `i`, extracts the point
            with index `i` from this point cloud.

        Returns
        -------
        A new point cloud that is a filtered view of this point cloud.
        """
        return PointCloudData(df=self._df.take(idx))  # pyright: ignore[reportReturnType, reportArgumentType]

    def merge(self, *others: PointCloudData) -> PointCloudData:
        """
        Merges a number of point clouds into a new point cloud containing all of the points.

        If the source point clouds have different channel headers, the new point cloud has
        the union of their channel headers; in that case, points may have `NaN` values if
        their source point cloud lacks the corresponding channel.

        Returns
        -------
        A new point cloud that includes each input point cloud.
        """
        pcds = (self, *others)

        merged_df = pd.concat([pcd._df for pcd in pcds], axis=0, join='outer')
        merged_df = merged_df.drop_duplicates([self._col_x, self._col_y, self._col_z])

        return PointCloudData(merged_df)

    def clone(self) -> PointCloudData:
        """Creates a deep clone of this object."""
        return PointCloudData(self._df.copy())
