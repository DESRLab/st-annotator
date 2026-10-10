"""Tests for the commit repository layer.

Covers the list/count/read/delete paths and the parent-link bulk
helpers of ``sta.domain/label/repo/commits.py``, including the group-based
authorization paths for non-manager users.

Commits are content-addressed and immutable: there is no update path,
as rewriting a commit's operations would invalidate the hashes of all
of its descendants.
"""

from enum import Enum
from http import HTTPStatus

from fastapi import HTTPException
from pydantic import BaseModel
from sqlmodel import Session, func, select

import pytest

from sta.common.utils.json import JSONType
from sta.config import AppConfig
from sta.domain.frames import create_frame
from sta.domain.label.groups import create_group as create_label_group
from sta.domain.label.repo.branches import read_branch, update_branch
from sta.domain.label.repo.commits import (
    bulk_delete_parents,
    can_read_commit,
    count_commits,
    delete_commit,
    list_commits,
    read_commit,
    require_write_commit,
)
from sta.domain.label.repo.graph import (
    LabelsetBranchInit,
    init_branch,
    push_commits,
)
from sta.domain.label.repo.ops import Operation, OperationRegistry
from sta.domain.projects import create_project
from sta.domain.tasks import create_task
from sta.domain.users import create_user
from sta.models.frame import FrameCreate, WorkType
from sta.models.label.group import LabelGroupCreate
from sta.models.label.repo import (
    BranchPermission,
    BranchPermissionLevel,
    LabelsetBranchPublic,
    LabelsetBranchUpdate,
    LabelsetCommit,
    LabelsetCommitInstruction,
    LabelsetEdge,
)
from sta.models.project import ProjectCreate
from sta.models.task import TaskCreate
from sta.models.user import Role, UserCreate, UserPublic
from sta.session import session_ctx

pytestmark = pytest.mark.in_memory_db


class CommitRepoOpType(str, Enum):
    NO_OP = "test-commit-repo-no-op"


class CommitRepoNoOpParams(BaseModel):
    pass


class CommitRepoNoOpOperation(Operation[CommitRepoNoOpParams]):
    def apply(
        self,
        current_user: UserPublic,
        session: Session,
        commit: LabelsetCommit,
    ) -> JSONType:
        pass


def _register_no_op(op_registry: OperationRegistry):
    op_registry.register(CommitRepoOpType.NO_OP, CommitRepoNoOpOperation, CommitRepoNoOpParams)


def _push_no_op(
    *,
    current_user: UserPublic,
    session: Session,
    op_registry: OperationRegistry,
    branch_id: int,
) -> str:
    """Pushes a no-op commit and returns the new head hash."""
    push_commits(
        current_user=current_user,
        session=session,
        op_registry=op_registry,
        branch_id=branch_id,
        commit_instrs=[
            LabelsetCommitInstruction(
                op_name=CommitRepoOpType.NO_OP,
                op_params=CommitRepoNoOpParams(),
            ),
        ],
    )
    session.commit()

    branch = read_branch(
        current_user=current_user,
        session=session,
        id=branch_id,
    )

    return branch.head_hash


def _create_test_user(
    session: Session,
    root_user: UserPublic,
    *,
    username: str,
    roles: set[Role],
) -> UserPublic:
    record = create_user(
        current_user=root_user,
        session=session,
        data=UserCreate(
            username=username,
            password="password",
            roles=roles,
        ),
    )

    return UserPublic.model_validate(record)


