"""Test timestamp parsing, metadata CSV output, and required CLI options."""

from __future__ import annotations

import csv
from datetime import datetime
from decimal import Decimal
from pathlib import Path

from click.testing import CliRunner

from sta.common.filesystem import FileSystemPath

from sta_datasets import st_data_info as generate_st_data_info_module


def test_generate_st_data_info_parses_point_cloud_timestamps_from_the_file_name(fs_root: Path):
    file = FileSystemPath.from_uri("2024_01_02=03_04_05_123456.pcd")

    row = generate_st_data_info_module._get_st_info_row(file)

    assert row is not None
    assert row.file_uri == "2024_01_02=03_04_05_123456.pcd"

    # The parsed timestamp is naive, so astimezone() interprets it as local time
    expected = datetime(2024, 1, 2, 3, 4, 5, 123456).astimezone()
    assert row.min_timestamp == expected
    assert row.max_timestamp == expected

    # The generator leaves the transform unset; importers apply their own defaults
    assert row.translate_x is None
    assert row.rotate_z is None
    assert row.scale_x is None


def test_generate_st_data_info_parses_exported_json_label_file_names(fs_root: Path):
    # export_label_data.py names exports `<timestamp>.<pcd extension>.json`
    file = FileSystemPath.from_uri("2024_01_02=03_04_05_123456.pcd.json")

    row = generate_st_data_info_module._get_st_info_row(file)

    assert row is not None
    assert row.file_uri == "2024_01_02=03_04_05_123456.pcd.json"

    expected = datetime(2024, 1, 2, 3, 4, 5, 123456).astimezone()
    assert row.min_timestamp == expected
    assert row.max_timestamp == expected


def test_generate_st_data_info_skips_files_without_timestamp_stems(fs_root: Path):
    # A dot-less stem is not an exported `<timestamp>.<ext>.json` label file;
    # it used to crash with IndexError.
    assert (
        generate_st_data_info_module._get_st_info_row(
            FileSystemPath.from_uri("labels.json"),
        )
        is None
    )

    # Dotted stems that are not timestamps are skipped rather than crashing.
    assert (
        generate_st_data_info_module._get_st_info_row(
            FileSystemPath.from_uri("notes.v2.json"),
        )
        is None
    )


def test_generate_st_data_info_writes_csv_relative_to_current_working_directory(
    tmp_path: Path,
    monkeypatch,
):
    monkeypatch.chdir(tmp_path)
    rows = [
        generate_st_data_info_module.STInfoRow(
            file_uri="data/example, first.pcd", translate_x=1.25, scale_z=2
        ),
        generate_st_data_info_module.STInfoRow(file_uri="data/second.pcd"),
    ]

    generate_st_data_info_module._write_data_info_csv("metadata/data_info.csv", rows)

    output = tmp_path / "metadata" / "data_info.csv"
    assert output.is_file()
    with output.open(newline="") as stream:
        reader = csv.DictReader(stream)
        assert reader.fieldnames == list(generate_st_data_info_module.STInfoRow.model_fields)
        written = list(reader)
    assert [row["file_uri"] for row in written] == [row.file_uri for row in rows]
    assert written[0]["translate_x"] == "1.25"
    assert Decimal(written[0]["scale_z"]) == 2
    assert written[1]["translate_x"] == ""


def test_cli_requires_output_before_loading_application_config():
    result = CliRunner().invoke(generate_st_data_info_module.cli, ["data"])

    assert result.exit_code == 2
    assert "Missing option" in result.output
    assert "--output" in result.output
