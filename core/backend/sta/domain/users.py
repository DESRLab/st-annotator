from collections.abc import Sequence, Set
from datetime import datetime
from http import HTTPStatus
from typing import Annotated, Any

from fastapi import HTTPException, Query
from sqlmodel import Session, delete, exists, insert, select, update

from sta.common.database.execution import execute_statement, sql_column

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
from .auth import get_password_hash, require_role, verify_password
from .querying import (
    Pagination,
    SortDirection,
    apply_sort,
    count_query,
    filter_contains,
    filter_range,
    id_query,
    paginate,
)

_USER_SORT_COLUMNS = {
    "id": User.id,
    "username": User.username,
    "created_at": User.created_at,
    "current_login_at": User.current_login_at,
}

NO_SELF_DELETION = HTTPException(
    status_code=HTTPStatus.BAD_REQUEST,
    detail="You cannot delete your own account!",
)

ADMIN_NO_SELF_DEMOTION = HTTPException(
    status_code=HTTPStatus.BAD_REQUEST,
    detail=f"You cannot remove the {Role.ADMIN} role from your own account!",
)


def require_user_auth(user: UserPublic, *, id: int | None = None):
    # This function is an enforcing guard, like require_role and the reader /
    # writer guards below. Returning False would be unsafe because callers use
    # it as a statement rather than inspecting its return value.
    if id != user.id:
        raise HTTPException(status_code=HTTPStatus.FORBIDDEN)

    return True


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

    values = [dict(user_id=user_id, role=role) for user_id in user_ids for role in set(roles)]
    if not values:
        return

    execute_statement(session, insert(roles_cls), values)


def _bulk_delete_roles(
    session: Session,
    user_ids: Set[int],
) -> None:
    roles_cls = User.get_role_links_cls()
    q = delete(roles_cls).where(sql_column(roles_cls.user_id).in_(user_ids))
    # synchronize_session=False: if a user's role_links collection was
    # loaded earlier in this session, the default synchronization would mark
    # those link objects deleted and break the later ORM add/flush. No caller
    # relies on synchronized state after this delete: update_user refreshes
    # the record (expiring its relationships), delete_user expires the
    # collection before deleting the record, and bulk_update_users never
    # reads the collection.
    execute_statement(session, q.execution_options(synchronize_session=False))


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
    id: int | None = None,
    id_ge: int | None = None,
    id_le: int | None = None,
    username: Annotated[str | None, Query()] = None,
    username_contains: str | None = None,
    roles: Sequence[Role] | None = None,
    created_at_ge: datetime | None = None,
    created_at_lt: datetime | None = None,
    current_login_at_ge: datetime | None = None,
    current_login_at_lt: datetime | None = None,
    sort_by: str | None = None,
    sort_dir: SortDirection = "asc",
    require_auth: bool = True,
):
    q = _build_filtered_users_query(
        current_user=current_user,
        session=session,
        id=id,
        id_ge=id_ge,
        id_le=id_le,
        username=username,
        username_contains=username_contains,
        roles=roles,
        created_at_ge=created_at_ge,
        created_at_lt=created_at_lt,
        current_login_at_ge=current_login_at_ge,
        current_login_at_lt=current_login_at_lt,
        sort_by=sort_by,
        sort_dir=sort_dir,
        require_auth=require_auth,
    )
    q = paginate(
        q,
        Pagination(offset=offset if offset is not None else 0, limit=limit),
    )

    return session.exec(q).all()


def list_user_ids(
    *,
    current_user: UserPublic,
    session: Session,
    id: int | None = None,
    id_ge: int | None = None,
    id_le: int | None = None,
    username: str | None = None,
    username_contains: str | None = None,
    roles: Sequence[Role] | None = None,
    created_at_ge: datetime | None = None,
    created_at_lt: datetime | None = None,
    current_login_at_ge: datetime | None = None,
    current_login_at_lt: datetime | None = None,
) -> list[int]:
    q = _build_filtered_users_query(
        current_user=current_user,
        session=session,
        id=id,
        id_ge=id_ge,
        id_le=id_le,
        username=username,
        username_contains=username_contains,
        roles=roles,
        created_at_ge=created_at_ge,
        created_at_lt=created_at_lt,
        current_login_at_ge=current_login_at_ge,
        current_login_at_lt=current_login_at_lt,
    )

    ids = id_query(q, sql_column(User.id))
    return list(execute_statement(session, ids).scalars().all())


