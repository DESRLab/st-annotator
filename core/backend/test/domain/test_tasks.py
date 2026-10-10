from datetime import date, datetime, timedelta, timezone

from fastapi import HTTPException
from sqlmodel import Session, select

import pytest

from sta.domain.frames import (
    bulk_create_frames,
    bulk_delete_frames,
    bulk_update_frames,
    count_recent_frames,
    create_frame,
    delete_frame,
    list_recent_frames,
    update_frame,
)
from sta.domain.label.groups import (
    create_group as create_label_group,
    get_valid_group_ids as get_valid_label_group_ids,
)
from sta.domain.label.repo.graph import LabelsetBranchInit, init_branch
from sta.domain.label.repo.ops import OperationRegistry
from sta.domain.label.repo.ops.special import register_special_ops
from sta.domain.projects import create_project, list_projects
from sta.domain.source.groups import (
    create_group as create_source_group,
    get_valid_group_ids as get_valid_source_group_ids,
)
from sta.domain.tasks import (
    bulk_update_tasks,
    can_read_task,
    can_read_task_filters,
    count_tasks,
    create_task,
    delete_task,
    get_task_branch_permission_warnings,
    list_tasks,
    read_task,
    require_task_writer,
    update_task,
)
from sta.domain.users import create_user, list_users
from sta.models.frame import Frame, FrameBulkUpdate, FrameCreate, FrameUpdate, WorkType
from sta.models.label.group import LabelGroupCreate
from sta.models.label.repo import BranchPermission, BranchPermissionLevel
from sta.models.project import ProjectCreate
from sta.models.source.group import SourceGroupCreate
from sta.models.task import (
    Task,
    TaskAnnotator,
    TaskBulkUpdate,
    TaskCreate,
    TaskSupervisor,
    TaskUpdate,
)
from sta.models.user import Role, User, UserCreate, UserPublic

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


def _create_op_registry() -> OperationRegistry:
    op_registry = OperationRegistry()
    register_special_ops(op_registry)

    return op_registry


def _can_write_tasks(user: UserPublic, session: Session) -> bool:
    try:
        require_task_writer(user, session)
    except HTTPException:
        return False

    return True


def test_task_writers_can_list_every_user_id_they_assign(
    root_user: UserPublic,
    session: Session,
):
    """A task write rebuilds the supervisor and annotator links from the submitted
    ids, so a writer that cannot list a user cannot round-trip that user's link: it
    would drop the assignment while saving an unrelated field.
    """
    _create_test_user(
        session,
        root_user,
        username="task-writer-coupling",
        roles={Role.ANNOTATOR},
    )
    all_user_ids = set(session.exec(select(User.id)).all())
    assert all_user_ids

    users = {
        role: UserPublic(id=index, username=f"task-{role.value}", roles={role})
        for index, role in enumerate(Role, start=10_000)
    }
    writable = [role for role in Role if _can_write_tasks(users[role], session)]

    # Neither direction may be vacuous: the gate has to admit someone, and
    # visibility has to exclude someone, or the coupling below proves nothing.
    assert writable
    assert len(writable) < len(list(Role))

    for role in writable:
        listed = {user.id for user in list_users(current_user=users[role], session=session)}
        assert listed == all_user_ids


def test_project_member_can_list_assigned_project(
    root_user: UserPublic,
    session: Session,
):
    member_user = _create_test_user(
        session,
        root_user,
        username="project_member_user",
        roles={Role.ANNOTATOR},
    )
    assigned_project = create_project(
        current_user=root_user,
        session=session,
        data=ProjectCreate(
            name="assigned-member-project",
            member_ids=[member_user.id],
        ),
    )
    create_project(
        current_user=root_user,
        session=session,
        data=ProjectCreate(
            name="unassigned-member-project",
            member_ids=[root_user.id],
        ),
    )

    visible_projects = list_projects(
        current_user=member_user,
        session=session,
    )

    assert [project.id for project in visible_projects] == [assigned_project.id]


def test_nested_project_and_task_relationships_obey_task_visibility(
    root_user: UserPublic,
    session: Session,
):
    annotator = _create_test_user(
        session,
        root_user,
        username="nested-task-annotator",
        roles={Role.ANNOTATOR},
    )
    project = create_project(
        current_user=root_user,
        session=session,
        data=ProjectCreate(
            name="nested-task-visibility-project",
            member_ids=[annotator.id],
        ),
    )
    hidden_parent = create_task(
        current_user=root_user,
        session=session,
        data=TaskCreate(name="hidden-parent", project_id=project.id),
    )
    assigned_child = create_task(
        current_user=root_user,
        session=session,
        data=TaskCreate(
            name="assigned-child",
            project_id=project.id,
            parent_id=hidden_parent.id,
            annotator_ids=[annotator.id],
        ),
    )
    session.commit()

    visible_project = list_projects(current_user=annotator, session=session)[0]
    assert [task.id for task in visible_project.tasks] == [assigned_child.id]

    visible_task = read_task(
        current_user=annotator,
        session=session,
        id=assigned_child.id,
    )
    assert visible_task.parent is None


def test_can_read_task_filters_matches_can_read_task(
    root_user: UserPublic,
    session: Session,
):
    project_manager_user = _create_test_user(
        session,
        root_user,
        username="manager_user",
        roles={Role.PROJECT_MANAGER},
    )
    annotator_user = _create_test_user(
        session,
        root_user,
        username="annotator_user",
        roles={Role.ANNOTATOR},
    )
    supervisor_user = _create_test_user(
        session,
        root_user,
        username="supervisor_user",
        roles={Role.SUPERVISOR},
    )
    dual_role_user = _create_test_user(
        session,
        root_user,
        username="dual_role_user",
        roles={Role.SUPERVISOR, Role.ANNOTATOR},
    )
    unrelated_user = _create_test_user(
        session,
        root_user,
        username="unrelated_user",
        roles=set(),
    )

    project = create_project(
        current_user=root_user,
        session=session,
        data=ProjectCreate(
            name="task-access-project",
            member_ids=[root_user.id, annotator_user.id, supervisor_user.id, dual_role_user.id],
        ),
    )
    annotate_parent = create_task(
        current_user=root_user,
        session=session,
        data=TaskCreate(
            name="annotate-parent-task",
            project_id=project.id,
            annotator_ids=[annotator_user.id, dual_role_user.id],
        ),
    )
    annotate_child = create_task(
        current_user=root_user,
        session=session,
        data=TaskCreate(
            name="annotate-child-task",
            project_id=project.id,
            parent_id=annotate_parent.id,
        ),
    )
    create_task(
        current_user=root_user,
        session=session,
        data=TaskCreate(
            name="annotate-grandchild-task",
            project_id=project.id,
            parent_id=annotate_child.id,
        ),
    )

    review_parent = create_task(
        current_user=root_user,
        session=session,
        data=TaskCreate(
            name="review-parent-task",
            project_id=project.id,
            supervisor_ids=[supervisor_user.id, dual_role_user.id],
        ),
    )
    create_task(
        current_user=root_user,
        session=session,
        data=TaskCreate(
            name="review-child-task",
            project_id=project.id,
            parent_id=review_parent.id,
        ),
    )

    create_task(
        current_user=root_user,
        session=session,
        data=TaskCreate(
            name="unassigned-task",
            project_id=project.id,
        ),
    )

    tasks = session.exec(select(Task).order_by(Task.id)).all()

    for user in [
        root_user,
        project_manager_user,
        annotator_user,
        supervisor_user,
        dual_role_user,
        unrelated_user,
    ]:
        expected_ids = {task.id for task in tasks if can_read_task(user, session, task)}
        filtered_ids = {
            task.id
            for task in session.exec(
                select(Task).where(*can_read_task_filters(user)).order_by(Task.id),
            ).all()
        }

        assert filtered_ids == expected_ids


