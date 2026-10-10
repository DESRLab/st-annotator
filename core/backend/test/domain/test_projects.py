"""Tests for project mutation paths: guards, member relinking, list queries."""

from datetime import datetime

from fastapi import HTTPException
from sqlmodel import Session, select

import pytest

from sta.domain import projects as domain
from sta.domain.projects import can_read_project
from sta.domain.tasks import create_task, read_task
from sta.domain.users import create_user
from sta.models.project import (
    Project,
    ProjectBulkUpdate,
    ProjectCreate,
    ProjectMember,
    ProjectUpdate,
)
from sta.models.task import Task, TaskAnnotator, TaskCreate, TaskSupervisor
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


def test_can_read_project_manager_bypass_and_membership(root_user: UserPublic, session: Session):
    member_user = _create_test_user(session, root_user, username="project_read_member", roles=set())
    manager_user = _create_test_user(
        session,
        root_user,
        username="project_read_manager",
        roles={Role.PROJECT_MANAGER},
    )
    outsider_user = _create_test_user(
        session, root_user, username="project_read_outsider", roles=set()
    )

    project = domain.create_project(
        current_user=root_user,
        session=session,
        data=ProjectCreate(name="read-access-project", member_ids=[member_user.id]),
    )
    session.commit()

    assert can_read_project(manager_user, project) is True, "PROJECT_MANAGER bypasses membership"
    assert can_read_project(member_user, project) is True
    assert can_read_project(root_user, project) is True
    assert can_read_project(outsider_user, project) is False


def test_read_project_visibility_and_missing(root_user: UserPublic, session: Session):
    member_user = _create_test_user(session, root_user, username="project_vis_member", roles=set())
    manager_user = _create_test_user(
        session,
        root_user,
        username="project_vis_manager",
        roles={Role.PROJECT_MANAGER},
    )
    outsider_user = _create_test_user(
        session, root_user, username="project_vis_outsider", roles=set()
    )

    project = domain.create_project(
        current_user=root_user,
        session=session,
        data=ProjectCreate(name="visibility-project", member_ids=[member_user.id]),
    )
    session.commit()

    assert (
        domain.read_project(current_user=member_user, session=session, id=project.id).id
        == project.id
    )
    assert (
        domain.read_project(current_user=manager_user, session=session, id=project.id).id
        == project.id
    )

    # Non-members get a 404 rather than a 403...
    with pytest.raises(HTTPException) as exc_info:
        domain.read_project(current_user=outsider_user, session=session, id=project.id)
    assert exc_info.value.status_code == 404

    # ...as does everyone for missing ids.
    with pytest.raises(HTTPException) as exc_info:
        domain.read_project(current_user=root_user, session=session, id=99999)
    assert exc_info.value.status_code == 404


def test_update_project_fields_and_member_relink(root_user: UserPublic, session: Session):
    first_member = _create_test_user(
        session, root_user, username="project_update_first", roles=set()
    )
    second_member = _create_test_user(
        session, root_user, username="project_update_second", roles=set()
    )

    project = domain.create_project(
        current_user=root_user,
        session=session,
        data=ProjectCreate(name="update-project", member_ids=[first_member.id]),
    )
    session.commit()

    # Only PROJECT_MANAGER may update.
    with pytest.raises(HTTPException) as exc_info:
        domain.update_project(
            current_user=first_member,
            session=session,
            id=project.id,
            data=ProjectUpdate(description="member attempt"),
        )
    assert exc_info.value.status_code == 403

    with pytest.raises(HTTPException) as exc_info:
        domain.update_project(
            current_user=root_user,
            session=session,
            id=99999,
            data=ProjectUpdate(name="ghost-project"),
        )
    assert exc_info.value.status_code == 404

    updated = domain.update_project(
        current_user=root_user,
        session=session,
        id=project.id,
        data=ProjectUpdate(
            name="update-project-renamed",
            description="updated description",
            member_ids=[second_member.id],
        ),
    )
    session.commit()

    assert updated.name == "update-project-renamed"
    assert updated.description == "updated description"
    assert {member.id for member in updated.members} == {second_member.id}

    # An empty member list clears all links.
    updated = domain.update_project(
        current_user=root_user,
        session=session,
        id=project.id,
        data=ProjectUpdate(member_ids=[]),
    )
    session.commit()
    assert updated.members == []


def test_update_project_rejects_an_edit_started_before_the_latest_update(
    root_user: UserPublic,
    session: Session,
):
    project = domain.create_project(
        current_user=root_user,
        session=session,
        data=ProjectCreate(name="optimistic-lock-project"),
    )
    session.commit()
    issued_at = datetime.now().astimezone()

    domain.update_project(
        current_user=root_user,
        session=session,
        id=project.id,
        data=ProjectUpdate(description="first edit", issued_at=issued_at),
    )
    session.commit()

    with pytest.raises(HTTPException) as exc_info:
        domain.update_project(
            current_user=root_user,
            session=session,
            id=project.id,
            data=ProjectUpdate(description="stale edit", issued_at=issued_at),
        )

    assert exc_info.value.status_code == 409
    assert session.get(Project, project.id).description == "first edit"


def test_delete_project_cleans_up_member_links(root_user: UserPublic, session: Session):
    member_user = _create_test_user(
        session, root_user, username="project_delete_member", roles=set()
    )

    project = domain.create_project(
        current_user=root_user,
        session=session,
        data=ProjectCreate(name="delete-project", member_ids=[member_user.id]),
    )
    session.commit()

    with pytest.raises(HTTPException) as exc_info:
        domain.delete_project(current_user=member_user, session=session, id=project.id)
    assert exc_info.value.status_code == 403

    domain.delete_project(current_user=root_user, session=session, id=project.id)
    session.commit()

    assert session.get(Project, project.id) is None
    assert (
        session.exec(
            select(ProjectMember).where(ProjectMember.project_id == project.id),
        ).all()
        == []
    )

    with pytest.raises(HTTPException) as exc_info:
        domain.delete_project(current_user=root_user, session=session, id=project.id)
    assert exc_info.value.status_code == 404


