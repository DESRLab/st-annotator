"""Round-trip tests for ``sta.common.filesystem.io.csv.CSVFileIO``."""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from types import MappingProxyType

import pandas as pd

import pytest

from sta.common.filesystem.io.csv import CSVFileIO


@pytest.fixture
def csv_io() -> CSVFileIO:
    return CSVFileIO()


def test_read_suffixes(csv_io: CSVFileIO):
    assert csv_io.read_suffixes == ".csv"


def test_write_then_read_round_trip(fs_root: Path, csv_io: CSVFileIO):
    frame = pd.DataFrame(
        {
            "id": [1, 2, 3],
            "value": [1.5, 2.5, 3.5],
            "timestamp": [
                datetime(2024, 1, 1, tzinfo=timezone.utc),
                datetime(2024, 1, 2, tzinfo=timezone.utc),
                datetime(2024, 1, 3, tzinfo=timezone.utc),
            ],
        }
    )

    csv_io.write("data/points.csv", frame)
    assert (fs_root / "data" / "points.csv").is_file()

    loaded = csv_io.read("data/points.csv", dtype={"id": "int64"}, parse_dates=["timestamp"])

    # The round trip preserves the columns exactly (no index column).
    assert list(loaded.columns) == ["id", "value", "timestamp"]
    assert loaded["id"].tolist() == [1, 2, 3]
    assert loaded["value"].tolist() == [1.5, 2.5, 3.5]
    assert loaded["timestamp"].tolist() == frame["timestamp"].tolist()


def test_read_accepts_non_dict_mapping_dtype(fs_root: Path, csv_io: CSVFileIO):
    frame = pd.DataFrame({"id": [1, 2]})
    csv_io.write("data.csv", frame)

    loaded = csv_io.read(
        "data.csv",
        dtype=MappingProxyType({"id": "int64"}),
        parse_dates=[],
    )

    assert loaded["id"].dtype == "int64"
    assert loaded["id"].tolist() == [1, 2]


def test_read_with_single_dtype_coerces_all_columns(fs_root: Path, csv_io: CSVFileIO):
    frame = pd.DataFrame({"id": [1, 2], "value": [1.5, 2.5]})
    csv_io.write("data.csv", frame)

    loaded = csv_io.read("data.csv", dtype=str, parse_dates=[])

    assert loaded["id"].tolist() == ["1", "2"]
    assert loaded["value"].tolist() == ["1.5", "2.5"]


def test_read_rejects_unsupported_suffix(fs_root: Path, csv_io: CSVFileIO):
    (fs_root / "data.txt").write_text("a,b\n1,2\n")

    with pytest.raises(ValueError, match="Unsupported file suffix"):
        csv_io.read("data.txt", dtype=str, parse_dates=[])


def test_write_rejects_unsupported_suffix(fs_root: Path, csv_io: CSVFileIO):
    with pytest.raises(ValueError, match="Unsupported file suffix"):
        csv_io.write("data.txt", pd.DataFrame({"a": [1]}))

    assert not (fs_root / "data.txt").exists()


def test_write_creates_parent_directories(fs_root: Path, csv_io: CSVFileIO):
    csv_io.write("a/b/c/data.csv", pd.DataFrame({"x": [1]}))

    assert (fs_root / "a/b/c/data.csv").is_file()
