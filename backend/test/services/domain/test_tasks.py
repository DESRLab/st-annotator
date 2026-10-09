from sqlmodel import Session, select

from sta.services.domain.label.groups import create_group as create_label_group
from sta.services.domain.projects import create_project
from sta.services.domain.source.groups import create_group as create_source_group
from sta.services.domain.tasks import can_read_task, can_read_task_filters, create_task
from sta.services.domain.users import create_user
from sta.services.models.label.group import LabelGroupCreate
from sta.services.models.project import ProjectCreate
from sta.services.models.source.group import SourceGroupCreate
from sta.services.models.task import Task, TaskCreate
from sta.services.models.user import Role, UserCreate, UserPublic


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
            member_ids=[root_user.id, annotator_user.id, supervisor_user.id],
        ),
    )
    source_group = create_source_group(
        current_user=root_user,
        session=session,
        data=SourceGroupCreate(name="task-access-source-group"),
    )
    label_group = create_label_group(
        current_user=root_user,
        session=session,
        data=LabelGroupCreate(name="task-access-label-group"),
    )

    annotate_parent = create_task(
        current_user=root_user,
        session=session,
        data=TaskCreate(
            name="annotate-parent-task",
            project_id=project.id,
            source_group_id=source_group.id,
            label_group_id=label_group.id,
            annotator_ids=[annotator_user.id],
        ),
    )
    annotate_child = create_task(
        current_user=root_user,
        session=session,
        data=TaskCreate(
            name="annotate-child-task",
            project_id=project.id,
            parent_id=annotate_parent.id,
            source_group_id=source_group.id,
            label_group_id=label_group.id,
        ),
    )
    create_task(
        current_user=root_user,
        session=session,
        data=TaskCreate(
            name="annotate-grandchild-task",
            project_id=project.id,
            parent_id=annotate_child.id,
            source_group_id=source_group.id,
            label_group_id=label_group.id,
        ),
    )

    review_parent = create_task(
        current_user=root_user,
        session=session,
        data=TaskCreate(
            name="review-parent-task",
            project_id=project.id,
            source_group_id=source_group.id,
            label_group_id=label_group.id,
            supervisor_ids=[supervisor_user.id],
        ),
    )
    create_task(
        current_user=root_user,
        session=session,
        data=TaskCreate(
            name="review-child-task",
            project_id=project.id,
            parent_id=review_parent.id,
            source_group_id=source_group.id,
            label_group_id=label_group.id,
        ),
    )

    create_task(
        current_user=root_user,
        session=session,
        data=TaskCreate(
            name="unassigned-task",
            project_id=project.id,
            source_group_id=source_group.id,
            label_group_id=label_group.id,
        ),
    )

    tasks = session.exec(select(Task).order_by(Task.id)).all()

    for user in [root_user, project_manager_user, annotator_user, supervisor_user, unrelated_user]:
        expected_ids = {
            task.id
            for task in tasks
            if can_read_task(user, session, task)
        }
        filtered_ids = {
            task.id
            for task in session.exec(
                select(Task)
                .where(*can_read_task_filters(user))
                .order_by(Task.id),
            ).all()
        }

        assert filtered_ids == expected_ids
