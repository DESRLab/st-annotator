"""Tests for the DB-coupled helpers of ``scripts/import_semantickitti.py``.

These run against the standard throwaway test database from the ``test_app``
fixture machinery and a tiny synthetic SemanticKITTI dataset, so they cover
the import pipeline end to end without needing the real dataset.
"""

from __future__ import annotations

from decimal import Decimal
from typing import TYPE_CHECKING
from uuid import UUID

import click
import scripts.import_semantickitti as semantickitti

import numpy as np

from sqlmodel import Session, select

import pytest

from sta.common.database.execution import sql_column
from sta.common.filesystem import FilesystemConfig, fs_ctx
from sta.domain.label.spec.objclass import (
    definitions as objclass_definitions,
    selections as objclass_selections_domain,
)
from sta.domain.source.groups import create_group as create_source_group
from sta.models.job import Job
from sta.models.label.group import LabelGroup
from sta.models.label.spec.objclass import ObjectClass, ObjectClassCreate
from sta.models.source.group import SourceGroup, SourceGroupCreate, SourceGroupPublic
from sta.models.user import UserPublic
from sta_bbox.models.label.data import LabelBox, LabelTrack
from sta_pcd.domain.source.data import metadata as pcd_metadata_domain
from sta_pcd.domain.source.spec import specs as pcd_specs_domain
from sta_segmentation.models.label.data import LabelInstance, LabelSelection

from .semantickitti_helpers import write_two_class_frames

pytestmark = pytest.mark.no_plugins

if TYPE_CHECKING:
    from collections.abc import Callable
    from pathlib import Path


def test_create_point_cloud_import_group_creates_group_and_spec(
    root_user: UserPublic, session: Session
):
    group = semantickitti.create_point_cloud_import_group(
        current_user=root_user,
        session=session,
        name="SemanticKITTI",
    )

    assert isinstance(group, SourceGroupPublic)
    assert group.id is not None
    assert group.name == "SemanticKITTI"

    spec = pcd_specs_domain.read_spec_in_group(
        current_user=root_user,
        session=session,
        group_id=group.id,
    )

    assert spec is not None
    assert spec.name == "SemanticKITTI point cloud"


def test_import_point_entries_to_db(
    tmp_path: Path,
    root_user: UserPublic,
    session: Session,
    write_semantickitti_frame: Callable[..., Path],
):
    dataset_root = tmp_path / "dataset"
    points = [
        [1.5, 2.25, 0.5, 0.1],
        [-3.75, 4.0, 1.25, 0.2],
    ]
    write_semantickitti_frame(
        dataset_root,
        sequence="00",
        frame_idx=0,
        points=points,
        semantic_ids=[10, 10],
        instance_ids=[1, 1],
    )

    group = semantickitti.create_point_cloud_import_group(
        current_user=root_user,
        session=session,
        name="SemanticKITTI",
    )
    data_info_rows = semantickitti.get_data_info_rows(
        root=dataset_root, sequences=["00"], fs_root=tmp_path
    )

    # The test app fixture carries its own filesystem context, so root the
    # filesystem at the dataset explicitly while reading the point files
    with fs_ctx(FilesystemConfig(root=tmp_path).get_fs()):
        semantickitti.import_point_entries_to_db(
            data_info_rows=data_info_rows,
            current_user=root_user,
            session=session,
            source_group=group,
        )

    metadatas = pcd_metadata_domain.list_datas(
        current_user=root_user, session=session, group_id=group.id
    )

    assert len(metadatas) == 1
    metadata = metadatas[0]
    assert metadata.uri == "dataset/sequences/00/velodyne/000000.bin"
    assert metadata.min_x == Decimal("-3.750000")
    assert metadata.max_x == Decimal("1.500000")
    assert metadata.min_y == Decimal("2.250000")
    assert metadata.max_y == Decimal("4.000000")
    assert metadata.min_z == Decimal("0.500000")
    assert metadata.max_z == Decimal("1.250000")
    assert metadata.min_timestamp == semantickitti.dummy_frame_timestamp(0)
    assert metadata.max_timestamp == semantickitti.dummy_frame_timestamp(0)

    # The script read each box from the raw scan, which is not what the group's own
    # configuration produces, so it must leave every record awaiting a sweep and queue
    # exactly one for the group rather than vouching for the boxes it guessed.
    assert metadata.auto_bounds is True
    assert metadata.bounds_config_hash is None, "the import attests nothing it did not derive"
    assert pcd_metadata_domain.pending_bounds_group_ids(session=session, group_ids={group.id}) == {
        group.id
    }
    queued = session.exec(
        select(Job).where(
            sql_column(Job.dedupe_key) == f"{pcd_metadata_domain.reconcile_kind}:{group.id}"
        )
    ).all()
    assert [job.kind for job in queued] == [pcd_metadata_domain.reconcile_kind]

    # The sweep the import drains is registered by the pcd plugin, and this module runs
    # `no_plugins`, so the job above cannot execute here -- the box is still the script's
    # reading for that reason alone. `plugins/pcd/backend/test/cli/test_import_by_st.py`
    # covers a load that does re-derive under the group's configuration.

    # A source group without a point cloud spec cannot receive imports
    bare_record = create_source_group(
        current_user=root_user,
        session=session,
        data=SourceGroupCreate(name="bare-group"),
    )
    session.flush([bare_record])
    bare_group = SourceGroupPublic.model_validate(bare_record)

    with pytest.raises(click.ClickException, match="No point cloud source defined"):
        semantickitti.import_point_entries_to_db(
            data_info_rows=[],
            current_user=root_user,
            session=session,
            source_group=bare_group,
        )


