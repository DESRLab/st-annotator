from collections.abc import Set
from http import HTTPStatus

from fastapi import HTTPException
from sqlmodel import Session, func, select, update

from sta.common.database.execution import execute_statement, sql_column, stamp_bulk_edit

from ...models.frame import Frame
from ...models.label.group import (
    LabelGroup,
    LabelGroupBulkUpdate,
    LabelGroupCreate,
    LabelGroupUpdate,
)
from ...models.label.repo import LabelsetBranch
from ...models.task import Task
from ...models.user import Role, UserPublic
from ..auth import require_role
from ..querying import SortDirection, apply_sort, filter_contains, filter_range
from ..tasks import can_read_task_filters

_LABEL_GROUP_SORT_COLUMNS = {
    "id": LabelGroup.id,
    "name": LabelGroup.name,
    "description": LabelGroup.description,
}


def can_read_group_filters(user: UserPublic, session: Session):
    if user.has_role(Role.DATA_MANAGER, Role.PROJECT_MANAGER):
        return []

    return [sql_column(LabelGroup.id).in_(get_valid_group_ids(user, session))]


def can_read_group(user: UserPublic, session: Session, group: LabelGroup) -> bool:
    if user.has_role(Role.DATA_MANAGER, Role.PROJECT_MANAGER):
        return True

    return group.id in get_valid_group_ids(user, session)


def require_group_writer(user: UserPublic, session: Session, group: LabelGroup | None = None):
    return require_role(user, Role.DATA_MANAGER)


def get_valid_group_ids(user: UserPublic, session: Session):
    if user.has_role(Role.DATA_MANAGER, Role.PROJECT_MANAGER):
        return set(session.exec(select(LabelGroup.id)).all())

    q = (
        select(LabelsetBranch.group_id)
        .join(Frame, sql_column(Frame.label_branch_id) == LabelsetBranch.id)
        .join(Task, sql_column(Frame.task_id) == Task.id)
        .where(*can_read_task_filters(user))
        .distinct()
    )

    return set(session.exec(q).all())


def create_group(
    *,
    current_user: UserPublic,
    session: Session,
    data: LabelGroupCreate,
):
    require_group_writer(current_user, session)

    record = LabelGroup.model_validate(data)

    session.add(record)
    session.flush([record])

    return record


def list_groups(
    *,
    current_user: UserPublic,
    session: Session,
    offset: int | None = 0,
    limit: int | None = None,
    id: int | None = None,
    id_ge: int | None = None,
    id_le: int | None = None,
    name: str | None = None,
    name_contains: str | None = None,
    description_contains: str | None = None,
    sort_by: str | None = None,
    sort_dir: SortDirection = "asc",
):
    q = _build_list_groups_query(
        current_user=current_user,
        session=session,
        offset=offset,
        limit=limit,
        id=id,
        id_ge=id_ge,
        id_le=id_le,
        name=name,
        name_contains=name_contains,
        description_contains=description_contains,
        sort_by=sort_by,
        sort_dir=sort_dir,
    )

    return session.exec(q).all()


def _build_list_groups_query(
    *,
    current_user: UserPublic,
    session: Session,
    offset: int | None = 0,
    limit: int | None = None,
    id: int | None = None,
    id_ge: int | None = None,
    id_le: int | None = None,
    name: str | None = None,
    name_contains: str | None = None,
    description_contains: str | None = None,
    sort_by: str | None = None,
    sort_dir: SortDirection = "asc",
):
    q = select(LabelGroup)
    for cond in can_read_group_filters(current_user, session):
        q = q.where(cond)
    if offset is not None:
        q = q.offset(offset)
    if limit is not None:
        q = q.limit(limit)
    if id is not None:
        q = q.where(LabelGroup.id == id)
    q = filter_range(q, LabelGroup.id, ge=id_ge, le=id_le)
    if name is not None:
        q = q.where(LabelGroup.name == name)
    q = filter_contains(q, LabelGroup.name, name_contains)
    q = filter_contains(q, LabelGroup.description, description_contains)
    q = apply_sort(q, _LABEL_GROUP_SORT_COLUMNS, sort_by, sort_dir)

    return q


def count_groups(
    *,
    current_user: UserPublic,
    session: Session,
    id: int | None = None,
    id_ge: int | None = None,
    id_le: int | None = None,
    name: str | None = None,
    name_contains: str | None = None,
    description_contains: str | None = None,
) -> int:
    q = _build_list_groups_query(
        current_user=current_user,
        session=session,
        offset=None,
        limit=None,
        id=id,
        id_ge=id_ge,
        id_le=id_le,
        name=name,
        name_contains=name_contains,
        description_contains=description_contains,
    )

    return session.exec(select(func.count()).select_from(q.subquery())).one()


def read_group(
    *,
    current_user: UserPublic,
    session: Session,
    id: int,
):
    q = select(LabelGroup).where(LabelGroup.id == id)
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
    data: LabelGroupUpdate,
):
    record = session.get(LabelGroup, id)
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
    record = session.get(LabelGroup, id)
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
    data: LabelGroupBulkUpdate,
):
    require_group_writer(current_user, session)

    data_to_update = data.model_dump(exclude_unset=True)
    has_updates = stamp_bulk_edit(data_to_update)

    if has_updates:
        q = update(LabelGroup).where(sql_column(LabelGroup.id).in_(ids)).values(**data_to_update)
        execute_statement(session, q)
