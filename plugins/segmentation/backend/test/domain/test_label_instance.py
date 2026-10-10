import uuid
from http import HTTPStatus

from fastapi import HTTPException

import pytest

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
from sta_segmentation.domain.label.data import entity as domain
from sta_segmentation.domain.label.repo.ops.instance import (
    AssignClassParams,
    AssignIsBlackParams,
    CreateParams,
    DeleteParams,
    InstanceOperationType,
    register_instance_ops,
)
from sta_segmentation.models.label.data import LabelInstanceSQLModel


def test_crud(
    test_app_config: AppConfig,
    root_user: UserPublic,
    op_registry: OperationRegistry,
    labelset_branch: LabelsetBranchPublic,
    object_class_selection: ObjectClassSelectionPublic,
):
    register_instance_ops(op_registry)

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

        def read_instance():
            record = domain.read_data(
                current_user=root_user,
                session=session,
                id=entity_id,
                group_id=labelset_branch.group.id,
                commit_hash=labelset_branch.head.hash,
            )

            assert isinstance(record, LabelInstanceSQLModel)

            return record

        (entity_id_raw,) = push_commits(
            current_user=root_user,
            session=session,
            op_registry=op_registry,
            branch_id=labelset_branch.id,
            commit_instrs=[
                LabelsetCommitInstruction(
                    op_name=InstanceOperationType.CREATE,
                    op_params=CreateParams(),
                ),
            ],
        )
        assert isinstance(entity_id_raw, uuid.UUID)
        entity_id = entity_id_raw

        commit_and_refresh()

        new_data = read_instance()
        assert new_data.is_black is False
        assert new_data.gt_class_id is None

        push_commits(
            current_user=root_user,
            session=session,
            op_registry=op_registry,
            branch_id=labelset_branch.id,
            commit_instrs=[
                LabelsetCommitInstruction(
                    op_name=InstanceOperationType.ASSIGN_CLASS,
                    op_params=AssignClassParams(
                        instance_id=entity_id,
                        gt_class_id=gt_class_id,
                    ),
                ),
            ],
        )

        commit_and_refresh()

        new_data = read_instance()
        assert new_data.gt_class_id == gt_class_id
        assert new_data.is_black is False

        push_commits(
            current_user=root_user,
            session=session,
            op_registry=op_registry,
            branch_id=labelset_branch.id,
            commit_instrs=[
                LabelsetCommitInstruction(
                    op_name=InstanceOperationType.ASSIGN_IS_BLACK,
                    op_params=AssignIsBlackParams(
                        instance_id=entity_id,
                        is_black=True,
                    ),
                ),
            ],
        )

        commit_and_refresh()

        new_data = read_instance()
        assert new_data.gt_class_id == gt_class_id
        assert new_data.is_black is True

        push_commits(
            current_user=root_user,
            session=session,
            op_registry=op_registry,
            branch_id=labelset_branch.id,
            commit_instrs=[
                LabelsetCommitInstruction(
                    op_name=InstanceOperationType.DELETE,
                    op_params=DeleteParams(instance_id=entity_id),
                ),
            ],
        )

        commit_and_refresh()

        with pytest.raises(HTTPException) as exc_info:
            read_instance()

        assert exc_info.value.status_code == HTTPStatus.NOT_FOUND
        assert "deleted" in str(exc_info.value.detail).lower()
