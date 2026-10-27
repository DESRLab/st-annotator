"""Exercise custom metadata generation through the datasets CLI."""

import csv
from contextlib import nullcontext
from pathlib import Path
from unittest.mock import Mock

import click
from click.testing import CliRunner

import pytest

from sta_datasets import st_data_info
from sta_datasets.cli import cli


@pytest.mark.parametrize("plugin_host", [False, True])
def test_metadata_command_writes_immediate_timestamped_files(
    fs_root: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch, *, plugin_host: bool
):
    data_dir = fs_root / "custom"
    data_dir.mkdir()
    (data_dir / "2026_08_25=09_30_00_000000.pcd").touch()
    (data_dir / "2026_08_25=09_30_01_000000.pcd.json").touch()
    (data_dir / "notes.txt").touch()
    nested = data_dir / "nested"
    nested.mkdir()
    (nested / "2026_08_25=09_30_02_000000.pcd").touch()
    config = tmp_path / "config.json"
    config.touch()
    config_args = Mock()
    monkeypatch.setattr(st_data_info, "AppConfigArgs", config_args)
    monkeypatch.setattr(st_data_info, "app_ctx", lambda _: nullcontext())

    @click.group()
    @click.option("-c", "--config", "config_path", type=click.Path(path_type=Path))
    def host(config_path: Path):
        pass

    host.add_command(cli, "datasets")
    command = host if plugin_host else cli
    prefix = ["-c", str(config), "datasets"] if plugin_host else []
    suffix = [] if plugin_host else ["--config", str(config)]
    runner = CliRunner()
    with runner.isolated_filesystem():
        result = runner.invoke(
            command,
            [
                *prefix,
                "generate",
                "st-data-info",
                "custom",
                "--output",
                "output/metadata.csv",
                *suffix,
            ],
        )
        assert result.exit_code == 0, result.output
        with Path("output/metadata.csv").open(newline="") as output:
            rows = list(csv.DictReader(output))

    config_args.from_file.assert_called_once_with(config)
    assert len(rows) == 2
    assert {Path(row["file_uri"]).name for row in rows} == {
        "2026_08_25=09_30_00_000000.pcd",
        "2026_08_25=09_30_01_000000.pcd.json",
    }
    for row in rows:
        assert row["min_timestamp"] == row["max_timestamp"]
        assert row["min_timestamp"].startswith("2026-08-25 09:30:0")
        assert row["translate_x"] == ""
