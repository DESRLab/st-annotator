from datetime import datetime
from http import HTTPStatus
from typing import Annotated

from fastapi import APIRouter, Body, Depends, Query, Response
from sqlmodel import Session

from ..domain import frames as domain
from ..domain.querying import Pagination, Sorting, pagination_params, sorting_params
from ..models.frame import FrameBulkUpdate, FrameCreate, FramePublicWithParents, FrameUpdate
from ..models.task import WorkType
from ..models.user import UserPublic
from ..session import get_session
from .auth import get_current_user
from .responses import CreatedIDsResponse, SuccessResponse, set_content_range

router = APIRouter(
    prefix="/frames",
    tags=["frames"],
    dependencies=[Depends(get_current_user)],
    responses={HTTPStatus.NOT_FOUND: {"description": "Not found"}},
)


@router.post("/", response_model=FramePublicWithParents)
def create_frame(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    data: FrameCreate,
):
    record = domain.create_frame(
        current_user=current_user,
        session=session,
        data=data,
    )

    session.commit()
    session.refresh(record)

    return record


@router.get("/", response_model=list[FramePublicWithParents])
def list_frames(
    response: Response,
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    pagination: Annotated[Pagination, Depends(pagination_params)],
    sorting: Annotated[Sorting, Depends(sorting_params)],
    task_id: Annotated[int | None, Query()] = None,
    work_type: Annotated[WorkType | None, Query()] = None,
    source_group_id: Annotated[list[int] | None, Query()] = None,
    label_branch_id: Annotated[list[int] | None, Query()] = None,
    account_id: Annotated[list[int] | None, Query()] = None,
    id: Annotated[int | None, Query()] = None,
    id_ge: Annotated[int | None, Query()] = None,
    id_le: Annotated[int | None, Query()] = None,
    is_complete: Annotated[list[bool] | None, Query()] = None,
    min_timestamp_ge: Annotated[datetime | None, Query()] = None,
    min_timestamp_lt: Annotated[datetime | None, Query()] = None,
    max_timestamp_ge: Annotated[datetime | None, Query()] = None,
    max_timestamp_lt: Annotated[datetime | None, Query()] = None,
    last_viewed_at_ge: Annotated[datetime | None, Query()] = None,
    last_viewed_at_lt: Annotated[datetime | None, Query()] = None,
):
    frames = domain.list_frames(
        current_user=current_user,
        session=session,
        offset=pagination.offset,
        limit=pagination.limit,
        task_id=task_id,
        work_type=work_type,
        source_group_ids=source_group_id,
        label_branch_ids=label_branch_id,
        account_ids=account_id,
        id=id,
        id_ge=id_ge,
        id_le=id_le,
        is_complete=is_complete,
        min_timestamp_ge=min_timestamp_ge,
        min_timestamp_lt=min_timestamp_lt,
        max_timestamp_ge=max_timestamp_ge,
        max_timestamp_lt=max_timestamp_lt,
        last_viewed_at_ge=last_viewed_at_ge,
        last_viewed_at_lt=last_viewed_at_lt,
        sort_by=sorting.sort_by,
        sort_dir=sorting.sort_dir,
    )

    total_frames = domain.count_frames(
        current_user=current_user,
        session=session,
        task_id=task_id,
        work_type=work_type,
        source_group_ids=source_group_id,
        label_branch_ids=label_branch_id,
        account_ids=account_id,
        id=id,
        id_ge=id_ge,
        id_le=id_le,
        is_complete=is_complete,
        min_timestamp_ge=min_timestamp_ge,
        min_timestamp_lt=min_timestamp_lt,
        max_timestamp_ge=max_timestamp_ge,
        max_timestamp_lt=max_timestamp_lt,
        last_viewed_at_ge=last_viewed_at_ge,
        last_viewed_at_lt=last_viewed_at_lt,
    )
    set_content_range(
        response,
        "frames",
        pagination=pagination,
        page_length=len(frames),
        total=total_frames,
    )

    return frames


@router.get("/ids", response_model=list[int])
def list_frame_ids(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    task_id: Annotated[int | None, Query()] = None,
    work_type: Annotated[WorkType | None, Query()] = None,
    source_group_id: Annotated[list[int] | None, Query()] = None,
    label_branch_id: Annotated[list[int] | None, Query()] = None,
    account_id: Annotated[list[int] | None, Query()] = None,
    id: Annotated[int | None, Query()] = None,
    id_ge: Annotated[int | None, Query()] = None,
    id_le: Annotated[int | None, Query()] = None,
    is_complete: Annotated[list[bool] | None, Query()] = None,
    min_timestamp_ge: Annotated[datetime | None, Query()] = None,
    min_timestamp_lt: Annotated[datetime | None, Query()] = None,
    max_timestamp_ge: Annotated[datetime | None, Query()] = None,
    max_timestamp_lt: Annotated[datetime | None, Query()] = None,
    last_viewed_at_ge: Annotated[datetime | None, Query()] = None,
    last_viewed_at_lt: Annotated[datetime | None, Query()] = None,
):
    return domain.list_frame_ids(
        current_user=current_user,
        session=session,
        task_id=task_id,
        work_type=work_type,
        source_group_ids=source_group_id,
        label_branch_ids=label_branch_id,
        account_ids=account_id,
        id=id,
        id_ge=id_ge,
        id_le=id_le,
        is_complete=is_complete,
        min_timestamp_ge=min_timestamp_ge,
        min_timestamp_lt=min_timestamp_lt,
        max_timestamp_ge=max_timestamp_ge,
        max_timestamp_lt=max_timestamp_lt,
        last_viewed_at_ge=last_viewed_at_ge,
        last_viewed_at_lt=last_viewed_at_lt,
    )


