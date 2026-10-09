import uuid
from decimal import Decimal
from http import HTTPStatus

from fastapi import HTTPException

import pytest

from sta.services.config import AppConfig
from sta.services.domain.label.repo.branches import read_branch
from sta.services.domain.label.repo.graph import push_commits
from sta.services.domain.label.repo.ops import OperationRegistry
from sta.services.models.label.repo import (
    LabelsetBranchPublic,
    LabelsetCommitInstruction,
)
from sta.services.models.label.spec import ObjectClassSelectionPublic
from sta.services.models.user import UserPublic
from sta.services.session import session_ctx
from sta_bbox.domain.label.data import element as domain
from sta_bbox.domain.label.repo.ops.box import (
    AssignClassParams,
    AssignDistinctiveLvParams,
    AssignEntityParams,
    AssignOcclusionLvParams,
    AssignTypeParams,
    BoxOperationType,
    CreateParams,
    DeleteParams,
    TransformParams,
    register_box_ops,
)
from sta_bbox.domain.label.repo.ops.track import (
    CreateParams as TrackCreateParams,
    TrackOperationType,
    register_track_ops,
)
from sta_bbox.models.label.data import (
    BoxType,
    DistinctiveLevel,
    LabelBoxSQLModel,
    OcclusionLevel,
    TruncDecimalCoord3,
    TruncDecimalSize3,
)


