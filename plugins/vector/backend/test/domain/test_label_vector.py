import uuid
from http import HTTPStatus

from fastapi import HTTPException

import pytest

from sta.common.spatial import DecimalCoord3
from sta.config import AppConfig
from sta.domain.label.repo.branches import read_branch
from sta.domain.label.repo.graph import push_commits
from sta.domain.label.repo.ops import OperationRegistry
from sta.models.label.repo import (
    LabelsetBranchPublic,
    LabelsetCommitInstruction,
)
from sta.models.label.spec import ObjectClassSelectionPublic
from sta.models.user import UserPublic
from sta.session import session_ctx
from sta_vector.domain.label.data import element as domain
from sta_vector.domain.label.repo.ops.vector import (
    AssignClassParams,
    CreateParams,
    DeleteParams,
    EditParams,
    VectorOperationType,
    register_vector_ops,
)
from sta_vector.models.label.data import LabelVectorSQLModel, PolygonVertices, VectorType


def test_crud(
    test_app_config: AppConfig,
    root_user: UserPublic,
    op_registry: OperationRegistry,
    labelset_branch: LabelsetBranchPublic,
    object_class_selection: ObjectClassSelectionPublic,
):
    register_vector_ops(op_registry)

    zeros = PolygonVertices(type=VectorType.POLYGON, coords=[DecimalCoord3.zeros()] * 4)
    ones = PolygonVertices(type=VectorType.POLYGON, coords=[DecimalCoord3.ones()] * 4)
    gt_class_id = object_class_selection.objclasses[0].id

    with session_ctx(test_app_config) as session:

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

        def read_vector():
            record = domain.read_data(
                current_user=root_user,
                session=session,
                id=element_id,
                group_id=labelset_branch.group.id,
                commit_hash=labelset_branch.head.hash,
            )

            assert isinstance(record, LabelVectorSQLModel)

            return record

        (element_id_raw,) = push_commits(
            current_user=root_user,
            session=session,
            op_registry=op_registry,
            branch_id=labelset_branch.id,
            commit_instrs=[
                LabelsetCommitInstruction(
                    op_name=VectorOperationType.CREATE,
                    op_params=CreateParams(vertices=ones),
                ),
            ],
        )
        assert isinstance(element_id_raw, uuid.UUID)
        element_id = element_id_raw

        commit_and_refresh()

        new_data = read_vector()
        assert new_data.vertices == ones

        push_commits(
            current_user=root_user,
            session=session,
            op_registry=op_registry,
            branch_id=labelset_branch.id,
            commit_instrs=[
                LabelsetCommitInstruction(
                    op_name=VectorOperationType.EDIT,
                    op_params=EditParams(
                        vector_id=element_id,
                        mode="replace",
                        vertices=zeros,
                    ),
                ),
            ],
        )

        commit_and_refresh()

        push_commits(
            current_user=root_user,
            session=session,
            op_registry=op_registry,
            branch_id=labelset_branch.id,
            commit_instrs=[
                LabelsetCommitInstruction(
                    op_name=VectorOperationType.ASSIGN_CLASS,
                    op_params=AssignClassParams(
                        vector_id=element_id,
                        gt_class_id=gt_class_id,
                    ),
                ),
            ],
        )

        commit_and_refresh()

        new_data = read_vector()
        assert new_data.gt_class_id == gt_class_id

        push_commits(
            current_user=root_user,
            session=session,
            op_registry=op_registry,
            branch_id=labelset_branch.id,
            commit_instrs=[
                LabelsetCommitInstruction(
                    op_name=VectorOperationType.DELETE,
                    op_params=DeleteParams(vector_id=element_id),
                ),
            ],
        )

        commit_and_refresh()

        with pytest.raises(HTTPException) as exc_info:
            read_vector()

        assert exc_info.value.status_code == HTTPStatus.NOT_FOUND
        assert "deleted" in str(exc_info.value.detail).lower()
