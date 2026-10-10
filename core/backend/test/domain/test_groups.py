"""Tests for the source-group and label-group domains.

Covers the manager bypass / frame-derived visibility rules plus the
update/delete/bulk mutation paths of both ``sta/domain/source/groups.py``
and ``sta/domain/label/groups.py``.
"""

from fastapi import HTTPException
from sqlmodel import Session

import pytest

from sta.domain.frames import create_frame
from sta.domain.label import groups as label_groups
from sta.domain.label.repo.graph import LabelsetBranchInit, init_branch
from sta.domain.label.repo.ops import OperationRegistry
from sta.domain.label.repo.ops.special import register_special_ops
from sta.domain.projects import create_project
from sta.domain.source import groups as source_groups
from sta.domain.tasks import create_task
from sta.domain.users import create_user
from sta.models.frame import FrameCreate, WorkType
from sta.models.label.group import (
    LabelGroup,
    LabelGroupBulkUpdate,
    LabelGroupCreate,
    LabelGroupUpdate,
)
from sta.models.label.repo import BranchPermissionLevel
from sta.models.project import ProjectCreate
from sta.models.source.group import (
    SourceGroup,
    SourceGroupBulkUpdate,
    SourceGroupCreate,
    SourceGroupUpdate,
)
from sta.models.task import TaskCreate
from sta.models.user import Role, UserCreate, UserPublic

pytestmark = pytest.mark.in_memory_db


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


def test_group_visibility_for_non_manager_users(root_user: UserPublic, session: Session):
    annotator_user = _create_test_user(
        session,
        root_user,
        username="group_vis_annotator",
        roles={Role.ANNOTATOR},
    )
    manager_user = _create_test_user(
        session,
        root_user,
        username="group_vis_manager",
        roles={Role.PROJECT_MANAGER},
    )
    outsider_user = _create_test_user(
        session, root_user, username="group_vis_outsider", roles=set()
    )

    project = create_project(
        current_user=root_user,
        session=session,
        data=ProjectCreate(
            name="group-visibility-project",
            member_ids=[root_user.id, annotator_user.id],
        ),
    )
    assigned_task = create_task(
        current_user=root_user,
        session=session,
        data=TaskCreate(
            name="group-visibility-assigned-task",
            project_id=project.id,
            annotator_ids=[annotator_user.id],
        ),
    )
    unassigned_task = create_task(
        current_user=root_user,
        session=session,
        data=TaskCreate(
            name="group-visibility-unassigned-task",
            project_id=project.id,
            annotator_ids=[root_user.id],
        ),
    )

    assigned_source_group = source_groups.create_group(
        current_user=root_user,
        session=session,
        data=SourceGroupCreate(name="group-vis-assigned-source"),
    )
    hidden_source_group = source_groups.create_group(
        current_user=root_user,
        session=session,
        data=SourceGroupCreate(name="group-vis-hidden-source"),
    )
    assigned_label_group = label_groups.create_group(
        current_user=root_user,
        session=session,
        data=LabelGroupCreate(name="group-vis-assigned-label"),
    )
    hidden_label_group = label_groups.create_group(
        current_user=root_user,
        session=session,
        data=LabelGroupCreate(name="group-vis-hidden-label"),
    )

    op_registry = OperationRegistry()
    register_special_ops(op_registry)
    assigned_branch = init_branch(
        current_user=root_user,
        session=session,
        op_registry=op_registry,
        data=LabelsetBranchInit(
            group_id=assigned_label_group.id,
            name="group-vis-assigned-branch",
            # The frame owner must hold WRITE on the branch it is assigned to.
            perm_lv_by_user_id={annotator_user.id: BranchPermissionLevel.WRITE},
        ),
    )
    hidden_branch = init_branch(
        current_user=root_user,
        session=session,
        op_registry=op_registry,
        data=LabelsetBranchInit(
            group_id=hidden_label_group.id,
            name="group-vis-hidden-branch",
        ),
    )

    # Source-group visibility derives from Frame.source_group_id, label-group
    # visibility from the frame's label branch -> group join.
    create_frame(
        current_user=root_user,
        session=session,
        data=FrameCreate(
            task_id=assigned_task.id,
            account_id=annotator_user.id,
            source_group_id=assigned_source_group.id,
            label_branch_id=assigned_branch.id,
            work_type=WorkType.ANNOTATE,
        ),
    )
    create_frame(
        current_user=root_user,
        session=session,
        data=FrameCreate(
            task_id=unassigned_task.id,
            account_id=root_user.id,
            source_group_id=hidden_source_group.id,
            label_branch_id=hidden_branch.id,
            work_type=WorkType.ANNOTATE,
        ),
    )
    session.commit()

    # Manager roles bypass the frame-derived visibility entirely.
    assert source_groups.can_read_group(root_user, session, hidden_source_group) is True
    assert label_groups.can_read_group(root_user, session, hidden_label_group) is True
    assert source_groups.can_read_group(manager_user, session, hidden_source_group) is True
    assert label_groups.can_read_group(manager_user, session, hidden_label_group) is True

    # A user without any task frames sees nothing.
    assert source_groups.can_read_group(outsider_user, session, assigned_source_group) is False
    assert label_groups.can_read_group(outsider_user, session, assigned_label_group) is False
    assert source_groups.list_groups(current_user=outsider_user, session=session) == []
    assert label_groups.list_groups(current_user=outsider_user, session=session) == []

    # The frame-wired annotator sees exactly the groups of their own tasks.
    assert source_groups.can_read_group(annotator_user, session, assigned_source_group) is True
    assert source_groups.can_read_group(annotator_user, session, hidden_source_group) is False
    assert label_groups.can_read_group(annotator_user, session, assigned_label_group) is True
    assert label_groups.can_read_group(annotator_user, session, hidden_label_group) is False

    assert [
        group.id
        for group in source_groups.list_groups(current_user=annotator_user, session=session)
    ] == [assigned_source_group.id]
    assert [
        group.id for group in label_groups.list_groups(current_user=annotator_user, session=session)
    ] == [assigned_label_group.id]

    # read_group applies the same filter.
    assert (
        source_groups.read_group(
            current_user=annotator_user,
            session=session,
            id=assigned_source_group.id,
        ).id
        == assigned_source_group.id
    )
    assert (
        label_groups.read_group(
            current_user=annotator_user,
            session=session,
            id=assigned_label_group.id,
        ).id
        == assigned_label_group.id
    )

    with pytest.raises(HTTPException) as exc_info:
        source_groups.read_group(
            current_user=annotator_user, session=session, id=hidden_source_group.id
        )
    assert exc_info.value.status_code == 404

    with pytest.raises(HTTPException) as exc_info:
        label_groups.read_group(
            current_user=annotator_user, session=session, id=hidden_label_group.id
        )
    assert exc_info.value.status_code == 404

    with pytest.raises(HTTPException) as exc_info:
        source_groups.read_group(current_user=root_user, session=session, id=99999)
    assert exc_info.value.status_code == 404

    with pytest.raises(HTTPException) as exc_info:
        label_groups.read_group(current_user=root_user, session=session, id=99999)
    assert exc_info.value.status_code == 404


