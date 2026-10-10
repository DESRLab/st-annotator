from http import HTTPStatus
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response
from sqlmodel import Session

from sta.domain import jobs as domain
from sta.models.job import JobPublic, JobState
from sta.models.user import UserPublic
from sta.session import get_session

from ..domain.querying import Pagination, Sorting, pagination_params, sorting_params
from .auth import get_current_user
from .responses import set_content_range

router = APIRouter(
    prefix="/jobs",
    tags=["jobs"],
    dependencies=[Depends(get_current_user)],
    responses={HTTPStatus.NOT_FOUND: {"description": "Not found"}},
)


@router.get("/", response_model=list[JobPublic])
def list_jobs(
    response: Response,
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    pagination: Annotated[Pagination, Depends(pagination_params)],
    sorting: Annotated[Sorting, Depends(sorting_params)],
    id: Annotated[list[int] | None, Query()] = None,
    kind: Annotated[str | None, Query()] = None,
    state: Annotated[list[JobState] | None, Query()] = None,
):
    """List the deferred-work inventory.

    ``id``, ``kind`` and ``state`` match any of their values, so one request can name the
    exact rows a write reported; absent, every job is listed, as the endpoint reports the
    queue rather than one view of it.
    """
    jobs = domain.list_jobs(
        current_user=current_user,
        session=session,
        offset=pagination.offset,
        limit=pagination.limit,
        id=id,
        kind=kind,
        state=state,
        sort_by=sorting.sort_by,
        sort_dir=sorting.sort_dir,
    )

    total_jobs = domain.count_jobs(
        current_user=current_user,
        session=session,
        id=id,
        kind=kind,
        state=state,
    )
    set_content_range(
        response,
        "jobs",
        pagination=pagination,
        page_length=len(jobs),
        total=total_jobs,
    )

    return jobs


@router.post("/{id}/cancel", response_model=JobPublic)
def cancel_job(
    id: int,
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
):
    """Cancel a pending or running job."""
    return domain.request_job_cancellation(
        session=session,
        current_user=current_user,
        job_id=id,
    )