def test_bulk_create_frames_validates_task_ids_in_batch(
    root_user: UserPublic,
    session: Session,
):
    project = create_project(
        current_user=root_user,
        session=session,
        data=ProjectCreate(name="bulk-frame-validation-project", member_ids=[root_user.id]),
    )
    first_task = create_task(
        current_user=root_user,
        session=session,
        data=TaskCreate(
            name="bulk-frame-validation-first-task",
            project_id=project.id,
            annotator_ids=[root_user.id],
        ),
    )
    second_task = create_task(
        current_user=root_user,
        session=session,
        data=TaskCreate(
            name="bulk-frame-validation-second-task",
            project_id=project.id,
            supervisor_ids=[root_user.id],
        ),
    )

    ids = bulk_create_frames(
        current_user=root_user,
        session=session,
        data=[
            FrameCreate(
                task_id=first_task.id,
                account_id=root_user.id,
                source_group_id=None,
                label_branch_id=None,
                work_type=WorkType.ANNOTATE,
            ),
            FrameCreate(
                task_id=second_task.id,
                account_id=root_user.id,
                source_group_id=None,
                label_branch_id=None,
                work_type=WorkType.REVIEW,
            ),
        ],
    )

    frames = session.exec(select(Frame).where(Frame.id.in_(ids)).order_by(Frame.id)).all()

    assert len(ids) == 2
    assert [frame.task_id for frame in frames] == [first_task.id, second_task.id]


def test_frame_assignment_inherits_from_parent_tasks(
    root_user: UserPublic,
    session: Session,
):
    project = create_project(
        current_user=root_user,
        session=session,
        data=ProjectCreate(name="inherited-frame-project", member_ids=[root_user.id]),
    )

    parent = create_task(
        current_user=root_user,
        session=session,
        data=TaskCreate(
            name="inherited-frame-parent",
            project_id=project.id,
            supervisor_ids=[root_user.id],
            annotator_ids=[root_user.id],
        ),
    )

    # Should inherit supervisor/annotator from parent
    child = create_task(
        current_user=root_user,
        session=session,
        data=TaskCreate(
            name="inherited-frame-child",
            project_id=project.id,
            parent_id=parent.id,
        ),
    )

    ids = bulk_create_frames(
        current_user=root_user,
        session=session,
        data=[
            FrameCreate(
                task_id=child.id,
                account_id=root_user.id,
                source_group_id=None,
                label_branch_id=None,
                work_type=work_type,
            )
            for work_type in (WorkType.ANNOTATE, WorkType.REVIEW)
        ],
    )

    assert len(ids) == 2


def test_bulk_update_frames_validates_existing_task_ids_in_batch(
    root_user: UserPublic,
    session: Session,
):
    project = create_project(
        current_user=root_user,
        session=session,
        data=ProjectCreate(name="bulk-frame-update-validation-project", member_ids=[root_user.id]),
    )
    task = create_task(
        current_user=root_user,
        session=session,
        data=TaskCreate(
            name="bulk-frame-update-task",
            project_id=project.id,
            supervisor_ids=[root_user.id],
            annotator_ids=[root_user.id],
        ),
    )

    ids = bulk_create_frames(
        current_user=root_user,
        session=session,
        data=[
            FrameCreate(
                task_id=task.id,
                account_id=root_user.id,
                source_group_id=None,
                label_branch_id=None,
                work_type=WorkType.ANNOTATE,
            ),
            FrameCreate(
                task_id=task.id,
                account_id=root_user.id,
                source_group_id=None,
                label_branch_id=None,
                work_type=WorkType.REVIEW,
            ),
        ],
    )

    bulk_update_frames(
        current_user=root_user,
        session=session,
        ids=set(ids),
        data=FrameBulkUpdate(is_complete=True),
    )

    frames = session.exec(select(Frame).where(Frame.id.in_(ids)).order_by(Frame.id)).all()

    assert [frame.task_id for frame in frames] == [task.id, task.id]
    assert [frame.is_complete for frame in frames] == [True, True]


def test_bulk_create_frames_rejects_any_missing_task_id_before_insert(
    root_user: UserPublic,
    session: Session,
):
    project = create_project(
        current_user=root_user,
        session=session,
        data=ProjectCreate(name="bulk-frame-invalid-project", member_ids=[root_user.id]),
    )
    task = create_task(
        current_user=root_user,
        session=session,
        data=TaskCreate(
            name="bulk-frame-invalid-task",
            project_id=project.id,
            annotator_ids=[root_user.id],
        ),
    )
    missing_task_id = task.id + 1000

    with pytest.raises(HTTPException) as exc_info:
        bulk_create_frames(
            current_user=root_user,
            session=session,
            data=[
                FrameCreate(
                    task_id=task.id,
                    account_id=root_user.id,
                    source_group_id=None,
                    label_branch_id=None,
                    work_type=WorkType.ANNOTATE,
                ),
                FrameCreate(
                    task_id=missing_task_id,
                    account_id=root_user.id,
                    source_group_id=None,
                    label_branch_id=None,
                    work_type=WorkType.REVIEW,
                ),
            ],
        )

    assert exc_info.value.status_code == 404
    assert session.exec(select(Frame).where(Frame.task_id == task.id)).all() == []


def test_frame_creation_requires_account_assigned_to_matching_task_role(
    root_user: UserPublic,
    session: Session,
):
    annotator_user = _create_test_user(
        session,
        root_user,
        username="frame_role_annotator_user",
        roles={Role.ANNOTATOR},
    )
    supervisor_user = _create_test_user(
        session,
        root_user,
        username="frame_role_supervisor_user",
        roles={Role.SUPERVISOR},
    )
    project = create_project(
        current_user=root_user,
        session=session,
        data=ProjectCreate(
            name="frame-role-validation-project",
            member_ids=[root_user.id, annotator_user.id, supervisor_user.id],
        ),
    )
    task = create_task(
        current_user=root_user,
        session=session,
        data=TaskCreate(
            name="frame-role-validation-task",
            project_id=project.id,
            supervisor_ids=[supervisor_user.id],
            annotator_ids=[annotator_user.id],
        ),
    )

    create_frame(
        current_user=root_user,
        session=session,
        data=FrameCreate(
            task_id=task.id,
            account_id=annotator_user.id,
            source_group_id=None,
            label_branch_id=None,
            work_type=WorkType.ANNOTATE,
        ),
    )

    create_frame(
        current_user=root_user,
        session=session,
        data=FrameCreate(
            task_id=task.id,
            account_id=supervisor_user.id,
            source_group_id=None,
            label_branch_id=None,
            work_type=WorkType.REVIEW,
        ),
    )

    with pytest.raises(HTTPException) as annotate_exc_info:
        create_frame(
            current_user=root_user,
            session=session,
            data=FrameCreate(
                task_id=task.id,
                account_id=supervisor_user.id,
                source_group_id=None,
                label_branch_id=None,
                work_type=WorkType.ANNOTATE,
            ),
        )

    with pytest.raises(HTTPException) as review_exc_info:
        create_frame(
            current_user=root_user,
            session=session,
            data=FrameCreate(
                task_id=task.id,
                account_id=annotator_user.id,
                source_group_id=None,
                label_branch_id=None,
                work_type=WorkType.REVIEW,
            ),
        )

    assert annotate_exc_info.value.status_code == 400
    assert review_exc_info.value.status_code == 400


def test_non_manager_frame_owner_can_only_update_completion_status(
    root_user: UserPublic,
    session: Session,
):
    annotator_user = _create_test_user(
        session,
        root_user,
        username="frame_completion_annotator_user",
        roles={Role.ANNOTATOR},
    )
    project = create_project(
        current_user=root_user,
        session=session,
        data=ProjectCreate(
            name="frame-completion-permission-project",
            member_ids=[root_user.id, annotator_user.id],
        ),
    )
    task = create_task(
        current_user=root_user,
        session=session,
        data=TaskCreate(
            name="frame-completion-permission-task",
            project_id=project.id,
            annotator_ids=[annotator_user.id],
        ),
    )
    frame = create_frame(
        current_user=root_user,
        session=session,
        data=FrameCreate(
            task_id=task.id,
            account_id=annotator_user.id,
            source_group_id=None,
            label_branch_id=None,
            work_type=WorkType.ANNOTATE,
            min_x=1,
        ),
    )

    update_frame(
        current_user=annotator_user,
        session=session,
        id=frame.id,
        data=FrameUpdate(is_complete=True, issued_at=frame.last_edit_at),
    )
    session.refresh(frame)
    assert frame.is_complete is True
    assert frame.min_x == 1

    with pytest.raises(HTTPException) as update_exc_info:
        update_frame(
            current_user=annotator_user,
            session=session,
            id=frame.id,
            data=FrameUpdate(min_x=2),
        )

    with pytest.raises(HTTPException) as delete_exc_info:
        delete_frame(
            current_user=annotator_user,
            session=session,
            id=frame.id,
        )

    assert update_exc_info.value.status_code == 403
    assert delete_exc_info.value.status_code == 403

    update_frame(
        current_user=root_user,
        session=session,
        id=frame.id,
        data=FrameUpdate(min_x=3),
    )
    session.refresh(frame)
    assert frame.min_x == 3

    delete_frame(
        current_user=root_user,
        session=session,
        id=frame.id,
    )
    assert session.get(Frame, frame.id) is None