def test_list_and_count_commits_with_filters(
    test_app_config: AppConfig,
    root_user: UserPublic,
    op_registry: OperationRegistry,
    labelset_branch: LabelsetBranchPublic,
):
    _register_no_op(op_registry)

    with session_ctx(test_app_config) as session:
        group_id = labelset_branch.group_id
        h0 = labelset_branch.head.hash

        h1 = _push_no_op(
            current_user=root_user,
            session=session,
            op_registry=op_registry,
            branch_id=labelset_branch.id,
        )
        h2 = _push_no_op(
            current_user=root_user,
            session=session,
            op_registry=op_registry,
            branch_id=labelset_branch.id,
        )

        other_group = create_label_group(
            current_user=root_user,
            session=session,
            data=LabelGroupCreate(name="other-commit-group"),
        )
        other_branch = init_branch(
            current_user=root_user,
            session=session,
            op_registry=op_registry,
            data=LabelsetBranchInit(
                group_id=other_group.id,
                name="other",
            ),
        )
        session.commit()

        # Without a group filter, managers see the commits of every group.
        assert {
            commit.hash for commit in list_commits(current_user=root_user, session=session)
        } == {h0, h1, h2, other_branch.head_hash}
        assert count_commits(current_user=root_user, session=session) == 4

        # The group filter restricts both listing and counting.
        assert {
            commit.hash
            for commit in list_commits(
                current_user=root_user,
                session=session,
                group_id=group_id,
            )
        } == {h0, h1, h2}
        assert (
            count_commits(
                current_user=root_user,
                session=session,
                group_id=group_id,
            )
            == 3
        )

        # Offset/limit pagination.
        page = list_commits(
            current_user=root_user,
            session=session,
            group_id=group_id,
            offset=1,
            limit=1,
        )
        assert len(page) == 1
        assert page[0].hash in {h0, h1, h2}

        record = read_commit(
            current_user=root_user,
            session=session,
            group_id=group_id,
            commit_hash=h2,
        )
        assert record.hash == h2

        with pytest.raises(HTTPException) as exc_info:
            read_commit(
                current_user=root_user,
                session=session,
                group_id=group_id,
                commit_hash="0" * 40,
            )
        assert exc_info.value.status_code == HTTPStatus.NOT_FOUND


def test_non_manager_commit_access(
    test_app_config: AppConfig,
    root_user: UserPublic,
    labelset_branch: LabelsetBranchPublic,
    source_group,
):
    with session_ctx(test_app_config) as session:
        group_id = labelset_branch.group_id
        h0 = labelset_branch.head.hash

        plain_user = _create_test_user(
            session,
            root_user,
            username="plain_commit_user",
            roles=set(),
        )
        annotator_user = _create_test_user(
            session,
            root_user,
            username="commit_annotator",
            roles={Role.ANNOTATOR},
        )

        # Wire a frame so the annotator can read the branch's label group.
        project = create_project(
            current_user=root_user,
            session=session,
            data=ProjectCreate(
                name="commit-access-project",
                member_ids=[root_user.id, annotator_user.id],
            ),
        )
        task = create_task(
            current_user=root_user,
            session=session,
            data=TaskCreate(
                name="commit-access-task",
                project_id=project.id,
                annotator_ids=[annotator_user.id],
            ),
        )
        session.add(
            BranchPermission(
                branch_id=labelset_branch.id,
                user_id=annotator_user.id,
                permission_lv=BranchPermissionLevel.WRITE,
            )
        )
        session.flush()
        create_frame(
            current_user=root_user,
            session=session,
            data=FrameCreate(
                task_id=task.id,
                account_id=annotator_user.id,
                source_group_id=source_group.id,
                label_branch_id=labelset_branch.id,
                work_type=WorkType.ANNOTATE,
            ),
        )
        session.commit()

        commit = read_commit(
            current_user=root_user,
            session=session,
            group_id=group_id,
            commit_hash=h0,
        )

        # can_read_commit falls back to group membership for non-managers.
        assert can_read_commit(annotator_user, session, commit) is True
        assert can_read_commit(plain_user, session, commit) is False

        # Users who can read a commit are also allowed to write it.
        assert require_write_commit(annotator_user, session, commit) is True

        record = read_commit(
            current_user=annotator_user,
            session=session,
            group_id=group_id,
            commit_hash=h0,
        )
        assert record.hash == h0

        with pytest.raises(HTTPException) as exc_info:
            read_commit(
                current_user=plain_user,
                session=session,
                group_id=group_id,
                commit_hash=h0,
            )
        assert exc_info.value.status_code == HTTPStatus.NOT_FOUND

        # Listing and counting are restricted to readable groups.
        assert {
            commit.hash for commit in list_commits(current_user=annotator_user, session=session)
        } == {h0}
        assert count_commits(current_user=annotator_user, session=session) == 1
        assert list_commits(current_user=plain_user, session=session) == []
        assert count_commits(current_user=plain_user, session=session) == 0