def test_create_label_import_branch(root_user: UserPublic, session: Session):
    labels_by_id = {10: "car", 1: "outlier", 50: "building"}
    created_objclass_ids: set[int] = set()

    branch = semantickitti.create_label_import_branch(
        current_user=root_user,
        session=session,
        group_name="SemanticKITTI labels",
        branch_name="main",
        labels_by_id=labels_by_id,
        created_objclass_ids=created_objclass_ids,
    )

    assert branch.name == "main"
    assert branch.group_id is not None
    assert branch.head is not None
    assert branch.head.group_id == branch.group_id

    selection = objclass_selections_domain.read_spec_in_group(
        current_user=root_user,
        session=session,
        group_id=branch.group_id,
    )

    assert selection is not None
    assert selection.name == "SemanticKITTI labels object classes"
    assert {objclass.name for objclass in selection.objclasses} == set(labels_by_id.values())
    assert created_objclass_ids == {objclass.id for objclass in selection.objclasses}


def test_get_or_create_object_class_is_idempotent(root_user: UserPublic, session: Session):
    created_objclass_ids: set[int] = set()
    first = semantickitti.get_or_create_object_class(
        current_user=root_user,
        session=session,
        name="car",
        created_ids=created_objclass_ids,
    )
    second = semantickitti.get_or_create_object_class(
        current_user=root_user,
        session=session,
        name="car",
        created_ids=created_objclass_ids,
    )

    assert first.id is not None
    assert second.id == first.id
    assert created_objclass_ids == {first.id}


def test_cleanup_failed_import_removes_only_new_object_classes(
    root_user: UserPublic,
    session: Session,
):
    existing = objclass_definitions.create_objclass(
        current_user=root_user,
        session=session,
        data=ObjectClassCreate(name="existing-class"),
    )
    created_objclass_ids: set[int] = set()
    source_group = semantickitti.create_point_cloud_import_group(
        current_user=root_user,
        session=session,
        name="failed-source-group",
    )
    branch = semantickitti.create_label_import_branch(
        current_user=root_user,
        session=session,
        group_name="failed-label-group",
        branch_name="main",
        labels_by_id={0: "existing-class", 1: "new-class"},
        created_objclass_ids=created_objclass_ids,
    )
    assert len(created_objclass_ids) == 1
    new_objclass_id = next(iter(created_objclass_ids))

    retained = semantickitti.cleanup_failed_import_in_session(
        current_user=root_user,
        session=session,
        source_group_id=source_group.id,
        label_group_id=branch.group_id,
        created_objclass_ids=created_objclass_ids,
    )

    assert retained == set()
    assert session.get(SourceGroup, source_group.id) is None
    assert session.get(LabelGroup, branch.group_id) is None
    new_objclass = session.get(ObjectClass, new_objclass_id)
    assert new_objclass is not None
    assert new_objclass.is_deleted

    existing_objclass = session.get(ObjectClass, existing.id)
    assert existing_objclass is not None
    assert not existing_objclass.is_deleted