def test_non_manager_group_access_uses_frames_from_assigned_tasks(
    root_user: UserPublic,
    session: Session,
):
    annotator_user = _create_test_user(
        session,
        root_user,
        username="frame_group_annotator_user",
        roles={Role.ANNOTATOR},
    )

    project = create_project(
        current_user=root_user,
        session=session,
        data=ProjectCreate(
            name="frame-group-access-project",
            member_ids=[root_user.id, annotator_user.id],
        ),
    )
    assigned_task = create_task(
        current_user=root_user,
        session=session,
        data=TaskCreate(
            name="assigned-frame-group-task",
            project_id=project.id,
            annotator_ids=[annotator_user.id],
        ),
    )
    unassigned_task = create_task(
        current_user=root_user,
        session=session,
        data=TaskCreate(
            name="unassigned-frame-group-task",
            project_id=project.id,
            annotator_ids=[root_user.id],
        ),
    )

    assert get_valid_source_group_ids(annotator_user, session) == set()
    assert get_valid_label_group_ids(annotator_user, session) == set()
    assert get_valid_source_group_ids(root_user, session) == set()
    assert get_valid_label_group_ids(root_user, session) == set()

    assigned_source_group = create_source_group(
        current_user=root_user,
        session=session,
        data=SourceGroupCreate(name="assigned-frame-source-group"),
    )
    unassigned_source_group = create_source_group(
        current_user=root_user,
        session=session,
        data=SourceGroupCreate(name="unassigned-frame-source-group"),
    )
    assigned_label_group = create_label_group(
        current_user=root_user,
        session=session,
        data=LabelGroupCreate(name="assigned-frame-label-group"),
    )
    unassigned_label_group = create_label_group(
        current_user=root_user,
        session=session,
        data=LabelGroupCreate(name="unassigned-frame-label-group"),
    )

    op_registry = _create_op_registry()
    assigned_branch = init_branch(
        current_user=root_user,
        session=session,
        op_registry=op_registry,
        data=LabelsetBranchInit(
            group_id=assigned_label_group.id,
            name="assigned-frame-branch",
            perm_lv_by_user_id={
                annotator_user.id: BranchPermissionLevel.WRITE,
            },
        ),
    )
    unassigned_branch = init_branch(
        current_user=root_user,
        session=session,
        op_registry=op_registry,
        data=LabelsetBranchInit(
            group_id=unassigned_label_group.id,
            name="unassigned-frame-branch",
        ),
    )

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
            source_group_id=unassigned_source_group.id,
            label_branch_id=unassigned_branch.id,
            work_type=WorkType.ANNOTATE,
        ),
    )

    assert get_valid_source_group_ids(annotator_user, session) == {assigned_source_group.id}
    assert get_valid_label_group_ids(annotator_user, session) == {assigned_label_group.id}
    assert get_valid_source_group_ids(root_user, session) == {
        assigned_source_group.id,
        unassigned_source_group.id,
    }
    assert get_valid_label_group_ids(root_user, session) == {
        assigned_label_group.id,
        unassigned_label_group.id,
    }

    permission = session.get(
        BranchPermission,
        {"branch_id": assigned_branch.id, "user_id": annotator_user.id},
    )
    assert permission is not None
    permission.permission_lv = BranchPermissionLevel.READ
    session.add(permission)
    session.flush([permission])
    warnings = get_task_branch_permission_warnings(session, assigned_task)
    assert len(warnings) == 1
    assert annotator_user.username in warnings[0]
    assert "lacks WRITE access" in warnings[0]


def test_task_branch_warnings_require_write_elevated_for_supervisors(
    root_user: UserPublic,
    session: Session,
):
    """Supervisors are reported against WRITE_ELEVATED; annotators against WRITE."""
    annotator_user = _create_test_user(
        session, root_user, username="warn_annotator", roles={Role.ANNOTATOR}
    )
    supervisor_user = _create_test_user(
        session, root_user, username="warn_supervisor", roles={Role.SUPERVISOR}
    )
    project = create_project(
        current_user=root_user,
        session=session,
        data=ProjectCreate(
            name="warn-branch-project",
            member_ids=[root_user.id, annotator_user.id, supervisor_user.id],
        ),
    )
    task = create_task(
        current_user=root_user,
        session=session,
        data=TaskCreate(
            name="warn-branch-task",
            project_id=project.id,
            supervisor_ids=[supervisor_user.id],
            annotator_ids=[annotator_user.id],
        ),
    )
    label_group = create_label_group(
        current_user=root_user,
        session=session,
        data=LabelGroupCreate(name="warn-branch-group"),
    )
    branch = init_branch(
        current_user=root_user,
        session=session,
        op_registry=_create_op_registry(),
        data=LabelsetBranchInit(
            group_id=label_group.id,
            name="warn-branch",
            perm_lv_by_user_id={
                annotator_user.id: BranchPermissionLevel.WRITE,
                supervisor_user.id: BranchPermissionLevel.WRITE,
            },
        ),
    )
    create_frame(
        current_user=root_user,
        session=session,
        data=FrameCreate(
            task_id=task.id,
            account_id=annotator_user.id,
            source_group_id=None,
            label_branch_id=branch.id,
            work_type=WorkType.ANNOTATE,
        ),
    )

    warnings = get_task_branch_permission_warnings(session, task)

    # Only the supervisor falls short, and the message names the level they lack.
    assert len(warnings) == 1
    assert supervisor_user.username in warnings[0]
    assert warnings[0].startswith("Supervisor ")
    assert "lacks WRITE_ELEVATED access" in warnings[0]

    permission = session.get(
        BranchPermission,
        {"branch_id": branch.id, "user_id": supervisor_user.id},
    )
    assert permission is not None
    permission.permission_lv = BranchPermissionLevel.WRITE_ELEVATED
    session.add(permission)
    session.flush([permission])

    assert get_task_branch_permission_warnings(session, task) == []


