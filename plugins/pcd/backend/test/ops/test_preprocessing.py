"""Pure unit tests for the preprocessing operations of the pcd plugin.

These tests exercise the operations on small synthetic point clouds and do not require a database.
Operations that read auxiliary files (remove-bg, crop-polygon) are run under an in-memory filesystem
context rooted at ``tmp_path``.
"""

from __future__ import annotations

import math
from pathlib import Path

from fsspec.implementations.dirfs import DirFileSystem

import numpy as np
import pandas as pd
from numpy.testing import assert_allclose, assert_array_equal

from pydantic import ValidationError

import pytest

from sta.common.filesystem import NumPyFileIO, fs_ctx
from sta.common.spatial import OptionalVector3, Vector3
from sta_pcd.filesystem import PointCloudData, PolygonData, PolygonFileIO
from sta_pcd.models.configs import PointCloudConfig
from sta_pcd.ops.points_in_polygon import pip_mask
from sta_pcd.ops.preprocessing import (
    CropBox,
    CropBoxParams,
    CropPolygon,
    CropPolygonParams,
    Denoise,
    DenoiseParams,
    RandomDownsample,
    RandomDownsampleParams,
    RemoveBackground,
    RemoveBackgroundParams,
    RemoveBackgroundParamsItem,
    Transform,
    TransformParams,
)


def make_pcd(points: list[list[float]]) -> PointCloudData:
    # Point clouds are stored as `float32` in production (see :class:`PointCloudConfig`),
    # so build the frame from a `float32` array to match the real read path.
    array = np.array(points, dtype=np.float32)
    return PointCloudData(pd.DataFrame(array, columns=["x", "y", "z", "intensity"]))


def test_point_cloud_config_requires_a_channel_header():
    with pytest.raises(ValidationError):
        PointCloudConfig(channel_headers=[], dtype="float32")


def test_pip_mask_flags_points_inside_and_outside_the_polygon():
    polygon = np.array(
        [
            [0.0, 0.0],
            [10.0, 0.0],
            [10.0, 10.0],
            [0.0, 10.0],
        ]
    )
    points = np.array(
        [
            [5.0, 5.0, 0.0],
            [15.0, 5.0, 0.0],
        ]
    )

    assert_array_equal(pip_mask(points, polygon, inside=True), [True, False])
    assert_array_equal(pip_mask(points, polygon, inside=False), [False, True])


def test_denoise_removes_isolated_outliers():
    grid = [[float(x), float(y), 0.0, 0.0] for x in range(5) for y in range(5)]
    points = [*grid, [100.0, 100.0, 100.0, 0.0]]
    pcd = make_pcd(points)

    op = Denoise("denoise", DenoiseParams(nb_neighbours=8, std_ratio=1.0))
    result = op.apply(pcd)

    assert result.num_points == 25
    assert result.num_channels == 4
    assert not np.isclose(result.x, 100.0).any()


def test_random_downsample_keeps_the_requested_proportion_of_points():
    rng = np.random.default_rng(0)
    points = rng.uniform(-10.0, 10.0, size=(100, 4)).tolist()
    pcd = make_pcd(points)

    op = RandomDownsample("downsample-random", RandomDownsampleParams(proportion=0.3))
    result = op.apply(pcd)

    assert result.num_points == 30

    original_rows = {tuple(row) for row in pcd.pointwise_data}
    sampled_rows = [tuple(row) for row in result.pointwise_data]
    assert len(set(sampled_rows)) == 30
    assert all(row in original_rows for row in sampled_rows)


@pytest.mark.parametrize("proportion", [-0.01, 1.01, 2])
def test_random_downsample_rejects_out_of_range_proportion(proportion: float):
    with pytest.raises(ValidationError):
        RandomDownsampleParams(proportion=proportion)


def test_remove_background_removes_points_with_intensity_within_range(tmp_path: Path):
    with fs_ctx(DirFileSystem(str(tmp_path))):
        numpy_io = NumPyFileIO()
        numpy_io.write("min.npy", np.array([1.0, 1.0, 1.0, 4.0]))
        numpy_io.write("max.npy", np.array([2.0, 2.0, 2.0, 5.0]))

        op = RemoveBackground(
            "remove-bg",
            RemoveBackgroundParams(
                [
                    RemoveBackgroundParamsItem(min_values_uri="min.npy", max_values_uri="max.npy"),
                ]
            ),
        )

        pcd = make_pcd(
            [
                [0.0, 0.0, 0.0, 0.5],  # Below the range of its point: kept
                [1.0, 0.0, 0.0, 1.5],  # Within (1, 2) of its point: removed
                [2.0, 0.0, 0.0, 3.0],  # Outside the range of its point: kept
                [3.0, 0.0, 0.0, 4.5],  # Within (4, 5) of its point: removed
            ]
        )
        result = op.apply(pcd)

    assert_array_equal(
        result.pointwise_data,
        np.array(
            [
                [0.0, 0.0, 0.0, 0.5],
                [2.0, 0.0, 0.0, 3.0],
            ]
        ),
    )