def test_import_labels_to_db_segmentation_and_bbox(
    tmp_path: Path,
    root_user: UserPublic,
    session: Session,
):
    dataset_root = write_two_class_frames(tmp_path, frame_count=2)
    labels_by_id = dict(semantickitti.SEMANTIC_KITTI_LABELS)

    branch = semantickitti.create_label_import_branch(
        current_user=root_user,
        session=session,
        group_name="SemanticKITTI",
        branch_name="main",
        labels_by_id=labels_by_id,
    )

    semantickitti.import_labels_to_db(
        root=dataset_root,
        sequences=["00"],
        current_user=root_user,
        session=session,
        label_branch=branch,
        labels_by_id=labels_by_id,
        learning_map=False,
        import_segmentation=True,
        import_bbox=True,
    )

    commit = branch.head
    selection = objclass_selections_domain.read_spec_in_group(
        current_user=root_user,
        session=session,
        group_id=branch.group_id,
    )
    objclass_ids = {objclass.name: objclass.id for objclass in selection.objclasses}

    selections = session.exec(
        select(LabelSelection).where(
            LabelSelection.group_id == commit.group_id,
            LabelSelection.commit_hash == commit.hash,
        ),
    ).all()
    instances = session.exec(
        select(LabelInstance).where(
            LabelInstance.group_id == commit.group_id,
            LabelInstance.commit_hash == commit.hash,
        ),
    ).all()
    tracks = session.exec(
        select(LabelTrack).where(
            LabelTrack.group_id == commit.group_id,
            LabelTrack.commit_hash == commit.hash,
        ),
    ).all()
    boxes = session.exec(
        select(LabelBox).where(
            LabelBox.group_id == commit.group_id,
            LabelBox.commit_hash == commit.hash,
        ),
    ).all()

    # Each frame has three point groups (car instance, truck instance, unlabeled)
    assert len(selections) == 6
    # Instances exist only for non-zero instance IDs
    assert len(instances) == 4
    # Tracks are keyed by (sequence, class, instance), so they persist across frames;
    # class 0 points never produce boxes or tracks
    assert len(tracks) == 2
    assert len(boxes) == 4
    assert all(semantickitti.segmentation_entity_domain.has_children(i) for i in instances)
    assert all(semantickitti.bbox_entity_domain.has_children(track) for track in tracks)

    instance_ids = {instance.id for instance in instances}
    track_ids = {track.id for track in tracks}

    labeled_selections = [s for s in selections if s.entity_id is not None]
    unlabeled_selections = [s for s in selections if s.entity_id is None]
    assert len(labeled_selections) == 4
    assert len(unlabeled_selections) == 2
    assert {s.entity_id for s in labeled_selections} == instance_ids
    # Class 0 selections carry the "unlabeled" object class but no instance entity
    assert all(s.perceived_class_id == objclass_ids["unlabeled"] for s in unlabeled_selections)

    car_selections = [s for s in selections if s.perceived_class_id == objclass_ids["car"]]
    truck_selections = [s for s in selections if s.perceived_class_id == objclass_ids["truck"]]
    assert len(car_selections) == 2
    assert len(truck_selections) == 2

    assert {box.entity_id for box in boxes} == track_ids
    car_track_ids = {track.id for track in tracks if track.gt_class_id == objclass_ids["car"]}
    assert len(car_track_ids) == 1
    car_boxes = [box for box in boxes if box.entity_id in car_track_ids]
    assert len(car_boxes) == 2
    # The same (sequence, class, instance) pair reuses one track across frames
    assert car_boxes[0].entity_id == car_boxes[1].entity_id

    car_box_by_timestamp = {box.timestamp: box for box in car_boxes}
    assert set(car_box_by_timestamp) == {
        semantickitti.dummy_frame_timestamp(0),
        semantickitti.dummy_frame_timestamp(1),
    }
    # The car points span x in [1, 2], y in [1, 1], z in [0, 0]
    car_box = car_box_by_timestamp[semantickitti.dummy_frame_timestamp(0)]
    assert car_box.center.x == Decimal("1.50000")
    assert car_box.size.x == Decimal("1.00000")
    assert car_box.size.y == Decimal("0.00001")


def test_import_labels_to_db_bbox_only(
    tmp_path: Path,
    root_user: UserPublic,
    session: Session,
):
    dataset_root = write_two_class_frames(tmp_path, frame_count=1)
    labels_by_id = dict(semantickitti.SEMANTIC_KITTI_LABELS)

    branch = semantickitti.create_label_import_branch(
        current_user=root_user,
        session=session,
        group_name="SemanticKITTI bbox-only",
        branch_name="main",
        labels_by_id=labels_by_id,
    )

    semantickitti.import_labels_to_db(
        root=dataset_root,
        sequences=["00"],
        current_user=root_user,
        session=session,
        label_branch=branch,
        labels_by_id=labels_by_id,
        learning_map=False,
        import_segmentation=False,
        import_bbox=True,
    )

    commit = branch.head
    selections = session.exec(
        select(LabelSelection).where(
            LabelSelection.group_id == commit.group_id,
            LabelSelection.commit_hash == commit.hash,
        ),
    ).all()
    instances = session.exec(
        select(LabelInstance).where(
            LabelInstance.group_id == commit.group_id,
            LabelInstance.commit_hash == commit.hash,
        ),
    ).all()
    tracks = session.exec(
        select(LabelTrack).where(
            LabelTrack.group_id == commit.group_id,
            LabelTrack.commit_hash == commit.hash,
        ),
    ).all()
    boxes = session.exec(
        select(LabelBox).where(
            LabelBox.group_id == commit.group_id,
            LabelBox.commit_hash == commit.hash,
        ),
    ).all()

    assert selections == []
    assert instances == []
    assert len(tracks) == 2
    assert len(boxes) == 2
    assert all(semantickitti.bbox_entity_domain.has_children(track) for track in tracks)


