from collections.abc import Set
from datetime import datetime
from http import HTTPStatus
from typing import Annotated

from fastapi import APIRouter, Body, Depends, Query, Response
from pydantic import BaseModel
from sqlmodel import Session

from ..domain import users as domain
from ..domain.querying import Pagination, Sorting, pagination_params, sorting_params
from ..models.user import Role, UserBulkUpdate, UserCreate, Username, UserPublic, UserUpdate
from ..session import get_session
from .auth import get_current_user
from .responses import SuccessResponse, set_content_range

router = APIRouter(
    prefix="/users",
    tags=["users"],
    dependencies=[Depends(get_current_user)],
    responses={HTTPStatus.NOT_FOUND: {"description": "Not found"}},
)


@router.post("/", response_model=UserPublic)
def create_user(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    data: UserCreate,
):
    record = domain.create_user(
        current_user=current_user,
        session=session,
        data=data,
    )

    session.commit()
    session.refresh(record)

    return record


@router.get("/", response_model=list[UserPublic])
def list_users(
    response: Response,
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    pagination: Annotated[Pagination, Depends(pagination_params)],
    sorting: Annotated[Sorting, Depends(sorting_params)],
    id: Annotated[int | None, Query()] = None,
    id_ge: Annotated[int | None, Query()] = None,
    id_le: Annotated[int | None, Query()] = None,
    username: Annotated[str | None, Query()] = None,
    username_contains: Annotated[str | None, Query()] = None,
    role: Annotated[list[Role] | None, Query()] = None,
    created_at_ge: Annotated[datetime | None, Query()] = None,
    created_at_lt: Annotated[datetime | None, Query()] = None,
    current_login_at_ge: Annotated[datetime | None, Query()] = None,
    current_login_at_lt: Annotated[datetime | None, Query()] = None,
):
    users = domain.list_users(
        current_user=current_user,
        session=session,
        offset=pagination.offset,
        limit=pagination.limit,
        id=id,
        id_ge=id_ge,
        id_le=id_le,
        username=username,
        username_contains=username_contains,
        roles=role,
        created_at_ge=created_at_ge,
        created_at_lt=created_at_lt,
        current_login_at_ge=current_login_at_ge,
        current_login_at_lt=current_login_at_lt,
        sort_by=sorting.sort_by,
        sort_dir=sorting.sort_dir,
    )

    total_users = domain.count_users(
        current_user=current_user,
        session=session,
        id=id,
        id_ge=id_ge,
        id_le=id_le,
        username=username,
        username_contains=username_contains,
        roles=role,
        created_at_ge=created_at_ge,
        created_at_lt=created_at_lt,
        current_login_at_ge=current_login_at_ge,
        current_login_at_lt=current_login_at_lt,
    )
    set_content_range(
        response,
        "users",
        pagination=pagination,
        page_length=len(users),
        total=total_users,
    )

    return users


@router.get("/ids", response_model=list[int])
def list_user_ids(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    id: Annotated[int | None, Query()] = None,
    id_ge: Annotated[int | None, Query()] = None,
    id_le: Annotated[int | None, Query()] = None,
    username: Annotated[str | None, Query()] = None,
    username_contains: Annotated[str | None, Query()] = None,
    role: Annotated[list[Role] | None, Query()] = None,
    created_at_ge: Annotated[datetime | None, Query()] = None,
    created_at_lt: Annotated[datetime | None, Query()] = None,
    current_login_at_ge: Annotated[datetime | None, Query()] = None,
    current_login_at_lt: Annotated[datetime | None, Query()] = None,
):
    return domain.list_user_ids(
        current_user=current_user,
        session=session,
        id=id,
        id_ge=id_ge,
        id_le=id_le,
        username=username,
        username_contains=username_contains,
        roles=role,
        created_at_ge=created_at_ge,
        created_at_lt=created_at_lt,
        current_login_at_ge=current_login_at_ge,
        current_login_at_lt=current_login_at_lt,
    )


class UserRoles(BaseModel):
    id: int
    username: Username
    roles: Set[Role]


# NOTE: Order matters for path parameters
@router.get("/roles", response_model=list[UserRoles])
def list_users_roles(
    response: Response,
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    pagination: Annotated[Pagination, Depends(pagination_params)],
    username: Annotated[str | None, Query()] = None,
):
    users = domain.list_users(
        current_user=current_user,
        session=session,
        offset=pagination.offset,
        limit=pagination.limit,
        username=username,
    )

    total_users = domain.count_users(
        current_user=current_user,
        session=session,
        username=username,
        require_auth=False,
    )
    set_content_range(
        response,
        "users",
        pagination=pagination,
        page_length=len(users),
        total=total_users,
    )

    return users


# NOTE: Order matters for path parameters
@router.put("/bulk", response_model=SuccessResponse)
@router.patch("/bulk", response_model=SuccessResponse)
def bulk_update_users(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    ids: Annotated[list[int], Body()],
    data: Annotated[UserBulkUpdate, Body()],
):
    domain.bulk_update_users(
        current_user=current_user,
        session=session,
        ids=set(ids),
        data=data,
    )

    session.commit()

    return SuccessResponse()


@router.get("/{id}", response_model=UserPublic)
def read_user(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    id: int,
):
    return domain.read_user(
        current_user=current_user,
        session=session,
        id=id,
    )


@router.put("/{id}", response_model=UserPublic)
@router.patch("/{id}", response_model=UserPublic)
def update_user(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    id: int,
    data: UserUpdate,
):
    record = domain.update_user(
        current_user=current_user,
        session=session,
        id=id,
        data=data,
    )

    session.commit()
    session.refresh(record)

    return record


@router.delete("/{id}", response_model=SuccessResponse)
def delete_user(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    id: int,
):
    domain.delete_user(
        current_user=current_user,
        session=session,
        id=id,
    )

    session.commit()

    return SuccessResponse()
