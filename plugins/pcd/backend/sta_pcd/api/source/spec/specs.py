from typing import Annotated

from fastapi import APIRouter, Body, Depends, Query, Response
from pydantic import BaseModel
from sqlmodel import Session

from sta.api.auth import get_current_user
from sta.api.crud import commit_queued_jobs, commit_record
from sta.api.responses import QueuedJobsResponse, set_content_range
from sta.domain.querying import Pagination, pagination_params
from sta.models.user import UserPublic
from sta.session import get_session

from ....domain.source.spec import specs as domain
from ....models.source.spec import (
    PointCloudSpecBulkUpdate,
    PointCloudSpecCreate,
    PointCloudSpecPublic,
    PointCloudSpecUpdate,
)

router = APIRouter(prefix="/specs", tags=["specs"])


class PointCloudSpecWrite(BaseModel):
    """
    The saved specification beside the queue rows the write started.

    A specification carries the configuration its groups' scans are read under, so saving
    one can leave every scan of those groups awaiting a new box. ``job_ids`` is empty when
    nothing needed re-deriving, or when the sweeps it would have started are already
    waiting; the record is returned either way, so a caller never trades one for the other.
    """

    spec: PointCloudSpecPublic
    job_ids: list[int] = []


@router.post("/", response_model=PointCloudSpecWrite)
def create_spec(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    data: PointCloudSpecCreate,
):
    record, job_ids = domain.create_spec(
        current_user=current_user,
        session=session,
        data=data,
    )

    commit_record(session, record)

    return PointCloudSpecWrite(
        spec=PointCloudSpecPublic.model_validate(record, from_attributes=True),
        job_ids=job_ids,
    )


@router.get("/", response_model=list[PointCloudSpecPublic])
def list_specs(
    response: Response,
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    pagination: Annotated[Pagination, Depends(pagination_params)],
    name: Annotated[str | None, Query()] = None,
):
    specs = domain.list_specs(
        current_user=current_user,
        session=session,
        offset=pagination.offset,
        limit=pagination.limit,
        name=name,
    )

    total_specs = domain.count_specs(
        current_user=current_user,
        session=session,
        name=name,
    )
    set_content_range(
        response,
        "specs",
        pagination=pagination,
        page_length=len(specs),
        total=total_specs,
    )

    return specs


# NOTE: Order matters for path parameters
@router.put("/bulk", response_model=QueuedJobsResponse)
@router.patch("/bulk", response_model=QueuedJobsResponse)
def bulk_update_specs(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    ids: Annotated[list[int], Body()],
    data: Annotated[PointCloudSpecBulkUpdate, Body()],
):
    job_ids = domain.bulk_update_specs(
        current_user=current_user,
        session=session,
        ids=set(ids),
        data=data,
    )

    return commit_queued_jobs(session, job_ids)


@router.delete("/bulk", response_model=QueuedJobsResponse)
def bulk_delete_specs(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    ids: Annotated[list[int], Body()],
):
    job_ids = domain.bulk_delete_specs(
        current_user=current_user,
        session=session,
        ids=set(ids),
    )

    return commit_queued_jobs(session, job_ids)


@router.get("/{id}", response_model=PointCloudSpecPublic)
def read_spec(
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


@router.put("/{id}", response_model=PointCloudSpecWrite)
@router.patch("/{id}", response_model=PointCloudSpecWrite)
def update_spec(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    id: int,
    data: PointCloudSpecUpdate,
):
    record, job_ids = domain.update_spec(
        current_user=current_user,
        session=session,
        id=id,
        data=data,
    )

    commit_record(session, record)

    return PointCloudSpecWrite(
        spec=PointCloudSpecPublic.model_validate(record, from_attributes=True),
        job_ids=job_ids,
    )


@router.delete("/{id}", response_model=QueuedJobsResponse)
def delete_spec(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    id: int,
):
    job_ids = domain.delete_spec(
        current_user=current_user,
        session=session,
        id=id,
    )

    return commit_queued_jobs(session, job_ids)
