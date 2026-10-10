"""Coverage for `sta_vector.domain.editor.loader.VectorLoader.get_data_bulk`.

The loader is the function that feeds the annotation editor; it is exercised here
through the instance registered by `sta_vector.plugin.register` (via entry points).
"""

from datetime import datetime, timezone
from decimal import Decimal

import pytest

from sta.common.spatial import DecimalCoord3
from sta.config import AppConfig
from sta.domain.editor.loader import LABEL_DATA_LOADERS
from sta.domain.frames import create_frame
from sta.domain.label.repo.graph import push_commits
from sta.domain.label.repo.ops import OperationRegistry
from sta.domain.label.repo.ops.special import register_special_ops
from sta.models.frame import FrameCreate, FramePublic, WorkType
from sta.models.label.repo import LabelsetBranchPublic, LabelsetCommitInstruction
from sta.models.label.spec import ObjectClassSelectionPublic
from sta.models.task import TaskPublic
from sta.models.user import UserPublic
from sta.session import session_ctx
from sta_vector.domain.editor.loader import VectorData, VectorLoader
from sta_vector.domain.label.data import element as element_domain
from sta_vector.domain.label.repo.ops.vector import (
    CreateParams,
    VectorOperationType,
    register_vector_ops,
)
from sta_vector.models.label.data import PolygonVertices, VectorType

TIMESTAMP = datetime(2024, 1, 1, tzinfo=timezone.utc)


def _polygon(offset: Decimal) -> PolygonVertices:
    return PolygonVertices(
        type=VectorType.POLYGON,
        coords=[
            DecimalCoord3(x=offset, y=offset, z=Decimal(0)),
            DecimalCoord3(x=offset + 10, y=offset, z=Decimal(0)),
            DecimalCoord3(x=offset + 10, y=offset + 10, z=Decimal(0)),
            DecimalCoord3(x=offset, y=offset + 10, z=Decimal(0)),
        ],
    )


def test_get_data_bulk_returns_vectors_within_frame_bounds(
    test_app_config: AppConfig,
    root_user: UserPublic,
    labelset_branch: LabelsetBranchPublic,
    object_class_selection: ObjectClassSelectionPublic,
    annotator_task: TaskPublic,
):
    registry = OperationRegistry()
    register_special_ops(registry)
    register_vector_ops(registry)

    objclass_id = object_class_selection.objclasses[0].id

    with session_ctx(test_app_config) as session:
        # One vector inside the frame bounds, one far outside them.
        (inside_id, _outside_id) = push_commits(
            current_user=root_user,
            session=session,
            op_registry=registry,
            branch_id=labelset_branch.id,
            commit_instrs=[
                LabelsetCommitInstruction(
                    op_name=VectorOperationType.CREATE,
                    op_params=CreateParams(
                        vertices=_polygon(Decimal(0)),
                        timestamp=TIMESTAMP,
                        gt_class_id=objclass_id,
                    ),
                ),
                LabelsetCommitInstruction(
                    op_name=VectorOperationType.CREATE,
                    op_params=CreateParams(vertices=_polygon(Decimal(100)), timestamp=TIMESTAMP),
                ),
            ],
        )

        frame_record = create_frame(
            current_user=root_user,
            session=session,
            data=FrameCreate(
                task_id=annotator_task.id,
                account_id=root_user.id,
                source_group_id=None,
                label_branch_id=labelset_branch.id,
                work_type=WorkType.ANNOTATE,
                min_x=Decimal(0),
                min_y=Decimal(0),
                min_z=Decimal(0),
                max_x=Decimal(15),
                max_y=Decimal(15),
                max_z=Decimal(15),
                min_timestamp=TIMESTAMP,
                max_timestamp=TIMESTAMP,
            ),
        )
        frame = FramePublic.model_validate(frame_record)

        session.commit()

    loader = LABEL_DATA_LOADERS["vector"]
    assert isinstance(loader, VectorLoader)

    with session_ctx(test_app_config) as session:
        (data,) = loader.get_data_bulk(
            current_user=root_user,
            session=session,
            frames=[frame],
            other_args=None,
        )

    assert isinstance(data, VectorData)
    assert [vector.id for vector in data.vectors] == [inside_id]
    assert data.vectors[0].type == VectorType.POLYGON

    # The compact bulk model must carry the persisted class assignment. Without it
    # the editor reloads a saved, classified frame as unclassified.
    assert data.vectors[0].gt_class_id == objclass_id

    # The class id is part of the serialized response, not only the Python model.
    dumped = data.model_dump()
    assert dumped["vectors"][0]["gt_class_id"] == objclass_id

    assert "class_selection" not in dumped


def test_get_data_bulk_returns_one_payload_per_requested_frame(
    monkeypatch: pytest.MonkeyPatch,
    test_app_config: AppConfig,
    root_user: UserPublic,
    labelset_branch: LabelsetBranchPublic,
    object_class_selection: ObjectClassSelectionPublic,
    annotator_task: TaskPublic,
):
    with session_ctx(test_app_config) as session:
        frame_record = create_frame(
            current_user=root_user,
            session=session,
            data=FrameCreate(
                task_id=annotator_task.id,
                account_id=root_user.id,
                source_group_id=None,
                label_branch_id=labelset_branch.id,
                work_type=WorkType.ANNOTATE,
            ),
        )
        frame = FramePublic.model_validate(frame_record)
        session.commit()

    loader = LABEL_DATA_LOADERS["vector"]
    original_list = element_domain.list_datas_in_any_bounds
    query_count = 0

    def count_queries(*args, **kwargs):
        nonlocal query_count
        query_count += 1
        return original_list(*args, **kwargs)

    monkeypatch.setattr(element_domain, "list_datas_in_any_bounds", count_queries)

    with session_ctx(test_app_config) as session:
        data = loader.get_data_bulk(
            current_user=root_user,
            session=session,
            frames=[frame, frame],
            other_args=None,
        )
    assert len(data) == 2
    assert query_count == 1


def test_get_data_bulk_requires_label_branch(
    test_app_config: AppConfig,
    root_user: UserPublic,
):
    frame = FramePublic.model_construct(id=1, label_branch_id=None)

    loader = LABEL_DATA_LOADERS["vector"]

    with session_ctx(test_app_config) as session:
        with pytest.raises(RuntimeError, match="No label branch"):
            loader.get_data_bulk(
                current_user=root_user,
                session=session,
                frames=[frame],
                other_args=None,
            )
