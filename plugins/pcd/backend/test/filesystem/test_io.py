"""Tests for :class:`PointCloudFileIO` covering every supported read format and the write path.

Source files for the readers are generated on the fly with the corresponding third-party
libraries (:mod:`laspy`, :mod:`plyfile`, :mod:`pypcd4`) so the tests do not depend on any
external sample data. All filesystem access happens inside an ``fs_ctx`` rooted at ``tmp_path``.
"""

from __future__ import annotations

from pathlib import Path

from fsspec.implementations.dirfs import DirFileSystem

import numpy as np
import pandas as pd
from numpy.testing import assert_array_equal

import laspy
from plyfile import PlyData, PlyElement
from pypcd4 import PointCloud as PypcdPointCloud

import pytest

from sta.common.filesystem import FileSystemPath, fs_ctx
from sta_pcd.filesystem import PointCloudData, PointCloudFileIO

CHANNEL_HEADERS = ["x", "y", "z", "intensity"]
EXPECTED_POINTS = np.array(
    [
        [1.0, 2.0, 3.0, 7.0],
        [4.0, 5.0, 6.0, 8.0],
    ],
    dtype=np.float32,
)


@pytest.fixture
def fs_root(tmp_path: Path):
    with fs_ctx(DirFileSystem(str(tmp_path))):
        yield tmp_path


def make_pcd() -> PointCloudData:
    return PointCloudData(pd.DataFrame(EXPECTED_POINTS, columns=CHANNEL_HEADERS))


def write_las(uri: str, *, compressed: bool) -> None:
    las = laspy.create(point_format=0, file_version="1.2")
    las.X = np.array([1, 4])
    las.Y = np.array([2, 5])
    las.Z = np.array([3, 6])
    las.intensity = np.array([7, 8])

    with FileSystemPath.from_uri(uri).open("wb") as f:
        las.write(f, do_compress=compressed)


def write_ply(uri: str, *, fields: list[str], points: np.ndarray = EXPECTED_POINTS) -> None:
    dtype = [(name, "<f4") for name in fields]
    rows = [tuple(point[: len(fields)]) for point in points]
    element = PlyElement.describe(np.array(rows, dtype=dtype), "vertex")
    with FileSystemPath.from_uri(uri).open("wb") as f:
        PlyData([element]).write(f)


def write_pcd(uri: str) -> None:
    point_cloud = PypcdPointCloud.from_xyzi_points(EXPECTED_POINTS.copy())
    with FileSystemPath.from_uri(uri).open("wb") as f:
        point_cloud.save(f)


def write_bin(uri: str) -> None:
    with FileSystemPath.from_uri(uri).open("wb") as f:
        EXPECTED_POINTS.astype(np.float32).tofile(f)


def write_npy(uri: str, array: np.ndarray) -> None:
    with FileSystemPath.from_uri(uri).open("wb") as f:
        np.save(f, array)


def read(uri: str) -> PointCloudData:
    return PointCloudFileIO().read(uri, dtype="float32", channel_headers=list(CHANNEL_HEADERS))


@pytest.mark.parametrize(
    "uri,writer",
    [
        ("data.bin", lambda uri: write_bin(uri)),
        ("data.npy", lambda uri: write_npy(uri, EXPECTED_POINTS)),
        ("data.pcd", lambda uri: write_pcd(uri)),
        ("data.ply", lambda uri: write_ply(uri, fields=list(CHANNEL_HEADERS))),
        ("data.las", lambda uri: write_las(uri, compressed=False)),
        ("data.laz", lambda uri: write_las(uri, compressed=True)),
    ],
)
def test_read_supported_formats(fs_root: Path, uri: str, writer) -> None:
    writer(uri)

    pcd = read(uri)

    assert pcd.channel_headers == tuple(CHANNEL_HEADERS)
    assert pcd.num_points == 2
    assert_array_equal(pcd.pointwise_data.astype(np.float32), EXPECTED_POINTS)


def test_read_bin_is_interpreted_using_the_configured_dtype(fs_root: Path) -> None:
    # 8 float64 values laid out as 4 float32 pairs would be misread; write float32 explicitly.
    write_bin("data.bin")

    pcd = PointCloudFileIO().read(
        "data.bin", dtype="float32", channel_headers=list(CHANNEL_HEADERS)
    )

    assert pcd.num_points == 2
    assert pcd.num_channels == 4