def test_list_recent_frames_returns_only_own_viewed_frames_most_recent_first(
    root_user: UserPublic,
    session: Session,
):
    annotator_user = _create_test_user(
        session,
        root_user,
        username="recent_frames_annotator_user",
        roles={Role.ANNOTATOR, Role.SUPERVISOR},
    )
    other_user = _create_test_user(
        session,
        root_user,
        username="recent_frames_other_user",
        roles={Role.ANNOTATOR},
    )
    project = create_project(
        current_user=root_user,
        session=session,
        data=ProjectCreate(
            name="recent-frames-project",
            member_ids=[root_user.id, annotator_user.id, other_user.id],
        ),
    )
    annotate_task = create_task(
        current_user=root_user,
        session=session,
        data=TaskCreate(
            name="recent-frames-annotate-task",
            project_id=project.id,
            annotator_ids=[annotator_user.id, other_user.id],
        ),
    )
    review_task = create_task(
        current_user=root_user,
        session=session,
        data=TaskCreate(
            name="recent-frames-review-task",
            project_id=project.id,
            supervisor_ids=[annotator_user.id],
        ),
    )

    def create_frame_for(account_id: int, task_id: int, work_type: WorkType) -> Frame:
        return create_frame(
            current_user=root_user,
            session=session,
            data=FrameCreate(
                task_id=task_id,
                account_id=account_id,
                source_group_id=None,
                label_branch_id=None,
                work_type=work_type,
            ),
        )

    own_unviewed = create_frame_for(annotator_user.id, annotate_task.id, WorkType.ANNOTATE)
    own_oldest = create_frame_for(annotator_user.id, annotate_task.id, WorkType.ANNOTATE)
    own_newest = create_frame_for(annotator_user.id, annotate_task.id, WorkType.ANNOTATE)
    other_viewed = create_frame_for(other_user.id, annotate_task.id, WorkType.ANNOTATE)
    own_review = create_frame_for(annotator_user.id, review_task.id, WorkType.REVIEW)

    base_time = datetime(2026, 8, 1, tzinfo=timezone.utc)
    update_frame(
        current_user=annotator_user,
        session=session,
        id=own_oldest.id,
        data=FrameUpdate(last_viewed_at=base_time),
    )
    update_frame(
        current_user=annotator_user,
        session=session,
        id=own_newest.id,
        data=FrameUpdate(last_viewed_at=base_time + timedelta(hours=2)),
    )
    update_frame(
        current_user=other_user,
        session=session,
        id=other_viewed.id,
        data=FrameUpdate(last_viewed_at=base_time + timedelta(hours=3)),
    )
    update_frame(
        current_user=annotator_user,
        session=session,
        id=own_review.id,
        data=FrameUpdate(last_viewed_at=base_time + timedelta(hours=5)),
    )

    recent = list_recent_frames(current_user=annotator_user, session=session)
    assert [frame.id for frame in recent] == [own_review.id, own_newest.id, own_oldest.id]
    assert count_recent_frames(current_user=annotator_user, session=session) == 3

    # Unviewed own frames and other users' frames are excluded.
    assert own_unviewed.id not in [frame.id for frame in recent]
    assert other_viewed.id not in [frame.id for frame in recent]

    # Managers are scoped to their own frames as well.
    assert list_recent_frames(current_user=root_user, session=session) == []

    annotate_recent = list_recent_frames(
        current_user=annotator_user,
        session=session,
        task_id=annotate_task.id,
        work_type=WorkType.ANNOTATE,
    )
    assert [frame.id for frame in annotate_recent] == [own_newest.id, own_oldest.id]

    review_recent = list_recent_frames(
        current_user=annotator_user,
        session=session,
        work_type=WorkType.REVIEW,
    )
    assert [frame.id for frame in review_recent] == [own_review.id]

    paged = list_recent_frames(
        current_user=annotator_user,
        session=session,
        offset=1,
        limit=1,
    )
    assert [frame.id for frame in paged] == [own_newest.id]


def _create_frame_write_targets(
    root_user: UserPublic,
    session: Session,
    name: str,
) -> int:
    """Create the project + task a frame written by these tests needs."""
    project = create_project(
        current_user=root_user,
        session=session,
        data=ProjectCreate(name=f"{name}-project", member_ids=[root_user.id]),
    )
    task = create_task(
        current_user=root_user,
        session=session,
        data=TaskCreate(
            name=f"{name}-task",
            project_id=project.id,
            supervisor_ids=[root_user.id],
            annotator_ids=[root_user.id],
        ),
    )
    session.commit()

    return task.id


@pytest.mark.parametrize(
    ("bounds", "reason"),
    [
        ({"min_x": 20, "max_x": 10}, "minimum coordinates"),
        (
            {
                "min_timestamp": datetime(2026, 1, 2, tzinfo=timezone.utc),
                "max_timestamp": datetime(2026, 1, 1, tzinfo=timezone.utc),
            },
            "minimum timestamp",
        ),
    ],
)
def test_create_frame_rejects_inverted_bounds(
    root_user: UserPublic,
    session: Session,
    bounds: dict,
    reason: str,
):
    task_id = _create_frame_write_targets(root_user, session, "frame-create-bounds")

    with pytest.raises(HTTPException) as exc_info:
        create_frame(
            current_user=root_user,
            session=session,
            data=FrameCreate(
                task_id=task_id,
                account_id=root_user.id,
                source_group_id=None,
                label_branch_id=None,
                work_type=WorkType.ANNOTATE,
                **bounds,
            ),
        )

    assert exc_info.value.status_code == 422
    assert reason in exc_info.value.detail
    assert session.exec(select(Frame)).all() == []


def test_update_frame_rejects_bounds_inverting_the_retained_maximum(
    root_user: UserPublic,
    session: Session,
):
    task_id = _create_frame_write_targets(root_user, session, "frame-update-bounds")
    frame = create_frame(
        current_user=root_user,
        session=session,
        data=FrameCreate(
            task_id=task_id,
            account_id=root_user.id,
            source_group_id=None,
            label_branch_id=None,
            work_type=WorkType.ANNOTATE,
            min_x=0,
            max_x=10,
        ),
    )
    session.commit()

    # A partial update that pushes the minimum past the retained maximum would
    # otherwise persist and only fail when a loader reads `st_bounds`.
    with pytest.raises(HTTPException) as exc_info:
        update_frame(
            current_user=root_user,
            session=session,
            id=frame.id,
            data=FrameUpdate(min_x=20),
        )

    assert exc_info.value.status_code == 422

    session.rollback()

    record = session.get(Frame, frame.id)
    assert record.min_x == 0
    assert record.max_x == 10
    assert record.st_bounds.max_coords.x == 10


def test_bulk_create_frames_rejects_any_inverted_bounds(
    root_user: UserPublic,
    session: Session,
):
    task_id = _create_frame_write_targets(root_user, session, "frame-bulk-create-bounds")

    with pytest.raises(HTTPException) as exc_info:
        bulk_create_frames(
            current_user=root_user,
            session=session,
            data=[
                FrameCreate(
                    task_id=task_id,
                    account_id=root_user.id,
                    source_group_id=None,
                    label_branch_id=None,
                    work_type=WorkType.ANNOTATE,
                    min_x=0,
                    max_x=10,
                ),
                FrameCreate(
                    task_id=task_id,
                    account_id=root_user.id,
                    source_group_id=None,
                    label_branch_id=None,
                    work_type=WorkType.REVIEW,
                    min_timestamp=datetime(2026, 1, 2, tzinfo=timezone.utc),
                    max_timestamp=datetime(2026, 1, 1, tzinfo=timezone.utc),
                ),
            ],
        )

    assert exc_info.value.status_code == 422
    assert session.exec(select(Frame)).all() == []


def test_bulk_update_frames_rejects_bounds_inverting_the_retained_maximum(
    root_user: UserPublic,
    session: Session,
):
    task_id = _create_frame_write_targets(root_user, session, "frame-bulk-update-bounds")
    ids = bulk_create_frames(
        current_user=root_user,
        session=session,
        data=[
            FrameCreate(
                task_id=task_id,
                account_id=root_user.id,
                source_group_id=None,
                label_branch_id=None,
                work_type=work_type,
                min_x=0,
                max_x=10,
            )
            for work_type in (WorkType.ANNOTATE, WorkType.REVIEW)
        ],
    )
    session.commit()

    with pytest.raises(HTTPException) as exc_info:
        bulk_update_frames(
            current_user=root_user,
            session=session,
            ids=set(ids),
            data=FrameBulkUpdate(min_x=20),
        )

    assert exc_info.value.status_code == 422

    # The bulk statement is rolled back with the request, so no row keeps it.
    session.rollback()

    frames = session.exec(select(Frame).where(Frame.id.in_(ids)).order_by(Frame.id)).all()
    assert [(frame.min_x, frame.max_x) for frame in frames] == [(0, 10), (0, 10)]


def test_bulk_update_frames_ignores_issued_at(root_user: UserPublic, session: Session):
    # `FrameBulkUpdate` inherits `issued_at` from the shared update model, but a
    # bulk statement is never conflict-checked, so the field must not reach the
    # Core UPDATE as a column name.
    task_id = _create_frame_write_targets(root_user, session, "frame-bulk-issued-at")
    ids = bulk_create_frames(
        current_user=root_user,
        session=session,
        data=[
            FrameCreate(
                task_id=task_id,
                account_id=root_user.id,
                source_group_id=None,
                label_branch_id=None,
                work_type=WorkType.ANNOTATE,
            ),
        ],
    )
    session.commit()

    bulk_update_frames(
        current_user=root_user,
        session=session,
        ids=set(ids),
        data=FrameBulkUpdate(is_complete=True, issued_at=datetime.now().astimezone()),
    )
    session.commit()

    frames = session.exec(select(Frame).where(Frame.id.in_(ids))).all()
    assert [frame.is_complete for frame in frames] == [True]


