import uuid
from datetime import datetime, timezone

import pytest

from sta.common.spatial import DecimalCoord3
from sta.config import AppConfig
from sta.domain.editor.loader import LABEL_DATA_LOADERS
from sta.domain.frames import create_frame
from sta.models.frame import FrameCreate, FramePublic, WorkType
from sta.models.label.repo import LabelsetBranchPublic
from sta.models.label.spec import ObjectClassSelectionPublic
from sta.models.task import TaskPublic
from sta.models.user import UserPublic
from sta.session import session_ctx
from sta_segmentation.domain.editor.loader import SegmentationData, SegmentationLoader
from sta_segmentation.domain.label.data import element as element_domain, entity as entity_domain
from sta_segmentation.models.label.data import (
    DistinctiveLevel,
    LabelInstance,
    LabelSelection,
    OcclusionLevel,
)

TIMESTAMP = datetime(2024, 1, 1, tzinfo=timezone.utc)


def _get_loader() -> SegmentationLoader:
    loader = LABEL_DATA_LOADERS.get("segmentation")
    assert isinstance(loader, SegmentationLoader)
    assert loader.data_model is SegmentationData

    return loader


def _seed_labels(
    test_app_config: AppConfig,
    root_user: UserPublic,
    labelset_branch: LabelsetBranchPublic,
    object_class_selection: ObjectClassSelectionPublic,
) -> tuple[uuid.UUID, uuid.UUID, uuid.UUID, uuid.UUID]:
    """Seed one instance and two selections at the branch head.

    Returns the instance id, the id of a selection inside the default frame
    bounds, and the id of a selection far outside of them.
    """
    gt_class_id = object_class_selection.objclasses[0].id

    instance = LabelInstance(
        group_id=labelset_branch.group_id,
        commit_hash=labelset_branch.head_hash,
        is_black=True,
        gt_class_id=gt_class_id,
    )
    orphan_instance = LabelInstance(
        group_id=labelset_branch.group_id,
        commit_hash=labelset_branch.head_hash,
        gt_class_id=gt_class_id,
    )
    in_bounds = LabelSelection.from_points(
        group_id=labelset_branch.group_id,
        commit_hash=labelset_branch.head_hash,
        points=[DecimalCoord3(x=1, y=2, z=3), DecimalCoord3(x=4, y=5, z=6)],
        timestamp=TIMESTAMP,
        entity_id=instance.id,
        perceived_class_id=gt_class_id,
        distinctive_lv=DistinctiveLevel.SATISFACTORY,
        occlusion_lv=OcclusionLevel.POOR,
    )
    out_of_bounds = LabelSelection.from_points(
        group_id=labelset_branch.group_id,
        commit_hash=labelset_branch.head_hash,
        points=[DecimalCoord3(x=100, y=100, z=100)],
        timestamp=TIMESTAMP,
    )
    entity_domain.initialize_has_children(instance, value=True)

    # Bulk-create preserves the generated ids and avoids the
    # `table_cls.model_validate(data)` relationship pitfall of `create_data`
    # when given a table-model instance directly.
    with session_ctx(test_app_config) as session:
        entity_domain.bulk_create_datas(
            current_user=root_user,
            session=session,
            data=[instance, orphan_instance],
        )
        element_domain.bulk_create_datas(
            current_user=root_user,
            session=session,
            data=[in_bounds, out_of_bounds],
        )

        session.commit()

    return instance.id, orphan_instance.id, in_bounds.id, out_of_bounds.id


def _create_frame(
    test_app_config: AppConfig,
    root_user: UserPublic,
    *,
    task_id: int,
    label_branch_id: int | None,
) -> FramePublic:
    with session_ctx(test_app_config) as session:
        record = create_frame(
            current_user=root_user,
            session=session,
            data=FrameCreate(
                task_id=task_id,
                account_id=root_user.id,
                source_group_id=None,
                label_branch_id=label_branch_id,
                work_type=WorkType.ANNOTATE,
                min_x=0,
                min_y=0,
                min_z=0,
                max_x=10,
                max_y=10,
                max_z=10,
                min_timestamp=TIMESTAMP,
                max_timestamp=TIMESTAMP,
            ),
        )
        frame = FramePublic.model_validate(record)

        session.commit()

    return frame


def test_get_data_bulk_returns_instances_and_selections_in_frame_bounds(
    test_app_config: AppConfig,
    root_user: UserPublic,
    annotator_task: TaskPublic,
    labelset_branch: LabelsetBranchPublic,
    object_class_selection: ObjectClassSelectionPublic,
):
    instance_id, orphan_instance_id, in_bounds_id, out_of_bounds_id = _seed_labels(
        test_app_config,
        root_user,
        labelset_branch,
        object_class_selection,
    )
    frame = _create_frame(
        test_app_config,
        root_user,
        task_id=annotator_task.id,
        label_branch_id=labelset_branch.id,
    )

    with session_ctx(test_app_config) as session:
        (data,) = _get_loader().get_data_bulk(
            current_user=root_user,
            session=session,
            frames=[frame],
            other_args=None,
        )

    assert isinstance(data, SegmentationData)
    assert {instance.id for instance in data.instances} == {instance_id, orphan_instance_id}
    assert next(instance for instance in data.instances if instance.id == instance_id).is_black

    assert [selection.id for selection in data.selections] == [in_bounds_id]
    (selection,) = data.selections
    assert selection.entity_id == instance_id
    assert selection.timestamp == TIMESTAMP
    assert selection.distinctive_lv == DistinctiveLevel.SATISFACTORY
    assert selection.occlusion_lv == OcclusionLevel.POOR
    assert selection.points == [1.0, 2.0, 3.0, 4.0, 5.0, 6.0]

    # The compact bulk models must carry the persisted class assignments. Without
    # them the editor reloads a saved, classified frame as unclassified.
    assert all(
        instance.gt_class_id == object_class_selection.objclasses[0].id
        for instance in data.instances
    )
    assert selection.perceived_class_id == object_class_selection.objclasses[0].id

    # The class ids are part of the serialized response, not only the Python model.
    dumped = data.model_dump()
    assert dumped["instances"][0]["gt_class_id"] == object_class_selection.objclasses[0].id
    assert dumped["selections"][0]["perceived_class_id"] == (
        object_class_selection.objclasses[0].id
    )

    assert "class_selection" not in dumped
    assert out_of_bounds_id != in_bounds_id


def test_get_data_bulk_rejects_multiple_frames_and_missing_branch(
    test_app_config: AppConfig,
    root_user: UserPublic,
    annotator_task: TaskPublic,
    labelset_branch: LabelsetBranchPublic,
    object_class_selection: ObjectClassSelectionPublic,
):
    frame = _create_frame(
        test_app_config,
        root_user,
        task_id=annotator_task.id,
        label_branch_id=labelset_branch.id,
    )
    branchless_frame = _create_frame(
        test_app_config,
        root_user,
        task_id=annotator_task.id,
        label_branch_id=None,
    )
    loader = _get_loader()

    with session_ctx(test_app_config) as session:
        payloads = loader.get_data_bulk(
            current_user=root_user,
            session=session,
            frames=[frame, frame],
            other_args=None,
        )
    assert len(payloads) == 2

    with session_ctx(test_app_config) as session:
        with pytest.raises(RuntimeError, match="No label branch"):
            loader.get_data_bulk(
                current_user=root_user,
                session=session,
                frames=[branchless_frame],
                other_args=None,
            )
