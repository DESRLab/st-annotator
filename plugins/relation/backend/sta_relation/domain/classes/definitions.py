from collections.abc import Set
from http import HTTPStatus

from fastapi import HTTPException
from sqlmodel import Session, func, select, update

from sta.common.database.execution import execute_statement, sql_column, stamp_bulk_edit
from sta.domain.auth import require_role
from sta.domain.filtering import apply_column_filters
from sta.domain.querying import SortDirection, apply_sort, filter_contains, filter_range
from sta.models.user import Role, UserPublic
from sta_relation.models.classes import (
    RelationClass,
    RelationClassBulkUpdate,
    RelationClassCreate,
    RelationClassUpdate,
)

_RELCLASS_SORT_COLUMNS = {
    "id": RelationClass.id,
    "name": RelationClass.name,
}


def require_relclass_reader(user: UserPublic, session: Session, *, id: int | None = None):
    return True


def require_relclass_writer(user: UserPublic, session: Session, *, id: int | None = None):
    return require_role(user, Role.DATA_MANAGER)


def create_relclass(
    *,
    current_user: UserPublic,
    session: Session,
    data: RelationClassCreate,
):
    require_relclass_writer(current_user, session)

    record = RelationClass.model_validate(data)

    session.add(record)
    session.flush([record])

    return record


def list_relclasses(
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
    sort_by: str | None = None,
    sort_dir: SortDirection = "asc",
    filters: str | None = None,
):
    q = _build_list_relclasses_query(
        current_user=current_user,
        session=session,
        offset=offset,
        limit=limit,
        id=id,
        id_ge=id_ge,
        id_le=id_le,
        name=name,
        name_contains=name_contains,
        sort_by=sort_by,
        sort_dir=sort_dir,
        filters=filters,
    )

    return session.exec(q).all()


def _build_list_relclasses_query(
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
    sort_by: str | None = None,
    sort_dir: SortDirection = "asc",
    filters: str | None = None,
):
    require_relclass_reader(current_user, session)

    q = select(RelationClass).where(sql_column(RelationClass.is_deleted).is_(False))
    if offset is not None:
        q = q.offset(offset)
    if limit is not None:
        q = q.limit(limit)
    if id is not None:
        q = q.where(RelationClass.id == id)
    q = filter_range(q, RelationClass.id, ge=id_ge, le=id_le)
    if name is not None:
        q = q.where(RelationClass.name == name)
    q = filter_contains(q, RelationClass.name, name_contains)
    q = apply_sort(q, _RELCLASS_SORT_COLUMNS, sort_by, sort_dir)

    return apply_column_filters(q, RelationClass, filters, allowed_columns={"id", "name"})


def count_relclasses(
    *,
    current_user: UserPublic,
    session: Session,
    id: int | None = None,
    id_ge: int | None = None,
    id_le: int | None = None,
    name: str | None = None,
    name_contains: str | None = None,
    filters: str | None = None,
) -> int:
    q = _build_list_relclasses_query(
        current_user=current_user,
        session=session,
        offset=None,
        limit=None,
        id=id,
        id_ge=id_ge,
        id_le=id_le,
        name=name,
        name_contains=name_contains,
        filters=filters,
    )

    return session.exec(select(func.count()).select_from(q.subquery())).one()


def read_relclass(
    *,
    current_user: UserPublic,
    session: Session,
    id: int,
):
    require_relclass_reader(current_user, session, id=id)

    q = select(RelationClass).where(
        sql_column(RelationClass.id) == id,
        sql_column(RelationClass.is_deleted).is_(False),
    )

    record = session.exec(q).one_or_none()
    if not record:
        raise HTTPException(status_code=HTTPStatus.NOT_FOUND)

    return record


def update_relclass(
    *,
    current_user: UserPublic,
    session: Session,
    id: int,
    data: RelationClassUpdate,
):
    # Circumvent request parsing issue: normalize an explicitly-sent null to
    # "". Guard on model_fields_set so an omitted description stays untouched
    # instead of being cleared by the exclude_unset dump below.
    if "description" in data.model_fields_set and data.description is None:
        data.description = ""

    require_relclass_writer(current_user, session, id=id)

    record = session.get(RelationClass, id)
    if not record or record.is_deleted:
        raise HTTPException(status_code=HTTPStatus.NOT_FOUND)

    data_to_update = data.model_dump(exclude_unset=True)

    record.sqlmodel_update(data_to_update)
    session.add(record)
    session.flush([record])

    session.refresh(record)

    return record


def delete_relclass(
    *,
    current_user: UserPublic,
    session: Session,
    id: int,
):
    require_relclass_writer(current_user, session, id=id)

    record = session.get(RelationClass, id)
    if not record or record.is_deleted:
        raise HTTPException(status_code=HTTPStatus.NOT_FOUND)

    record.is_deleted = True
    session.add(record)
    session.flush([record])


def bulk_update_relclasses(
    *,
    current_user: UserPublic,
    session: Session,
    ids: Set[int],
    data: RelationClassBulkUpdate,
):
    # Mirror update_relclass: normalize an explicitly-sent null to "" so it
    # does not write NULL into the NOT NULL description column.
    if "description" in data.model_fields_set and data.description is None:
        data.description = ""

    require_relclass_writer(current_user, session)

    data_to_update = data.model_dump(exclude_unset=True)
    has_updates = stamp_bulk_edit(data_to_update)

    if has_updates:
        q = (
            update(RelationClass)
            .where(sql_column(RelationClass.id).in_(ids))
            .values(**data_to_update)
        )
        execute_statement(session, q)