def test_bulk_update_projects_fields_and_members(root_user: UserPublic, session: Session):
    member_user = _create_test_user(session, root_user, username="project_bulk_member", roles=set())

    alpha = domain.create_project(
        current_user=root_user,
        session=session,
        data=ProjectCreate(name="bulk-alpha-project", member_ids=[root_user.id]),
    )
    beta = domain.create_project(
        current_user=root_user,
        session=session,
        data=ProjectCreate(name="bulk-beta-project"),
    )
    session.commit()

    with pytest.raises(HTTPException) as exc_info:
        domain.bulk_update_projects(
            current_user=member_user,
            session=session,
            ids={alpha.id},
            data=ProjectBulkUpdate(description="member attempt"),
        )
    assert exc_info.value.status_code == 403

    edited_before = {
        project_id: session.get(Project, project_id).last_edit_at
        for project_id in (alpha.id, beta.id)
    }

    domain.bulk_update_projects(
        current_user=root_user,
        session=session,
        ids={alpha.id, beta.id},
        data=ProjectBulkUpdate(description="bulk description", member_ids=[member_user.id]),
    )
    session.commit()

    for project_id in (alpha.id, beta.id):
        record = session.get(Project, project_id)
        assert record.description == "bulk description"
        assert {member.id for member in record.members} == {member_user.id}
        assert record.last_edit_at > edited_before[project_id]

    edited_before = {
        project_id: session.get(Project, project_id).last_edit_at
        for project_id in (alpha.id, beta.id)
    }

    # Membership links only: no scalar Project column is supplied, but the rows
    # were edited and must not look untouched to the optimistic lock.
    domain.bulk_update_projects(
        current_user=root_user,
        session=session,
        ids={alpha.id, beta.id},
        data=ProjectBulkUpdate(member_ids=[]),
    )
    session.commit()

    for project_id in (alpha.id, beta.id):
        record = session.get(Project, project_id)
        assert (
            session.exec(
                select(ProjectMember).where(ProjectMember.project_id == project_id),
            ).all()
            == []
        )
        assert record.last_edit_at > edited_before[project_id]


def test_list_projects_limit_and_exact_match_filters(root_user: UserPublic, session: Session):
    alpha = domain.create_project(
        current_user=root_user,
        session=session,
        data=ProjectCreate(name="exact-alpha-project"),
    )
    beta = domain.create_project(
        current_user=root_user,
        session=session,
        data=ProjectCreate(name="exact-beta-project"),
    )
    session.commit()

    assert len(domain.list_projects(current_user=root_user, session=session, limit=1)) == 1

    assert [
        project.id
        for project in domain.list_projects(current_user=root_user, session=session, id=alpha.id)
    ] == [alpha.id]

    assert [
        project.id
        for project in domain.list_projects(
            current_user=root_user, session=session, name="exact-beta-project"
        )
    ] == [beta.id]


def test_delete_project_cascades_with_loaded_task_tree_collections(
    root_user: UserPublic, session: Session
):
    supervisor_user = _create_test_user(
        session,
        root_user,
        username="project_delete_tree_sup",
        roles={Role.SUPERVISOR},
    )
    annotator_user = _create_test_user(
        session,
        root_user,
        username="project_delete_tree_ann",
        roles={Role.ANNOTATOR},
    )
    project = domain.create_project(
        current_user=root_user,
        session=session,
        data=ProjectCreate(
            name="project-delete-tree-project",
            member_ids=[root_user.id, supervisor_user.id, annotator_user.id],
        ),
    )
    parent_task = create_task(
        current_user=root_user,
        session=session,
        data=TaskCreate(name="project-delete-tree-parent", project_id=project.id),
    )
    child_task = create_task(
        current_user=root_user,
        session=session,
        data=TaskCreate(
            name="project-delete-tree-child",
            project_id=project.id,
            parent_id=parent_task.id,
            supervisor_ids=[supervisor_user.id],
            annotator_ids=[annotator_user.id],
        ),
    )
    session.commit()

    # Load the project's task collection and the child task's link
    # collections into the session. Regression: deleting the project
    # cascades through the ORM to the whole task tree, which must not trip
    # over the loaded collections (only the project's own member links are
    # bulk-deleted and expired beforehand).
    record = domain.read_project(current_user=root_user, session=session, id=project.id)
    assert {task.id for task in record.tasks} == {parent_task.id, child_task.id}
    child_record = read_task(current_user=root_user, session=session, id=child_task.id)
    assert list(child_record.supervisor_ids) == [supervisor_user.id]
    assert list(child_record.annotator_ids) == [annotator_user.id]

    domain.delete_project(current_user=root_user, session=session, id=project.id)
    session.commit()

    assert session.get(Project, project.id) is None
    assert session.get(Task, parent_task.id) is None
    assert session.get(Task, child_task.id) is None
    assert (
        session.exec(select(ProjectMember).where(ProjectMember.project_id == project.id)).all()
        == []
    )
    assert (
        session.exec(select(TaskSupervisor).where(TaskSupervisor.task_id == child_task.id)).all()
        == []
    )
    assert (
        session.exec(select(TaskAnnotator).where(TaskAnnotator.task_id == child_task.id)).all()
        == []
    )