def test_bulk_delete_parents_and_delete_commit(
    test_app_config: AppConfig,
    root_user: UserPublic,
    op_registry: OperationRegistry,
    labelset_branch: LabelsetBranchPublic,
):
    _register_no_op(op_registry)

    with session_ctx(test_app_config) as session:
        group_id = labelset_branch.group_id
        h0 = labelset_branch.head.hash

        h1 = _push_no_op(
            current_user=root_user,
            session=session,
            op_registry=op_registry,
            branch_id=labelset_branch.id,
        )
        h2 = _push_no_op(
            current_user=root_user,
            session=session,
            op_registry=op_registry,
            branch_id=labelset_branch.id,
        )

        # A pushed commit tracks its parent through the edge table.
        record = read_commit(
            current_user=root_user,
            session=session,
            group_id=group_id,
            commit_hash=h1,
        )
        assert [parent.hash for parent in record.parents] == [h0]
        session.commit()

        plain_user = _create_test_user(
            session,
            root_user,
            username="commit_delete_user",
            roles=set(),
        )
        session.commit()

        with pytest.raises(HTTPException) as exc_info:
            delete_commit(
                current_user=root_user,
                session=session,
                group_id=group_id,
                commit_hash="0" * 40,
            )
        assert exc_info.value.status_code == HTTPStatus.NOT_FOUND

        # Users who cannot read the commit are denied.
        with pytest.raises(HTTPException) as exc_info:
            delete_commit(
                current_user=plain_user,
                session=session,
                group_id=group_id,
                commit_hash=h1,
            )
        assert exc_info.value.status_code == HTTPStatus.FORBIDDEN

        # bulk_delete_parents removes the parent links of the given commits.
        bulk_delete_parents(session, group_id, {h1})
        session.commit()

        record = read_commit(
            current_user=root_user,
            session=session,
            group_id=group_id,
            commit_hash=h1,
        )
        assert list(record.parents) == []
        assert (
            session.exec(
                select(func.count())
                .select_from(LabelsetEdge)
                .where(LabelsetEdge.group_id == group_id)
                .where(LabelsetEdge.child_hash == h1),
            ).one()
            == 0
        )

        # Deleting a mid-graph commit succeeds; the edges where it was the
        # parent are removed by the database-level FK cascade.
        count_before = count_commits(
            current_user=root_user,
            session=session,
            group_id=group_id,
        )
        delete_commit(
            current_user=root_user,
            session=session,
            group_id=group_id,
            commit_hash=h1,
        )
        session.commit()

        assert (
            count_commits(
                current_user=root_user,
                session=session,
                group_id=group_id,
            )
            == count_before - 1
        )

        with pytest.raises(HTTPException) as exc_info:
            read_commit(
                current_user=root_user,
                session=session,
                group_id=group_id,
                commit_hash=h1,
            )
        assert exc_info.value.status_code == HTTPStatus.NOT_FOUND

        assert (
            session.exec(
                select(func.count())
                .select_from(LabelsetEdge)
                .where(LabelsetEdge.group_id == group_id)
                .where(LabelsetEdge.parent_hash == h1),
            ).one()
            == 0
        )

        # The branch survives, as its head commit was not deleted.
        branch = read_branch(
            current_user=root_user,
            session=session,
            id=labelset_branch.id,
        )
        assert branch.head_hash == h2
        session.commit()


