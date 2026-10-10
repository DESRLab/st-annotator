"""Round-trip tests for ``sta.common.filesystem.io.numpy.NumPyFileIO``."""

from __future__ import annotations

from pathlib import Path

import numpy as np

import pytest

from sta.common.filesystem.io.numpy import NumPyFileIO


@pytest.fixture
def npy_io() -> NumPyFileIO:
    return NumPyFileIO()


def test_read_suffixes(npy_io: NumPyFileIO):
    assert npy_io.read_suffixes == ".npy"


def test_round_trips_2d_float_array(fs_root: Path, npy_io: NumPyFileIO):
    array = np.array([[1.5, 2.0], [3.0, -4.25]])

    npy_io.write("data/array.npy", array)

    assert (fs_root / "data" / "array.npy").is_file()
    loaded = npy_io.read("data/array.npy")
    assert isinstance(loaded, np.ndarray)
    assert loaded.dtype == array.dtype
    np.testing.assert_array_equal(loaded, array)


def test_round_trips_integer_array(fs_root: Path, npy_io: NumPyFileIO):
    array = np.arange(6, dtype=np.int32).reshape(2, 3)

    npy_io.write("ints.npy", array)

    np.testing.assert_array_equal(npy_io.read("ints.npy"), array)


def test_read_rejects_non_ndarray_payload(fs_root: Path, npy_io: NumPyFileIO, monkeypatch):
    # `.npy` files normally always contain arrays; simulate a non-array payload to
    # exercise the defensive type guard
    npy_io.write("data.npy", np.zeros(2))
    monkeypatch.setattr(np, "load", lambda f: {"not": "an ndarray"})

    with pytest.raises(TypeError, match="File data is not a NumPy array"):
        npy_io.read("data.npy")


def test_read_rejects_unsupported_suffix(fs_root: Path, npy_io: NumPyFileIO):
    with pytest.raises(ValueError, match="Unsupported file suffix"):
        npy_io.read("data.csv")


def test_write_rejects_unsupported_suffix(fs_root: Path, npy_io: NumPyFileIO):
    with pytest.raises(ValueError, match="Unsupported file suffix"):
        npy_io.write("data.npz", np.zeros(2))

    assert not (fs_root / "data.npz").exists()