def _create_frames_for_accounts(
    root_user: UserPublic,
    session: Session,
    name: str,
    account_ids: list[int],
) -> list[int]:
    """
    Create one frame per account on a task that every one of them is assigned to.

    The frames are written by ``root_user`` because creating them needs the
    project-manager role; the returned rows belong to ``account_ids``, which is
    what the owner-scoped bulk write is told to reach. An account may own more
    than one frame, so the assignment lists are deduplicated.
    """
    owner_ids = list(dict.fromkeys([root_user.id, *account_ids]))
    project = create_project(
        current_user=root_user,
        session=session,
        data=ProjectCreate(name=f"{name}-project", member_ids=owner_ids),
    )
    task = create_task(
        current_user=root_user,
        session=session,
        data=TaskCreate(
            name=f"{name}-task",
            project_id=project.id,
            supervisor_ids=[root_user.id],
            annotator_ids=owner_ids,
        ),
    )
    session.commit()

    return bulk_create_frames(
        current_user=root_user,
        session=session,
        data=[
            FrameCreate(
                task_id=task.id,
                account_id=account_id,
                source_group_id=None,
                label_branch_id=None,
                work_type=WorkType.ANNOTATE,
            )
            for account_id in account_ids
        ],
    )


def _create_worker(session: Session, root_user: UserPublic, username: str) -> UserPublic:
    return _create_test_user(session, root_user, username=username, roles={Role.ANNOTATOR})


def test_frame_owner_can_bulk_complete_their_own_frames(
    root_user: UserPublic,
    session: Session,
):
    """The bulk route honours the same narrow grant the single-record route gives an owner."""
    worker = _create_worker(session, root_user, "frame-bulk-owner")
    ids = _create_frames_for_accounts(
        root_user, session, "frame-bulk-owner", [worker.id, worker.id]
    )
    session.commit()

    bulk_update_frames(
        current_user=worker,
        session=session,
        ids=set(ids),
        data=FrameBulkUpdate(is_complete=True),
    )
    session.commit()

    frames = session.exec(select(Frame).where(Frame.id.in_(ids)).order_by(Frame.id)).all()
    assert [frame.is_complete for frame in frames] == [True, True]
    # Only what the owner may write moved: the batch leaves assignment alone.
    assert [frame.account_id for frame in frames] == [worker.id, worker.id]


def test_frame_owner_bulk_update_cannot_reach_another_accounts_frames(
    root_user: UserPublic,
    session: Session,
):
    """One row that is not the caller's refuses the whole batch, before anything is written."""
    caller = _create_worker(session, root_user, "frame-bulk-mixed-caller")
    other = _create_worker(session, root_user, "frame-bulk-mixed-other")
    ids = _create_frames_for_accounts(root_user, session, "frame-bulk-mixed", [caller.id, other.id])
    session.commit()

    with pytest.raises(HTTPException) as exc_info:
        bulk_update_frames(
            current_user=caller,
            session=session,
            ids=set(ids),
            data=FrameBulkUpdate(is_complete=True),
        )

    assert exc_info.value.status_code == 403
    # The gate runs ahead of the statement, so neither row -- not even the
    # caller's own -- carries the write.
    frames = session.exec(select(Frame).where(Frame.id.in_(ids))).all()
    assert [frame.is_complete for frame in frames] == [False, False]

    # Dropping the foreign row makes the same caller, same payload, same role
    # succeed: the refusal above was the ownership check, not the missing role.
    bulk_update_frames(
        current_user=caller,
        session=session,
        ids={ids[0]},
        data=FrameBulkUpdate(is_complete=True),
    )
    session.commit()

    completed = {
        frame.id: frame.is_complete
        for frame in session.exec(select(Frame).where(Frame.id.in_(ids))).all()
    }
    assert completed == {ids[0]: True, ids[1]: False}


def test_frame_owner_bulk_update_is_confined_to_the_owner_editable_fields(
    root_user: UserPublic,
    session: Session,
):
    """A payload that escapes the owner set needs the project-manager role, even for own rows."""
    worker = _create_worker(session, root_user, "frame-bulk-field-gate")
    source_group = create_source_group(
        current_user=root_user,
        session=session,
        data=SourceGroupCreate(name="frame-bulk-field-gate-group"),
    )
    ids = _create_frames_for_accounts(
        root_user, session, "frame-bulk-field-gate", [worker.id, worker.id]
    )
    session.commit()

    # Completion alone passes...
    bulk_update_frames(
        current_user=worker,
        session=session,
        ids={ids[0]},
        data=FrameBulkUpdate(is_complete=True),
    )
    session.commit()

    # ...but pairing it with a move does not, even though every row is the caller's.
    with pytest.raises(HTTPException) as exc_info:
        bulk_update_frames(
            current_user=worker,
            session=session,
            ids=set(ids),
            data=FrameBulkUpdate(is_complete=True, source_group_id=source_group.id),
        )
    assert exc_info.value.status_code == 403

    frames = session.exec(select(Frame).where(Frame.id.in_(ids)).order_by(Frame.id)).all()
    assert [frame.source_group_id for frame in frames] == [None, None]

    # The same payload is a plain write for a project manager, so the refusal is
    # the role gate rather than the field being unbatchable.
    bulk_update_frames(
        current_user=root_user,
        session=session,
        ids=set(ids),
        data=FrameBulkUpdate(is_complete=True, source_group_id=source_group.id),
    )
    session.commit()

    frames = session.exec(select(Frame).where(Frame.id.in_(ids)).order_by(Frame.id)).all()
    assert [frame.source_group_id for frame in frames] == [source_group.id, source_group.id]


def test_bulk_delete_frames_removes_every_requested_frame(
    root_user: UserPublic,
    session: Session,
):
    task_id = _create_frame_write_targets(root_user, session, "frame-bulk-delete")
    ids = bulk_create_frames(
        current_user=root_user,
        session=session,
        data=[
            FrameCreate(
                task_id=task_id,
                account_id=root_user.id,
                source_group_id=None,
                label_branch_id=None,
                work_type=WorkType.ANNOTATE,
            )
            for _ in range(3)
        ],
    )
    session.commit()

    # The batch is a single statement guarded by one role check, so a caller
    # without it loses the whole batch rather than the rows it may not touch.
    annotator_user = _create_test_user(
        session,
        root_user,
        username="frame_bulk_delete_annotator",
        roles={Role.ANNOTATOR},
    )
    with pytest.raises(HTTPException) as exc_info:
        bulk_delete_frames(
            current_user=annotator_user,
            session=session,
            ids=set(ids),
        )

    assert exc_info.value.status_code == 403
    assert len(session.exec(select(Frame).where(Frame.id.in_(ids))).all()) == 3

    bulk_delete_frames(
        current_user=root_user,
        session=session,
        ids=set(ids),
    )
    session.commit()

    assert session.exec(select(Frame).where(Frame.id.in_(ids))).all() == []


def test_create_task_validates_parent_deadline(root_user: UserPublic, session: Session):
    project = create_project(
        current_user=root_user,
        session=session,
        data=ProjectCreate(name="parent-deadline-project", member_ids=[root_user.id]),
    )
    parent_task = create_task(
        current_user=root_user,
        session=session,
        data=TaskCreate(
            name="parent-deadline-parent-task",
            project_id=project.id,
            deadline=date(2026, 2, 1),
        ),
    )

    with pytest.raises(HTTPException) as exc_info:
        create_task(
            current_user=root_user,
            session=session,
            data=TaskCreate(
                name="parent-deadline-missing-parent-task",
                project_id=project.id,
                parent_id=99999,
            ),
        )
    assert exc_info.value.status_code == 404

    other_project = create_project(
        current_user=root_user,
        session=session,
        data=ProjectCreate(name="parent-deadline-other-project", member_ids=[root_user.id]),
    )
    with pytest.raises(HTTPException) as exc_info:
        create_task(
            current_user=root_user,
            session=session,
            data=TaskCreate(
                name="parent-deadline-cross-project-task",
                project_id=other_project.id,
                parent_id=parent_task.id,
            ),
        )
    assert exc_info.value.status_code == 400
    assert exc_info.value.detail == "A parent task must belong to the same project"

    with pytest.raises(HTTPException) as exc_info:
        create_task(
            current_user=root_user,
            session=session,
            data=TaskCreate(
                name="parent-deadline-too-late-task",
                project_id=project.id,
                parent_id=parent_task.id,
                deadline=date(2026, 2, 2),
            ),
        )
    assert exc_info.value.status_code == 400

    # A deadline equal to the parent's is allowed...
    child_task = create_task(
        current_user=root_user,
        session=session,
        data=TaskCreate(
            name="parent-deadline-equal-task",
            project_id=project.id,
            parent_id=parent_task.id,
            deadline=date(2026, 2, 1),
        ),
    )
    assert child_task.parent_id == parent_task.id

    # ...and a parent without deadline imposes no restriction.
    unlimited_parent = create_task(
        current_user=root_user,
        session=session,
        data=TaskCreate(name="parent-deadline-unlimited-parent-task", project_id=project.id),
    )
    create_task(
        current_user=root_user,
        session=session,
        data=TaskCreate(
            name="parent-deadline-unlimited-child-task",
            project_id=project.id,
            parent_id=unlimited_parent.id,
            deadline=date(2030, 1, 1),
        ),
    )


