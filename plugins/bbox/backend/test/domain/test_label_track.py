import uuid
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
from sta_bbox.domain.label.data import entity as domain
from sta_bbox.domain.label.repo.ops.track import (
    AssignClassParams,
    AssignIsBlackParams,
    CreateParams,
    DeleteParams,
    TrackOperationType,
    register_track_ops,
)
from sta_bbox.models.label.data import LabelTrackSQLModel


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

    register_track_ops(op_registry)

    gt_class_id = object_class_selection.objclasses[0].id

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

        def read_instance():
            record = domain.read_data(
                current_user=root_user,
                session=session,
                id=entity_id,
                group_id=labelset_branch.group.id,
                commit_hash=labelset_branch.head.hash,
            )

            assert isinstance(record, LabelTrackSQLModel)

            return record

        (entity_id_raw,) = push_commits(
            current_user=root_user,
            session=session,
            op_registry=op_registry,
            branch_id=labelset_branch.id,
            commit_instrs=[
                LabelsetCommitInstruction(
                    op_name=TrackOperationType.CREATE,
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
                    op_name=TrackOperationType.ASSIGN_CLASS,
                    op_params=AssignClassParams(
                        track_id=entity_id,
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
                    op_name=TrackOperationType.ASSIGN_IS_BLACK,
                    op_params=AssignIsBlackParams(
                        track_id=entity_id,
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
                    op_name=TrackOperationType.DELETE,
                    op_params=DeleteParams(track_id=entity_id),
                ),
            ],
        )

        commit_and_refresh()

        with pytest.raises(HTTPException) as exc_info:
            read_instance()

        assert exc_info.value.status_code == HTTPStatus.NOT_FOUND
        assert "deleted" in str(exc_info.value.detail).lower()
