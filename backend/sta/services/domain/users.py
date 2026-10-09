from collections.abc import Set
from datetime import datetime
from http import HTTPStatus
from typing import Annotated, Any

from fastapi import HTTPException, Query
from sqlalchemy.orm import QueryableAttribute
from sqlmodel import Session, delete, exists, func, insert, select, update

from ..models.account import Account
from ..models.user import (
    Password,
    Role,
    User,
    UserBulkUpdate,
    UserCreate,
    Username,
    UserPublic,
    UserUpdate,
)
from .auth import get_password_hash, require_role

NO_SELF_DELETION = HTTPException(
    status_code=HTTPStatus.BAD_REQUEST,
    detail="You cannot delete your own account!",
)

ADMIN_NO_SELF_DEMOTION = HTTPException(
    status_code=HTTPStatus.BAD_REQUEST,
    detail=f"You cannot remove the {Role.ADMIN} role from your own account!",
)


def require_user_auth(user: UserPublic, *, id: int | None = None):
    return id == user.id


def require_user_reader(user: UserPublic, *, id: int | None = None):
    if id == user.id:
        return True

    return require_role(user, Role.ADMIN, Role.PROJECT_MANAGER)


def require_user_writer(user: UserPublic, *, id: int | None = None):
    return require_role(user, Role.ADMIN)


def _create_account_for_user(
    session: Session,
    record: User,
):
    account_record = Account.model_validate(record)
    session.add(account_record)
    session.flush([account_record])

    return account_record


def _bulk_insert_roles(
    session: Session,
    user_ids: Set[int],
    roles: Set[Role],
) -> None:
    roles_cls = User.get_role_links_cls()

    values = [
        dict(user_id=user_id, role=role)
        for user_id in user_ids
        for role in set(roles)
    ]
    if not values:
        return

    session.execute(insert(roles_cls), values)


def _bulk_delete_roles(
    session: Session,
    user_ids: Set[int],
) -> None:
    roles_cls = User.get_role_links_cls()
    assert isinstance(roles_cls.user_id, QueryableAttribute)

    q = delete(roles_cls).where(roles_cls.user_id.in_(user_ids))
    session.execute(q)


def create_user(
    *,
    current_user: UserPublic,
    session: Session,
    data: UserCreate,
):
    require_user_writer(current_user)

    data_to_create = data.model_dump(exclude_unset=True)

    if "password" in data_to_create:
        password = data_to_create.pop("password")
        data_to_create["password_hash"] = get_password_hash(password)

    record = User.model_validate(data_to_create)

    session.add(record)
    session.flush([record])

    session.refresh(record)  # Get the new ID
    assert record.id is not None

    _bulk_insert_roles(session, {record.id}, data.roles)

    _create_account_for_user(session, record)

    session.refresh(record)

    return record


def list_users(
    *,
    current_user: UserPublic,
    session: Session,
    offset: int | None = 0,
    limit: int | None = None,
    username: Annotated[str | None, Query()] = None,
    require_auth: bool = True,
):
    q = _build_list_users_query(
        current_user=current_user,
        session=session,
        offset=offset,
        limit=limit,
        username=username,
        require_auth=require_auth,
    )

    return session.exec(q).all()


def _build_list_users_query(
    *,
    current_user: UserPublic,
    session: Session,
    offset: int | None = 0,
    limit: int | None = None,
    username: Annotated[str | None, Query()] = None,
    require_auth: bool = True,
):
    if require_auth:
        require_user_reader(current_user)

    q = select(User)
    if offset is not None:
        q = q.offset(offset)
    if limit is not None:
        q = q.limit(limit)
    if username is not None:
        q = q.where(User.username == username)

    return q


def count_users(
    *,
    current_user: UserPublic,
    session: Session,
    username: Annotated[str | None, Query()] = None,
    require_auth: bool = True,
) -> int:
    q = _build_list_users_query(
        current_user=current_user,
        session=session,
        offset=None,
        limit=None,
        username=username,
        require_auth=require_auth,
    )

    return session.exec(select(func.count()).select_from(q.subquery())).one()


