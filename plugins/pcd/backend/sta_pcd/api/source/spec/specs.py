from typing import Annotated

from fastapi import APIRouter, Body, Depends, Query, Response
from sqlmodel import Session

from sta.services.api.auth import get_current_user
from sta.services.api.responses import SuccessResponse
from sta.services.models.user import UserPublic
from sta.services.session import get_session

from ....domain.source.spec import specs as domain
from ....models.source.spec import (
    PointCloudSpecBulkUpdate,
    PointCloudSpecCreate,
    PointCloudSpecPublic,
    PointCloudSpecUpdate,
)

router = APIRouter(prefix='/specs', tags=['specs'])


@router.post('/', response_model=PointCloudSpecPublic)
async def create_spec(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    data: PointCloudSpecCreate,
):
    record = domain.create_spec(
        current_user=current_user,
        session=session,
        data=data,
    )

    session.commit()
    session.refresh(record)

    return record


@router.get('/', response_model=list[PointCloudSpecPublic])
async def list_specs(
    response: Response,
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int | None, Query(ge=0)] = None,
    name: Annotated[str | None, Query()] = None,
):
    specs = domain.list_specs(
        current_user=current_user,
        session=session,
        offset=offset,
        limit=limit,
        name=name,
    )

    total_specs = domain.count_specs(
        current_user=current_user,
        session=session,
        name=name,
    )
    response.headers.setdefault(
        "Content-Range",
        f"specs {offset}-{offset + len(specs)}/{total_specs}",
    )

    return specs


# NOTE: Order matters for path parameters
@router.put('/bulk', response_model=SuccessResponse)
@router.patch('/bulk', response_model=SuccessResponse)
async def bulk_update_specs(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    ids: Annotated[list[int], Body()],
    data: Annotated[PointCloudSpecBulkUpdate, Body()],
):
    domain.bulk_update_specs(
        current_user=current_user,
        session=session,
        ids=set(ids),
        data=data,
    )

    session.commit()

    return SuccessResponse()


@router.get('/{id}', response_model=PointCloudSpecPublic)
async def read_spec(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    id: int,
):
    return domain.read_spec(
        current_user=current_user,
        session=session,
        id=id,
    )


@router.put('/{id}', response_model=PointCloudSpecPublic)
@router.patch('/{id}', response_model=PointCloudSpecPublic)
async def update_spec(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    id: int,
    data: PointCloudSpecUpdate,
):
    record = domain.update_spec(
        current_user=current_user,
        session=session,
        id=id,
        data=data,
    )

    session.commit()
    session.refresh(record)

    return record


@router.delete('/{id}', response_model=SuccessResponse)
async def delete_spec(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    id: int,
):
    domain.delete_spec(
        current_user=current_user,
        session=session,
        id=id,
    )

    session.commit()

    return SuccessResponse()
