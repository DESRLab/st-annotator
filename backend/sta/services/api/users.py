from collections.abc import Set
from http import HTTPStatus
from typing import Annotated

from fastapi import APIRouter, Body, Depends, Query, Response
from pydantic import BaseModel
from sqlmodel import Session

from ..domain import users as domain
from ..models.user import Role, UserBulkUpdate, UserCreate, Username, UserPublic, UserUpdate
from ..session import get_session
from .auth import get_current_user
from .responses import SuccessResponse

router = APIRouter(
    prefix='/users',
    tags=['users'],
    dependencies=[Depends(get_current_user)],
    responses={HTTPStatus.NOT_FOUND: {"description": "Not found"}},
)


@router.post('/', response_model=UserPublic)
async def create_user(
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


@router.get('/', response_model=list[UserPublic])
async def list_users(
    response: Response,
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int | None, Query(ge=0)] = None,
    username: Annotated[str | None, Query()] = None,
):
    users = domain.list_users(
        current_user=current_user,
        session=session,
        offset=offset,
        limit=limit,
        username=username,
    )

    total_users = domain.count_users(
        current_user=current_user,
        session=session,
        username=username,
    )
    response.headers.setdefault(
        "Content-Range",
        f"users {offset}-{offset + len(users)}/{total_users}",
    )

    return users


class UserRoles(BaseModel):
    id: int
    username: Username
    roles: Set[Role]


# NOTE: Order matters for path parameters
@router.get('/roles', response_model=list[UserRoles])
async def list_users_roles(
    response: Response,
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int | None, Query(ge=0)] = None,
    username: Annotated[str | None, Query()] = None,
):
    users = domain.list_users(
        current_user=current_user,
        session=session,
        offset=offset,
        limit=limit,
        username=username,
    )

    total_users = domain.count_users(
        current_user=current_user,
        session=session,
        username=username,
        require_auth=False,
    )
    response.headers.setdefault(
        "Content-Range",
        f"users {offset}-{offset + len(users)}/{total_users}",
    )

    return users


# NOTE: Order matters for path parameters
@router.put('/bulk', response_model=SuccessResponse)
@router.patch('/bulk', response_model=SuccessResponse)
async def bulk_update_users(
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


@router.get('/{id}', response_model=UserPublic)
async def read_user(
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


@router.put('/{id}', response_model=UserPublic)
@router.patch('/{id}', response_model=UserPublic)
async def update_user(
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


@router.delete('/{id}', response_model=SuccessResponse)
async def delete_user(
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
