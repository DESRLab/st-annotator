from typing import Annotated

from fastapi import APIRouter, Body, Depends, Query, Response
from sqlmodel import Session

from ...domain.source import groups as domain
from ...models.source.group import (
    SourceGroupBulkUpdate,
    SourceGroupCreate,
    SourceGroupPublic,
    SourceGroupUpdate,
)
from ...models.user import UserPublic
from ...session import get_session
from ..auth import get_current_user
from ..responses import SuccessResponse

router = APIRouter(prefix='/groups', tags=['groups'])


@router.post('/', response_model=SourceGroupPublic)
async def create_group(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    data: SourceGroupCreate,
):
    record = domain.create_group(
        current_user=current_user,
        session=session,
        data=data,
    )

    session.commit()
    session.refresh(record)

    return record


@router.get('/', response_model=list[SourceGroupPublic])
async def list_groups(
    response: Response,
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int | None, Query(ge=0)] = None,
    name: Annotated[str | None, Query()] = None,
):
    groups = domain.list_groups(
        current_user=current_user,
        session=session,
        offset=offset,
        limit=limit,
        name=name,
    )

    total_groups = domain.count_groups(
        current_user=current_user,
        session=session,
        name=name,
    )
    response.headers.setdefault(
        "Content-Range",
        f"groups {offset}-{offset + len(groups)}/{total_groups}",
    )

    return groups


# NOTE: Order matters for path parameters
@router.put('/bulk', response_model=SuccessResponse)
@router.patch('/bulk', response_model=SuccessResponse)
async def bulk_update_groups(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    ids: Annotated[list[int], Body()],
    data: Annotated[SourceGroupBulkUpdate, Body()],
):
    domain.bulk_update_groups(
        current_user=current_user,
        session=session,
        ids=set(ids),
        data=data,
    )

    session.commit()

    return SuccessResponse()


@router.get('/{id}', response_model=SourceGroupPublic)
async def read_group(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    id: int,
):
    return domain.read_group(
        current_user=current_user,
        session=session,
        id=id,
    )


@router.put('/{id}', response_model=SourceGroupPublic)
@router.patch('/{id}', response_model=SourceGroupPublic)
async def update_group(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    id: int,
    data: SourceGroupUpdate,
):
    record = domain.update_group(
        current_user=current_user,
        session=session,
        id=id,
        data=data,
    )

    session.commit()
    session.refresh(record)

    return record


@router.delete('/{id}', response_model=SuccessResponse)
async def delete_group(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    id: int,
):
    domain.delete_group(
        current_user=current_user,
        session=session,
        id=id,
    )

    session.commit()

    return SuccessResponse()
