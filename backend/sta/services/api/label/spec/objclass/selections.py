from typing import Annotated

from fastapi import APIRouter, Body, Depends, Query, Response
from sqlmodel import Session

from .....domain.label.spec.objclass import selections as domain
from .....models.label.spec import (
    ObjectClassSelectionBulkUpdate,
    ObjectClassSelectionCreate,
    ObjectClassSelectionPublic,
    ObjectClassSelectionUpdate,
)
from .....models.user import UserPublic
from .....session import get_session
from ....auth import get_current_user
from ....responses import SuccessResponse

router = APIRouter(prefix='/selections', tags=['selections'])


@router.post('/', response_model=ObjectClassSelectionPublic)
async def create_selection(
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


@router.get('/', response_model=list[ObjectClassSelectionPublic])
async def list_selections(
    response: Response,
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int | None, Query(ge=0)] = None,
    name: Annotated[str | None, Query()] = None,
):
    selections = domain.list_specs(
        current_user=current_user,
        session=session,
        offset=offset,
        limit=limit,
        name=name,
    )

    total_selections = domain.count_specs(
        current_user=current_user,
        session=session,
        name=name,
    )
    response.headers.setdefault(
        "Content-Range",
        f"selections {offset}-{offset + len(selections)}/{total_selections}",
    )

    return selections


# NOTE: Order matters for path parameters
@router.put('/bulk', response_model=SuccessResponse)
@router.patch('/bulk', response_model=SuccessResponse)
async def bulk_update_selections(
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


@router.get('/{id}', response_model=ObjectClassSelectionPublic)
async def read_selection(
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


@router.put('/{id}', response_model=ObjectClassSelectionPublic)
@router.patch('/{id}', response_model=ObjectClassSelectionPublic)
async def update_selection(
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


@router.delete('/{id}', response_model=SuccessResponse)
async def delete_selection(
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
