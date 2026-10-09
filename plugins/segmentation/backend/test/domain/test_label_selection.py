import uuid
from http import HTTPStatus

from fastapi import HTTPException

import pytest

from sta.common.spatial import DecimalCoord3
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
from sta_segmentation.domain.label.data import element as domain
from sta_segmentation.domain.label.repo.ops.instance import (
    CreateParams as InstanceCreateParams,
    InstanceOperationType,
    register_instance_ops,
)
from sta_segmentation.domain.label.repo.ops.selection import (
    AssignClassParams,
    AssignDistinctiveLvParams,
    AssignEntityParams,
    AssignOcclusionLvParams,
    CreateParams,
    DeleteParams,
    EditParams,
    SelectionOperationType,
    register_selection_ops,
)
from sta_segmentation.models.label.data import (
    DistinctiveLevel,
    LabelSelectionSQLModel,
    OcclusionLevel,
)


def test_crud(
    app_config: AppConfig,
    root_user: UserPublic,
    op_registry: OperationRegistry,
    labelset_branch: LabelsetBranchPublic,
    object_class_selection: ObjectClassSelectionPublic,
):
    register_selection_ops(op_registry)
    register_instance_ops(op_registry)

    zeros = [DecimalCoord3.zeros()] * 100
    ones = [DecimalCoord3.ones()] * 100
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

            assert isinstance(record, LabelSelectionSQLModel)

            return record

        (element_id_raw,) = push_commits(
            current_user=root_user,
            session=session,
            op_registry=op_registry,
            branch_id=labelset_branch.id,
            commit_instrs=[
                LabelsetCommitInstruction(
                    op_name=SelectionOperationType.CREATE,
                    op_params=CreateParams(points=ones),
                ),
            ],
        )
        assert isinstance(element_id_raw, uuid.UUID)
        element_id = element_id_raw

        commit_and_refresh()

        new_data = read_selection()
        assert new_data.points == ones

        push_commits(
            current_user=root_user,
            session=session,
            op_registry=op_registry,
            branch_id=labelset_branch.id,
            commit_instrs=[
                LabelsetCommitInstruction(
                    op_name=SelectionOperationType.EDIT,
                    op_params=EditParams(
                        selection_id=element_id,
                        mode="replace",
                        points=zeros,
                    ),
                ),
            ],
        )

        commit_and_refresh()

        new_data = read_selection()
        assert new_data.points == zeros

        (entity_id_raw,) = push_commits(
            current_user=root_user,
            session=session,
            op_registry=op_registry,
            branch_id=labelset_branch.id,
            commit_instrs=[
                LabelsetCommitInstruction(
                    op_name=InstanceOperationType.CREATE,
                    op_params=InstanceCreateParams(),
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
                    op_name=SelectionOperationType.ASSIGN_CLASS,
                    op_params=AssignClassParams(
                        selection_id=element_id,
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
                    op_name=SelectionOperationType.ASSIGN_ENTITY,
                    op_params=AssignEntityParams(
                        selection_id=element_id,
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
                    op_name=SelectionOperationType.ASSIGN_DISTINCTIVE_LV,
                    op_params=AssignDistinctiveLvParams(
                        selection_id=element_id,
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
                    op_name=SelectionOperationType.ASSIGN_OCCLUSION_LV,
                    op_params=AssignOcclusionLvParams(
                        selection_id=element_id,
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
                    op_name=SelectionOperationType.DELETE,
                    op_params=DeleteParams(selection_id=element_id),
                ),
            ],
        )

        commit_and_refresh()

        with pytest.raises(HTTPException) as exc_info:
            read_selection()

        assert exc_info.value.status_code == HTTPStatus.NOT_FOUND
        assert "deleted" in str(exc_info.value.detail).lower()
