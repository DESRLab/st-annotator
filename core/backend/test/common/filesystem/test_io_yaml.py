"""Round-trip tests for ``sta.common.filesystem.io.yaml.YAMLFileIO``."""

from __future__ import annotations

from pathlib import Path

import pytest

from sta.common.filesystem.io.yaml import YAMLFileIO


@pytest.fixture
def yaml_io() -> YAMLFileIO:
    return YAMLFileIO()


def test_read_suffixes(yaml_io: YAMLFileIO):
    assert yaml_io.read_suffixes == (".yaml", ".yml")


def test_round_trips_dict(fs_root: Path, yaml_io: YAMLFileIO):
    data = {"name": "a", "values": [1, 2.5, None, True], "nested": {"k": "v"}}

    yaml_io.write("data/config.yaml", data)

    assert (fs_root / "data" / "config.yaml").is_file()
    assert yaml_io.read("data/config.yaml") == data


def test_round_trips_list(fs_root: Path, yaml_io: YAMLFileIO):
    data = [1, "two", {"three": 3}]

    yaml_io.write("list.yaml", data)

    assert yaml_io.read("list.yaml") == data


def test_round_trips_yml_suffix(fs_root: Path, yaml_io: YAMLFileIO):
    # `.yml` is a common YAML extension and is supported alongside `.yaml`
    data = {"a": 1}

    yaml_io.write("data.yml", data)

    assert (fs_root / "data.yml").is_file()
    assert yaml_io.read("data.yml") == data


def test_write_rejects_unsupported_suffix(fs_root: Path, yaml_io: YAMLFileIO):
    with pytest.raises(ValueError, match="Unsupported file suffix"):
        yaml_io.write("data.json", {"a": 1})

    assert not (fs_root / "data.json").exists()
