"""Unit tests for the pure and file-driven logic of ``scripts/import_semantickitti.py``.

The DB-coupled helpers are covered separately in ``test_import_semantickitti_db.py``.
Everything here runs without a database or the SemanticKITTI dataset.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path
from typing import TYPE_CHECKING

import click
import scripts.import_semantickitti as semantickitti

import numpy as np

from shapely import wkb

import pytest

from sta.common.filesystem import FileSystemPath
from sta.common.spatial import DecimalCoord3, OptionalDecimalCoord3, Transform
from sta.porter.st_metadata import STInfoRow

if TYPE_CHECKING:
    from collections.abc import Callable

# Official SemanticKITTI labels, frozen from the semantic-kitti-api config.
# The importer's label tables are data, so pin them exactly to catch accidental edits.
EXPECTED_SEMANTIC_KITTI_LABELS = {
    0: "unlabeled",
    1: "outlier",
    10: "car",
    11: "bicycle",
    13: "bus",
    15: "motorcycle",
    16: "on-rails",
    18: "truck",
    20: "other-vehicle",
    30: "person",
    31: "bicyclist",
    32: "motorcyclist",
    40: "road",
    44: "parking",
    48: "sidewalk",
    49: "other-ground",
    50: "building",
    51: "fence",
    52: "other-structure",
    60: "lane-marking",
    70: "vegetation",
    71: "trunk",
    72: "terrain",
    80: "pole",
    81: "traffic-sign",
    99: "other-object",
    252: "moving-car",
    253: "moving-bicyclist",
    254: "moving-person",
    255: "moving-motorcyclist",
    256: "moving-on-rails",
    257: "moving-bus",
    258: "moving-truck",
    259: "moving-other-vehicle",
}


class TestLabelTables:
    def test_semantic_kitti_labels_match_official_config(self):
        assert semantickitti.SEMANTIC_KITTI_LABELS == EXPECTED_SEMANTIC_KITTI_LABELS

    def test_label_names_are_unique(self):
        names = list(semantickitti.SEMANTIC_KITTI_LABELS.values())

        assert len(names) == len(set(names))

    def test_learning_map_covers_exactly_the_label_ids(self):
        assert (
            semantickitti.SEMANTIC_KITTI_LEARNING_MAP.keys()
            == semantickitti.SEMANTIC_KITTI_LABELS.keys()
        )

    def test_learning_map_targets_are_learning_labels(self):
        learning_labels = semantickitti.SEMANTIC_KITTI_LEARNING_LABELS

        assert set(learning_labels) == set(range(20))
        assert set(semantickitti.SEMANTIC_KITTI_LEARNING_MAP.values()) <= set(learning_labels)

    @pytest.mark.parametrize(
        ("raw_id", "learning_id"),
        [
            # Spot checks against the official semantic-kitti.yaml learning map
            (10, 1),  # car
            (50, 13),  # building
            (52, 0),  # other-structure is ignored
            (99, 0),  # other-object is ignored
            (252, 1),  # moving-car maps to car
            (254, 6),  # moving-person maps to person
            (259, 5),  # moving-other-vehicle maps to other-vehicle
        ],
    )
    def test_learning_map_spot_checks(self, raw_id: int, learning_id: int):
        assert semantickitti.SEMANTIC_KITTI_LEARNING_MAP[raw_id] == learning_id

    def test_learning_map_lut(self):
        lut = semantickitti.SEMANTIC_KITTI_LEARNING_MAP_LUT

        assert lut.dtype == np.int16
        assert len(lut) == max(semantickitti.SEMANTIC_KITTI_LEARNING_MAP) + 1
        assert np.array_equal(lut, semantickitti.build_learning_map_lut())

        for src, dst in semantickitti.SEMANTIC_KITTI_LEARNING_MAP.items():
            assert lut[src] == dst

        # Indices without a learning-map entry are marked invalid
        assert lut[2] == -1
        assert lut[9] == -1
        assert lut[100] == -1
        assert lut[251] == -1


class TestParseSequences:
    def test_zero_pads_single_values(self):
        assert semantickitti.parse_sequences(("0",)) == ["00"]
        assert semantickitti.parse_sequences(("4",)) == ["04"]
        assert semantickitti.parse_sequences(("21",)) == ["21"]

    def test_splits_comma_and_whitespace_separated_values(self):
        assert semantickitti.parse_sequences(("0,4 6",)) == ["00", "04", "06"]

    def test_concatenates_multiple_arguments(self):
        assert semantickitti.parse_sequences(("1", "2,3")) == ["01", "02", "03"]

    def test_empty_input_returns_no_sequences(self):
        assert semantickitti.parse_sequences(()) == []

    def test_accepts_the_dataset_boundaries(self):
        # SemanticKITTI contains sequence directories 00-21
        assert semantickitti.parse_sequences(("0", "21")) == ["00", "21"]

    @pytest.mark.parametrize("raw", ["-1", "22"])
    def test_rejects_out_of_range_sequences(self, raw: str):
        with pytest.raises(click.BadParameter, match="sequence out of range"):
            semantickitti.parse_sequences((raw,))

    def test_rejects_non_integer_sequences(self):
        with pytest.raises(click.BadParameter, match="sequence must be an integer"):
            semantickitti.parse_sequences(("abc",))

    def test_deduplicates_repeated_sequences(self):
        # Repeating a sequence (across flags or within one value) must not
        # import it twice; order of first appearance is preserved.
        assert semantickitti.parse_sequences(("4", "4")) == ["04"]
        assert semantickitti.parse_sequences(("1", "4", "2,4 1")) == ["01", "04", "02"]
        # `5` and `05` normalize to the same sequence.
        assert semantickitti.parse_sequences(("5", "05")) == ["05"]

    def test_default_sequences_are_the_published_ones(self):
        # Labels are published for sequences 00-10; 11-21 are test-only scans
        assert tuple(f"{i:02d}" for i in range(11)) == semantickitti.DEFAULT_SEQUENCES

    def test_label_type_choices(self):
        assert semantickitti.LABEL_TYPE_CHOICES == ("segmentation", "bbox")
        assert semantickitti.DEFAULT_LABEL_TYPES == semantickitti.LABEL_TYPE_CHOICES


class TestDecimalQuantization:
    def test_decimal_coord_truncates_to_six_places(self):
        assert semantickitti.decimal_coord(1.1234567) == Decimal("1.123456")

    def test_decimal_coord_rounds_towards_zero_for_negatives(self):
        # ROUND_DOWN truncates towards zero rather than to -infinity
        assert semantickitti.decimal_coord(-1.1234567) == Decimal("-1.123456")

    def test_decimal_bbox_coord_truncates_to_five_places(self):
        assert semantickitti.decimal_bbox_coord(1.1234567) == Decimal("1.12345")

    def test_decimal_bbox_size_clamps_to_the_minimum_size(self):
        assert semantickitti.decimal_bbox_size(0.0) == Decimal("0.00001")
        assert semantickitti.decimal_bbox_size(1e-9) == Decimal("0.00001")

    def test_decimal_bbox_size_keeps_larger_sizes(self):
        assert semantickitti.decimal_bbox_size(2.5) == Decimal("2.50000")


class TestFsRelativeUri:
    def test_returns_posix_uri_relative_to_the_fs_root(self, tmp_path: Path):
        data_path = tmp_path / "dataset" / "sequences" / "00" / "scan.bin"

        assert semantickitti.fs_relative_uri(data_path, tmp_path) == "dataset/sequences/00/scan.bin"

    def test_raises_when_the_path_escapes_the_fs_root(self, tmp_path: Path):
        with pytest.raises(click.ClickException, match="must be accessible"):
            semantickitti.fs_relative_uri(tmp_path / "outside.bin", tmp_path / "root")

    def test_validate_data_dir_accepts_nested_paths(self, tmp_path: Path):
        semantickitti.validate_data_dir(tmp_path / "dataset", tmp_path)

    def test_validate_data_dir_rejects_escaping_paths(self, tmp_path: Path):
        with pytest.raises(click.ClickException, match="must be accessible"):
            semantickitti.validate_data_dir(tmp_path, tmp_path / "root")


class TestFrameHelpers:
    def test_dummy_frame_timestamp_starts_at_the_unix_epoch(self):
        assert semantickitti.dummy_frame_timestamp(0) == datetime(1970, 1, 1, tzinfo=timezone.utc)

    def test_dummy_frame_timestamp_advances_by_one_second_per_frame(self):
        timestamp = semantickitti.dummy_frame_timestamp(3661)

        assert timestamp == datetime(1970, 1, 1, tzinfo=timezone.utc) + timedelta(seconds=3661)
        assert timestamp.utcoffset() == timedelta(0)

    def test_data_info_row(self, tmp_path: Path):
        timestamp = datetime(2024, 1, 1, tzinfo=timezone.utc)

        row = semantickitti.data_info_row(
            tmp_path / "data" / "one.bin", tmp_path, timestamp=timestamp
        )

        assert isinstance(row, STInfoRow)
        assert row.file_uri == "data/one.bin"
        assert row.min_timestamp == timestamp
        assert row.max_timestamp == timestamp


class TestParallelHelpers:
    @staticmethod
    def _task(sequence: str) -> semantickitti.SequenceImportTask:
        return semantickitti.SequenceImportTask(
            config_path="/config.yaml",
            data_dir="/dataset",
            sequence=sequence,
            first_frame_index=0,
            source_group_id=1,
            label_branch_id=2,
            user_id=3,
            labels_by_id={0: "unlabeled"},
            learning_map=False,
            import_segmentation=True,
            import_bbox=True,
            label_batch_bytes=64 * 1024 * 1024,
            point_metadata_batch_rows=250,
        )

    def test_single_worker_runs_tasks_without_a_process_pool(self, monkeypatch: pytest.MonkeyPatch):
        called: list[str] = []

        def import_task(task: semantickitti.SequenceImportTask):
            called.append(task.sequence)
            return semantickitti.SequenceImportResult(sequence=task.sequence, frame_count=1)

        monkeypatch.setattr(semantickitti, "import_sequence_worker", import_task)
        tasks = [self._task("04"), self._task("00")]

        results = semantickitti.run_sequence_imports(tasks, workers=1)

        assert called == ["04", "00"]
        assert [result.sequence for result in results] == ["04", "00"]

    def test_parallel_worker_progress_has_distinguishing_prefix(
        self, monkeypatch: pytest.MonkeyPatch
    ):
        monkeypatch.setattr(semantickitti, "_WORKER_NUMBER", 3)

        assert semantickitti.progress_desc("Importing labels") == "[DP3] Importing labels"
        assert semantickitti.progress_position() == 2

    def test_single_worker_progress_remains_unprefixed(self, monkeypatch: pytest.MonkeyPatch):
        monkeypatch.setattr(semantickitti, "_WORKER_NUMBER", None)

        assert semantickitti.progress_desc("Importing labels") == "Importing labels"
        assert semantickitti.progress_position() is None


class TestIterFrames:
    def test_yields_frames_sorted_within_each_sequence(
        self,
        tmp_path: Path,
        write_semantickitti_frame: Callable[..., Path],
    ):
        points = np.zeros((1, 4), dtype=np.float32)
        write_semantickitti_frame(
            tmp_path, sequence="00", frame_idx=1, points=points, semantic_ids=[0], instance_ids=[0]
        )
        write_semantickitti_frame(
            tmp_path, sequence="00", frame_idx=0, points=points, semantic_ids=[0], instance_ids=[0]
        )
        write_semantickitti_frame(
            tmp_path, sequence="04", frame_idx=0, points=points, semantic_ids=[0], instance_ids=[0]
        )

        frames = list(semantickitti.iter_frames(tmp_path, ["00", "04"]))

        assert [(sequence, frame) for sequence, frame, _, _ in frames] == [
            ("00", "000000"),
            ("00", "000001"),
            ("04", "000000"),
        ]

    def test_yields_scan_and_label_paths(
        self, tmp_path: Path, write_semantickitti_frame: Callable[..., Path]
    ):
        write_semantickitti_frame(
            tmp_path,
            sequence="00",
            frame_idx=7,
            points=np.zeros((1, 4), dtype=np.float32),
            semantic_ids=[0],
            instance_ids=[0],
        )

        ((_, _, scan_path, label_path),) = semantickitti.iter_frames(tmp_path, ["00"])

        assert scan_path == tmp_path / "sequences" / "00" / "velodyne" / "000007.bin"
        assert label_path == tmp_path / "sequences" / "00" / "labels" / "000007.label"

    def test_raises_for_a_missing_velodyne_directory(self, tmp_path: Path):
        with pytest.raises(FileNotFoundError, match="missing velodyne directory"):
            list(semantickitti.iter_frames(tmp_path, ["00"]))

    def test_sequence_frame_offsets_match_serial_order(
        self,
        tmp_path: Path,
        write_semantickitti_frame: Callable[..., Path],
    ):
        points = np.zeros((1, 4), dtype=np.float32)
        for frame_idx in range(2):
            write_semantickitti_frame(
                tmp_path,
                sequence="00",
                frame_idx=frame_idx,
                points=points,
                semantic_ids=[0],
                instance_ids=[0],
            )
        for frame_idx in range(3):
            write_semantickitti_frame(
                tmp_path,
                sequence="04",
                frame_idx=frame_idx,
                points=points,
                semantic_ids=[0],
                instance_ids=[0],
            )

        assert semantickitti.sequence_frame_offsets(tmp_path, ["00", "04"]) == {
            "00": 0,
            "04": 2,
        }

    def test_import_points_applies_global_frame_offset(
        self,
        tmp_path: Path,
        write_semantickitti_frame: Callable[..., Path],
    ):
        write_semantickitti_frame(
            tmp_path,
            sequence="04",
            frame_idx=0,
            points=np.zeros((1, 4), dtype=np.float32),
            semantic_ids=[0],
            instance_ids=[0],
        )

        rows = semantickitti.get_data_info_rows(
            root=tmp_path,
            sequences=["04"],
            fs_root=tmp_path,
            frame_index_offset=7,
        )

        assert rows[0].min_timestamp == semantickitti.dummy_frame_timestamp(7)


class TestReadPoints:
    def test_reads_float32_xyz_remission_rows(self, tmp_path: Path):
        scan_path = tmp_path / "scan.bin"
        np.array([[1, 2, 3, 0.5], [4, 5, 6, 0.25]], dtype=np.float32).tofile(scan_path)

        points = semantickitti.read_points(scan_path)

        assert points.shape == (2, 4)
        assert points.dtype == np.float32
        np.testing.assert_array_equal(points[0], [1, 2, 3, 0.5])

    def test_raises_when_the_size_is_not_a_multiple_of_four(self, tmp_path: Path):
        scan_path = tmp_path / "bad.bin"
        np.zeros(5, dtype=np.float32).tofile(scan_path)

        with pytest.raises(ValueError, match="does not contain float32 x/y/z/remission rows"):
            semantickitti.read_points(scan_path)

    def test_raises_for_an_empty_scan(self, tmp_path: Path):
        scan_path = tmp_path / "empty.bin"
        scan_path.touch()

        with pytest.raises(ValueError, match="does not contain float32 x/y/z/remission rows"):
            semantickitti.read_points(scan_path)


class TestValidatePointFiles:
    def test_rejects_empty_scans_before_import(self, tmp_path: Path):
        scan_dir = tmp_path / "sequences" / "00" / "velodyne"
        scan_dir.mkdir(parents=True)
        (scan_dir / "000000.bin").touch()

        with pytest.raises(click.ClickException, match=r"000000\.bin"):
            semantickitti.validate_point_files(tmp_path, ["00"])


class TestReadLabels:
    def test_unpacks_semantic_and_instance_ids(self, tmp_path: Path):
        label_path = tmp_path / "scan.label"
        # Official packing: uint32 with the semantic ID in the lower 16 bits
        # and the instance ID in the upper 16 bits
        packed = np.array(
            [
                (5 << 16) | 10,
                0,
                (700 << 16) | 252,
            ],
            dtype=np.uint32,
        )
        packed.tofile(label_path)

        raw_labels, semantic_labels, instance_labels = semantickitti.read_labels(label_path)

        np.testing.assert_array_equal(raw_labels, packed)
        np.testing.assert_array_equal(semantic_labels, [10, 0, 252])
        np.testing.assert_array_equal(instance_labels, [5, 0, 700])


class TestImportPoints:
    def test_builds_one_row_per_frame_with_dummy_timestamps(
        self,
        tmp_path: Path,
        write_semantickitti_frame: Callable[..., Path],
    ):
        dataset_root = tmp_path / "dataset"
        points = np.zeros((1, 4), dtype=np.float32)
        write_semantickitti_frame(
            dataset_root,
            sequence="00",
            frame_idx=0,
            points=points,
            semantic_ids=[0],
            instance_ids=[0],
        )
        write_semantickitti_frame(
            dataset_root,
            sequence="00",
            frame_idx=1,
            points=points,
            semantic_ids=[0],
            instance_ids=[0],
        )

        rows = semantickitti.get_data_info_rows(
            root=dataset_root, sequences=["00"], fs_root=tmp_path
        )

        assert [row.file_uri for row in rows] == [
            "dataset/sequences/00/velodyne/000000.bin",
            "dataset/sequences/00/velodyne/000001.bin",
        ]
        # Timestamps are frame-indexed placeholders, not real scan times
        assert rows[0].min_timestamp == semantickitti.dummy_frame_timestamp(0)
        assert rows[0].max_timestamp == semantickitti.dummy_frame_timestamp(0)
        assert rows[1].min_timestamp == semantickitti.dummy_frame_timestamp(1)

    def test_timestamps_continue_across_sequences(
        self, tmp_path: Path, write_semantickitti_frame: Callable[..., Path]
    ):
        dataset_root = tmp_path / "dataset"
        points = np.zeros((1, 4), dtype=np.float32)
        write_semantickitti_frame(
            dataset_root,
            sequence="00",
            frame_idx=0,
            points=points,
            semantic_ids=[0],
            instance_ids=[0],
        )
        write_semantickitti_frame(
            dataset_root,
            sequence="01",
            frame_idx=0,
            points=points,
            semantic_ids=[0],
            instance_ids=[0],
        )

        rows = semantickitti.get_data_info_rows(
            root=dataset_root, sequences=["00", "01"], fs_root=tmp_path
        )

        assert [row.min_timestamp for row in rows] == [
            semantickitti.dummy_frame_timestamp(0),
            semantickitti.dummy_frame_timestamp(1),
        ]


class TestStItemsFromRows:
    def test_converts_rows_to_metadata_with_identity_transforms(self, fs_root: Path):
        timestamp = datetime(2024, 1, 1, tzinfo=timezone.utc)
        rows = [
            STInfoRow(file_uri="data/one.bin", min_timestamp=timestamp, max_timestamp=timestamp)
        ]

        (item,) = semantickitti.st_items_from_rows(rows)

        assert item.filepath == FileSystemPath.from_uri("data/one.bin")
        assert item.min_timestamp == timestamp
        assert item.max_timestamp == timestamp

        transform = item.file_coords_to_db_coords
        assert transform.translation == DecimalCoord3(x=Decimal(0), y=Decimal(0), z=Decimal(0))
        assert transform.rotation == DecimalCoord3(x=Decimal(0), y=Decimal(0), z=Decimal(0))
        assert transform.scale == DecimalCoord3(x=Decimal(1), y=Decimal(1), z=Decimal(1))


def test_stable_uuid_int_is_deterministic_and_distinct():
    first = semantickitti.stable_uuid_int("selection", "00", "000000", 10, 1)

    assert first == semantickitti.stable_uuid_int("selection", "00", "000000", 10, 1)
    assert first != semantickitti.stable_uuid_int("selection", "00", "000000", 10, 2)
    assert first != semantickitti.stable_uuid_int("instance", "00", "000000", 10, 1)

    # The value must fit into a UUID
    assert uuid.UUID(int=first).int == first


class TestReadPointsFromFsPath:
    def test_reads_points_through_the_filesystem_context(self, fs_root: Path):
        scan_path = fs_root / "scan.bin"
        np.array([[1, 2, 3, 0.5]], dtype=np.float32).tofile(scan_path)

        points = semantickitti.read_points_from_fs_path(FileSystemPath.from_uri("scan.bin"))

        assert points.shape == (1, 4)
        np.testing.assert_array_equal(points[0], [1, 2, 3, 0.5])

    def test_raises_for_malformed_point_files(self, fs_root: Path):
        np.zeros(5, dtype=np.float32).tofile(fs_root / "bad.bin")

        with pytest.raises(ValueError, match="bad\\.bin"):
            semantickitti.read_points_from_fs_path(FileSystemPath.from_uri("bad.bin"))

    def test_raises_for_empty_point_files(self, fs_root: Path):
        (fs_root / "empty.bin").touch()

        with pytest.raises(ValueError, match=r"empty\.bin"):
            semantickitti.read_points_from_fs_path(FileSystemPath.from_uri("empty.bin"))


class TestTransformedXyz:
    def test_identity_transform_keeps_the_points(self):
        xyz = np.array([[1, 2, 3], [4, 5, 6]], dtype=np.float32)

        transformed = semantickitti.transformed_xyz(xyz, Transform.from_optional())

        np.testing.assert_array_equal(transformed, xyz)

    def test_translation_is_applied(self):
        xyz = np.array([[1, 2, 3]], dtype=np.float32)
        transform = Transform.from_optional(
            translation=OptionalDecimalCoord3(x=Decimal(10), y=Decimal(20), z=Decimal(30)),
        )

        (transformed,) = semantickitti.transformed_xyz(xyz, transform)

        np.testing.assert_allclose(transformed, [11, 22, 33])


class TestClassIdsFromSemanticLabels:
    def test_returns_the_labels_unchanged_without_the_learning_map(self):
        labels = np.array([10, 0, 252], dtype=np.uint32)

        result = semantickitti.class_ids_from_semantic_labels(labels, learning_map=False)

        assert result is labels

    def test_maps_labels_to_learning_class_ids(self):
        labels = np.array([10, 252, 52, 0], dtype=np.uint32)

        result = semantickitti.class_ids_from_semantic_labels(labels, learning_map=True)

        np.testing.assert_array_equal(result, [1, 1, 0, 0])
        assert result.dtype == np.uint16

    def test_empty_input_with_the_learning_map_returns_empty(self):
        result = semantickitti.class_ids_from_semantic_labels(
            np.array([], dtype=np.uint32), learning_map=True
        )

        assert result.shape == (0,)

    def test_unknown_label_below_the_lut_size_raises(self):
        # 2 is within the LUT range but has no learning-map entry
        with pytest.raises(ValueError, match=r"unknown SemanticKITTI semantic label\(s\): \[2\]"):
            semantickitti.class_ids_from_semantic_labels(
                np.array([2], dtype=np.uint32), learning_map=True
            )

    def test_unknown_label_beyond_the_lut_size_raises(self):
        with pytest.raises(ValueError, match=r"unknown SemanticKITTI semantic label\(s\): \[300\]"):
            semantickitti.class_ids_from_semantic_labels(
                np.array([300], dtype=np.uint32), learning_map=True
            )


class TestIterPointGroups:
    def test_groups_points_by_class_and_instance(self):
        xyz = np.array([[0, 0, 0], [1, 0, 0], [2, 0, 0], [3, 0, 0]], dtype=np.float64)
        class_ids = np.array([10, 10, 0, 10])
        instance_labels = np.array([1, 1, 0, 2])

        groups = list(
            semantickitti.iter_point_groups(
                xyz=xyz,
                class_ids=class_ids,
                instance_labels=instance_labels,
            )
        )

        assert [(class_id, instance_id) for class_id, instance_id, _ in groups] == [
            (0, 0),
            (10, 1),
            (10, 2),
        ]
        np.testing.assert_array_equal(groups[0][2], [[2, 0, 0]])
        np.testing.assert_array_equal(groups[1][2], [[0, 0, 0], [1, 0, 0]])
        np.testing.assert_array_equal(groups[2][2], [[3, 0, 0]])

    def test_empty_input_yields_no_groups(self):
        empty = np.empty((0,), dtype=np.uint32)

        groups = list(
            semantickitti.iter_point_groups(
                xyz=np.empty((0, 3), dtype=np.float64),
                class_ids=empty,
                instance_labels=empty,
            )
        )

        assert groups == []


class TestLabelSelectionFromXyz:
    def test_builds_a_multipoint_selection_with_decimal_bounds(self):
        xyz = np.array([[-1, -2, -3], [0, 0, 0], [1, 2, 3]], dtype=np.float64)
        timestamp = semantickitti.dummy_frame_timestamp(0)
        entity_id = uuid.uuid4()

        selection = semantickitti.label_selection_from_xyz(
            id=uuid.uuid4(),
            group_id=7,
            commit_hash="commit",
            xyz=xyz,
            timestamp=timestamp,
            entity_id=entity_id,
            perceived_class_id=42,
        )

        assert selection.group_id == 7
        assert selection.commit_hash == "commit"
        assert (selection.min_x, selection.min_y, selection.min_z) == (
            Decimal("-1.000000"),
            Decimal("-2.000000"),
            Decimal("-3.000000"),
        )
        assert (selection.max_x, selection.max_y, selection.max_z) == (
            Decimal("1.000000"),
            Decimal("2.000000"),
            Decimal("3.000000"),
        )
        assert selection.min_timestamp == timestamp
        assert selection.max_timestamp == timestamp
        assert selection.timestamp == timestamp
        assert selection.entity_id == entity_id
        assert selection.perceived_class_id == 42
        assert selection.distinctive_lv is None
        assert selection.occlusion_lv is None

        geometry = wkb.loads(bytes(selection.selection.data))
        assert geometry.geom_type == "MultiPoint"
        assert geometry.has_z
        assert len(geometry.geoms) == 3


class TestBestFitCuboidFromXyz:
    @staticmethod
    def box_corners(
        *, x_size: float, y_size: float, z_size: float, origin=(0.0, 0.0, 0.0)
    ) -> np.ndarray:
        x0, y0, z0 = origin

        return np.array(
            [
                [x0, y0, z0],
                [x0 + x_size, y0, z0],
                [x0 + x_size, y0 + y_size, z0],
                [x0, y0 + y_size, z0],
                [x0, y0, z0 + z_size],
                [x0 + x_size, y0, z0 + z_size],
                [x0 + x_size, y0 + y_size, z0 + z_size],
                [x0, y0 + y_size, z0 + z_size],
            ],
            dtype=np.float64,
        )

    def test_axis_aligned_box_is_fitted_exactly(self):
        xyz = self.box_corners(x_size=4, y_size=2, z_size=3, origin=(0, 0, 1))

        center, angle, size = semantickitti.best_fit_cuboid_from_xyz(xyz)

        # The long side lies on the x axis, so the heading is zero and
        # size.x follows the heading direction
        assert angle == Decimal("0.00000")
        assert (center.x, center.y, center.z) == (
            Decimal("2.00000"),
            Decimal("1.00000"),
            Decimal("2.50000"),
        )
        assert (size.x, size.y, size.z) == (
            Decimal("4.00000"),
            Decimal("2.00000"),
            Decimal("3.00000"),
        )

    def test_rotated_point_line_estimates_the_heading(self):
        t = np.linspace(-2, 2, 9)
        xyz = np.column_stack([t / np.sqrt(2), t / np.sqrt(2), np.zeros_like(t)])

        _, angle, size = semantickitti.best_fit_cuboid_from_xyz(xyz)

        assert abs(angle - Decimal("0.78540")) <= Decimal("0.00001")
        # The line is ~4 units long along the heading and degenerate across it
        assert abs(size.x - Decimal(4)) <= Decimal("0.00001")
        assert size.y == Decimal("0.00001")

    def test_fewer_than_three_points_default_to_a_zero_heading(self):
        xyz = np.array([[0, 0, 0], [1, 1, 1]], dtype=np.float64)

        _, angle, size = semantickitti.best_fit_cuboid_from_xyz(xyz)

        assert angle == Decimal("0.00000")
        assert (size.x, size.y, size.z) == (
            Decimal("1.00000"),
            Decimal("1.00000"),
            Decimal("1.00000"),
        )

    def test_a_single_point_is_clamped_to_the_minimum_size(self):
        xyz = np.array([[5, 6, 7]], dtype=np.float64)

        center, angle, size = semantickitti.best_fit_cuboid_from_xyz(xyz)

        assert angle == Decimal("0.00000")
        assert (center.x, center.y, center.z) == (
            Decimal("5.00000"),
            Decimal("6.00000"),
            Decimal("7.00000"),
        )
        assert (size.x, size.y, size.z) == (Decimal("0.00001"),) * 3


class TestLabelBoxFromXyz:
    def test_builds_a_cuboid_from_the_best_fit(self):
        xyz = TestBestFitCuboidFromXyz.box_corners(x_size=4, y_size=2, z_size=3, origin=(0, 0, 1))
        timestamp = semantickitti.dummy_frame_timestamp(1)
        box_id = uuid.uuid4()
        entity_id = uuid.uuid4()

        box = semantickitti.label_box_from_xyz(
            id=box_id,
            group_id=3,
            commit_hash="commit",
            xyz=xyz,
            timestamp=timestamp,
            entity_id=entity_id,
            perceived_class_id=10,
        )

        expected_center, expected_angle, expected_size = semantickitti.best_fit_cuboid_from_xyz(xyz)

        assert box.id == box_id
        assert box.group_id == 3
        assert box.commit_hash == "commit"
        assert box.type == semantickitti.BoxType.CUBOID
        assert box.timestamp == timestamp
        assert box.entity_id == entity_id
        assert box.perceived_class_id == 10
        assert box.center == expected_center
        assert box.angle == expected_angle
        assert box.size == expected_size


class TestEmptyBatchFlushes:
    def test_flush_point_metadata_batch_is_a_noop_for_empty_batches(self):
        # The session is never touched on the empty path
        semantickitti.flush_point_metadata_batch(current_user=None, session=None, pcd_items=[])

    def test_point_metadata_flush_creates_the_batch_it_was_given(
        self, monkeypatch: pytest.MonkeyPatch
    ):
        """The batch reaches the domain before the caller's list is emptied.

        Both halves are needed: handing over the list and then clearing it in place means a
        swapped pair of lines would send an empty batch and still report success, while a
        copy made instead of the original would leave the caller accumulating rows forever.
        """
        received: list[tuple[int, bool]] = []

        def bulk_create_datas(**kwargs: object):
            data = kwargs["data"]
            assert isinstance(data, list)
            received.append((len(data), data is items))

        monkeypatch.setattr(
            semantickitti.pcd_metadata_domain,
            "bulk_create_datas",
            bulk_create_datas,
        )
        items = [object()]

        semantickitti.flush_point_metadata_batch(
            current_user="user",
            session="session",
            pcd_items=items,
        )

        assert received == [(1, True)], "the full batch, by identity, before it is cleared"
        assert items == []

    def test_flush_label_batch_is_a_noop_for_empty_batches(self):
        semantickitti.flush_label_batch(
            current_user=None,
            session=None,
            instance_items=[],
            selection_items=[],
            track_items=[],
            box_items=[],
        )