def _build_filtered_users_query(
    *,
    current_user: UserPublic,
    session: Session,
    id: int | None = None,
    id_ge: int | None = None,
    id_le: int | None = None,
    username: Annotated[str | None, Query()] = None,
    username_contains: str | None = None,
    roles: Sequence[Role] | None = None,
    created_at_ge: datetime | None = None,
    created_at_lt: datetime | None = None,
    current_login_at_ge: datetime | None = None,
    current_login_at_lt: datetime | None = None,
    sort_by: str | None = None,
    sort_dir: SortDirection = "asc",
    require_auth: bool = True,
):
    if require_auth:
        require_user_reader(current_user)

    q = select(User)
    if id is not None:
        q = q.where(User.id == id)
    q = filter_range(q, User.id, ge=id_ge, le=id_le)
    if username is not None:
        q = q.where(User.username == username)
    q = filter_contains(q, User.username, username_contains)
    q = filter_range(q, User.created_at, ge=created_at_ge, lt=created_at_lt)
    q = filter_range(q, User.current_login_at, ge=current_login_at_ge, lt=current_login_at_lt)
    if roles:
        role_links_cls = User.get_role_links_cls()
        q = (
            q.join(role_links_cls, sql_column(role_links_cls.user_id) == User.id)
            .where(sql_column(role_links_cls.role).in_(roles))
            .distinct()
        )
    q = apply_sort(q, _USER_SORT_COLUMNS, sort_by, sort_dir)

    return q


def count_users(
    *,
    current_user: UserPublic,
    session: Session,
    id: int | None = None,
    id_ge: int | None = None,
    id_le: int | None = None,
    username: Annotated[str | None, Query()] = None,
    username_contains: str | None = None,
    roles: Sequence[Role] | None = None,
    created_at_ge: datetime | None = None,
    created_at_lt: datetime | None = None,
    current_login_at_ge: datetime | None = None,
    current_login_at_lt: datetime | None = None,
    require_auth: bool = True,
) -> int:
    q = _build_filtered_users_query(
        current_user=current_user,
        session=session,
        id=id,
        id_ge=id_ge,
        id_le=id_le,
        username=username,
        username_contains=username_contains,
        roles=roles,
        created_at_ge=created_at_ge,
        created_at_lt=created_at_lt,
        current_login_at_ge=current_login_at_ge,
        current_login_at_lt=current_login_at_lt,
        require_auth=require_auth,
    )

    return session.exec(count_query(q)).one()


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
    record = session.get(User, id)
    if not record:
        raise HTTPException(status_code=HTTPStatus.NOT_FOUND)

    data_to_update = data.model_dump(exclude_unset=True)
    record.check_edit_conflict(data_to_update)
    current_password = data_to_update.pop("current_password", None)

    if current_user.id == id:
        # issued_at is concurrency metadata, not a request to change a user
        # field: check_edit_conflict above has already enforced it and
        # sqlmodel_update drops it again. Like the owner set in
        # frames.FRAME_OWNER_EDITABLE_FIELDS, it may accompany an otherwise
        # restricted self-service edit; password is the only editable field.
        allowed_self_fields = {"password", "issued_at"}
        if not set(data_to_update) <= allowed_self_fields:
            require_user_writer(current_user, id=id)
    else:
        require_user_writer(current_user, id=id)

    if "password" in data_to_update:
        # Administrators may reset another user's password. A self-service
        # change must prove knowledge of the current password in this same
        # request; a separate check endpoint would be bypassable.
        if current_user.id == id and (
            current_password is None or not verify_password(current_password, record.password_hash)
        ):
            raise HTTPException(
                status_code=HTTPStatus.FORBIDDEN,
                detail="Current password is incorrect.",
            )
        password = data_to_update.pop("password")
        data_to_update["password_hash"] = get_password_hash(password)
        # Invalidate every access and refresh token issued before the change.
        data_to_update["current_login_at"] = None

    if "roles" in data_to_update:
        roles = data_to_update.pop("roles")
        if roles is None:
            raise HTTPException(HTTPStatus.UNPROCESSABLE_ENTITY, "roles cannot be null")

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
    # Expire the link collection (if it was loaded) so the delete below does
    # not try to blank out the foreign keys of link rows that the bulk
    # delete already removed.
    session.expire(record, ["role_links"])

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
    has_updates = bool(data_to_update)

    if "roles" in data_to_update:
        roles = data_to_update.pop("roles")
        if roles is None:
            raise HTTPException(HTTPStatus.UNPROCESSABLE_ENTITY, "roles cannot be null")

        if current_user.id in ids and Role.ADMIN not in roles:
            raise ADMIN_NO_SELF_DEMOTION

        _bulk_delete_roles(session, ids)
        _bulk_insert_roles(session, ids, roles)

    if has_updates:
        # Role link changes are also edits even when no scalar User column was
        # supplied. Core UPDATE bypasses the model's automatic timestamping.
        data_to_update["last_edit_at"] = datetime.now().astimezone()
        q = update(User).where(sql_column(User.id).in_(ids)).values(**data_to_update)
        execute_statement(session, q)


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

    return UserPublic.model_validate(record)


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

    # Login timestamps are activity metadata, not a security edit. Updating
    # them must not rotate the auth epoch and invalidate other active clients.
    for key, value in data_to_update.items():
        setattr(record, key, value)

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