def test_create_task_validates_supervisors_and_annotators(root_user: UserPublic, session: Session):
    supervisor_user = _create_test_user(
        session,
        root_user,
        username="task_validator_supervisor",
        roles={Role.SUPERVISOR},
    )
    annotator_user = _create_test_user(
        session,
        root_user,
        username="task_validator_annotator",
        roles={Role.ANNOTATOR},
    )
    plain_user = _create_test_user(
        session,
        root_user,
        username="task_validator_plain",
        roles=set(),
    )
    outside_supervisor = _create_test_user(
        session,
        root_user,
        username="task_validator_out_sup",
        roles={Role.SUPERVISOR},
    )
    outside_annotator = _create_test_user(
        session,
        root_user,
        username="task_validator_out_ann",
        roles={Role.ANNOTATOR},
    )

    project = create_project(
        current_user=root_user,
        session=session,
        data=ProjectCreate(
            name="task-validator-project",
            member_ids=[root_user.id, supervisor_user.id, annotator_user.id, plain_user.id],
        ),
    )

    # Supervisors/annotators must hold the corresponding role...
    with pytest.raises(HTTPException) as exc_info:
        create_task(
            current_user=root_user,
            session=session,
            data=TaskCreate(
                name="task-validator-bad-supervisor-role",
                project_id=project.id,
                supervisor_ids=[plain_user.id],
            ),
        )
    assert exc_info.value.status_code == 400

    with pytest.raises(HTTPException) as exc_info:
        create_task(
            current_user=root_user,
            session=session,
            data=TaskCreate(
                name="task-validator-bad-annotator-role",
                project_id=project.id,
                annotator_ids=[plain_user.id],
            ),
        )
    assert exc_info.value.status_code == 400

    # ...and must be members of the parent project.
    with pytest.raises(HTTPException) as exc_info:
        create_task(
            current_user=root_user,
            session=session,
            data=TaskCreate(
                name="task-validator-nonmember-supervisor",
                project_id=project.id,
                supervisor_ids=[outside_supervisor.id],
            ),
        )
    assert exc_info.value.status_code == 400
    assert outside_supervisor.username in str(exc_info.value.detail)

    with pytest.raises(HTTPException) as exc_info:
        create_task(
            current_user=root_user,
            session=session,
            data=TaskCreate(
                name="task-validator-nonmember-annotator",
                project_id=project.id,
                annotator_ids=[outside_annotator.id],
            ),
        )
    assert exc_info.value.status_code == 400
    assert outside_annotator.username in str(exc_info.value.detail)

    # The parent project must exist.
    with pytest.raises(HTTPException) as exc_info:
        create_task(
            current_user=root_user,
            session=session,
            data=TaskCreate(name="task-validator-missing-project", project_id=99999),
        )
    assert exc_info.value.status_code == 404

    # Valid supervisors/annotators pass both validators.
    task = create_task(
        current_user=root_user,
        session=session,
        data=TaskCreate(
            name="task-validator-valid-task",
            project_id=project.id,
            supervisor_ids=[supervisor_user.id],
            annotator_ids=[annotator_user.id],
        ),
    )
    assert task.supervisor_ids == [supervisor_user.id]
    assert task.annotator_ids == [annotator_user.id]


def test_update_task_revalidates_parent_and_deadline(root_user: UserPublic, session: Session):
    project = create_project(
        current_user=root_user,
        session=session,
        data=ProjectCreate(name="task-revalidate-project", member_ids=[root_user.id]),
    )
    parent_task = create_task(
        current_user=root_user,
        session=session,
        data=TaskCreate(
            name="task-revalidate-parent",
            project_id=project.id,
            deadline=date(2026, 3, 1),
        ),
    )
    child_task = create_task(
        current_user=root_user,
        session=session,
        data=TaskCreate(
            name="task-revalidate-child",
            project_id=project.id,
            parent_id=parent_task.id,
        ),
    )
    grandchild_task = create_task(
        current_user=root_user,
        session=session,
        data=TaskCreate(
            name="task-revalidate-grandchild",
            project_id=project.id,
            parent_id=child_task.id,
        ),
    )
    session.commit()

    with pytest.raises(HTTPException) as exc_info:
        update_task(
            current_user=root_user,
            session=session,
            id=parent_task.id,
            data=TaskUpdate(parent_id=grandchild_task.id),
        )
    assert exc_info.value.status_code == 400
    assert exc_info.value.detail == "Cannot assign descendant as parent"
    # update_task flushes before revalidating; restore the committed state.
    session.rollback()

    with pytest.raises(HTTPException) as exc_info:
        update_task(
            current_user=root_user,
            session=session,
            id=child_task.id,
            data=TaskUpdate(parent_id=child_task.id),
        )
    assert exc_info.value.status_code == 400
    assert exc_info.value.detail == "Cannot assign self as parent"
    session.rollback()

    with pytest.raises(HTTPException) as exc_info:
        update_task(
            current_user=root_user,
            session=session,
            id=child_task.id,
            data=TaskUpdate(deadline=date(2026, 3, 2)),
        )
    assert exc_info.value.status_code == 400
    session.rollback()

    with pytest.raises(HTTPException) as exc_info:
        update_task(
            current_user=root_user,
            session=session,
            id=99999,
            data=TaskUpdate(name="task-revalidate-ghost"),
        )
    assert exc_info.value.status_code == 404

    # A valid reparenting with a matching deadline succeeds.
    other_parent = create_task(
        current_user=root_user,
        session=session,
        data=TaskCreate(
            name="task-revalidate-other-parent",
            project_id=project.id,
            deadline=date(2026, 4, 1),
        ),
    )
    updated = update_task(
        current_user=root_user,
        session=session,
        id=child_task.id,
        data=TaskUpdate(parent_id=other_parent.id, deadline=date(2026, 4, 1)),
    )
    session.commit()
    assert updated.parent_id == other_parent.id
    assert updated.deadline == date(2026, 4, 1)


def test_update_task_revalidates_supervisors_and_annotators(
    root_user: UserPublic,
    session: Session,
):
    plain_user = _create_test_user(
        session,
        root_user,
        username="task_update_validator_plain",
        roles=set(),
    )
    outside_supervisor = _create_test_user(
        session,
        root_user,
        username="task_update_out_sup",
        roles={Role.SUPERVISOR},
    )
    outside_annotator = _create_test_user(
        session,
        root_user,
        username="task_update_out_ann",
        roles={Role.ANNOTATOR},
    )
    supervisor_user = _create_test_user(
        session,
        root_user,
        username="task_update_validator_sup",
        roles={Role.SUPERVISOR},
    )

    project = create_project(
        current_user=root_user,
        session=session,
        data=ProjectCreate(
            name="task-update-validator-project",
            member_ids=[root_user.id, plain_user.id, supervisor_user.id],
        ),
    )
    task = create_task(
        current_user=root_user,
        session=session,
        data=TaskCreate(name="task-update-validator-task", project_id=project.id),
    )
    session.commit()

    # Supervisor lacking the SUPERVISOR role.
    with pytest.raises(HTTPException) as exc_info:
        update_task(
            current_user=root_user,
            session=session,
            id=task.id,
            data=TaskUpdate(supervisor_ids=[plain_user.id]),
        )
    assert exc_info.value.status_code == 400
    session.rollback()

    # Supervisor not in the parent project.
    with pytest.raises(HTTPException) as exc_info:
        update_task(
            current_user=root_user,
            session=session,
            id=task.id,
            data=TaskUpdate(supervisor_ids=[outside_supervisor.id]),
        )
    assert exc_info.value.status_code == 400
    session.rollback()

    # Annotator not in the parent project.
    with pytest.raises(HTTPException) as exc_info:
        update_task(
            current_user=root_user,
            session=session,
            id=task.id,
            data=TaskUpdate(annotator_ids=[outside_annotator.id]),
        )
    assert exc_info.value.status_code == 400
    session.rollback()

    # Valid replacement of both link tables plus scalar fields.
    updated = update_task(
        current_user=root_user,
        session=session,
        id=task.id,
        data=TaskUpdate(
            name="task-update-validator-renamed",
            description="updated description",
            supervisor_ids=[supervisor_user.id],
            annotator_ids=[root_user.id],
        ),
    )
    session.commit()

    assert updated.name == "task-update-validator-renamed"
    assert updated.description == "updated description"
    assert updated.supervisor_ids == [supervisor_user.id]
    assert updated.annotator_ids == [root_user.id]


