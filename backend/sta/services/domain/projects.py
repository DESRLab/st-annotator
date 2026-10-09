from collections.abc import Set
from http import HTTPStatus

from fastapi import HTTPException
from sqlalchemy.orm import QueryableAttribute
from sqlmodel import Session, delete, func, insert, select, update

from ..models.project import Project, ProjectBulkUpdate, ProjectCreate, ProjectUpdate
from ..models.user import Role, UserPublic
from .auth import require_role


def can_read_project_filters(user: UserPublic):
    if user.has_role(Role.PROJECT_MANAGER):
        return []

    assert isinstance(Project.id, QueryableAttribute)

    members_cls = Project.get_member_links_cls()
    valid_project_ids = select(members_cls.project_id) \
        .where(members_cls.account_id == user.id)

    return [Project.id.in_(valid_project_ids)]


def can_read_project(user: UserPublic, project: Project):
    if user.has_role(Role.PROJECT_MANAGER):
        return True

    return any(user.id == member.id for member in project.members)


def require_project_writer(user: UserPublic, project: Project | None = None):
    return require_role(user, Role.PROJECT_MANAGER)


def _bulk_insert_members(
    session: Session,
    project_ids: Set[int],
    member_ids: list[int],
) -> None:
    members_cls = Project.get_member_links_cls()

    values = [
        dict(project_id=project_id, member_id=member_id)
        for project_id in project_ids
        for member_id in set(member_ids)
    ]
    if not values:
        return

    session.execute(insert(members_cls), values)


def _bulk_delete_members(
    session: Session,
    project_ids: Set[int],
) -> None:
    members_cls = Project.get_member_links_cls()
    assert isinstance(members_cls.project_id, QueryableAttribute)

    q = delete(members_cls).where(members_cls.project_id.in_(project_ids))
    session.execute(q)


def create_project(
    *,
    current_user: UserPublic,
    session: Session,
    data: ProjectCreate,
):
    require_project_writer(current_user)

    record = Project.model_validate(data)

    session.add(record)
    session.flush([record])

    session.refresh(record)  # Get the new ID
    assert record.id is not None

    _bulk_insert_members(session, {record.id}, data.member_ids)

    session.refresh(record)

    return record


def list_projects(
    *,
    current_user: UserPublic,
    session: Session,
    offset: int | None = 0,
    limit: int | None = None,
    name: str | None = None,
):
    q = _build_list_projects_query(
        current_user=current_user,
        session=session,
        offset=offset,
        limit=limit,
        name=name,
    )

    return session.exec(q).all()


def _build_list_projects_query(
    *,
    current_user: UserPublic,
    session: Session,
    offset: int | None = 0,
    limit: int | None = None,
    name: str | None = None,
):
    q = select(Project)
    for cond in can_read_project_filters(current_user):
        q = q.where(cond)
    if offset is not None:
        q = q.offset(offset)
    if limit is not None:
        q = q.limit(limit)
    if name is not None:
        q = q.where(Project.name == name)

    return q


def count_projects(
    *,
    current_user: UserPublic,
    session: Session,
    name: str | None = None,
) -> int:
    q = _build_list_projects_query(
        current_user=current_user,
        session=session,
        offset=None,
        limit=None,
        name=name,
    )

    return session.exec(select(func.count()).select_from(q.subquery())).one()


def read_project(
    *,
    current_user: UserPublic,
    session: Session,
    id: int,
):
    q = select(Project).where(Project.id == id)
    for cond in can_read_project_filters(current_user):
        q = q.where(cond)

    record = session.exec(q).one_or_none()
    if not record:
        raise HTTPException(status_code=HTTPStatus.NOT_FOUND)

    return record


def update_project(
    *,
    current_user: UserPublic,
    session: Session,
    id: int,
    data: ProjectUpdate,
):
    record = session.get(Project, id)
    if not record:
        raise HTTPException(status_code=HTTPStatus.NOT_FOUND)

    require_project_writer(current_user, record)

    data_to_update = data.model_dump(exclude_unset=True)

    if "member_ids" in data_to_update:
        member_ids = data_to_update.pop("member_ids")

        _bulk_delete_members(session, {id})
        _bulk_insert_members(session, {id}, member_ids)

    record.sqlmodel_update(data_to_update)
    session.add(record)
    session.flush([record])

    session.refresh(record)

    return record


def delete_project(
    *,
    current_user: UserPublic,
    session: Session,
    id: int,
):
    record = session.get(Project, id)
    if not record:
        raise HTTPException(status_code=HTTPStatus.NOT_FOUND)

    require_project_writer(current_user, record)

    _bulk_delete_members(session, {id})

    session.delete(record)
    session.flush([record])


def bulk_update_projects(
    *,
    current_user: UserPublic,
    session: Session,
    ids: Set[int],
    data: ProjectBulkUpdate,
):
    require_project_writer(current_user)

    data_to_update = data.model_dump(exclude_unset=True)

    if "member_ids" in data_to_update:
        member_ids = data_to_update.pop("member_ids")

        _bulk_delete_members(session, ids)
        _bulk_insert_members(session, ids, member_ids)

    assert isinstance(Project.id, QueryableAttribute)

    if data_to_update:
        q = update(Project).where(Project.id.in_(ids)).values(**data_to_update)
        session.execute(q)