def test_group_mutation_paths(root_user: UserPublic, session: Session):
    plain_user = _create_test_user(session, root_user, username="group_crud_plain", roles=set())

    source_alpha = source_groups.create_group(
        current_user=root_user,
        session=session,
        data=SourceGroupCreate(name="crud-source-alpha"),
    )
    source_beta = source_groups.create_group(
        current_user=root_user,
        session=session,
        data=SourceGroupCreate(name="crud-source-beta"),
    )
    label_alpha = label_groups.create_group(
        current_user=root_user,
        session=session,
        data=LabelGroupCreate(name="crud-label-alpha"),
    )
    label_beta = label_groups.create_group(
        current_user=root_user,
        session=session,
        data=LabelGroupCreate(name="crud-label-beta"),
    )
    session.commit()

    # All mutation paths require DATA_MANAGER.
    with pytest.raises(HTTPException) as exc_info:
        source_groups.update_group(
            current_user=plain_user,
            session=session,
            id=source_alpha.id,
            data=SourceGroupUpdate(description="member attempt"),
        )
    assert exc_info.value.status_code == 403

    with pytest.raises(HTTPException) as exc_info:
        label_groups.delete_group(current_user=plain_user, session=session, id=label_alpha.id)
    assert exc_info.value.status_code == 403

    with pytest.raises(HTTPException) as exc_info:
        source_groups.bulk_update_groups(
            current_user=plain_user,
            session=session,
            ids={source_alpha.id},
            data=SourceGroupBulkUpdate(description="member attempt"),
        )
    assert exc_info.value.status_code == 403

    with pytest.raises(HTTPException) as exc_info:
        label_groups.bulk_update_groups(
            current_user=plain_user,
            session=session,
            ids={label_alpha.id},
            data=LabelGroupBulkUpdate(description="member attempt"),
        )
    assert exc_info.value.status_code == 403

    # Field updates.
    updated_source = source_groups.update_group(
        current_user=root_user,
        session=session,
        id=source_alpha.id,
        data=SourceGroupUpdate(name="crud-source-renamed", description="source description"),
    )
    updated_label = label_groups.update_group(
        current_user=root_user,
        session=session,
        id=label_alpha.id,
        data=LabelGroupUpdate(name="crud-label-renamed", description="label description"),
    )
    session.commit()

    assert updated_source.name == "crud-source-renamed"
    assert updated_source.description == "source description"
    assert updated_label.name == "crud-label-renamed"
    assert updated_label.description == "label description"

    with pytest.raises(HTTPException) as exc_info:
        source_groups.update_group(
            current_user=root_user,
            session=session,
            id=99999,
            data=SourceGroupUpdate(name="ghost"),
        )
    assert exc_info.value.status_code == 404

    with pytest.raises(HTTPException) as exc_info:
        label_groups.update_group(
            current_user=root_user,
            session=session,
            id=99999,
            data=LabelGroupUpdate(name="ghost"),
        )
    assert exc_info.value.status_code == 404

    # Bulk updates.
    source_groups.bulk_update_groups(
        current_user=root_user,
        session=session,
        ids={source_alpha.id, source_beta.id},
        data=SourceGroupBulkUpdate(description="bulk source"),
    )
    label_groups.bulk_update_groups(
        current_user=root_user,
        session=session,
        ids={label_alpha.id, label_beta.id},
        data=LabelGroupBulkUpdate(description="bulk label"),
    )
    session.commit()

    assert session.get(SourceGroup, source_alpha.id).description == "bulk source"
    assert session.get(SourceGroup, source_beta.id).description == "bulk source"
    assert session.get(LabelGroup, label_alpha.id).description == "bulk label"
    assert session.get(LabelGroup, label_beta.id).description == "bulk label"

    # Counts and the remaining list-query branches.
    assert source_groups.count_groups(current_user=root_user, session=session) == 2
    assert (
        source_groups.count_groups(current_user=root_user, session=session, name="crud-source-beta")
        == 1
    )
    assert label_groups.count_groups(current_user=root_user, session=session) == 2
    assert (
        label_groups.count_groups(
            current_user=root_user, session=session, name="crud-label-renamed"
        )
        == 1
    )

    assert len(source_groups.list_groups(current_user=root_user, session=session, limit=1)) == 1
    assert [
        group.id
        for group in source_groups.list_groups(
            current_user=root_user, session=session, id=source_beta.id
        )
    ] == [source_beta.id]
    assert {
        group.id
        for group in source_groups.list_groups(
            current_user=root_user,
            session=session,
            ids={source_alpha.id, source_beta.id},
        )
    } == {source_alpha.id, source_beta.id}
    assert [
        group.id
        for group in source_groups.list_groups(
            current_user=root_user, session=session, name="crud-source-beta"
        )
    ] == [source_beta.id]

    assert len(label_groups.list_groups(current_user=root_user, session=session, limit=1)) == 1
    assert [
        group.id
        for group in label_groups.list_groups(
            current_user=root_user, session=session, id=label_beta.id
        )
    ] == [label_beta.id]
    assert [
        group.id
        for group in label_groups.list_groups(
            current_user=root_user, session=session, name="crud-label-renamed"
        )
    ] == [label_alpha.id]

    # Deletes.
    source_groups.delete_group(current_user=root_user, session=session, id=source_beta.id)
    label_groups.delete_group(current_user=root_user, session=session, id=label_beta.id)
    session.commit()

    assert session.get(SourceGroup, source_beta.id) is None
    assert session.get(LabelGroup, label_beta.id) is None

    with pytest.raises(HTTPException) as exc_info:
        source_groups.delete_group(current_user=root_user, session=session, id=source_beta.id)
    assert exc_info.value.status_code == 404

    with pytest.raises(HTTPException) as exc_info:
        label_groups.delete_group(current_user=root_user, session=session, id=label_beta.id)
    assert exc_info.value.status_code == 404
