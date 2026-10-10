"""Coverage for `sta_vector.filesystem`, focused on the `LabelsFileIO` write/read path
(the export side that the import tests never exercise) and the geometry converters.
"""

import json
from decimal import Decimal
from pathlib import Path

import pytest

from sta.common.filesystem import FilesystemConfig, FileSystemPath, JSONFileIO, fs_ctx
from sta.common.spatial import Vector3
from sta_vector.filesystem import (
    GeoFeatureCollection,
    GeomConverters,
    LabelClassModel,
    LabelsFileIO,
    LabelsModel,
    LabelVectorModel,
)
from sta_vector.models.label.data import VectorType


@pytest.fixture
def fs_root(tmp_path: Path):
    with fs_ctx(FilesystemConfig(root=tmp_path).get_fs()) as fs:
        yield fs


def _labels() -> LabelsModel:
    return LabelsModel(
        vectors=[
            LabelVectorModel(
                id=7,
                vector_type=VectorType.POLYGON,
                vertices=[
                    Vector3(x=0, y=0, z=0),
                    Vector3(x=1, y=0, z=0),
                    Vector3(x=1, y=1, z=0),
                ],
                gt_class=LabelClassModel(id=5, name="car"),
            ),
            LabelVectorModel(
                id=8,
                vector_type=VectorType.POINT,
                vertices=[Vector3(x=2, y=2, z=2)],
                gt_class=None,
            ),
        ]
    )


def test_labels_file_io_write_read_round_trip(fs_root):
    labels = _labels()
    io = LabelsFileIO()
    path = FileSystemPath.from_uri("labels.json")

    io.write(path, labels)
    assert path.is_file()

    assert io.read(path) == labels


def test_labels_file_io_write_creates_parent_directories(fs_root, tmp_path: Path):
    io = LabelsFileIO()
    path = FileSystemPath.from_uri("nested/dir/labels.json")

    io.write(path, _labels())

    assert (tmp_path / "nested" / "dir" / "labels.json").is_file()


def test_labels_file_io_read_missing_file_returns_empty(fs_root):
    io = LabelsFileIO()

    assert io.read(FileSystemPath.from_uri("does_not_exist.json")) == LabelsModel(vectors=[])


def test_labels_file_io_read_invalid_json_raises(fs_root):
    path = FileSystemPath.from_uri("bad.json")
    with path.open("w") as f:
        f.write("{not valid json")

    with pytest.raises(ValueError, match="Unable to read annotation"):
        LabelsFileIO().read(path)


def test_labels_file_io_read_wrong_schema_raises(fs_root):
    path = FileSystemPath.from_uri("wrong_schema.json")
    JSONFileIO().write(path, {"vectors": [{"id": "not-an-int"}]})

    with pytest.raises(ValueError, match="Invalid annotation"):
        LabelsFileIO().read(path)


def test_labels_file_io_read_unsupported_suffix_raises(fs_root):
    path = FileSystemPath.from_uri("labels.txt")
    with path.open("w") as f:
        f.write("anything")

    with pytest.raises(ValueError, match="Unable to read annotation"):
        LabelsFileIO().read(path)


def test_labels_file_io_reads_geojson_feature_collection(fs_root):
    geojson = {
        "type": "FeatureCollection",
        "name": "car",
        "features": [
            {
                "type": "Feature",
                "geometry": {
                    "type": VectorType.POLYGON.value,
                    # Standard GeoJSON polygon rings; only the outer ring is read.
                    "coordinates": [
                        [[0, 0, 0], [1, 0, 0], [1, 1, 0]],
                        [[0.25, 0.25, 0], [0.75, 0.25, 0], [0.75, 0.75, 0]],
                    ],
                },
            },
            # Features without geometry are skipped.
            {"type": "Feature", "geometry": None},
        ],
    }
    path = FileSystemPath.from_uri("labels.geojson")
    JSONFileIO().write(path, geojson)

    labels = LabelsFileIO().read(path)

    assert len(labels.vectors) == 1
    (vector,) = labels.vectors
    assert vector.vector_type == VectorType.POLYGON
    assert vector.gt_class == LabelClassModel(name="car")
    # The geometry round-trip closes the outer ring.
    assert [(v.x, v.y, v.z) for v in vector.vertices] == [
        (0, 0, 0),
        (1, 0, 0),
        (1, 1, 0),
        (0, 0, 0),
    ]


