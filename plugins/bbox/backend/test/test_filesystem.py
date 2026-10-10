import json
from pathlib import Path

import pytest

from sta.common.filesystem import FilesystemConfig, FileSystemPath, fs_ctx
from sta.common.spatial import Vector3
from sta_bbox.filesystem import (
    LabelBoxModel,
    LabelClassModel,
    LabelsFileIO,
    LabelsModel,
    LabelTrackModel,
)
from sta_bbox.models.label.data import BoxType


def _sample_labels() -> LabelsModel:
    return LabelsModel(
        bounding_boxes=[
            LabelBoxModel(
                id=1,
                box_type=BoxType.CUBOID,
                center=Vector3(x=1, y=2, z=3),
                angle=0.5,
                size=Vector3(x=4, y=5, z=6),
                track=LabelTrackModel(
                    id=7,
                    gt_class=LabelClassModel(id=3, name="car"),
                    is_black=True,
                ),
                perceived_class=LabelClassModel(id=3, name="car"),
                distinctive_lv=1,
                occlusion_lv=2,
            ),
            LabelBoxModel(
                id=2,
                box_type=BoxType.CYLINDER,
                center=Vector3(x=0, y=0, z=0),
                angle=0,
                size=Vector3(x=1, y=1, z=1),
            ),
        ]
    )


def test_labels_file_io_write_read_round_trip(tmp_path: Path):
    with fs_ctx(FilesystemConfig(root=tmp_path).get_fs()):
        labels_io = LabelsFileIO()
        labels = _sample_labels()

        # Writing must create the parent directories as needed.
        path = FileSystemPath.from_uri("nested/boxes.json")
        labels_io.write(path, labels)

        assert (tmp_path / "nested" / "boxes.json").is_file()
        assert labels_io.read(path) == labels


def test_labels_file_io_read_rejects_invalid_labels(tmp_path: Path):
    empty = LabelsModel(bounding_boxes=[])

    with fs_ctx(FilesystemConfig(root=tmp_path).get_fs()):
        labels_io = LabelsFileIO()

        # A missing file yields an empty label set.
        assert labels_io.read(FileSystemPath.from_uri("missing.json")) == empty

        # An unreadable JSON file yields an empty label set.
        invalid_json_path = FileSystemPath.from_uri("invalid.json")
        with invalid_json_path.open("w") as f:
            f.write("{not json")
        with pytest.raises(ValueError, match="Unable to read annotation"):
            labels_io.read(invalid_json_path)

        # A JSON file that does not match the schema yields an empty label set.
        invalid_schema_path = FileSystemPath.from_uri("invalid_schema.json")
        with invalid_schema_path.open("w") as f:
            json.dump({"bounding_boxes": [{"id": "not-an-int"}]}, f)
        with pytest.raises(ValueError, match="Invalid annotation"):
            labels_io.read(invalid_schema_path)
