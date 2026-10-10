import uuid
from datetime import datetime, timezone
from decimal import Decimal

from sqlmodel import Session

import pytest

from sta.common.spatial import DecimalCoord3
from sta.config import AppConfig
from sta.domain.editor.loader import LABEL_DATA_LOADERS
from sta.domain.frames import create_frame
from sta.domain.label.repo.branches import read_branch
from sta.domain.label.repo.graph import push_commits
from sta.domain.label.repo.ops import OperationRegistry
from sta.models.frame import FrameCreate, FramePublic, WorkType
from sta.models.label.repo import (
    LabelsetBranchPublic,
    LabelsetCommitInstruction,
)
from sta.models.label.spec import ObjectClassSelectionPublic
from sta.models.task import TaskPublic
from sta.models.user import UserPublic
from sta_bbox.domain.editor.loader import BBoxData, BBoxLoader
from sta_bbox.domain.label.repo.ops.box import (
    AssignEntityParams,
    BoxOperationType,
    CreateParams as BoxCreateParams,
    register_box_ops,
)
from sta_bbox.domain.label.repo.ops.track import (
    CreateParams as TrackCreateParams,
    TrackOperationType,
    register_track_ops,
)
from sta_bbox.models.label.data import (
    BoxType,
    TruncDecimalCoord3,
    TruncDecimalSize3,
)

INSIDE_TIMESTAMP = datetime(2024, 1, 1, tzinfo=timezone.utc)
OUTSIDE_TIMESTAMP = datetime(2024, 1, 2, tzinfo=timezone.utc)


def test_get_data_bulk_filters_by_frame_bounds(
    test_app_config: AppConfig,
    session: Session,
    root_user: UserPublic,
    op_registry: OperationRegistry,
    labelset_branch: LabelsetBranchPublic,
    object_class_selection: ObjectClassSelectionPublic,
    annotator_task: TaskPublic,
):
    _ = test_app_config  # Ensure the plugins (and their loaders) are loaded

    objclass_id = object_class_selection.objclasses[0].id

    register_box_ops(op_registry)
    register_track_ops(op_registry)

    ones = TruncDecimalCoord3.ones()
    size = TruncDecimalSize3.from_tuple(ones.to_tuple())

    (track_id, inside_box_id, outside_box_id) = push_commits(
        current_user=root_user,
        session=session,
        op_registry=op_registry,
        branch_id=labelset_branch.id,
        commit_instrs=[
            LabelsetCommitInstruction(
                op_name=TrackOperationType.CREATE,
                op_params=TrackCreateParams(gt_class_id=objclass_id),
            ),
            LabelsetCommitInstruction(
                op_name=BoxOperationType.CREATE,
                op_params=BoxCreateParams(
                    type=BoxType.CUBOID,
                    center=ones,
                    angle=Decimal("0"),
                    size=size,
                    timestamp=INSIDE_TIMESTAMP,
                    perceived_class_id=objclass_id,
                ),
            ),
            LabelsetCommitInstruction(
                op_name=BoxOperationType.CREATE,
                op_params=BoxCreateParams(
                    type=BoxType.CUBOID,
                    center=TruncDecimalCoord3.from_tuple((Decimal("10"),) * 3),
                    angle=Decimal("0"),
                    size=size,
                    timestamp=OUTSIDE_TIMESTAMP,
                    perceived_class_id=objclass_id,
                ),
            ),
        ],
    )
    assert isinstance(track_id, uuid.UUID)
    assert isinstance(inside_box_id, uuid.UUID)
    assert isinstance(outside_box_id, uuid.UUID)

    push_commits(
        current_user=root_user,
        session=session,
        op_registry=op_registry,
        branch_id=labelset_branch.id,
        commit_instrs=[
            LabelsetCommitInstruction(
                op_name=BoxOperationType.ASSIGN_ENTITY,
                op_params=AssignEntityParams(
                    box_id=inside_box_id,
                    entity_id=track_id,
                ),
            ),
        ],
    )
    (orphan_track_id,) = push_commits(
        current_user=root_user,
        session=session,
        op_registry=op_registry,
        branch_id=labelset_branch.id,
        commit_instrs=[
            LabelsetCommitInstruction(
                op_name=TrackOperationType.CREATE,
                op_params=TrackCreateParams(gt_class_id=objclass_id),
            ),
        ],
    )
    assert isinstance(orphan_track_id, uuid.UUID)

    frame_record = create_frame(
        current_user=root_user,
        session=session,
        data=FrameCreate(
            task_id=annotator_task.id,
            account_id=root_user.id,
            source_group_id=None,
            label_branch_id=labelset_branch.id,
            work_type=WorkType.ANNOTATE,
            min_x=Decimal("0"),
            min_y=Decimal("0"),
            min_z=Decimal("0"),
            max_x=Decimal("2"),
            max_y=Decimal("2"),
            max_z=Decimal("2"),
            min_timestamp=INSIDE_TIMESTAMP,
            max_timestamp=INSIDE_TIMESTAMP,
        ),
    )
    frame = FramePublic.model_validate(frame_record)

    branchless_frame_record = create_frame(
        current_user=root_user,
        session=session,
        data=FrameCreate(
            task_id=annotator_task.id,
            account_id=root_user.id,
            source_group_id=None,
            label_branch_id=None,
            work_type=WorkType.ANNOTATE,
        ),
    )
    branchless_frame = FramePublic.model_validate(branchless_frame_record)

    session.commit()
    labelset_branch = LabelsetBranchPublic.model_validate(
        read_branch(
            current_user=root_user,
            session=session,
            id=labelset_branch.id,
        ),
    )

    # The loader must be the instance registered by the plugin.
    loader = LABEL_DATA_LOADERS["bbox"]
    assert isinstance(loader, BBoxLoader)

    (data,) = loader.get_data_bulk(
        current_user=root_user,
        session=session,
        frames=[frame],
        other_args={},
    )

    assert isinstance(data, BBoxData)
    assert "class_selection" not in data.model_dump()

    # Only the box inside the frame bounds is returned.
    assert [box.id for box in data.boxes] == [inside_box_id]
    (box,) = data.boxes
    assert box.entity_id == track_id
    assert box.timestamp == INSIDE_TIMESTAMP
    assert box.type == BoxType.CUBOID
    assert box.center == DecimalCoord3(x=Decimal("1"), y=Decimal("1"), z=Decimal("1"))

    # Only the tracks referenced by the returned boxes are returned.
    assert {track.id for track in data.tracks} == {track_id, orphan_track_id}
    assert all(track.is_black is False for track in data.tracks)

    # The compact bulk models must carry the persisted class assignments. Without
    # them the editor reloads a saved, classified frame as unclassified.
    assert box.perceived_class_id == objclass_id
    assert all(track.gt_class_id == objclass_id for track in data.tracks)

    # The class ids are part of the serialized response, not only the Python model.
    dumped = data.model_dump()
    assert dumped["boxes"][0]["perceived_class_id"] == objclass_id
    assert dumped["tracks"][0]["gt_class_id"] == objclass_id

    payloads = loader.get_data_bulk(
        current_user=root_user,
        session=session,
        frames=[frame, frame],
        other_args={},
    )
    assert len(payloads) == 2

    # Frames without a label branch cannot load label data.
    with pytest.raises(RuntimeError, match="No label branch"):
        loader.get_data_bulk(
            current_user=root_user,
            session=session,
            frames=[branchless_frame],
            other_args={},
        )
