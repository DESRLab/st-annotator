from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Body, Depends, Query, Response
from sqlmodel import Session

from sta.api.auth import get_current_user
from sta.api.crud import (
    commit_created_ids,
    commit_queued_jobs,
    commit_record,
    commit_success,
    unique_ids,
)
from sta.api.responses import (
    CreatedIDsResponse,
    QueuedJobsResponse,
    SuccessResponse,
    set_content_range,
)
from sta.domain.querying import Pagination, pagination_params
from sta.models.user import UserPublic
from sta.session import get_session

from ....domain.source.data import metadata as domain
from ....models.source.data import (
    PointCloudMetadataBulkUpdate,
    PointCloudMetadataCreate,
    PointCloudMetadataPublic,
    PointCloudMetadataUpdate,
)

router = APIRouter(prefix="/metadata", tags=["metadata"])


@router.post("/", response_model=PointCloudMetadataPublic)
def create_metadata(
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

    return commit_record(session, record)


@router.get("/", response_model=list[PointCloudMetadataPublic])
def list_metadatas(
    response: Response,
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    pagination: Annotated[Pagination, Depends(pagination_params)],
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
    bounds_pending: Annotated[bool | None, Query()] = None,
):
    metadatas = domain.list_datas(
        current_user=current_user,
        session=session,
        offset=pagination.offset,
        limit=pagination.limit,
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
        bounds_pending=bounds_pending,
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
        bounds_pending=bounds_pending,
    )
    set_content_range(
        response,
        "metadatas",
        pagination=pagination,
        page_length=len(metadatas),
        total=total_metadatas,
    )

    return metadatas


@router.get("/ids", response_model=list[int])
def list_metadata_ids(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
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
    bounds_pending: Annotated[bool | None, Query()] = None,
):
    return domain.list_data_ids(
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
        bounds_pending=bounds_pending,
    )


# NOTE: Order matters for path parameters
@router.put("/bulk", response_model=QueuedJobsResponse)
@router.patch("/bulk", response_model=QueuedJobsResponse)
def bulk_update_metadatas(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    ids: Annotated[list[int], Body()],
    data: Annotated[PointCloudMetadataBulkUpdate, Body()],
):
    job_ids = domain.bulk_update_datas(
        current_user=current_user,
        session=session,
        ids=unique_ids(ids),
        data=data,
    )

    return commit_queued_jobs(session, job_ids)


@router.post("/bulk", response_model=CreatedIDsResponse)
def bulk_create_metadatas(
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

    return commit_created_ids(session, ids)


@router.delete("/bulk", response_model=SuccessResponse)
def bulk_delete_metadatas(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    ids: Annotated[list[int], Body()],
):
    domain.bulk_delete_datas(
        current_user=current_user,
        session=session,
        ids=unique_ids(ids),
    )

    return commit_success(session)


@router.get("/{id}", response_model=PointCloudMetadataPublic)
def read_metadata(
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


@router.put("/{id}", response_model=PointCloudMetadataPublic)
@router.patch("/{id}", response_model=PointCloudMetadataPublic)
def update_metadata(
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

    return commit_record(session, record)


@router.delete("/{id}", response_model=SuccessResponse)
def delete_metadata(
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

    return commit_success(session)
