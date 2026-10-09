from collections.abc import Set
from http import HTTPStatus

from fastapi import HTTPException
from sqlalchemy.orm import QueryableAttribute
from sqlmodel import Session, func, select, update

from .....models.label.spec import (
    ObjectClass,
    ObjectClassBulkUpdate,
    ObjectClassCreate,
    ObjectClassUpdate,
)
from .....models.user import Role, UserPublic
from ....auth import require_role


def require_objclass_reader(user: UserPublic, session: Session, *, id: int | None = None):
    return True


def require_objclass_writer(user: UserPublic, session: Session, *, id: int | None = None):
    return require_role(user, Role.DATA_MANAGER)


def create_objclass(
    *,
    current_user: UserPublic,
    session: Session,
    data: ObjectClassCreate,
):
    require_objclass_writer(current_user, session)

    record = ObjectClass.model_validate(data)

    session.add(record)
    session.flush([record])

    return record


def list_objclasses(
    *,
    current_user: UserPublic,
    session: Session,
    offset: int | None = 0,
    limit: int | None = None,
    name: str | None = None,
):
    q = _build_list_objclasses_query(
        current_user=current_user,
        session=session,
        offset=offset,
        limit=limit,
        name=name,
    )

    return session.exec(q).all()


def _build_list_objclasses_query(
    *,
    current_user: UserPublic,
    session: Session,
    offset: int | None = 0,
    limit: int | None = None,
    name: str | None = None,
):
    require_objclass_reader(current_user, session)

    q = select(ObjectClass)
    if offset is not None:
        q = q.offset(offset)
    if limit is not None:
        q = q.limit(limit)
    if name is not None:
        q = q.where(ObjectClass.name == name)

    return q


def count_objclasses(
    *,
    current_user: UserPublic,
    session: Session,
    name: str | None = None,
) -> int:
    q = _build_list_objclasses_query(
        current_user=current_user,
        session=session,
        offset=None,
        limit=None,
        name=name,
    )

    return session.exec(select(func.count()).select_from(q.subquery())).one()


def read_objclass(
    *,
    current_user: UserPublic,
    session: Session,
    id: int,
):
    require_objclass_reader(current_user, session, id=id)

    q = select(ObjectClass).where(ObjectClass.id == id)

    record = session.exec(q).one_or_none()
    if not record:
        raise HTTPException(status_code=HTTPStatus.NOT_FOUND)

    return record


def update_objclass(
    *,
    current_user: UserPublic,
    session: Session,
    id: int,
    data: ObjectClassUpdate,
):
    # Circumvent request parsing issue
    if data.description is None:
        data.description = ""

    require_objclass_writer(current_user, session, id=id)

    record = session.get(ObjectClass, id)
    if not record:
        raise HTTPException(status_code=HTTPStatus.NOT_FOUND)

    data_to_update = data.model_dump(exclude_unset=True)

    record.sqlmodel_update(data_to_update)
    session.add(record)
    session.flush([record])

    session.refresh(record)

    return record


def delete_objclass(
    *,
    current_user: UserPublic,
    session: Session,
    id: int,
):
    require_objclass_writer(current_user, session, id=id)

    record = session.get(ObjectClass, id)
    if not record:
        raise HTTPException(status_code=HTTPStatus.NOT_FOUND)

    session.delete(record)
    session.flush([record])


def bulk_update_objclasses(
    *,
    current_user: UserPublic,
    session: Session,
    ids: Set[int],
    data: ObjectClassBulkUpdate,
):
    require_objclass_writer(current_user, session)

    data_to_update = data.model_dump(exclude_unset=True)

    assert isinstance(ObjectClass.id, QueryableAttribute)

    if data_to_update:
        q = update(ObjectClass).where(ObjectClass.id.in_(ids)).values(**data_to_update)
        session.execute(q)