def test_read_npy_with_more_columns_than_headers_truncates(fs_root: Path) -> None:
    extra = np.array([[1.0, 2.0, 3.0, 7.0, 99.0]], dtype=np.float32)
    write_npy("data.npy", extra)

    pcd = read("data.npy")

    assert_array_equal(pcd.pointwise_data, np.array([[1.0, 2.0, 3.0, 7.0]], dtype=np.float32))


def test_read_npy_with_fewer_columns_than_headers_raises(fs_root: Path) -> None:
    write_npy("data.npy", np.array([[1.0, 2.0, 3.0]], dtype=np.float32))

    with pytest.raises(ValueError, match="at most"):
        read("data.npy")


def test_read_bin_with_indivisible_number_of_values_raises(fs_root: Path) -> None:
    with FileSystemPath.from_uri("data.bin").open("wb") as f:
        np.array([1.0, 2.0, 3.0, 4.0, 5.0], dtype=np.float32).tofile(f)

    with pytest.raises(ValueError, match="cannot divide"):
        read("data.bin")


@pytest.mark.parametrize("uri", ["data.bin", "data.npy", "data.ply"])
def test_read_of_an_empty_point_file_raises(fs_root: Path, uri: str) -> None:
    # An empty or fully truncated source file must be rejected when it is read. Otherwise the
    # scan registers successfully and every later bounds recalculation fails on its empty cloud.
    if uri == "data.bin":
        with FileSystemPath.from_uri(uri).open("wb") as f:
            f.write(b"")
    elif uri == "data.npy":
        write_npy(uri, np.empty((0, 4), dtype=np.float32))
    else:
        write_ply(uri, fields=list(CHANNEL_HEADERS), points=np.empty((0, 4), dtype=np.float32))

    with pytest.raises(ValueError, match="at least one point"):
        read(uri)


def test_read_ply_with_fewer_channels_than_headers_raises(fs_root: Path) -> None:
    write_ply("data.ply", fields=["x", "y", "z"])

    with pytest.raises(ValueError, match="at least"):
        read("data.ply")


def test_read_las_with_an_unknown_channel_raises(fs_root: Path) -> None:
    write_las("data.las", compressed=False)

    with pytest.raises(ValueError, match="Could not find matching channel"):
        PointCloudFileIO().read(
            "data.las",
            dtype="float32",
            channel_headers=["x", "y", "z", "not-a-real-channel"],
        )


def test_read_unsupported_suffix_raises(fs_root: Path) -> None:
    with pytest.raises(ValueError, match="Unsupported file suffix"):
        read("data.txt")


def test_read_renames_duplicate_channel_headers(fs_root: Path) -> None:
    five_channels = np.array([[1.0, 2.0, 3.0, 7.0, 8.0]], dtype=np.float32)
    write_npy("data.npy", five_channels)

    pcd = PointCloudFileIO().read(
        "data.npy",
        dtype="float32",
        channel_headers=["x", "y", "z", "intensity", "intensity"],
    )

    assert pcd.channel_headers == ("x", "y", "z", "intensity", "intensity_1")


def test_write_then_read_bin_round_trip(fs_root: Path) -> None:
    io = PointCloudFileIO()

    io.write("out.bin", make_pcd())
    pcd = io.read("out.bin", dtype="float32", channel_headers=list(CHANNEL_HEADERS))

    assert_array_equal(pcd.pointwise_data, EXPECTED_POINTS)


def test_write_unsupported_suffix_raises(fs_root: Path) -> None:
    with pytest.raises(ValueError, match="Unsupported file suffix"):
        PointCloudFileIO().write("out.txt", make_pcd())


@pytest.mark.parametrize("uri", ["out.pcd", "out.laz", "out.las", "out.npy", "out.ply"])
def test_write_read_only_suffix_raises(fs_root: Path, uri: str) -> None:
    # Reading supports all six formats, but only '.bin' is writable.
    with pytest.raises(ValueError, match="Unsupported file suffix"):
        PointCloudFileIO().write(uri, make_pcd())
