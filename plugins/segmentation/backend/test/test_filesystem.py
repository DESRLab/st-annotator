import json
from decimal import Decimal
from pathlib import Path

from pydantic import ValidationError

import pytest

from sta.common.filesystem import FilesystemConfig, FileSystemPath, fs_ctx
from sta.common.spatial import DecimalCoord3, Vector3
from sta_segmentation.filesystem import (
    GeomConverters,
    LabelClassModel,
    LabelInstanceModel,
    LabelSelectionModel,
    LabelsFileIO,
    LabelsModel,
)

POINTS = [DecimalCoord3(x=1, y=2, z=3), DecimalCoord3(x=4, y=5, z=6)]


def _labels_model() -> LabelsModel:
    return LabelsModel(
        selections=[
            LabelSelectionModel(
                id=5,
                points=[Vector3(x=1, y=2, z=3)],
                instance=LabelInstanceModel(
                    id=7,
                    gt_class=LabelClassModel(name="car", id=3),
                    is_black=True,
                ),
                perceived_class=LabelClassModel(name="car", id=3),
                distinctive_lv=1,
                occlusion_lv=2,
            ),
        ]
    )


def test_labels_file_io_write_then_read_round_trip(tmp_path: Path):
    labels_io = LabelsFileIO()
    data = _labels_model()

    with fs_ctx(FilesystemConfig(root=tmp_path).get_fs()):
        path = FileSystemPath.from_uri("nested/dir/labels.json")
        labels_io.write(path, data)

        assert (tmp_path / "nested" / "dir" / "labels.json").is_file()
        assert labels_io.read(path) == data


def test_labels_file_io_read_returns_default_for_missing_path(tmp_path: Path):
    labels_io = LabelsFileIO()

    with fs_ctx(FilesystemConfig(root=tmp_path).get_fs()):
        assert labels_io.read(FileSystemPath.from_uri("missing.json")) == LabelsModel(selections=[])


def test_labels_file_io_read_rejects_invalid_json(tmp_path: Path):
    labels_io = LabelsFileIO()
    (tmp_path / "bad.json").write_text("not-json", encoding="utf-8")

    with fs_ctx(FilesystemConfig(root=tmp_path).get_fs()):
        with pytest.raises(ValueError, match="Unable to read annotation"):
            labels_io.read(FileSystemPath.from_uri("bad.json"))


def test_labels_file_io_read_rejects_unsupported_suffix(tmp_path: Path):
    labels_io = LabelsFileIO()
    (tmp_path / "labels.txt").write_text("{}", encoding="utf-8")

    with fs_ctx(FilesystemConfig(root=tmp_path).get_fs()):
        with pytest.raises(ValueError, match="Unable to read annotation"):
            labels_io.read(FileSystemPath.from_uri("labels.txt"))


def test_labels_file_io_read_rejects_invalid_schema(tmp_path: Path):
    labels_io = LabelsFileIO()
    (tmp_path / "invalid.json").write_text(
        json.dumps({"selections": [{"id": 1}]}),
        encoding="utf-8",
    )

    with fs_ctx(FilesystemConfig(root=tmp_path).get_fs()):
        with pytest.raises(ValueError, match="Invalid annotation"):
            labels_io.read(FileSystemPath.from_uri("invalid.json"))


def test_labels_model_rejects_invalid_payload():
    with pytest.raises(ValidationError):
        LabelsModel.model_validate({"selections": [{"id": "not-an-int"}]})


def test_geom_converters_round_trip_wkb_and_points():
    geom = GeomConverters.geom_from_points(POINTS)

    wkb = GeomConverters.geom_to_wkb(geom)
    assert GeomConverters.points_from_wkb(wkb) == POINTS

    without_z = GeomConverters.points_from_wkb(wkb, include_z=False)
    assert without_z == [
        DecimalCoord3(x=1, y=2, z=Decimal(0)),
        DecimalCoord3(x=4, y=5, z=Decimal(0)),
    ]

    assert GeomConverters.points_from_geom(geom) == POINTS


def test_geom_converters_wkb_to_geojson_returns_geojson():
    geom = GeomConverters.geom_from_points(POINTS)

    geojson = GeomConverters.wkb_to_geojson(GeomConverters.geom_to_wkb(geom))

    # `shapely.to_geojson` returns a JSON string, not a parsed object.
    assert json.loads(geojson) == {
        "type": "MultiPoint",
        "coordinates": [[1.0, 2.0, 3.0], [4.0, 5.0, 6.0]],
    }
