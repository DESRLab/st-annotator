from typing import Annotated

from fastapi import APIRouter, Body, Depends, Query, Response
from sqlmodel import Session

from sta.api.auth import get_current_user
from sta.api.responses import SuccessResponse, set_content_range
from sta.domain.querying import Pagination, Sorting, pagination_params, sorting_params
from sta.models.user import UserPublic
from sta.session import get_session
from sta_relation.domain.classes import selections as domain
from sta_relation.models.classes import (
    RelationClassSelectionBulkUpdate,
    RelationClassSelectionCreate,
    RelationClassSelectionPublic,
    RelationClassSelectionUpdate,
)

router = APIRouter(prefix="/selections", tags=["selections"])


@router.post("/", response_model=RelationClassSelectionPublic)
def create_selection(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    data: RelationClassSelectionCreate,
):
    record = domain.create_spec(
        current_user=current_user,
        session=session,
        data=data,
    )

    session.commit()
    session.refresh(record)

    return record


@router.get("/", response_model=list[RelationClassSelectionPublic])
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
    data: Annotated[RelationClassSelectionBulkUpdate, Body()],
):
    domain.bulk_update_specs(
        current_user=current_user,
        session=session,
        ids=set(ids),
        data=data,
    )

    session.commit()

    return SuccessResponse()


@router.get("/ids", response_model=list[int])
def list_selections_ids(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    id: int | None = None,
    id_ge: int | None = None,
    id_le: int | None = None,
    name: str | None = None,
    name_contains: str | None = None,
    group_id: int | None = None,
    description_contains: str | None = None,
):
    records = domain.list_specs(
        current_user=current_user,
        session=session,
        offset=None,
        limit=None,
        id=id,
        id_ge=id_ge,
        id_le=id_le,
        name=name,
        name_contains=name_contains,
        group_id=group_id,
        description_contains=description_contains,
    )
    return [record.id for record in records]


@router.delete("/bulk", response_model=SuccessResponse)
def bulk_delete_selections(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    ids: Annotated[list[int], Body()],
):
    domain.require_spec_writer(current_user, session)
    for id in set(ids):
        domain.delete_spec(current_user=current_user, session=session, id=id)
    session.commit()
    return SuccessResponse()


@router.get("/{id}", response_model=RelationClassSelectionPublic)
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


@router.put("/{id}", response_model=RelationClassSelectionPublic)
@router.patch("/{id}", response_model=RelationClassSelectionPublic)
def update_selection(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    id: int,
    data: RelationClassSelectionUpdate,
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
