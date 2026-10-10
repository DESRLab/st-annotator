"""Tests for the row-building logic of ``generate_st_data_info.py``.

Only the per-file row construction (``_get_st_info_row``) and the CLI surface
are covered here. The command bodies themselves load an application config
(which reads the database/filesystem environment) and are therefore left to
manual runs; see the final test report notes.
"""

from __future__ import annotations

from datetime import datetime
from pathlib import Path

import click
import scripts.generate_st_data_info as generate_st_data_info_module

from sta.common.filesystem import FileSystemPath


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
    row = generate_st_data_info_module.STInfoRow(file_uri="data/example.pcd")

    generate_st_data_info_module._write_data_info_csv("metadata/data_info.csv", [row])

    output = tmp_path / "metadata" / "data_info.csv"
    assert output.is_file()
    assert output.read_text().splitlines()[1].startswith("data/example.pcd,")


def test_cli_command_exposes_the_expected_interface():
    command = generate_st_data_info_module.generate_st_data_info

    assert isinstance(command, click.Command)
    assert command.name == "generate-st-data-info"

    parameter_names = {parameter.name for parameter in command.params}
    assert {"data_uri", "output_path", "config_path"} <= parameter_names
