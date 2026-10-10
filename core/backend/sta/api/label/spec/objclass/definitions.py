from typing import Annotated

from fastapi import APIRouter, Body, Depends, Query, Response
from sqlmodel import Session

from .....domain.label.spec.objclass import definitions as domain
from .....domain.querying import Pagination, Sorting, pagination_params, sorting_params
from .....models.label.spec import (
    ObjectClassBulkUpdate,
    ObjectClassCreate,
    ObjectClassPublic,
    ObjectClassUpdate,
)
from .....models.user import UserPublic
from .....session import get_session
from ....auth import get_current_user
from ....responses import SuccessResponse, set_content_range

router = APIRouter(prefix="/definitions", tags=["definitions"])


@router.post("/", response_model=ObjectClassPublic)
def create_objclass(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    data: ObjectClassCreate,
):
    record = domain.create_objclass(
        current_user=current_user,
        session=session,
        data=data,
    )

    session.commit()
    session.refresh(record)

    return record


@router.get("/", response_model=list[ObjectClassPublic])
def list_objclasses(
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
    objclasses = domain.list_objclasses(
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

    total_objclasses = domain.count_objclasses(
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
        "objclasses",
        pagination=pagination,
        page_length=len(objclasses),
        total=total_objclasses,
    )

    return objclasses


# NOTE: Order matters for path parameters
@router.put("/bulk", response_model=SuccessResponse)
@router.patch("/bulk", response_model=SuccessResponse)
def bulk_update_objclasses(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    ids: Annotated[list[int], Body()],
    data: Annotated[ObjectClassBulkUpdate, Body()],
):
    domain.bulk_update_objclasses(
        current_user=current_user,
        session=session,
        ids=set(ids),
        data=data,
    )

    session.commit()

    return SuccessResponse()


@router.get("/{id}", response_model=ObjectClassPublic)
def read_objclass(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    id: int,
):
    return domain.read_objclass(
        current_user=current_user,
        session=session,
        id=id,
    )


@router.put("/{id}", response_model=ObjectClassPublic)
@router.patch("/{id}", response_model=ObjectClassPublic)
def update_objclass(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    id: int,
    data: ObjectClassUpdate,
):
    record = domain.update_objclass(
        current_user=current_user,
        session=session,
        id=id,
        data=data,
    )

    session.commit()
    session.refresh(record)

    return record


@router.delete("/{id}", response_model=SuccessResponse)
def delete_objclass(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    id: int,
):
    domain.delete_objclass(
        current_user=current_user,
        session=session,
        id=id,
    )

    session.commit()

    return SuccessResponse()