# NOTE: Must precede the `/{id}` route below (order matters for path parameters)
@router.get("/recent", response_model=list[FramePublicWithParents])
def list_recent_frames(
    response: Response,
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    pagination: Annotated[Pagination, Depends(pagination_params)],
    sorting: Annotated[Sorting, Depends(sorting_params)],
    task_id: Annotated[int | None, Query()] = None,
    work_type: Annotated[WorkType | None, Query()] = None,
    source_group_id: Annotated[list[int] | None, Query()] = None,
    label_branch_id: Annotated[list[int] | None, Query()] = None,
    id: Annotated[int | None, Query()] = None,
    id_ge: Annotated[int | None, Query()] = None,
    id_le: Annotated[int | None, Query()] = None,
    is_complete: Annotated[list[bool] | None, Query()] = None,
    min_timestamp_ge: Annotated[datetime | None, Query()] = None,
    min_timestamp_lt: Annotated[datetime | None, Query()] = None,
    max_timestamp_ge: Annotated[datetime | None, Query()] = None,
    max_timestamp_lt: Annotated[datetime | None, Query()] = None,
    last_viewed_at_ge: Annotated[datetime | None, Query()] = None,
    last_viewed_at_lt: Annotated[datetime | None, Query()] = None,
):
    frames = domain.list_recent_frames(
        current_user=current_user,
        session=session,
        offset=pagination.offset,
        limit=pagination.limit,
        task_id=task_id,
        work_type=work_type,
        source_group_ids=source_group_id,
        label_branch_ids=label_branch_id,
        id=id,
        id_ge=id_ge,
        id_le=id_le,
        is_complete=is_complete,
        min_timestamp_ge=min_timestamp_ge,
        min_timestamp_lt=min_timestamp_lt,
        max_timestamp_ge=max_timestamp_ge,
        max_timestamp_lt=max_timestamp_lt,
        last_viewed_at_ge=last_viewed_at_ge,
        last_viewed_at_lt=last_viewed_at_lt,
        sort_by=sorting.sort_by,
        sort_dir=sorting.sort_dir,
    )

    total_frames = domain.count_recent_frames(
        current_user=current_user,
        session=session,
        task_id=task_id,
        work_type=work_type,
        source_group_ids=source_group_id,
        label_branch_ids=label_branch_id,
        id=id,
        id_ge=id_ge,
        id_le=id_le,
        is_complete=is_complete,
        min_timestamp_ge=min_timestamp_ge,
        min_timestamp_lt=min_timestamp_lt,
        max_timestamp_ge=max_timestamp_ge,
        max_timestamp_lt=max_timestamp_lt,
        last_viewed_at_ge=last_viewed_at_ge,
        last_viewed_at_lt=last_viewed_at_lt,
    )
    set_content_range(
        response,
        "frames",
        pagination=pagination,
        page_length=len(frames),
        total=total_frames,
    )

    return frames


# NOTE: Order matters for path parameters
@router.post("/bulk", response_model=CreatedIDsResponse)
def bulk_create_frames(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    data: list[FrameCreate],
):
    ids = domain.bulk_create_frames(
        current_user=current_user,
        session=session,
        data=data,
    )

    session.commit()

    return CreatedIDsResponse(ids=ids)


@router.put("/bulk", response_model=SuccessResponse)
@router.patch("/bulk", response_model=SuccessResponse)
def bulk_update_frames(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    ids: Annotated[list[int], Body()],
    data: Annotated[FrameBulkUpdate, Body()],
):
    domain.bulk_update_frames(
        current_user=current_user,
        session=session,
        ids=set(ids),
        data=data,
    )

    session.commit()

    return SuccessResponse()


@router.delete("/bulk", response_model=SuccessResponse)
def bulk_delete_frames(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    ids: Annotated[list[int], Body()],
):
    domain.bulk_delete_frames(
        current_user=current_user,
        session=session,
        ids=set(ids),
    )

    session.commit()

    return SuccessResponse()


@router.get("/{id}", response_model=FramePublicWithParents)
def read_frame(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    id: int,
):
    return domain.read_frame(
        current_user=current_user,
        session=session,
        id=id,
    )


@router.put("/{id}", response_model=FramePublicWithParents)
@router.patch("/{id}", response_model=FramePublicWithParents)
def update_frame(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    id: int,
    data: FrameUpdate,
):
    record = domain.update_frame(
        current_user=current_user,
        session=session,
        id=id,
        data=data,
    )

    session.commit()
    session.refresh(record)

    return record


@router.delete("/{id}", response_model=SuccessResponse)
def delete_frame(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    id: int,
):
    domain.delete_frame(
        current_user=current_user,
        session=session,
        id=id,
    )

    session.commit()

    return SuccessResponse()