def test_delete_task_cleans_up_links(root_user: UserPublic, session: Session):
    plain_user = _create_test_user(
        session,
        root_user,
        username="task_delete_plain",
        roles=set(),
    )
    project = create_project(
        current_user=root_user,
        session=session,
        data=ProjectCreate(name="task-delete-project", member_ids=[root_user.id, plain_user.id]),
    )
    task = create_task(
        current_user=root_user,
        session=session,
        data=TaskCreate(
            name="task-delete-task",
            project_id=project.id,
            supervisor_ids=[root_user.id],
            annotator_ids=[root_user.id],
        ),
    )
    session.commit()

    with pytest.raises(HTTPException) as exc_info:
        delete_task(current_user=plain_user, session=session, id=task.id)
    assert exc_info.value.status_code == 403

    delete_task(current_user=root_user, session=session, id=task.id)
    session.commit()

    assert session.get(Task, task.id) is None
    assert session.exec(select(TaskSupervisor).where(TaskSupervisor.task_id == task.id)).all() == []
    assert session.exec(select(TaskAnnotator).where(TaskAnnotator.task_id == task.id)).all() == []

    with pytest.raises(HTTPException) as exc_info:
        delete_task(current_user=root_user, session=session, id=task.id)
    assert exc_info.value.status_code == 404


def test_delete_task_tree_with_loaded_descendant_link_collections(
    root_user: UserPublic,
    session: Session,
):
    supervisor_user = _create_test_user(
        session,
        root_user,
        username="task_tree_session_sup",
        roles={Role.SUPERVISOR},
    )
    annotator_user = _create_test_user(
        session,
        root_user,
        username="task_tree_session_ann",
        roles={Role.ANNOTATOR},
    )
    project = create_project(
        current_user=root_user,
        session=session,
        data=ProjectCreate(
            name="task-tree-session-project",
            member_ids=[root_user.id, supervisor_user.id, annotator_user.id],
        ),
    )
    parent = create_task(
        current_user=root_user,
        session=session,
        data=TaskCreate(name="task-tree-session-parent", project_id=project.id),
    )
    child = create_task(
        current_user=root_user,
        session=session,
        data=TaskCreate(
            name="task-tree-session-child",
            project_id=project.id,
            parent_id=parent.id,
            supervisor_ids=[supervisor_user.id],
            annotator_ids=[annotator_user.id],
        ),
    )
    session.commit()

    # Load the parent's children collection and the child's link collections
    # into the session. Regression: deleting the parent cascades through the
    # ORM to the child, which must not trip over the loaded collections even
    # though only the directly deleted task's links are bulk-deleted/expired.
    parent_record = read_task(current_user=root_user, session=session, id=parent.id)
    assert [c.id for c in parent_record.children] == [child.id]
    child_record = read_task(current_user=root_user, session=session, id=child.id)
    assert list(child_record.supervisor_ids) == [supervisor_user.id]
    assert list(child_record.annotator_ids) == [annotator_user.id]

    delete_task(current_user=root_user, session=session, id=parent.id)
    session.commit()

    assert session.get(Task, parent.id) is None
    assert session.get(Task, child.id) is None
    assert (
        session.exec(select(TaskSupervisor).where(TaskSupervisor.task_id == child.id)).all() == []
    )
    assert session.exec(select(TaskAnnotator).where(TaskAnnotator.task_id == child.id)).all() == []


def test_update_and_delete_task_with_loaded_link_collections(
    root_user: UserPublic,
    session: Session,
):
    supervisor_user = _create_test_user(
        session,
        root_user,
        username="task_link_session_sup",
        roles={Role.SUPERVISOR},
    )
    annotator_user = _create_test_user(
        session,
        root_user,
        username="task_link_session_ann",
        roles={Role.ANNOTATOR},
    )
    project = create_project(
        current_user=root_user,
        session=session,
        data=ProjectCreate(
            name="task-link-session-project",
            member_ids=[root_user.id, supervisor_user.id, annotator_user.id],
        ),
    )
    task = create_task(
        current_user=root_user,
        session=session,
        data=TaskCreate(
            name="task-link-session-task",
            project_id=project.id,
            supervisor_ids=[supervisor_user.id],
            annotator_ids=[annotator_user.id],
        ),
    )
    session.commit()

    # Load both link collections into the session. Regression: the bulk link
    # deletes used to corrupt the loaded link rows, breaking the subsequent
    # update_task flush and delete_task ORM delete in the same session.
    record = read_task(current_user=root_user, session=session, id=task.id)
    assert list(record.supervisor_ids) == [supervisor_user.id]
    assert list(record.annotator_ids) == [annotator_user.id]

    # Replacing the links succeeds while the collections are loaded...
    updated = update_task(
        current_user=root_user,
        session=session,
        id=task.id,
        data=TaskUpdate(
            supervisor_ids=[root_user.id],
            annotator_ids=[annotator_user.id],
        ),
    )
    session.commit()
    assert list(updated.supervisor_ids) == [root_user.id]
    assert list(updated.annotator_ids) == [annotator_user.id]

    # ...and so does deleting the task after reloading the collections.
    record = read_task(current_user=root_user, session=session, id=task.id)
    assert list(record.supervisor_ids) == [root_user.id]
    assert list(record.annotator_ids) == [annotator_user.id]

    delete_task(current_user=root_user, session=session, id=task.id)
    session.commit()

    assert session.get(Task, task.id) is None


def test_bulk_update_tasks_updates_and_revalidates(root_user: UserPublic, session: Session):
    project = create_project(
        current_user=root_user,
        session=session,
        data=ProjectCreate(name="task-bulk-project", member_ids=[root_user.id]),
    )
    parent_task = create_task(
        current_user=root_user,
        session=session,
        data=TaskCreate(
            name="task-bulk-parent",
            project_id=project.id,
            deadline=date(2026, 5, 1),
        ),
    )
    first_task = create_task(
        current_user=root_user,
        session=session,
        data=TaskCreate(name="task-bulk-first", project_id=project.id, parent_id=parent_task.id),
    )
    second_task = create_task(
        current_user=root_user,
        session=session,
        data=TaskCreate(name="task-bulk-second", project_id=project.id, parent_id=parent_task.id),
    )
    session.commit()

    bulk_update_tasks(
        current_user=root_user,
        session=session,
        ids={first_task.id, second_task.id},
        data=TaskBulkUpdate(
            description="bulk description",
            supervisor_ids=[root_user.id],
            annotator_ids=[root_user.id],
        ),
    )
    session.commit()

    for task_id in (first_task.id, second_task.id):
        record = session.get(Task, task_id)
        assert record.description == "bulk description"
        assert record.supervisor_ids == [root_user.id]
        assert record.annotator_ids == [root_user.id]

    # Revalidation runs on every updated record.
    with pytest.raises(HTTPException) as exc_info:
        bulk_update_tasks(
            current_user=root_user,
            session=session,
            ids={first_task.id},
            data=TaskBulkUpdate(deadline=date(2026, 5, 2)),
        )
    assert exc_info.value.status_code == 400
    session.rollback()