def test_remove_background_concatenates_stats_from_multiple_items(tmp_path: Path):
    with fs_ctx(DirFileSystem(str(tmp_path))):
        numpy_io = NumPyFileIO()
        numpy_io.write("min_a.npy", np.array([1.0, 1.0]))
        numpy_io.write("max_a.npy", np.array([2.0, 2.0]))
        numpy_io.write("min_b.npy", np.array([4.0, 4.0]))
        numpy_io.write("max_b.npy", np.array([5.0, 5.0]))

        op = RemoveBackground(
            "remove-bg",
            RemoveBackgroundParams(
                [
                    RemoveBackgroundParamsItem(
                        min_values_uri="min_a.npy", max_values_uri="max_a.npy"
                    ),
                    RemoveBackgroundParamsItem(
                        min_values_uri="min_b.npy", max_values_uri="max_b.npy"
                    ),
                ]
            ),
        )

        pcd = make_pcd(
            [
                [0.0, 0.0, 0.0, 1.5],  # Removed by the stats of the first item
                [1.0, 0.0, 0.0, 3.0],  # Outside both ranges: kept
                [2.0, 0.0, 0.0, 4.5],  # Removed by the stats of the second item
                [3.0, 0.0, 0.0, 6.0],  # Outside both ranges: kept
            ]
        )
        result = op.apply(pcd)

    assert_array_equal(
        result.pointwise_data,
        np.array(
            [
                [1.0, 0.0, 0.0, 3.0],
                [3.0, 0.0, 0.0, 6.0],
            ]
        ),
    )


def test_remove_background_without_items_keeps_all_points():
    op = RemoveBackground("remove-bg", RemoveBackgroundParams([]))
    pcd = make_pcd(
        [
            [0.0, 0.0, 0.0, 0.5],
            [1.0, 0.0, 0.0, 1.5],
        ]
    )

    result = op.apply(pcd)

    assert_array_equal(result.pointwise_data, pcd.pointwise_data)


def test_remove_background_requires_intensity_channel(tmp_path: Path):
    with fs_ctx(DirFileSystem(str(tmp_path))):
        numpy_io = NumPyFileIO()
        numpy_io.write("min.npy", np.array([1.0]))
        numpy_io.write("max.npy", np.array([2.0]))
        op = RemoveBackground(
            "remove-bg",
            RemoveBackgroundParams(
                [
                    RemoveBackgroundParamsItem(min_values_uri="min.npy", max_values_uri="max.npy"),
                ]
            ),
        )
        pcd = PointCloudData(pd.DataFrame([[0.0, 0.0, 0.0]], columns=["x", "y", "z"]))

        with pytest.raises(ValueError, match="requires an intensity channel"):
            op.apply(pcd)


def test_remove_background_missing_stats_file_raises(tmp_path: Path):
    with fs_ctx(DirFileSystem(str(tmp_path))):
        with pytest.raises(ValueError, match="no file"):
            RemoveBackground(
                "remove-bg",
                RemoveBackgroundParams(
                    [
                        RemoveBackgroundParamsItem(
                            min_values_uri="missing_min.npy",
                            max_values_uri="missing_max.npy",
                        ),
                    ]
                ),
            )


def test_transform_applies_rotation_then_translation():
    params = TransformParams(
        rotate=OptionalVector3(z=math.pi / 2),
        translate=OptionalVector3(x=10, y=20, z=30),
    )
    op = Transform("transform", params)

    pcd = make_pcd(
        [
            [1.0, 0.0, 0.0, 0.5],
            [0.0, 1.0, 0.0, 0.6],
        ]
    )
    result = op.apply(pcd)

    assert_allclose(
        result.pointwise_data,
        np.array(
            [
                [10.0, 21.0, 30.0, 0.5],
                [9.0, 20.0, 30.0, 0.6],
            ]
        ),
        rtol=1e-5,
        atol=1e-5,
    )
    # The original point cloud must be left untouched.
    assert_allclose(pcd.pointwise_data[:, :3], [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0]])


def test_transform_apply_inverse_to_vector_round_trips():
    params = TransformParams(
        rotate=OptionalVector3(x=0.1, y=0.2, z=0.3),
        translate=OptionalVector3(x=-5, y=0, z=7),
    )
    op = Transform("transform", params)

    pcd = make_pcd([[3.0, -2.0, 7.0, 0.5]])
    (transformed_xyz,) = op.apply(pcd).pointwise_data[:, :3]

    round_tripped = op.apply_inverse_to_vector(Vector3.from_array(transformed_xyz))

    assert_allclose(round_tripped.to_array(), [3.0, -2.0, 7.0], rtol=1e-4, atol=1e-4)


