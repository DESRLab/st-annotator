"""Unit tests for the :class:`PointCloudData` container's validation and accessors.

These are pure, DB-free tests covering the column-lookup error paths and the coordinate setters.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from numpy.testing import assert_array_equal

import pytest

from sta_pcd.filesystem import PointCloudData


def make_df(columns: list[str]) -> pd.DataFrame:
    return pd.DataFrame(
        np.array([[1.0, 2.0, 3.0, 0.5]], dtype=np.float64)[:, : len(columns)], columns=columns
    )


def test_missing_x_column_raises():
    with pytest.raises(ValueError, match="column for x"):
        PointCloudData(make_df(["y", "z", "intensity"]))


def test_missing_y_column_raises():
    with pytest.raises(ValueError, match="column for y"):
        PointCloudData(make_df(["x", "z", "intensity"]))


def test_missing_z_column_raises():
    with pytest.raises(ValueError, match="column for z"):
        PointCloudData(make_df(["x", "y", "intensity"]))


def test_coordinate_setters_update_the_frame():
    pcd = PointCloudData(make_df(["x", "y", "z", "intensity"]))

    pcd.x = np.array([10.0])
    pcd.y = np.array([20.0])
    pcd.z = np.array([30.0])
    pcd.intensity = np.array([0.9])

    assert_array_equal(pcd.xyz, np.array([[10.0, 20.0, 30.0]]))
    assert_array_equal(pcd.intensity, np.array([0.9]))


def test_intensity_is_optional():
    pcd = PointCloudData(make_df(["x", "y", "z"]))

    assert pcd.intensity is None
    assert pcd.num_channels == 3

    # Setting intensity when the column is absent is a no-op.
    pcd.intensity = np.array([0.5])
    assert pcd.intensity is None


def test_bbox_and_counts():
    pcd = PointCloudData(
        pd.DataFrame(
            np.array([[0.0, 0.0, 0.0, 0.0], [2.0, 3.0, 4.0, 1.0]]),
            columns=["x", "y", "z", "intensity"],
        )
    )

    assert pcd.num_points == 2
    assert pcd.num_channels == 4

    min_coords, max_coords = pcd.bbox
    assert_array_equal(min_coords.to_array(), [0.0, 0.0, 0.0])
    assert_array_equal(max_coords.to_array(), [2.0, 3.0, 4.0])


def make_empty_pcd() -> PointCloudData:
    return PointCloudData(
        pd.DataFrame(np.empty((0, 4), dtype=np.float64), columns=["x", "y", "z", "intensity"])
    )


def test_empty_frame_is_a_legal_container_state():
    # Masks and samplers may legitimately remove every point; only bounds are undefined.
    pcd = PointCloudData(
        pd.DataFrame(
            np.array([[0.0, 0.0, 0.0, 0.0], [2.0, 3.0, 4.0, 1.0]]),
            columns=["x", "y", "z", "intensity"],
        )
    )

    masked = pcd.apply_pointwise_mask(np.array([False, False]))

    assert masked.num_points == 0
    assert masked.pointwise_data.shape == (0, 4)


def test_bbox_of_an_empty_point_cloud_raises():
    pcd = make_empty_pcd()

    assert pcd.num_points == 0

    with pytest.raises(ValueError, match="at least one point"):
        _ = pcd.bbox