def test_geo_feature_collection_to_labels_validates_model():
    collection = GeoFeatureCollection.model_validate(
        {
            "type": "FeatureCollection",
            "name": "lane",
            "features": [
                {
                    "type": "Feature",
                    "geometry": {
                        "type": VectorType.POLYLINE.value,
                        "coordinates": [[0, 0, 0], [1, 1, 0]],
                    },
                },
            ],
        }
    )

    labels = collection.to_labels()

    assert len(labels.vectors) == 1
    assert labels.vectors[0].vector_type == VectorType.POLYLINE
    assert labels.vectors[0].gt_class == LabelClassModel(name="lane")


def test_geo_feature_collection_parses_point_and_2d_positions():
    collection = GeoFeatureCollection.model_validate(
        {
            "type": "FeatureCollection",
            "name": "marker",
            "features": [
                {
                    "type": "Feature",
                    # A standard GeoJSON point is a single position, not a list of positions.
                    "geometry": {"type": VectorType.POINT.value, "coordinates": [2, 2, 2]},
                },
                {
                    "type": "Feature",
                    # 2D positions default to z=0.
                    "geometry": {"type": VectorType.POINT.value, "coordinates": [3, 4]},
                },
            ],
        }
    )

    labels = collection.to_labels()

    assert len(labels.vectors) == 2
    point, flat_point = labels.vectors
    assert point.vector_type == VectorType.POINT
    assert [(v.x, v.y, v.z) for v in point.vertices] == [(2, 2, 2)]
    assert [(v.x, v.y, v.z) for v in flat_point.vertices] == [(3, 4, 0)]


def test_labels_file_io_rejects_invalid_geojson(fs_root):
    geojson = {
        "type": "FeatureCollection",
        "name": "broken",
        "features": [
            {
                "type": "Feature",
                # A position must have at least two coordinates.
                "geometry": {"type": VectorType.POINT.value, "coordinates": [1]},
            },
        ],
    }
    path = FileSystemPath.from_uri("broken.geojson")
    JSONFileIO().write(path, geojson)

    with pytest.raises(ValueError, match="Invalid annotation"):
        LabelsFileIO().read(path)


def test_geom_converters_round_trip():
    vertices = [
        Vector3(x=0, y=0, z=0).to_decimal(),
        Vector3(x=1, y=0, z=0).to_decimal(),
        Vector3(x=1, y=1, z=1).to_decimal(),
    ]

    geom = GeomConverters.geom_from_vector_data(VectorType.POLYLINE, vertices)
    wkb = GeomConverters.geom_to_wkb(geom)

    assert GeomConverters.vertices_from_wkb(wkb) == vertices
    assert GeomConverters.vertices_from_geom(geom) == vertices

    flat = GeomConverters.vertices_from_wkb(wkb, include_z=False)
    assert [(v.x, v.y) for v in flat] == [(v.x, v.y) for v in vertices]
    assert all(v.z == Decimal(0) for v in flat)

    geojson = json.loads(GeomConverters.wkb_to_geojson(wkb))
    assert geojson["type"] == "LineString"


def test_geom_converters_point_round_trip():
    vertex = Vector3(x=2, y=2, z=2).to_decimal()
    geom = GeomConverters.geom_from_vector_data(VectorType.POINT, [vertex])

    assert GeomConverters.vertices_from_geom(geom) == [vertex]
    assert GeomConverters.vertices_from_wkb(GeomConverters.geom_to_wkb(geom)) == [vertex]