def read_user(
    *,
    current_user: UserPublic,
    session: Session,
    id: int,
):
    require_user_reader(current_user, id=id)

    record = session.get(User, id)
    if not record:
        raise HTTPException(status_code=HTTPStatus.NOT_FOUND)

    return record


def update_user(
    *,
    current_user: UserPublic,
    session: Session,
    id: int,
    data: UserUpdate,
):
    require_user_writer(current_user, id=id)

    record = session.get(User, id)
    if not record:
        raise HTTPException(status_code=HTTPStatus.NOT_FOUND)

    data_to_update = data.model_dump(exclude_unset=True)

    if "password" in data_to_update:
        password = data_to_update.pop("password")
        data_to_update["password_hash"] = get_password_hash(password)

    if "roles" in data_to_update:
        roles = data_to_update.pop("roles")

        if current_user.id == id and Role.ADMIN not in roles:
            raise ADMIN_NO_SELF_DEMOTION

        _bulk_delete_roles(session, {id})
        _bulk_insert_roles(session, {id}, roles)

    record.sqlmodel_update(data_to_update)
    session.add(record)
    session.flush([record])

    # Keep Account table in sync
    if "username" in data_to_update:
        account_record = session.get(Account, id)
        if not account_record:
            raise HTTPException(status_code=HTTPStatus.NOT_FOUND)

        account_record.sqlmodel_update({"username": data_to_update["username"]})
        session.add(account_record)
        session.flush([account_record])

    session.refresh(record)

    return record


def delete_user(
    *,
    current_user: UserPublic,
    session: Session,
    id: int,
):
    require_user_writer(current_user, id=id)

    record = session.get(User, id)
    if not record:
        raise HTTPException(status_code=HTTPStatus.NOT_FOUND)

    if current_user.id == id:
        raise NO_SELF_DELETION

    _bulk_delete_roles(session, {id})

    session.delete(record)
    session.flush([record])


def bulk_update_users(
    *,
    current_user: UserPublic,
    session: Session,
    ids: Set[int],
    data: UserBulkUpdate,
) -> None:
    require_user_writer(current_user)

    data_to_update = data.model_dump(exclude_unset=True)

    if "roles" in data_to_update:
        roles = data_to_update.pop("roles")

        if current_user.id in ids and Role.ADMIN not in roles:
            raise ADMIN_NO_SELF_DEMOTION

        _bulk_delete_roles(session, ids)
        _bulk_insert_roles(session, ids, roles)

    assert isinstance(User.id, QueryableAttribute)

    if data_to_update:
        q = update(User).where(User.id.in_(ids)).values(**data_to_update)
        session.execute(q)


def create_root_user(
    *,
    session: Session,
    username: Username = "admin",
    password: Password = "admin",
) -> UserPublic:
    if session.exec(select(exists(User))).one():
        msg = "Cannot create root user when there already exist other users"
        raise RuntimeError(msg)

    record = User(username=username, password_hash=get_password_hash(password))
    session.add(record)
    session.flush([record])

    assert record.id is not None
    _bulk_insert_roles(session, {record.id}, set(Role))

    _create_account_for_user(session, record)

    session.refresh(record)

    return record


def login_user(
    *,
    current_user: UserPublic,
    session: Session,
    id: int,
):
    require_user_auth(current_user, id=id)

    record = session.get(User, id)
    if not record:
        raise HTTPException(status_code=HTTPStatus.NOT_FOUND)

    data_to_update = dict[str, Any]()
    if record.current_login_at is not None:
        data_to_update["prev_login_at"] = record.current_login_at

    data_to_update["current_login_at"] = datetime.now().astimezone()

    record.sqlmodel_update(data_to_update)

    session.add(record)
    session.flush([record])

    session.refresh(record)

    return record


def logout_user(
    *,
    current_user: UserPublic,
    session: Session,
    id: int,
):
    require_user_auth(current_user, id=id)

    record = session.get(User, id)
    if not record:
        raise HTTPException(status_code=HTTPStatus.NOT_FOUND)

    data_to_update = dict[str, Any]()
    if record.current_login_at is not None:
        data_to_update["prev_login_at"] = record.current_login_at

    data_to_update["current_login_at"] = None

    record.sqlmodel_update(data_to_update)

    session.add(record)
    session.flush([record])

    session.refresh(record)

    return record
