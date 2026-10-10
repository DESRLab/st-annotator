from __future__ import annotations

import csv
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path

import pytz

import pandas as pd

import pytest

from sta.common.filesystem import FilesystemConfig, fs_ctx
from sta.common.spatial import DecimalCoord3
from sta.porter.st_metadata import STMetadata, STMetadataReader

DATA_INFO_HEADER = [
    "file_uri",
    "translate_x",
    "translate_y",
    "translate_z",
    "rotate_x",
    "rotate_y",
    "rotate_z",
    "scale_x",
    "scale_y",
    "scale_z",
    "min_timestamp",
    "max_timestamp",
]


@pytest.fixture
def fs_root(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Yields a temporary directory with an active filesystem context rooted at it."""
    monkeypatch.chdir(tmp_path)
    with fs_ctx(FilesystemConfig(root=tmp_path).get_fs()):
        yield tmp_path


def touch_data_file(root: Path, relpath: str) -> None:
    data_file = root / relpath
    data_file.parent.mkdir(parents=True, exist_ok=True)
    data_file.write_text("")


def write_data_info(root: Path, rows: list[dict[str, str]], *, name: str = "data_info.csv") -> str:
    with (root / name).open("w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=DATA_INFO_HEADER)
        writer.writeheader()
        writer.writerows(rows)

    return name


def make_row(
    *,
    file_uri: str,
    min_timestamp: str = "2024-01-01T00:00:00+00:00",
    max_timestamp: str = "2024-01-02T00:00:00+00:00",
    **overrides: str,
) -> dict[str, str]:
    row = {
        "file_uri": file_uri,
        "translate_x": "1",
        "translate_y": "2",
        "translate_z": "3",
        "rotate_x": "0.1",
        "rotate_y": "0.2",
        "rotate_z": "0.3",
        "scale_x": "2",
        "scale_y": "2",
        "scale_z": "2",
        "min_timestamp": min_timestamp,
        "max_timestamp": max_timestamp,
    }
    row.update(overrides)
    return row


def test_read_csv_parses_transform_and_timestamp_bounds(fs_root: Path):
    touch_data_file(fs_root, "data/one.pcd")
    touch_data_file(fs_root, "data/two.pcd")
    write_data_info(
        fs_root,
        [
            make_row(file_uri="data/one.pcd"),
            make_row(
                file_uri="data/two.pcd",
                min_timestamp="2024-01-03T00:00:00+00:00",
                max_timestamp="2024-01-04T00:00:00+00:00",
                translate_x="4",
                rotate_z="0.6",
                scale_y="3",
            ),
        ],
    )

    metadata = STMetadataReader().read_csv(data_info_path="data_info.csv")

    assert len(metadata) == 2
    first, second = metadata
    assert isinstance(first, STMetadata)
    assert first.filepath.path == Path("data/one.pcd")
    assert first.file_coords_to_db_coords.translation == DecimalCoord3(
        x=Decimal("1"),
        y=Decimal("2"),
        z=Decimal("3"),
    )
    assert first.file_coords_to_db_coords.rotation == DecimalCoord3(
        x=Decimal("0.1"),
        y=Decimal("0.2"),
        z=Decimal("0.3"),
    )
    assert first.file_coords_to_db_coords.scale == DecimalCoord3(
        x=Decimal("2"),
        y=Decimal("2"),
        z=Decimal("2"),
    )
    # The CSV timestamps are timezone-aware, so their timezone is kept as-is
    assert first.min_timestamp == datetime(2024, 1, 1, tzinfo=timezone.utc)
    assert first.max_timestamp == datetime(2024, 1, 2, tzinfo=timezone.utc)
    assert first.min_timestamp.utcoffset() == timedelta(0)

    assert second.filepath.path == Path("data/two.pcd")
    assert second.file_coords_to_db_coords.translation.x == Decimal("4")
    assert second.file_coords_to_db_coords.rotation.z == Decimal("0.6")
    assert second.file_coords_to_db_coords.scale.y == Decimal("3")
    assert second.min_timestamp == datetime(2024, 1, 3, tzinfo=timezone.utc)
    assert second.max_timestamp == datetime(2024, 1, 4, tzinfo=timezone.utc)


def test_read_csv_accepts_absolute_metadata_path_outside_filesystem_root(tmp_path: Path):
    filesystem_root = tmp_path / "filesystem-root"
    filesystem_root.mkdir()
    touch_data_file(filesystem_root, "data/one.pcd")
    write_data_info(tmp_path, [make_row(file_uri="data/one.pcd")])

    with fs_ctx(FilesystemConfig(root=filesystem_root).get_fs()):
        (metadata,) = STMetadataReader().read_csv(data_info_path=str(tmp_path / "data_info.csv"))

    # The CSV is external, but the data URI stored in the metadata remains
    # relative to the configured filesystem root.
    assert metadata.filepath.path == Path("data/one.pcd")


def test_read_csv_missing_transform_components_become_defaults(fs_root: Path):
    touch_data_file(fs_root, "data/one.pcd")
    write_data_info(
        fs_root,
        [
            make_row(
                file_uri="data/one.pcd",
                translate_y="",
                translate_z="",
                rotate_x="",
                rotate_y="",
                rotate_z="",
                scale_x="",
                scale_y="",
                scale_z="",
            ),
        ],
    )

    (metadata,) = STMetadataReader().read_csv(data_info_path="data_info.csv")

    transform = metadata.file_coords_to_db_coords
    assert transform.translation == DecimalCoord3(x=Decimal("1"), y=Decimal(0), z=Decimal(0))
    assert transform.rotation == DecimalCoord3(x=Decimal(0), y=Decimal(0), z=Decimal(0))
    assert transform.scale == DecimalCoord3(x=Decimal(1), y=Decimal(1), z=Decimal(1))


def test_read_csv_applies_default_timezone_to_naive_timestamps(fs_root: Path):
    touch_data_file(fs_root, "data/one.pcd")
    write_data_info(
        fs_root,
        [
            make_row(
                file_uri="data/one.pcd",
                min_timestamp="2024-01-01T00:00:00",
                max_timestamp="2024-01-02T12:30:00",
            ),
        ],
    )

    (metadata,) = STMetadataReader().read_csv(
        data_info_path="data_info.csv",
        data_tz=pytz.timezone("Asia/Tokyo"),
    )

    tokyo = pytz.timezone("Asia/Tokyo")
    # The CSV timestamps are intentionally naive here
    assert metadata.min_timestamp == tokyo.localize(datetime(2024, 1, 1))  # noqa: DTZ001
    assert metadata.max_timestamp == tokyo.localize(datetime(2024, 1, 2, 12, 30))  # noqa: DTZ001
    assert metadata.min_timestamp.utcoffset() == timedelta(hours=9)


def test_read_csv_naive_timestamp_without_default_timezone_raises(fs_root: Path):
    touch_data_file(fs_root, "data/one.pcd")
    write_data_info(
        fs_root,
        [
            make_row(file_uri="data/one.pcd", min_timestamp="2024-01-01T00:00:00"),
        ],
    )

    with pytest.raises(ValueError, match="Missing timezone from timestamp"):
        STMetadataReader().read_csv(data_info_path="data_info.csv")


def test_read_csv_matching_timezone_is_accepted(fs_root: Path):
    touch_data_file(fs_root, "data/one.pcd")
    write_data_info(fs_root, [make_row(file_uri="data/one.pcd")])

    # The parsed timestamps carry `datetime.timezone.utc`, so `data_tz` must
    # compare equal to it; otherwise a spurious timezone conflict is reported
    (metadata,) = STMetadataReader().read_csv(
        data_info_path="data_info.csv",
        data_tz=timezone.utc,
    )

    assert metadata.min_timestamp.utcoffset() == timedelta(0)
    assert metadata.max_timestamp.utcoffset() == timedelta(0)


def test_read_csv_conflicting_timezone_raises(fs_root: Path):
    touch_data_file(fs_root, "data/one.pcd")
    write_data_info(fs_root, [make_row(file_uri="data/one.pcd")])

    with pytest.raises(ValueError, match="Found conflicting timezones!") as exc_info:
        STMetadataReader().read_csv(
            data_info_path="data_info.csv",
            data_tz=pytz.timezone("Asia/Tokyo"),
        )

    message = str(exc_info.value)
    assert "UTC" in message
    assert "Asia/Tokyo" in message


def test_read_csv_invalid_data_info_path_raises(fs_root: Path):
    with pytest.raises(
        ValueError,
        match=r"Provided invalid path to spatiotemporal metadata: missing\.csv",
    ):
        STMetadataReader().read_csv(data_info_path="missing.csv")


def test_read_csv_unsupported_data_info_suffix_raises(fs_root: Path):
    (fs_root / "data_info.txt").write_text("file_uri\n")

    with pytest.raises(ValueError, match=r"Unable to read CSV file at: data_info\.txt"):
        STMetadataReader().read_csv(data_info_path="data_info.txt")


def test_read_csv_empty_data_info_file_raises(fs_root: Path):
    (fs_root / "data_info.csv").write_text("")

    with pytest.raises(ValueError, match="Unable to read CSV file"):
        STMetadataReader().read_csv(data_info_path="data_info.csv")


def test_read_csv_missing_timestamp_columns_default_to_none(fs_root: Path):
    touch_data_file(fs_root, "data/one.pcd")
    (fs_root / "data_info.csv").write_text("file_uri\ndata/one.pcd\n")

    (metadata,) = STMetadataReader().read_csv(data_info_path="data_info.csv")

    assert metadata.filepath.path == Path("data/one.pcd")
    assert metadata.min_timestamp is None
    assert metadata.max_timestamp is None


def test_read_csv_malformed_row_reports_diagnostics(fs_root: Path):
    touch_data_file(fs_root, "data/one.pcd")
    write_data_info(fs_root, [make_row(file_uri="data/one.pcd", translate_x="not-a-number")])

    with pytest.raises(ValueError, match="Unable to parse row") as exc_info:
        STMetadataReader().read_csv(data_info_path="data_info.csv")

    message = str(exc_info.value)
    assert "Series representation" in message
    assert "Dictionary representation" in message
    assert "not-a-number" in message


def test_read_csv_missing_required_column_reports_diagnostics(fs_root: Path):
    with (fs_root / "data_info.csv").open("w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["translate_x", "min_timestamp", "max_timestamp"])
        writer.writerow(["1", "2024-01-01T00:00:00+00:00", "2024-01-02T00:00:00+00:00"])

    with pytest.raises(ValueError, match="Unable to parse row") as exc_info:
        STMetadataReader().read_csv(data_info_path="data_info.csv")

    assert "Dictionary representation" in str(exc_info.value)


def test_read_csv_invalid_file_uri_raises(fs_root: Path):
    write_data_info(fs_root, [make_row(file_uri="data/missing.pcd")])

    with pytest.raises(ValueError, match="Provided invalid path to file"):
        STMetadataReader().read_csv(data_info_path="data_info.csv")


def test_read_csv_header_only_data_info_returns_no_metadata(fs_root: Path):
    write_data_info(fs_root, [])

    metadata = STMetadataReader().read_csv(data_info_path="data_info.csv")

    assert metadata == []


def test_read_csv_missing_timestamp_becomes_none_when_default_timezone_given(fs_root: Path):
    touch_data_file(fs_root, "data/one.pcd")
    touch_data_file(fs_root, "data/two.pcd")
    write_data_info(
        fs_root,
        [
            make_row(file_uri="data/one.pcd"),
            make_row(
                file_uri="data/two.pcd",
                min_timestamp="2024-01-03T00:00:00+00:00",
                max_timestamp="",
            ),
        ],
    )

    metadata = STMetadataReader().read_csv(data_info_path="data_info.csv", data_tz=timezone.utc)

    second = metadata[1]
    assert second.min_timestamp == datetime(2024, 1, 3, tzinfo=timezone.utc)
    assert second.max_timestamp is None


def test_read_csv_missing_timestamp_is_none_without_default_timezone(fs_root: Path):
    # A missing timestamp is an absent value, not a timezone error: it becomes
    # None regardless of whether a default timezone is given.
    touch_data_file(fs_root, "data/one.pcd")
    write_data_info(
        fs_root,
        [
            make_row(file_uri="data/one.pcd", max_timestamp=""),
        ],
    )

    (metadata,) = STMetadataReader().read_csv(data_info_path="data_info.csv")

    assert metadata.min_timestamp == datetime(2024, 1, 1, tzinfo=timezone.utc)
    assert metadata.max_timestamp is None


def test_read_csv_missing_timestamps_in_mixed_offset_columns_become_none(fs_root: Path):
    touch_data_file(fs_root, "data/one.pcd")
    touch_data_file(fs_root, "data/two.pcd")
    touch_data_file(fs_root, "data/three.pcd")
    write_data_info(
        fs_root,
        [
            make_row(file_uri="data/one.pcd"),
            make_row(
                file_uri="data/two.pcd",
                min_timestamp="2024-01-03T00:00:00+09:00",
                max_timestamp="",
            ),
            make_row(
                file_uri="data/three.pcd",
                min_timestamp="",
                max_timestamp="2024-01-04T00:00:00+09:00",
            ),
        ],
    )

    metadata = STMetadataReader().read_csv(data_info_path="data_info.csv")

    assert len(metadata) == 3
    _, second, third = metadata
    assert second.min_timestamp == datetime(2024, 1, 3, tzinfo=timezone(timedelta(hours=9)))
    assert second.max_timestamp is None
    assert third.min_timestamp is None
    assert third.max_timestamp == datetime(2024, 1, 4, tzinfo=timezone(timedelta(hours=9)))


def test_replace_nans_converts_missing_values_to_none():
    cleaned = STMetadataReader._replace_nans(
        {
            "missing": float("nan"),
            "nat": pd.NaT,
            "number": 1.5,
            "text": "x",
            "none": None,
        }
    )

    assert cleaned == {"missing": None, "nat": None, "number": 1.5, "text": "x", "none": None}


class TestGetTimezone:
    def test_returns_default_timezone_for_naive_timestamp(self):
        # The timestamp is intentionally naive here
        tz = STMetadataReader._get_timezone(datetime(2024, 1, 1), pytz.utc)  # noqa: DTZ001

        assert tz is pytz.utc

    def test_raises_for_naive_timestamp_without_default_timezone(self):
        with pytest.raises(
            ValueError,
            match=r"Missing timezone from timestamp: 2024-01-01 00:00:00",
        ):
            # The timestamp is intentionally naive here
            STMetadataReader._get_timezone(datetime(2024, 1, 1), None)  # noqa: DTZ001

    def test_keeps_timezone_of_aware_timestamp(self):
        tz = STMetadataReader._get_timezone(datetime(2024, 1, 1, tzinfo=timezone.utc), None)

        assert tz is timezone.utc

    def test_accepts_matching_default_timezone(self):
        tz = STMetadataReader._get_timezone(datetime(2024, 1, 1, tzinfo=timezone.utc), timezone.utc)

        assert tz is timezone.utc

    def test_accepts_equivalent_timezones_of_different_types(self):
        # A parsed CSV column yields `datetime.timezone.utc` while the CLI
        # passes `pytz.utc`; the two compare unequal but must not conflict.
        tz = STMetadataReader._get_timezone(datetime(2024, 1, 1, tzinfo=timezone.utc), pytz.utc)

        assert tz is timezone.utc

    def test_accepts_fixed_offset_matching_the_timestamp(self):
        tz = STMetadataReader._get_timezone(
            datetime(2024, 1, 1, tzinfo=timezone(timedelta(hours=9))),
            pytz.timezone("Asia/Tokyo"),
        )

        assert tz == timezone(timedelta(hours=9))

    def test_raises_for_conflicting_timezones(self):
        tokyo = pytz.timezone("Asia/Tokyo")

        with pytest.raises(ValueError, match="Found conflicting timezones!") as exc_info:
            STMetadataReader._get_timezone(datetime(2024, 1, 1, tzinfo=timezone.utc), tokyo)

        message = str(exc_info.value)
        assert "UTC" in message
        assert "Asia/Tokyo" in message


class TestResolveTimestamp:
    def test_returns_none_for_none(self):
        assert STMetadataReader._resolve_timestamp(None, pytz.utc) is None

    def test_keeps_aware_timestamp_unchanged(self):
        timestamp = datetime(2024, 1, 1, tzinfo=timezone.utc)

        assert STMetadataReader._resolve_timestamp(timestamp, None) is timestamp

    def test_localizes_naive_plain_datetime_with_pytz_zone(self):
        # `datetime.replace(tzinfo=<pytz zone>)` attaches the zone's LMT rather
        # than its real offset; naive timestamps must be localized instead.
        tokyo = pytz.timezone("Asia/Tokyo")

        resolved = STMetadataReader._resolve_timestamp(datetime(2024, 1, 1), tokyo)  # noqa: DTZ001

        assert resolved == tokyo.localize(datetime(2024, 1, 1))  # noqa: DTZ001
        assert resolved.utcoffset() == timedelta(hours=9)

    def test_attaches_fixed_offset_to_naive_timestamp(self):
        resolved = STMetadataReader._resolve_timestamp(
            datetime(2024, 1, 1),  # noqa: DTZ001
            timezone.utc,
        )

        assert resolved == datetime(2024, 1, 1, tzinfo=timezone.utc)