def test_delete_commit_with_loaded_edge_collections(
    test_app_config: AppConfig,
    root_user: UserPublic,
    op_registry: OperationRegistry,
    labelset_branch: LabelsetBranchPublic,
):
    _register_no_op(op_registry)

    with session_ctx(test_app_config) as session:
        group_id = labelset_branch.group_id
        h0 = labelset_branch.head.hash

        h1 = _push_no_op(
            current_user=root_user,
            session=session,
            op_registry=op_registry,
            branch_id=labelset_branch.id,
        )
        h2 = _push_no_op(
            current_user=root_user,
            session=session,
            op_registry=op_registry,
            branch_id=labelset_branch.id,
        )

        # Load both edge collections of the middle commit into the session.
        # Regression: with the loaded collections present, bulk_delete_parents
        # must not corrupt the session (it skips session synchronization) and
        # delete_commit must still succeed in that same session, even though
        # the loaded parent-edge collection now references deleted rows.
        record = read_commit(
            current_user=root_user,
            session=session,
            group_id=group_id,
            commit_hash=h1,
        )
        assert [parent.hash for parent in record.parents] == [h0]
        assert [child.hash for child in record.children] == [h2]

        count_before = count_commits(
            current_user=root_user,
            session=session,
            group_id=group_id,
        )
        delete_commit(
            current_user=root_user,
            session=session,
            group_id=group_id,
            commit_hash=h1,
        )
        session.commit()

        assert (
            count_commits(
                current_user=root_user,
                session=session,
                group_id=group_id,
            )
            == count_before - 1
        )

        # Both edges touching h1 are gone: the parent edge was bulk-deleted,
        # and the child edge was removed by the database-level FK cascade.
        assert (
            session.exec(
                select(func.count())
                .select_from(LabelsetEdge)
                .where(LabelsetEdge.group_id == group_id)
                .where(LabelsetEdge.child_hash == h1),
            ).one()
            == 0
        )
        assert (
            session.exec(
                select(func.count())
                .select_from(LabelsetEdge)
                .where(LabelsetEdge.group_id == group_id)
                .where(LabelsetEdge.parent_hash == h1),
            ).one()
            == 0
        )

        # The branch survives, as its head commit was not deleted.
        branch = read_branch(
            current_user=root_user,
            session=session,
            id=labelset_branch.id,
        )
        assert branch.head_hash == h2
        session.commit()


def test_delete_commit_rejects_branch_head_and_checkpoint(
    test_app_config: AppConfig,
    root_user: UserPublic,
    op_registry: OperationRegistry,
    labelset_branch: LabelsetBranchPublic,
):
    """Deleting a commit referenced as a branch head/checkpoint must fail.

    The branch head/checkpoint FKs cascade on delete, so allowing it would
    silently delete the branch row at the database level.
    """
    _register_no_op(op_registry)

    with session_ctx(test_app_config) as session:
        group_id = labelset_branch.group_id

        h1 = _push_no_op(
            current_user=root_user,
            session=session,
            op_registry=op_registry,
            branch_id=labelset_branch.id,
        )
        h2 = _push_no_op(
            current_user=root_user,
            session=session,
            op_registry=op_registry,
            branch_id=labelset_branch.id,
        )

        # The head commit cannot be deleted.
        with pytest.raises(HTTPException) as exc_info:
            delete_commit(
                current_user=root_user,
                session=session,
                group_id=group_id,
                commit_hash=h2,
            )
        assert exc_info.value.status_code == HTTPStatus.BAD_REQUEST

        # Both the commit and the branch survive the rejection.
        assert (
            read_commit(
                current_user=root_user,
                session=session,
                group_id=group_id,
                commit_hash=h2,
            ).hash
            == h2
        )
        branch = read_branch(
            current_user=root_user,
            session=session,
            id=labelset_branch.id,
        )
        assert branch.head_hash == h2

        # A commit referenced as the checkpoint cannot be deleted either.
        update_branch(
            current_user=root_user,
            session=session,
            id=labelset_branch.id,
            data=LabelsetBranchUpdate(checkpoint_hash=h1),
        )
        session.commit()

        with pytest.raises(HTTPException) as exc_info:
            delete_commit(
                current_user=root_user,
                session=session,
                group_id=group_id,
                commit_hash=h1,
            )
        assert exc_info.value.status_code == HTTPStatus.BAD_REQUEST

        branch = read_branch(
            current_user=root_user,
            session=session,
            id=labelset_branch.id,
        )
        assert branch.checkpoint_hash == h1

        # Once the branch no longer references the commit, deletion succeeds.
        update_branch(
            current_user=root_user,
            session=session,
            id=labelset_branch.id,
            data=LabelsetBranchUpdate(checkpoint_hash=h2),
        )
        session.commit()

        delete_commit(
            current_user=root_user,
            session=session,
            group_id=group_id,
            commit_hash=h1,
        )
        session.commit()

        with pytest.raises(HTTPException) as exc_info:
            read_commit(
                current_user=root_user,
                session=session,
                group_id=group_id,
                commit_hash=h1,
            )
        assert exc_info.value.status_code == HTTPStatus.NOT_FOUND

        branch = read_branch(
            current_user=root_user,
            session=session,
            id=labelset_branch.id,
        )
        assert branch.head_hash == h2
        assert branch.checkpoint_hash == h2
        session.commit()


