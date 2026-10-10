from typing import Annotated

from fastapi import APIRouter, Body, Depends, Query, Response
from sqlmodel import Session

from .....domain.label.spec.objclass import selections as domain
from .....domain.querying import Pagination, Sorting, pagination_params, sorting_params
from .....models.label.spec import (
    ObjectClassSelectionBulkUpdate,
    ObjectClassSelectionCreate,
    ObjectClassSelectionPublic,
    ObjectClassSelectionUpdate,
)
from .....models.user import UserPublic
from .....session import get_session
from ....auth import get_current_user
from ....responses import SuccessResponse, set_content_range

router = APIRouter(prefix="/selections", tags=["selections"])


@router.post("/", response_model=ObjectClassSelectionPublic)
def create_selection(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    data: ObjectClassSelectionCreate,
):
    record = domain.create_spec(
        current_user=current_user,
        session=session,
        data=data,
    )

    session.commit()
    session.refresh(record)

    return record


@router.get("/", response_model=list[ObjectClassSelectionPublic])
def list_selections(
    response: Response,
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    pagination: Annotated[Pagination, Depends(pagination_params)],
    sorting: Annotated[Sorting, Depends(sorting_params)],
    id: Annotated[int | None, Query()] = None,
    id_ge: Annotated[int | None, Query()] = None,
    id_le: Annotated[int | None, Query()] = None,
    group_id: Annotated[int | None, Query()] = None,
    name: Annotated[str | None, Query()] = None,
    name_contains: Annotated[str | None, Query()] = None,
    description_contains: Annotated[str | None, Query()] = None,
):
    selections = domain.list_specs(
        current_user=current_user,
        session=session,
        offset=pagination.offset,
        limit=pagination.limit,
        id=id,
        id_ge=id_ge,
        id_le=id_le,
        group_id=group_id,
        name=name,
        name_contains=name_contains,
        description_contains=description_contains,
        sort_by=sorting.sort_by,
        sort_dir=sorting.sort_dir,
    )

    total_selections = domain.count_specs(
        current_user=current_user,
        session=session,
        id=id,
        id_ge=id_ge,
        id_le=id_le,
        group_id=group_id,
        name=name,
        name_contains=name_contains,
        description_contains=description_contains,
    )
    set_content_range(
        response,
        "selections",
        pagination=pagination,
        page_length=len(selections),
        total=total_selections,
    )

    return selections


# NOTE: Order matters for path parameters
@router.put("/bulk", response_model=SuccessResponse)
@router.patch("/bulk", response_model=SuccessResponse)
def bulk_update_selections(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    ids: Annotated[list[int], Body()],
    data: Annotated[ObjectClassSelectionBulkUpdate, Body()],
):
    domain.bulk_update_specs(
        current_user=current_user,
        session=session,
        ids=set(ids),
        data=data,
    )

    session.commit()

    return SuccessResponse()


@router.get("/{id}", response_model=ObjectClassSelectionPublic)
def read_selection(
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


@router.put("/{id}", response_model=ObjectClassSelectionPublic)
@router.patch("/{id}", response_model=ObjectClassSelectionPublic)
def update_selection(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    id: int,
    data: ObjectClassSelectionUpdate,
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


@router.delete("/{id}", response_model=SuccessResponse)
def delete_selection(
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