def test_import_labels_to_db_error_paths(
    tmp_path: Path,
    root_user: UserPublic,
    session: Session,
    write_semantickitti_frame: Callable[..., Path],
):
    labels_by_id = dict(semantickitti.SEMANTIC_KITTI_LABELS)
    branch = semantickitti.create_label_import_branch(
        current_user=root_user,
        session=session,
        group_name="SemanticKITTI errors",
        branch_name="main",
        labels_by_id=labels_by_id,
    )

    # A scan without its label file is reported before any row is written
    missing_label_root = tmp_path / "missing-labels"
    scan_dir = missing_label_root / "sequences" / "00" / "velodyne"
    scan_dir.mkdir(parents=True)
    np.zeros((1, 4), dtype=np.float32).tofile(scan_dir / "000000.bin")

    with pytest.raises(FileNotFoundError, match="missing label file"):
        semantickitti.import_labels_to_db(
            root=missing_label_root,
            sequences=["00"],
            current_user=root_user,
            session=session,
            label_branch=branch,
            labels_by_id=labels_by_id,
            learning_map=False,
            import_segmentation=True,
            import_bbox=True,
        )

    # Points and labels must agree on the point count per frame
    mismatch_root = tmp_path / "mismatch"
    write_semantickitti_frame(
        mismatch_root,
        sequence="00",
        frame_idx=0,
        points=[[0, 0, 0, 0], [1, 1, 1, 0]],
        semantic_ids=[10],
        instance_ids=[1],
    )

    with pytest.raises(ValueError, match="point/label count mismatch"):
        semantickitti.import_labels_to_db(
            root=mismatch_root,
            sequences=["00"],
            current_user=root_user,
            session=session,
            label_branch=branch,
            labels_by_id=labels_by_id,
            learning_map=False,
            import_segmentation=True,
            import_bbox=True,
        )


def test_import_labels_to_db_flushes_batches_mid_loop(
    tmp_path: Path,
    root_user: UserPublic,
    session: Session,
    write_semantickitti_frame: Callable[..., Path],
):
    # More frames than LABEL_BATCH_FRAMES so the mid-loop flush runs at least once
    frame_count = semantickitti.LABEL_BATCH_FRAMES + 1
    dataset_root = tmp_path / "dataset"
    for frame_idx in range(frame_count):
        write_semantickitti_frame(
            dataset_root,
            sequence="00",
            frame_idx=frame_idx,
            points=[[float(frame_idx), 0, 0, 0]],
            semantic_ids=[10],
            instance_ids=[1],
        )

    labels_by_id = dict(semantickitti.SEMANTIC_KITTI_LABELS)
    branch = semantickitti.create_label_import_branch(
        current_user=root_user,
        session=session,
        group_name="SemanticKITTI batches",
        branch_name="main",
        labels_by_id=labels_by_id,
    )

    semantickitti.import_labels_to_db(
        root=dataset_root,
        sequences=["00"],
        current_user=root_user,
        session=session,
        label_branch=branch,
        labels_by_id=labels_by_id,
        learning_map=False,
        import_segmentation=True,
        import_bbox=True,
    )

    commit = branch.head
    selections = session.exec(
        select(LabelSelection).where(
            LabelSelection.group_id == commit.group_id,
            LabelSelection.commit_hash == commit.hash,
        ),
    ).all()
    tracks = session.exec(
        select(LabelTrack).where(
            LabelTrack.group_id == commit.group_id,
            LabelTrack.commit_hash == commit.hash,
        ),
    ).all()
    boxes = session.exec(
        select(LabelBox).where(
            LabelBox.group_id == commit.group_id,
            LabelBox.commit_hash == commit.hash,
        ),
    ).all()

    assert len(selections) == frame_count
    assert len(boxes) == frame_count
    assert len(tracks) == 1
    # IDs are derived deterministically, so a double flush would collide loudly;
    # reaching here with the expected counts means both flush paths ran cleanly
    assert all(isinstance(selection.id, UUID) for selection in selections)
