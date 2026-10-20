from typing import Annotated

from fastapi import APIRouter, Body, Depends, Query, Response
from sqlmodel import Session

from sta.api.auth import get_current_user
from sta.api.responses import SuccessResponse, set_content_range
from sta.domain.querying import Pagination, Sorting, pagination_params, sorting_params
from sta.models.user import UserPublic
from sta.session import get_session
from sta_relation.domain.classes import definitions as domain
from sta_relation.models.classes import (
    RelationClassBulkUpdate,
    RelationClassCreate,
    RelationClassPublic,
    RelationClassUpdate,
)

router = APIRouter(prefix="/definitions", tags=["definitions"])


@router.post("/", response_model=RelationClassPublic)
def create_relclass(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    data: RelationClassCreate,
):
    record = domain.create_relclass(
        current_user=current_user,
        session=session,
        data=data,
    )

    session.commit()
    session.refresh(record)

    return record


@router.get("/", response_model=list[RelationClassPublic])
def list_relclasses(
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
):
    relclasses = domain.list_relclasses(
        current_user=current_user,
        session=session,
        offset=pagination.offset,
        limit=pagination.limit,
        id=id,
        id_ge=id_ge,
        id_le=id_le,
        name=name,
        name_contains=name_contains,
        sort_by=sorting.sort_by,
        sort_dir=sorting.sort_dir,
    )

    total_relclasses = domain.count_relclasses(
        current_user=current_user,
        session=session,
        id=id,
        id_ge=id_ge,
        id_le=id_le,
        name=name,
        name_contains=name_contains,
    )
    set_content_range(
        response,
        "relclasses",
        pagination=pagination,
        page_length=len(relclasses),
        total=total_relclasses,
    )

    return relclasses


# NOTE: Order matters for path parameters
@router.put("/bulk", response_model=SuccessResponse)
@router.patch("/bulk", response_model=SuccessResponse)
def bulk_update_relclasses(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    ids: Annotated[list[int], Body()],
    data: Annotated[RelationClassBulkUpdate, Body()],
):
    domain.bulk_update_relclasses(
        current_user=current_user,
        session=session,
        ids=set(ids),
        data=data,
    )

    session.commit()

    return SuccessResponse()


@router.get("/ids", response_model=list[int])
def list_definitions_ids(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    id: int | None = None,
    id_ge: int | None = None,
    id_le: int | None = None,
    name: str | None = None,
    name_contains: str | None = None,
):
    records = domain.list_relclasses(
        current_user=current_user,
        session=session,
        offset=None,
        limit=None,
        id=id,
        id_ge=id_ge,
        id_le=id_le,
        name=name,
        name_contains=name_contains,
    )
    return [record.id for record in records]


@router.delete("/bulk", response_model=SuccessResponse)
def bulk_delete_definitions(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    ids: Annotated[list[int], Body()],
):
    domain.bulk_update_relclasses(
        current_user=current_user,
        session=session,
        ids=set(ids),
        data=RelationClassBulkUpdate(is_deleted=True),
    )
    session.commit()
    return SuccessResponse()


@router.get("/{id}", response_model=RelationClassPublic)
def read_relclass(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    id: int,
):
    return domain.read_relclass(
        current_user=current_user,
        session=session,
        id=id,
    )


@router.put("/{id}", response_model=RelationClassPublic)
@router.patch("/{id}", response_model=RelationClassPublic)
def update_relclass(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    id: int,
    data: RelationClassUpdate,
):
    record = domain.update_relclass(
        current_user=current_user,
        session=session,
        id=id,
        data=data,
    )

    session.commit()
    session.refresh(record)

    return record


@router.delete("/{id}", response_model=SuccessResponse)
def delete_relclass(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    id: int,
):
    domain.delete_relclass(
        current_user=current_user,
        session=session,
        id=id,
    )

    session.commit()

    return SuccessResponse()
