from __future__ import annotations

from collections.abc import Collection, Mapping
from typing import Any

import numpy as np
import numpy.typing as npt
import pandas as pd

import laspy
from plyfile import PlyData
from pypcd4.pypcd4 import PointCloud

from sta.common.filesystem import FileIO, FileSystemPath

from ..data import PointCloudData

__all__ = ["PointCloudFileIO"]


def _rename_duplicates(channel_headers: list[str]) -> list[str]:
    header_count_tuples: list[tuple[str, int]] = []

    for field in channel_headers:
        count = sum(f == field for f, _ in header_count_tuples)
        header_count_tuples.append((field, count))

    return [f if c == 0 else f"{f}_{c}" for f, c in header_count_tuples]


def _lookup_file_header(file_headers: Collection[str], user_header: str) -> str:
    for file_header in file_headers:
        if user_header.lower() == file_header.lower():
            return file_header

    msg = f"Could not find matching channel for header: {user_header}"
    raise ValueError(msg)


def _lookup_file_headers(
    file_headers: Collection[str], user_headers: Collection[str]
) -> Mapping[str, str]:
    file_headers_set = set(file_headers)

    return {
        _lookup_file_header(file_headers_set, user_header): user_header
        for user_header in user_headers
    }


def _convert_file_headers(
    file_df: pd.DataFrame, file_to_user_headers: Mapping[str, str]
) -> pd.DataFrame:
    user_df = file_df.rename(columns=file_to_user_headers)

    user_headers = list(file_to_user_headers.values())
    return user_df[user_headers]


def _parse_structured_array(channel_headers: list[str], arr: npt.NDArray[Any]) -> PointCloudData:
    file_headers = arr.dtype.names
    if not isinstance(file_headers, (list, tuple)):
        msg = "File data is not a structured NumPy array"
        raise TypeError(msg)

    num_headers = len(file_headers)
    num_channels = len(channel_headers)
    if num_headers < num_channels:
        msg = f"Expected point cloud to have at least {num_channels} channels, but found {num_headers} channels instead"
        raise ValueError(msg)
    if len(arr) == 0:
        msg = "Point clouds require at least one point"
        raise ValueError(msg)

    data_df = pd.DataFrame(arr, columns=file_headers)

    file_to_user_headers = _lookup_file_headers(file_headers, channel_headers)
    data_df = _convert_file_headers(data_df, file_to_user_headers)

    return PointCloudData(data_df)


def _parse_unstructured_array(channel_headers: list[str], arr: npt.NDArray[Any]) -> PointCloudData:
    num_points, columns = arr.shape
    num_headers = len(channel_headers)

    if num_points == 0:
        msg = "Point clouds require at least one point"
        raise ValueError(msg)
    if num_headers > columns:
        msg = f"Expected point cloud to have at most {columns} channels, but found {num_headers} channels instead"
        raise ValueError(msg)

    arr = arr[:, :num_headers]
    data_df = pd.DataFrame(arr, columns=channel_headers)

    return PointCloudData(data_df)


def _parse_2d_array(channel_headers: list[str], arr: Any) -> PointCloudData:
    if not isinstance(arr, np.ndarray):
        msg = "File data cannot be read as a NumPy array"
        raise TypeError(msg)

    num_channels = len(channel_headers)
    if num_channels == 0:
        msg = "Point clouds require at least one channel header"
        raise ValueError(msg)
    if arr.size == 0:
        msg = "Point clouds require at least one point"
        raise ValueError(msg)
    if arr.size % num_channels != 0:
        msg = f"Expected point cloud to have {num_channels} channels, but cannot divide {arr.size} elements evenly"
        raise ValueError(msg)

    arr_2d = arr.reshape((-1, len(channel_headers)))
    data_df = pd.DataFrame(arr_2d, columns=channel_headers)

    return PointCloudData(data_df)


class PointCloudFileIO(FileIO):
    @property
    def read_suffixes(self) -> tuple[str, ...] | str:
        return ".bin", ".pcd", ".laz", ".las", ".npy", ".ply"

    @property
    def write_suffixes(self) -> tuple[str, ...] | str:
        return ".bin"

    @FileIO.reader
    def read(
        self, path: FileSystemPath, *, dtype: str, channel_headers: list[str]
    ) -> PointCloudData:
        channel_headers = _rename_duplicates(channel_headers)

        with path.open("rb") as f:
            if path.suffix == ".bin":
                points = np.fromfile(f, dtype=dtype)
                return _parse_2d_array(channel_headers, points)
            elif path.suffix == ".pcd":
                points = PointCloud.from_fileobj(f).numpy()  # pyright: ignore[reportArgumentType]
                return _parse_2d_array(channel_headers, points)
            elif path.suffix == ".las" or path.suffix == ".laz":
                points = laspy.read(f).points.array
                return _parse_structured_array(channel_headers, points)
            elif path.suffix == ".npy":
                points = np.load(f)
                return _parse_unstructured_array(channel_headers, points)
            else:
                # FileIO.reader rejects suffixes outside `read_suffixes`, so only '.ply' reaches here.
                points: npt.NDArray[Any] = PlyData.read(f)["vertex"].data
                return _parse_structured_array(channel_headers, points)

    @FileIO.writer
    def write(self, path: FileSystemPath, data: PointCloudData) -> None:
        with path.open("wb") as f:
            data.pointwise_data.tofile(f)