@pytest.mark.parametrize("use_delta_encoding", [True, False])
def test_crud(
    monkeypatch: pytest.MonkeyPatch,
    app_config: AppConfig,
    root_user: UserPublic,
    op_registry: OperationRegistry,
    labelset_branch: LabelsetBranchPublic,
    object_class_selection: ObjectClassSelectionPublic,
    *,
    use_delta_encoding: bool,
):
    monkeypatch.setenv("STA_USE_DELTA_ENCODING", str(use_delta_encoding))

    register_box_ops(op_registry)
    register_track_ops(op_registry)

    ones = TruncDecimalCoord3.ones()
    two = Decimal("2")
    threes = TruncDecimalCoord3.from_tuple((ones * 2).to_tuple())
    four = Decimal("2")
    perceived_class_id = object_class_selection.objclasses[0].id

    with session_ctx(app_config) as session:

        def commit_and_refresh():
            nonlocal labelset_branch

            session.commit()
            labelset_branch = LabelsetBranchPublic.model_validate(
                read_branch(
                    current_user=root_user,
                    session=session,
                    id=labelset_branch.id,
                ),
            )

        def read_selection():
            record = domain.read_data(
                current_user=root_user,
                session=session,
                id=element_id,
                group_id=labelset_branch.group.id,
                commit_hash=labelset_branch.head.hash,
            )

            assert isinstance(record, LabelBoxSQLModel)

            return record

        (element_id_raw,) = push_commits(
            current_user=root_user,
            session=session,
            op_registry=op_registry,
            branch_id=labelset_branch.id,
            commit_instrs=[
                LabelsetCommitInstruction(
                    op_name=BoxOperationType.CREATE,
                    op_params=CreateParams(
                        type=BoxType.CUBOID,
                        center=ones,
                        angle=two,
                        size=TruncDecimalSize3.from_tuple(threes.to_tuple()),
                    ),
                ),
            ],
        )
        assert isinstance(element_id_raw, uuid.UUID)
        element_id = element_id_raw

        commit_and_refresh()

        new_data = read_selection()
        assert new_data.center == ones
        assert new_data.angle == two
        assert new_data.size == TruncDecimalSize3.from_tuple(threes.to_tuple())

        push_commits(
            current_user=root_user,
            session=session,
            op_registry=op_registry,
            branch_id=labelset_branch.id,
            commit_instrs=[
                LabelsetCommitInstruction(
                    op_name=BoxOperationType.TRANSFORM,
                    op_params=TransformParams(
                        box_id=element_id,
                        mode="replace",
                        center=threes,
                        angle=four,
                        size=TruncDecimalSize3.from_tuple(ones.to_tuple()),
                    ),
                ),
            ],
        )

        commit_and_refresh()

        new_data = read_selection()
        assert new_data.center == threes
        assert new_data.angle == four
        assert new_data.size == TruncDecimalSize3.from_tuple(ones.to_tuple())

        (entity_id_raw,) = push_commits(
            current_user=root_user,
            session=session,
            op_registry=op_registry,
            branch_id=labelset_branch.id,
            commit_instrs=[
                LabelsetCommitInstruction(
                    op_name=TrackOperationType.CREATE,
                    op_params=TrackCreateParams(),
                ),
            ],
        )
        assert isinstance(entity_id_raw, uuid.UUID)
        entity_id = entity_id_raw

        commit_and_refresh()

        push_commits(
            current_user=root_user,
            session=session,
            op_registry=op_registry,
            branch_id=labelset_branch.id,
            commit_instrs=[
                LabelsetCommitInstruction(
                    op_name=BoxOperationType.ASSIGN_CLASS,
                    op_params=AssignClassParams(
                        box_id=element_id,
                        perceived_class_id=perceived_class_id,
                    ),
                ),
            ],
        )

        commit_and_refresh()

        new_data = read_selection()
        assert new_data.perceived_class_id == perceived_class_id

        push_commits(
            current_user=root_user,
            session=session,
            op_registry=op_registry,
            branch_id=labelset_branch.id,
            commit_instrs=[
                LabelsetCommitInstruction(
                    op_name=BoxOperationType.ASSIGN_ENTITY,
                    op_params=AssignEntityParams(
                        box_id=element_id,
                        entity_id=entity_id,
                    ),
                ),
            ],
        )

        commit_and_refresh()

        new_data = read_selection()
        assert new_data.entity_id == entity_id

        push_commits(
            current_user=root_user,
            session=session,
            op_registry=op_registry,
            branch_id=labelset_branch.id,
            commit_instrs=[
                LabelsetCommitInstruction(
                    op_name=BoxOperationType.ASSIGN_TYPE,
                    op_params=AssignTypeParams(
                        box_id=element_id,
                        box_type=BoxType.CUBOID,
                    ),
                ),
            ],
        )

        commit_and_refresh()

        new_data = read_selection()
        assert new_data.type == BoxType.CUBOID

        push_commits(
            current_user=root_user,
            session=session,
            op_registry=op_registry,
            branch_id=labelset_branch.id,
            commit_instrs=[
                LabelsetCommitInstruction(
                    op_name=BoxOperationType.ASSIGN_DISTINCTIVE_LV,
                    op_params=AssignDistinctiveLvParams(
                        box_id=element_id,
                        distinctive_lv=DistinctiveLevel.SATISFACTORY,
                    ),
                ),
            ],
        )

        commit_and_refresh()

        new_data = read_selection()
        assert new_data.distinctive_lv == DistinctiveLevel.SATISFACTORY

        push_commits(
            current_user=root_user,
            session=session,
            op_registry=op_registry,
            branch_id=labelset_branch.id,
            commit_instrs=[
                LabelsetCommitInstruction(
                    op_name=BoxOperationType.ASSIGN_OCCLUSION_LV,
                    op_params=AssignOcclusionLvParams(
                        box_id=element_id,
                        occlusion_lv=OcclusionLevel.POOR,
                    ),
                ),
            ],
        )

        commit_and_refresh()

        new_data = read_selection()
        assert new_data.occlusion_lv == OcclusionLevel.POOR

        push_commits(
            current_user=root_user,
            session=session,
            op_registry=op_registry,
            branch_id=labelset_branch.id,
            commit_instrs=[
                LabelsetCommitInstruction(
                    op_name=BoxOperationType.DELETE,
                    op_params=DeleteParams(box_id=element_id),
                ),
            ],
        )

        commit_and_refresh()

        with pytest.raises(HTTPException) as exc_info:
            read_selection()

        assert exc_info.value.status_code == HTTPStatus.NOT_FOUND
        assert "deleted" in str(exc_info.value.detail).lower()