def test_bulk_update_tasks_stamps_last_edit_at(root_user: UserPublic, session: Session):
    annotator_user = _create_test_user(
        session,
        root_user,
        username="bulk_stamp_annotator",
        roles={Role.ANNOTATOR},
    )
    project = create_project(
        current_user=root_user,
        session=session,
        data=ProjectCreate(
            name="task-bulk-stamp-project",
            member_ids=[root_user.id, annotator_user.id],
        ),
    )
    first_task = create_task(
        current_user=root_user,
        session=session,
        data=TaskCreate(
            name="task-bulk-stamp-first",
            project_id=project.id,
            annotator_ids=[root_user.id],
        ),
    )
    second_task = create_task(
        current_user=root_user,
        session=session,
        data=TaskCreate(
            name="task-bulk-stamp-second",
            project_id=project.id,
            annotator_ids=[root_user.id],
        ),
    )
    session.commit()

    ids = {first_task.id, second_task.id}
    edited_before = {task_id: session.get(Task, task_id).last_edit_at for task_id in ids}

    # Assignment links only: no scalar Task column is supplied, but the rows
    # were edited and must not look untouched to the optimistic lock.
    bulk_update_tasks(
        current_user=root_user,
        session=session,
        ids=ids,
        data=TaskBulkUpdate(annotator_ids=[annotator_user.id]),
    )
    session.commit()

    for task_id in ids:
        record = session.get(Task, task_id)
        assert list(record.annotator_ids) == [annotator_user.id]
        assert record.last_edit_at > edited_before[task_id]

    edited_before = {task_id: session.get(Task, task_id).last_edit_at for task_id in ids}

    bulk_update_tasks(
        current_user=root_user,
        session=session,
        ids=ids,
        data=TaskBulkUpdate(description="bulk stamped description"),
    )
    session.commit()

    for task_id in ids:
        record = session.get(Task, task_id)
        assert record.description == "bulk stamped description"
        assert record.last_edit_at > edited_before[task_id]


def test_bulk_assignment_change_blocks_a_stale_single_task_edit(
    root_user: UserPublic,
    session: Session,
):
    annotator_user = _create_test_user(
        session,
        root_user,
        username="bulk_race_annotator",
        roles={Role.ANNOTATOR},
    )
    project = create_project(
        current_user=root_user,
        session=session,
        data=ProjectCreate(
            name="task-bulk-race-project",
            member_ids=[root_user.id, annotator_user.id],
        ),
    )
    task = create_task(
        current_user=root_user,
        session=session,
        data=TaskCreate(
            name="task-bulk-race",
            project_id=project.id,
            annotator_ids=[root_user.id],
        ),
    )
    session.commit()

    # The client loaded the task before the bulk reassignment happened.
    issued_at = datetime.now().astimezone()

    bulk_update_tasks(
        current_user=root_user,
        session=session,
        ids={task.id},
        data=TaskBulkUpdate(annotator_ids=[annotator_user.id]),
    )
    session.commit()

    with pytest.raises(HTTPException) as exc_info:
        update_task(
            current_user=root_user,
            session=session,
            id=task.id,
            data=TaskUpdate(description="stale single edit", issued_at=issued_at),
        )

    assert exc_info.value.status_code == 409
    # The bulk assignment survived instead of being silently reverted.
    assert list(session.get(Task, task.id).annotator_ids) == [annotator_user.id]


def test_count_and_read_task(root_user: UserPublic, session: Session):
    annotator_user = _create_test_user(
        session,
        root_user,
        username="task_read_annotator",
        roles={Role.ANNOTATOR},
    )
    project = create_project(
        current_user=root_user,
        session=session,
        data=ProjectCreate(name="task-read-project", member_ids=[root_user.id, annotator_user.id]),
    )
    assigned_task = create_task(
        current_user=root_user,
        session=session,
        data=TaskCreate(
            name="task-read-assigned",
            project_id=project.id,
            annotator_ids=[annotator_user.id],
        ),
    )
    unassigned_task = create_task(
        current_user=root_user,
        session=session,
        data=TaskCreate(name="task-read-unassigned", project_id=project.id),
    )
    session.commit()

    assert count_tasks(current_user=root_user, session=session) == 2
    assert count_tasks(current_user=root_user, session=session, project_id=project.id) == 2
    assert count_tasks(current_user=root_user, session=session, name="task-read-assigned") == 1
    assert count_tasks(current_user=annotator_user, session=session) == 1

    assert (
        read_task(current_user=root_user, session=session, id=assigned_task.id).id
        == assigned_task.id
    )
    assert (
        read_task(current_user=annotator_user, session=session, id=assigned_task.id).id
        == assigned_task.id
    )

    # Non-managers only see their accessible tasks...
    with pytest.raises(HTTPException) as exc_info:
        read_task(current_user=annotator_user, session=session, id=unassigned_task.id)
    assert exc_info.value.status_code == 404

    # ...and missing ids 404 for everyone.
    with pytest.raises(HTTPException) as exc_info:
        read_task(current_user=root_user, session=session, id=99999)
    assert exc_info.value.status_code == 404


def test_list_tasks_manager_and_dual_role_access(root_user: UserPublic, session: Session):
    manager_user = _create_test_user(
        session,
        root_user,
        username="task_list_manager",
        roles={Role.PROJECT_MANAGER},
    )
    dual_role_user = _create_test_user(
        session,
        root_user,
        username="task_list_dual_role",
        roles={Role.SUPERVISOR, Role.ANNOTATOR},
    )
    project = create_project(
        current_user=root_user,
        session=session,
        data=ProjectCreate(name="task-list-project", member_ids=[root_user.id, dual_role_user.id]),
    )
    supervised_task = create_task(
        current_user=root_user,
        session=session,
        data=TaskCreate(
            name="task-list-supervised",
            project_id=project.id,
            supervisor_ids=[dual_role_user.id],
        ),
    )
    annotated_task = create_task(
        current_user=root_user,
        session=session,
        data=TaskCreate(
            name="task-list-annotated",
            project_id=project.id,
            annotator_ids=[dual_role_user.id],
        ),
    )
    child_task = create_task(
        current_user=root_user,
        session=session,
        data=TaskCreate(
            name="task-list-child-of-supervised",
            project_id=project.id,
            parent_id=supervised_task.id,
        ),
    )
    annotated_child_task = create_task(
        current_user=root_user,
        session=session,
        data=TaskCreate(
            name="task-list-child-of-annotated",
            project_id=project.id,
            parent_id=annotated_task.id,
        ),
    )
    unassigned_task = create_task(
        current_user=root_user,
        session=session,
        data=TaskCreate(name="task-list-unassigned", project_id=project.id),
    )
    session.commit()

    all_task_ids = {
        supervised_task.id,
        annotated_task.id,
        child_task.id,
        annotated_child_task.id,
        unassigned_task.id,
    }

    # PROJECT_MANAGER takes the early-return branch and sees every task.
    assert {
        task.id for task in list_tasks(current_user=manager_user, session=session)
    } == all_task_ids
    assert {
        task.id
        for task in list_tasks(current_user=root_user, session=session, project_id=project.id)
    } == all_task_ids

    # limit and exact-name branches.
    assert len(list_tasks(current_user=root_user, session=session, limit=2)) == 2
    assert [
        task.id
        for task in list_tasks(current_user=root_user, session=session, name="task-list-annotated")
    ] == [annotated_task.id]

    # A SUPERVISOR+ANNOTATOR user sees the union of both role seed sets,
    # expanded with the descendants of every accessible task.
    dual_role_task_ids = {
        supervised_task.id,
        annotated_task.id,
        child_task.id,
        annotated_child_task.id,
    }
    assert {
        task.id for task in list_tasks(current_user=dual_role_user, session=session)
    } == dual_role_task_ids
    assert count_tasks(current_user=dual_role_user, session=session) == len(dual_role_task_ids)
    assert count_tasks(current_user=dual_role_user, session=session, project_id=project.id) == len(
        dual_role_task_ids,
    )
    for task_id in dual_role_task_ids:
        assert read_task(current_user=dual_role_user, session=session, id=task_id).id == task_id

    # Unassigned tasks remain invisible to the dual-role user.
    assert unassigned_task.id not in {
        task.id for task in list_tasks(current_user=dual_role_user, session=session)
    }
    with pytest.raises(HTTPException) as exc_info:
        read_task(current_user=dual_role_user, session=session, id=unassigned_task.id)
    assert exc_info.value.status_code == 404
