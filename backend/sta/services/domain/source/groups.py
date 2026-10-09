from collections.abc import Set
from http import HTTPStatus

from fastapi import HTTPException
from sqlalchemy.orm import QueryableAttribute
from sqlmodel import Session, func, select, update

from ...models.source.group import (
    SourceGroup,
    SourceGroupBulkUpdate,
    SourceGroupCreate,
    SourceGroupUpdate,
)
from ...models.user import Role, UserPublic
from ..auth import require_role
from ..tasks import Task, can_read_task


def can_read_group_filters(user: UserPublic, session: Session):
    if user.has_role(Role.DATA_MANAGER, Role.PROJECT_MANAGER):
        return []

    assert isinstance(SourceGroup.id, QueryableAttribute)

    return [SourceGroup.id.in_(get_valid_group_ids(user, session))]


def can_read_group(user: UserPublic, session: Session, group: SourceGroup):
    if user.has_role(Role.DATA_MANAGER, Role.PROJECT_MANAGER):
        return True

    return group.id in get_valid_group_ids(user, session)


def require_group_writer(user: UserPublic, session: Session, group: SourceGroup | None = None):
    return require_role(user, Role.DATA_MANAGER)


def get_valid_group_ids(user: UserPublic, session: Session):
    if user.has_role(Role.DATA_MANAGER, Role.PROJECT_MANAGER):
        return set(session.exec(select(SourceGroup.id)).all())

    return {
        task.source_group_id
        for task in session.exec(select(Task)).all()
        if can_read_task(user, session, task)
    }


def create_group(
    *,
    current_user: UserPublic,
    session: Session,
    data: SourceGroupCreate,
):
    require_group_writer(current_user, session)

    record = SourceGroup.model_validate(data)

    session.add(record)
    session.flush([record])

    return record


def list_groups(
    *,
    current_user: UserPublic,
    session: Session,
    offset: int | None = 0,
    limit: int | None = None,
    ids: Set[int] | None = None,
    name: str | None = None,
):
    q = _build_list_groups_query(
        current_user=current_user,
        session=session,
        offset=offset,
        limit=limit,
        ids=ids,
        name=name,
    )

    return session.exec(q).all()


def _build_list_groups_query(
    *,
    current_user: UserPublic,
    session: Session,
    offset: int | None = 0,
    limit: int | None = None,
    ids: Set[int] | None = None,
    name: str | None = None,
):
    q = select(SourceGroup)
    for cond in can_read_group_filters(current_user, session):
        q = q.where(cond)
    if offset is not None:
        q = q.offset(offset)
    if limit is not None:
        q = q.limit(limit)
    if ids is not None:
        q = q.where(SourceGroup.id.in_(ids))
    if name is not None:
        q = q.where(SourceGroup.name == name)

    return q


def count_groups(
    *,
    current_user: UserPublic,
    session: Session,
    ids: Set[int] | None = None,
    name: str | None = None,
) -> int:
    q = _build_list_groups_query(
        current_user=current_user,
        session=session,
        offset=None,
        limit=None,
        ids=ids,
        name=name,
    )

    return session.exec(select(func.count()).select_from(q.subquery())).one()


def read_group(
    *,
    current_user: UserPublic,
    session: Session,
    id: int,
):
    q = select(SourceGroup).where(SourceGroup.id == id)
    for cond in can_read_group_filters(current_user, session):
        q = q.where(cond)

    record = session.exec(q).one_or_none()
    if not record:
        raise HTTPException(status_code=HTTPStatus.NOT_FOUND)

    return record


def update_group(
    *,
    current_user: UserPublic,
    session: Session,
    id: int,
    data: SourceGroupUpdate,
):
    record = session.get(SourceGroup, id)
    if not record:
        raise HTTPException(status_code=HTTPStatus.NOT_FOUND)

    require_group_writer(current_user, session, record)

    data_to_update = data.model_dump(exclude_unset=True)

    record.sqlmodel_update(data_to_update)
    session.add(record)
    session.flush([record])

    session.refresh(record)

    return record


def delete_group(
    *,
    current_user: UserPublic,
    session: Session,
    id: int,
):
    record = session.get(SourceGroup, id)
    if not record:
        raise HTTPException(status_code=HTTPStatus.NOT_FOUND)

    require_group_writer(current_user, session, record)

    session.delete(record)
    session.flush([record])


def bulk_update_groups(
    *,
    current_user: UserPublic,
    session: Session,
    ids: Set[int],
    data: SourceGroupBulkUpdate,
):
    require_group_writer(current_user, session)

    data_to_update = data.model_dump(exclude_unset=True)

    assert isinstance(SourceGroup.id, QueryableAttribute)

    if data_to_update:
        q = update(SourceGroup).where(SourceGroup.id.in_(ids)).values(**data_to_update)
        session.execute(q)
