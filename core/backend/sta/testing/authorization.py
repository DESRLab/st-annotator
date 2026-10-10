"""Reusable authorization test principals and resource relationships."""

from collections.abc import Callable
from dataclasses import dataclass
from typing import TypeVar

from sqlmodel import Session

import pytest

from sta.domain.users import create_user
from sta.models.frame import Frame, WorkType
from sta.models.label.repo import BranchPermission, BranchPermissionLevel
from sta.models.project import ProjectMember
from sta.models.task import TaskAnnotator, TaskSupervisor
from sta.models.user import Role, UserCreate, UserPublic

T = TypeVar("T")


@dataclass(frozen=True)
class PrincipalProfiles:
    """Named authenticated principals shared by authorization tests."""

    no_roles: UserPublic
    annotator: UserPublic
    supervisor: UserPublic
    project_manager: UserPublic
    data_manager: UserPublic
    administrator: UserPublic
    dual_role: UserPublic


@dataclass(frozen=True)
class ResourceRelationships:
    """Factories that vary resource relationships independently of roles."""

    project_member: Callable[[int, UserPublic], ProjectMember]
    assigned_annotator: Callable[[int, UserPublic], TaskAnnotator]
    assigned_supervisor: Callable[[int, UserPublic], TaskSupervisor]
    frame: Callable[[int, UserPublic, WorkType], Frame]
    branch_grant: Callable[[int, UserPublic, BranchPermissionLevel], BranchPermission]


def _create_principal(
    session: Session,
    administrator: UserPublic,
    name: str,
    roles: set[Role],
) -> UserPublic:
    record = create_user(
        current_user=administrator,
        session=session,
        data=UserCreate(
            username=f"authz_{name}",
            password="password",
            roles=roles,
        ),
    )
    return UserPublic.model_validate(record)


@pytest.fixture
def principal_profiles(session: Session, root_user: UserPublic) -> PrincipalProfiles:
    """Create the standard authenticated profiles used by the RBAC matrix.

    Anonymous requests are represented separately by omitting a principal;
    every member of this fixture is an authenticated :class:`UserPublic`.
    """
    return PrincipalProfiles(
        no_roles=_create_principal(session, root_user, "no_roles", set()),
        annotator=_create_principal(session, root_user, "annotator", {Role.ANNOTATOR}),
        supervisor=_create_principal(session, root_user, "supervisor", {Role.SUPERVISOR}),
        project_manager=_create_principal(
            session, root_user, "project_manager", {Role.PROJECT_MANAGER}
        ),
        data_manager=_create_principal(session, root_user, "data_manager", {Role.DATA_MANAGER}),
        administrator=_create_principal(session, root_user, "administrator", {Role.ADMIN}),
        dual_role=_create_principal(
            session,
            root_user,
            "project_data_manager",
            {Role.PROJECT_MANAGER, Role.DATA_MANAGER},
        ),
    )


@pytest.fixture
def resource_relationships(session: Session) -> ResourceRelationships:
    """Return explicit factories for relationships used by authorization tests."""

    def add(record: T) -> T:
        session.add(record)
        session.flush([record])
        return record

    def project_member(project_id: int, user: UserPublic) -> ProjectMember:
        return add(ProjectMember(project_id=project_id, member_id=user.id))

    def assigned_annotator(task_id: int, user: UserPublic) -> TaskAnnotator:
        return add(TaskAnnotator(task_id=task_id, account_id=user.id, quality_rank=0))

    def assigned_supervisor(task_id: int, user: UserPublic) -> TaskSupervisor:
        return add(TaskSupervisor(task_id=task_id, account_id=user.id))

    def frame(task_id: int, user: UserPublic, work_type: WorkType) -> Frame:
        return add(
            Frame(
                task_id=task_id,
                account_id=user.id,
                work_type=work_type,
                source_group_id=None,
                label_branch_id=None,
            )
        )

    def branch_grant(
        branch_id: int,
        user: UserPublic,
        permission: BranchPermissionLevel,
    ) -> BranchPermission:
        return add(
            BranchPermission(
                branch_id=branch_id,
                user_id=user.id,
                permission_lv=permission,
            )
        )

    return ResourceRelationships(
        project_member=project_member,
        assigned_annotator=assigned_annotator,
        assigned_supervisor=assigned_supervisor,
        frame=frame,
        branch_grant=branch_grant,
    )
