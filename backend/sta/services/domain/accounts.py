from collections.abc import Set
from http import HTTPStatus

from fastapi import HTTPException
from sqlalchemy.orm import QueryableAttribute
from sqlmodel import Session, func, select, update

from ..models.account import Account, AccountBulkUpdate, AccountCreate, AccountUpdate
from ..models.user import Role, User, UserPublic
from .auth import require_role


def require_account_reader(
    user: UserPublic,
    *,
    id: int | None = None,
    username: str | None = None,
):
    return True


def require_account_writer(user: UserPublic, *, id: int | None = None):
    if id == user.id:
        return True

    return require_role(user, Role.ADMIN)


def create_account(
    *,
    current_user: UserPublic,
    session: Session,
    data: AccountCreate,
):
    require_account_writer(current_user)

    record = Account.model_validate(data)
    if not session.get(User, record.id):
        raise HTTPException(
            status_code=HTTPStatus.BAD_REQUEST,
            detail="There is no user with the provided ID!",
        )

    session.add(record)
    session.flush([record])

    return record


def list_accounts(
    *,
    current_user: UserPublic,
    session: Session,
    offset: int | None = 0,
    limit: int | None = None,
    username: str | None = None,
):
    q = _build_list_accounts_query(
        current_user=current_user,
        session=session,
        offset=offset,
        limit=limit,
        username=username,
    )

    return session.exec(q).all()


def _build_list_accounts_query(
    *,
    current_user: UserPublic,
    session: Session,
    offset: int | None = 0,
    limit: int | None = None,
    username: str | None = None,
):
    require_account_reader(current_user, username=username)

    q = select(Account)
    if offset is not None:
        q = q.offset(offset)
    if limit is not None:
        q = q.limit(limit)
    if username is not None:
        q = q.where(Account.username == username)

    return q


def count_accounts(
    *,
    current_user: UserPublic,
    session: Session,
    username: str | None = None,
) -> int:
    q = _build_list_accounts_query(
        current_user=current_user,
        session=session,
        offset=None,
        limit=None,
        username=username,
    )

    return session.exec(select(func.count()).select_from(q.subquery())).one()


def read_account(
    *,
    current_user: UserPublic,
    session: Session,
    id: int,
):
    require_account_reader(current_user, id=id)

    record = session.get(Account, id)
    if not record:
        raise HTTPException(status_code=HTTPStatus.NOT_FOUND)

    return record


def update_account(
    *,
    current_user: UserPublic,
    session: Session,
    id: int,
    data: AccountUpdate,
):
    require_account_writer(current_user, id=id)

    record = session.get(Account, id)
    if not record:
        raise HTTPException(status_code=HTTPStatus.NOT_FOUND)

    data_to_update = data.model_dump(exclude_unset=True)
    record.sqlmodel_update(data_to_update)
    session.add(record)
    session.flush([record])

    # Keep User table in sync
    if "username" in data_to_update:
        user_record = session.get(User, id)
        if not user_record:
            raise HTTPException(
                status_code=HTTPStatus.NOT_FOUND,
                detail="Cannot find corresponding user",
            )

        user_record.sqlmodel_update({"username": data_to_update["username"]})
        session.add(user_record)
        session.flush([user_record])

    session.refresh(record)

    return record


def delete_account(
    *,
    current_user: UserPublic,
    session: Session,
    id: int,
):
    require_account_writer(current_user, id=id)

    record = session.get(Account, id)
    if not record:
        raise HTTPException(status_code=HTTPStatus.NOT_FOUND)

    session.delete(record)
    session.flush([record])


def bulk_update_accounts(
    *,
    current_user: UserPublic,
    session: Session,
    ids: Set[int],
    data: AccountBulkUpdate,
):
    require_account_writer(current_user)

    data_to_update = data.model_dump(exclude_unset=True)

    assert isinstance(Account.id, QueryableAttribute)

    if data_to_update:
        q = update(Account).where(Account.id.in_(ids)).values(**data_to_update)
        session.execute(q)