def _write_square_polygon(uri: str) -> None:
    polygon = PolygonData(
        pd.DataFrame(
            {
                "x": [0.0, 10.0, 10.0, 0.0],
                "y": [0.0, 0.0, 10.0, 10.0],
                "z": [0.0, 0.0, 0.0, 0.0],
            }
        )
    )
    PolygonFileIO().write(uri, polygon)


def test_crop_polygon_keeps_or_removes_points_within_z_bounds(tmp_path: Path):
    with fs_ctx(DirFileSystem(str(tmp_path))):
        _write_square_polygon("polygon.csv")

        pcd = make_pcd(
            [
                [5.0, 5.0, 0.5, 0.0],  # Inside the polygon and within the z range
                [5.0, 5.0, 5.0, 0.0],  # Inside the polygon but above the z range
                [15.0, 5.0, 0.5, 0.0],  # Outside the polygon
            ]
        )

        keep = CropPolygon(
            "crop-polygon",
            CropPolygonParams(keep=True, uri="polygon.csv", min_z=0.0, max_z=1.0),
        )
        assert_array_equal(
            keep.apply(pcd).pointwise_data,
            np.array([[5.0, 5.0, 0.5, 0.0]]),
        )

        remove = CropPolygon(
            "crop-polygon",
            CropPolygonParams(keep=False, uri="polygon.csv", min_z=0.0, max_z=1.0),
        )
        assert_array_equal(
            remove.apply(pcd).pointwise_data,
            np.array(
                [
                    [5.0, 5.0, 5.0, 0.0],
                    [15.0, 5.0, 0.5, 0.0],
                ]
            ),
        )


def test_crop_polygon_defaults_to_unbounded_z(tmp_path: Path):
    with fs_ctx(DirFileSystem(str(tmp_path))):
        _write_square_polygon("polygon.csv")

        pcd = make_pcd(
            [
                [5.0, 5.0, -100.0, 0.0],
                [15.0, 5.0, 100.0, 0.0],
            ]
        )

        op = CropPolygon("crop-polygon", CropPolygonParams(keep=True, uri="polygon.csv"))
        result = op.apply(pcd)

    assert_array_equal(result.pointwise_data, np.array([[5.0, 5.0, -100.0, 0.0]]))


def test_crop_polygon_missing_file_raises(tmp_path: Path):
    with fs_ctx(DirFileSystem(str(tmp_path))):
        with pytest.raises(ValueError, match="no file"):
            CropPolygon("crop-polygon", CropPolygonParams(keep=True, uri="missing.csv"))


def test_crop_box_can_remove_every_point():
    # An area that misses the whole scan is a legal configuration, so the operation must return
    # an empty cloud instead of failing; handling emptiness belongs downstream (bounds updates).
    pcd = make_pcd(
        [
            [0.0, 0.0, 0.0, 0.5],
            [1.0, 1.0, 1.0, 0.5],
        ]
    )

    op = CropBox(
        "crop-box",
        CropBoxParams(
            keep=True,
            box_min=OptionalVector3(x=10.0, y=10.0, z=10.0),
            box_max=OptionalVector3(x=20.0, y=20.0, z=20.0),
        ),
    )
    result = op.apply(pcd)

    assert result.num_points == 0
    assert result.num_channels == 4


def test_random_downsample_with_zero_proportion_removes_every_point():
    pcd = make_pcd(
        [
            [0.0, 0.0, 0.0, 0.5],
            [1.0, 1.0, 1.0, 0.5],
        ]
    )

    op = RandomDownsample("downsample-random", RandomDownsampleParams(proportion=0))
    result = op.apply(pcd)

    assert result.num_points == 0


def test_remove_background_can_remove_every_point(tmp_path: Path):
    with fs_ctx(DirFileSystem(str(tmp_path))):
        numpy_io = NumPyFileIO()
        numpy_io.write("min.npy", np.array([0.0]))
        numpy_io.write("max.npy", np.array([10.0]))

        op = RemoveBackground(
            "remove-bg",
            RemoveBackgroundParams(
                [RemoveBackgroundParamsItem(min_values_uri="min.npy", max_values_uri="max.npy")]
            ),
        )

        pcd = make_pcd(
            [
                [0.0, 0.0, 0.0, 1.0],
                [1.0, 1.0, 1.0, 2.0],
            ]
        )
        result = op.apply(pcd)

    assert result.num_points == 0
