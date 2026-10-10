from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response
from sqlmodel import Session

from ....domain.label.repo import branches as domain
from ....domain.querying import Pagination, Sorting, pagination_params, sorting_params
from ....models.label.repo import (
    LabelsetBranchCreate,
    LabelsetBranchPublic,
    LabelsetBranchUpdate,
)
from ....models.user import UserPublic
from ....session import get_session
from ...auth import get_current_user
from ...responses import SuccessResponse, set_content_range

router = APIRouter(prefix="/branches", tags=["branches"])


# Should use higher-level API
# @router.post('/', response_model=LabelsetBranchPublic)
def create_branch(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    data: LabelsetBranchCreate,
):
    record = domain.create_branch(
        current_user=current_user,
        session=session,
        data=data,
    )

    session.commit()
    session.refresh(record)

    return record


@router.get("/", response_model=list[LabelsetBranchPublic])
def list_branches(
    response: Response,
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    pagination: Annotated[Pagination, Depends(pagination_params)],
    sorting: Annotated[Sorting, Depends(sorting_params)],
    group_id: Annotated[int | None, Query()] = None,
    id: Annotated[int | None, Query()] = None,
    id_ge: Annotated[int | None, Query()] = None,
    id_le: Annotated[int | None, Query()] = None,
    name: Annotated[str | None, Query()] = None,
    name_contains: Annotated[str | None, Query()] = None,
    head_hash_contains: Annotated[str | None, Query()] = None,
    checkpoint_hash_contains: Annotated[str | None, Query()] = None,
    last_edit_at_ge: Annotated[datetime | None, Query()] = None,
    last_edit_at_lt: Annotated[datetime | None, Query()] = None,
):
    branches = domain.list_branches(
        current_user=current_user,
        session=session,
        offset=pagination.offset,
        limit=pagination.limit,
        group_id=group_id,
        id=id,
        id_ge=id_ge,
        id_le=id_le,
        name=name,
        name_contains=name_contains,
        head_hash_contains=head_hash_contains,
        checkpoint_hash_contains=checkpoint_hash_contains,
        last_edit_at_ge=last_edit_at_ge,
        last_edit_at_lt=last_edit_at_lt,
        sort_by=sorting.sort_by,
        sort_dir=sorting.sort_dir,
    )

    total_branches = domain.count_branches(
        current_user=current_user,
        session=session,
        group_id=group_id,
        id=id,
        id_ge=id_ge,
        id_le=id_le,
        name=name,
        name_contains=name_contains,
        head_hash_contains=head_hash_contains,
        checkpoint_hash_contains=checkpoint_hash_contains,
        last_edit_at_ge=last_edit_at_ge,
        last_edit_at_lt=last_edit_at_lt,
    )
    set_content_range(
        response,
        "branches",
        pagination=pagination,
        page_length=len(branches),
        total=total_branches,
    )

    return branches


@router.get("/{id}", response_model=LabelsetBranchPublic)
def read_branch(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    id: int,
):
    return domain.read_branch(
        current_user=current_user,
        session=session,
        id=id,
    )


@router.put("/{id}", response_model=LabelsetBranchPublic)
@router.patch("/{id}", response_model=LabelsetBranchPublic)
def update_branch(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    id: int,
    data: LabelsetBranchUpdate,
):
    record = domain.update_branch(
        current_user=current_user,
        session=session,
        id=id,
        data=data,
    )

    session.commit()
    session.refresh(record)

    return record


@router.delete("/{id}", response_model=SuccessResponse)
def delete_branch(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    id: int,
):
    domain.delete_branch(
        current_user=current_user,
        session=session,
        id=id,
    )

    session.commit()

    return SuccessResponse()
