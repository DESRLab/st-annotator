"""Round-trip tests for ``sta.common.filesystem.io.json.JSONFileIO``."""

from __future__ import annotations

from pathlib import Path

import pytest

from sta.common.filesystem.io.json import JSONFileIO


@pytest.fixture
def json_io() -> JSONFileIO:
    return JSONFileIO()


def test_read_suffixes(json_io: JSONFileIO):
    assert json_io.read_suffixes == (".json", ".geojson")


def test_round_trips_dict(fs_root: Path, json_io: JSONFileIO):
    data = {"name": "a", "values": [1, 2.5, None, True], "nested": {"k": "v"}}

    json_io.write("data/config.json", data)

    assert (fs_root / "data" / "config.json").is_file()
    assert json_io.read("data/config.json") == data


def test_round_trips_list(fs_root: Path, json_io: JSONFileIO):
    data = [1, "two", {"three": 3}]

    json_io.write("list.json", data)

    assert json_io.read("list.json") == data


def test_round_trips_geojson_suffix(fs_root: Path, json_io: JSONFileIO):
    data = {"type": "FeatureCollection", "features": []}

    json_io.write("map.geojson", data)

    assert json_io.read("map.geojson") == data


def test_read_accepts_filesystem_path(fs_root: Path, json_io: JSONFileIO):
    json_io.write("data.json", {"a": 1})
    path = json_io.normalize_uri_or_path("data.json")

    assert json_io.read(path) == {"a": 1}


def test_read_rejects_unsupported_suffix(fs_root: Path, json_io: JSONFileIO):
    (fs_root / "data.yaml").write_text("a: 1")

    with pytest.raises(ValueError, match="Unsupported file suffix"):
        json_io.read("data.yaml")


def test_write_rejects_unsupported_suffix(fs_root: Path, json_io: JSONFileIO):
    with pytest.raises(ValueError, match="Unsupported file suffix"):
        json_io.write("data.yaml", {"a": 1})

    assert not (fs_root / "data.yaml").exists()
