from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Body, Depends, Query, Response
from sqlmodel import Session

from sta.services.api.auth import get_current_user
from sta.services.api.responses import CreatedIDsResponse, SuccessResponse
from sta.services.models.user import UserPublic
from sta.services.session import get_session

from ....domain.source.data import metadata as domain
from ....models.source.data import (
    PointCloudMetadataBulkUpdate,
    PointCloudMetadataCreate,
    PointCloudMetadataPublic,
    PointCloudMetadataUpdate,
)

router = APIRouter(prefix='/metadata', tags=['metadata'])


@router.post('/', response_model=PointCloudMetadataPublic)
async def create_metadata(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    data: PointCloudMetadataCreate,
):
    record = domain.create_data(
        current_user=current_user,
        session=session,
        data=data,
    )

    session.commit()
    session.refresh(record)

    return record


@router.get('/', response_model=list[PointCloudMetadataPublic])
async def list_metadatas(
    response: Response,
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int | None, Query(ge=0)] = None,
    group_id: Annotated[int | None, Query()] = None,
    min_x: Annotated[float | None, Query()] = None,
    min_y: Annotated[float | None, Query()] = None,
    min_z: Annotated[float | None, Query()] = None,
    max_x: Annotated[float | None, Query()] = None,
    max_y: Annotated[float | None, Query()] = None,
    max_z: Annotated[float | None, Query()] = None,
    min_timestamp: Annotated[datetime | None, Query()] = None,
    max_timestamp: Annotated[datetime | None, Query()] = None,
    uri: Annotated[str | None, Query()] = None,
):
    metadatas = domain.list_datas(
        current_user=current_user,
        session=session,
        offset=offset,
        limit=limit,
        group_id=group_id,
        min_x=min_x,
        min_y=min_y,
        min_z=min_z,
        max_x=max_x,
        max_y=max_y,
        max_z=max_z,
        min_timestamp=min_timestamp,
        max_timestamp=max_timestamp,
        uri=uri,
    )

    total_metadatas = domain.count_datas(
        current_user=current_user,
        session=session,
        group_id=group_id,
        min_x=min_x,
        min_y=min_y,
        min_z=min_z,
        max_x=max_x,
        max_y=max_y,
        max_z=max_z,
        min_timestamp=min_timestamp,
        max_timestamp=max_timestamp,
        uri=uri,
    )
    response.headers.setdefault(
        "Content-Range",
        f"metadatas {offset}-{offset + len(metadatas)}/{total_metadatas}",
    )

    return metadatas


# NOTE: Order matters for path parameters
@router.put('/bulk', response_model=SuccessResponse)
@router.patch('/bulk', response_model=SuccessResponse)
async def bulk_update_metadatas(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    ids: Annotated[list[int], Body()],
    data: Annotated[PointCloudMetadataBulkUpdate, Body()],
):
    domain.bulk_update_datas(
        current_user=current_user,
        session=session,
        ids=set(ids),
        data=data,
    )

    session.commit()

    return SuccessResponse()


@router.post('/bulk', response_model=CreatedIDsResponse)
async def bulk_create_metadatas(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    data: list[PointCloudMetadataCreate],
):
    ids = domain.bulk_create_datas(
        current_user=current_user,
        session=session,
        data=data,
    )

    session.commit()

    return CreatedIDsResponse(ids=ids)


@router.delete('/bulk', response_model=SuccessResponse)
async def bulk_delete_metadatas(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    ids: Annotated[list[int], Body()],
):
    domain.bulk_delete_datas(
        current_user=current_user,
        session=session,
        ids=ids,
    )

    session.commit()

    return SuccessResponse()


@router.get('/{id}', response_model=PointCloudMetadataPublic)
async def read_metadata(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    id: int,
):
    return domain.read_data(
        current_user=current_user,
        session=session,
        id=id,
    )


@router.put('/{id}', response_model=PointCloudMetadataPublic)
@router.patch('/{id}', response_model=PointCloudMetadataPublic)
async def update_metadata(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    id: int,
    data: PointCloudMetadataUpdate,
):
    record = domain.update_data(
        current_user=current_user,
        session=session,
        id=id,
        data=data,
    )

    session.commit()
    session.refresh(record)

    return record


@router.delete('/{id}', response_model=SuccessResponse)
async def delete_metadata(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    id: int,
):
    domain.delete_data(
        current_user=current_user,
        session=session,
        id=id,
    )

    session.commit()

    return SuccessResponse()