def test_git_style_branch_rewrite_via_replacement_commit(
    test_app_config: AppConfig,
    root_user: UserPublic,
    op_registry: OperationRegistry,
    labelset_branch: LabelsetBranchPublic,
):
    """Commits are immutable, so a branch is rewritten the way Git does it.

    Rather than editing the tip commit in place, repoint the branch to the
    superseded commit's parent, push a replacement commit (which becomes the
    new head), and delete the superseded commit once it is no longer
    referenced as a head or checkpoint.
    """
    _register_no_op(op_registry)

    with session_ctx(test_app_config) as session:
        group_id = labelset_branch.group_id
        h0 = labelset_branch.head.hash

        # Push the commit that will be superseded.
        h1 = _push_no_op(
            current_user=root_user,
            session=session,
            op_registry=op_registry,
            branch_id=labelset_branch.id,
        )

        # While h1 is the head it cannot be deleted.
        with pytest.raises(HTTPException) as exc_info:
            delete_commit(
                current_user=root_user,
                session=session,
                group_id=group_id,
                commit_hash=h1,
            )
        assert exc_info.value.status_code == HTTPStatus.BAD_REQUEST

        # Repoint the branch to the superseded commit's parent and push the
        # replacement, which lands as the new head.
        update_branch(
            current_user=root_user,
            session=session,
            id=labelset_branch.id,
            data=LabelsetBranchUpdate(head_hash=h0),
        )
        session.commit()

        h2 = _push_no_op(
            current_user=root_user,
            session=session,
            op_registry=op_registry,
            branch_id=labelset_branch.id,
        )

        branch = read_branch(
            current_user=root_user,
            session=session,
            id=labelset_branch.id,
        )
        assert branch.head_hash == h2
        # The checkpoint still predates the rewrite and does not reference h1.
        assert branch.checkpoint_hash == h0

        # h1 is now unreferenced and can be deleted.
        delete_commit(
            current_user=root_user,
            session=session,
            group_id=group_id,
            commit_hash=h1,
        )
        session.commit()

        with pytest.raises(HTTPException) as exc_info:
            read_commit(
                current_user=root_user,
                session=session,
                group_id=group_id,
                commit_hash=h1,
            )
        assert exc_info.value.status_code == HTTPStatus.NOT_FOUND

        # The replacement sits on the original parent; the branch survives.
        replacement = read_commit(
            current_user=root_user,
            session=session,
            group_id=group_id,
            commit_hash=h2,
        )
        assert [parent.hash for parent in replacement.parents] == [h0]
        assert (
            count_commits(
                current_user=root_user,
                session=session,
                group_id=group_id,
            )
            == 2
        )
        session.commit()
