from typing import Annotated

from fastapi import APIRouter, Body, Depends, Query, Response
from sqlmodel import Session

from ...domain.querying import Pagination, Sorting, pagination_params, sorting_params
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
from ..crud import commit_record, commit_success, unique_ids
from ..responses import SuccessResponse, set_content_range

router = APIRouter(prefix="/groups", tags=["groups"])


@router.post("/", response_model=SourceGroupPublic)
def create_group(
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

    return commit_record(session, record)


@router.get("/", response_model=list[SourceGroupPublic])
def list_groups(
    response: Response,
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    pagination: Annotated[Pagination, Depends(pagination_params)],
    sorting: Annotated[Sorting, Depends(sorting_params)],
    id: Annotated[int | None, Query()] = None,
    id_ge: Annotated[int | None, Query()] = None,
    id_le: Annotated[int | None, Query()] = None,
    name: Annotated[str | None, Query()] = None,
    name_contains: Annotated[str | None, Query()] = None,
    description_contains: Annotated[str | None, Query()] = None,
):
    groups = domain.list_groups(
        current_user=current_user,
        session=session,
        offset=pagination.offset,
        limit=pagination.limit,
        id=id,
        id_ge=id_ge,
        id_le=id_le,
        name=name,
        name_contains=name_contains,
        description_contains=description_contains,
        sort_by=sorting.sort_by,
        sort_dir=sorting.sort_dir,
    )

    total_groups = domain.count_groups(
        current_user=current_user,
        session=session,
        id=id,
        id_ge=id_ge,
        id_le=id_le,
        name=name,
        name_contains=name_contains,
        description_contains=description_contains,
    )
    set_content_range(
        response,
        "groups",
        pagination=pagination,
        page_length=len(groups),
        total=total_groups,
    )

    return groups


# NOTE: Order matters for path parameters
@router.put("/bulk", response_model=SuccessResponse)
@router.patch("/bulk", response_model=SuccessResponse)
def bulk_update_groups(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    ids: Annotated[list[int], Body()],
    data: Annotated[SourceGroupBulkUpdate, Body()],
):
    domain.bulk_update_groups(
        current_user=current_user,
        session=session,
        ids=unique_ids(ids),
        data=data,
    )

    return commit_success(session)


@router.get("/{id}", response_model=SourceGroupPublic)
def read_group(
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


@router.put("/{id}", response_model=SourceGroupPublic)
@router.patch("/{id}", response_model=SourceGroupPublic)
def update_group(
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

    return commit_record(session, record)


@router.delete("/{id}", response_model=SuccessResponse)
def delete_group(
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

    return commit_success(session)
