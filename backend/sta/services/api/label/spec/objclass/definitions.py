from typing import Annotated

from fastapi import APIRouter, Body, Depends, Query, Response
from sqlmodel import Session

from .....domain.label.spec.objclass import definitions as domain
from .....models.label.spec import (
    ObjectClassBulkUpdate,
    ObjectClassCreate,
    ObjectClassPublic,
    ObjectClassUpdate,
)
from .....models.user import UserPublic
from .....session import get_session
from ....auth import get_current_user
from ....responses import SuccessResponse

router = APIRouter(prefix='/definitions', tags=['definitions'])


@router.post('/', response_model=ObjectClassPublic)
async def create_objclass(
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


@router.get('/', response_model=list[ObjectClassPublic])
async def list_objclasses(
    response: Response,
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int | None, Query(ge=0)] = None,
    name: Annotated[str | None, Query()] = None,
):
    objclasses = domain.list_objclasses(
        current_user=current_user,
        session=session,
        offset=offset,
        limit=limit,
        name=name,
    )

    total_objclasses = domain.count_objclasses(
        current_user=current_user,
        session=session,
        name=name,
    )
    response.headers.setdefault(
        "Content-Range",
        f"objclasses {offset}-{offset + len(objclasses)}/{total_objclasses}",
    )

    return objclasses


# NOTE: Order matters for path parameters
@router.put('/bulk', response_model=SuccessResponse)
@router.patch('/bulk', response_model=SuccessResponse)
async def bulk_update_objclasses(
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


@router.get('/{id}', response_model=ObjectClassPublic)
async def read_objclass(
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


@router.put('/{id}', response_model=ObjectClassPublic)
@router.patch('/{id}', response_model=ObjectClassPublic)
async def update_objclass(
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


@router.delete('/{id}', response_model=SuccessResponse)
async def delete_objclass(
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
