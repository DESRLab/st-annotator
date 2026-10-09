import uuid
from collections.abc import Set
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response
from sqlmodel import Session

from sta.services.api.auth import get_current_user
from sta.services.api.responses import SuccessResponse
from sta.services.models.user import UserPublic
from sta.services.session import get_session

from ....domain.label.data import element as domain
from ....models.label.data import (
    LabelBoxBulkUpdate,
    LabelBoxCreate,
    LabelBoxPublic,
    LabelBoxUpdate,
)

router = APIRouter(prefix='/element', tags=['element'])


# Should use label repository API
# @router.post('/', response_model=LabelBoxPublic)
async def create_element(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    data: LabelBoxCreate,
):
    record = domain.create_data(
        current_user=current_user,
        session=session,
        data=data,
    )

    session.commit()
    session.refresh(record)

    return record


@router.get('/', response_model=list[LabelBoxPublic])
async def list_elements(
    response: Response,
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int | None, Query(ge=0)] = None,
    ids: Annotated[Set[int] | None, Query()] = None,
    group_id: Annotated[int, Query()],
    commit_hash: Annotated[uuid.UUID, Query()],
    min_x: Annotated[float | None, Query()] = None,
    min_y: Annotated[float | None, Query()] = None,
    min_z: Annotated[float | None, Query()] = None,
    max_x: Annotated[float | None, Query()] = None,
    max_y: Annotated[float | None, Query()] = None,
    max_z: Annotated[float | None, Query()] = None,
    min_timestamp: Annotated[datetime | None, Query()] = None,
    max_timestamp: Annotated[datetime | None, Query()] = None,
    entity_id: Annotated[int | None, Query()] = None,
):
    elements = domain.list_datas(
        current_user=current_user,
        session=session,
        offset=offset,
        limit=limit,
        ids=ids,
        group_id=group_id,
        commit_hash=commit_hash,
        min_x=min_x,
        min_y=min_y,
        min_z=min_z,
        max_x=max_x,
        max_y=max_y,
        max_z=max_z,
        min_timestamp=min_timestamp,
        max_timestamp=max_timestamp,
        entity_id=entity_id,
    )

    total_elements = domain.count_datas(
        current_user=current_user,
        session=session,
        ids=ids,
        group_id=group_id,
        commit_hash=commit_hash,
        min_x=min_x,
        min_y=min_y,
        min_z=min_z,
        max_x=max_x,
        max_y=max_y,
        max_z=max_z,
        min_timestamp=min_timestamp,
        max_timestamp=max_timestamp,
        entity_id=entity_id,
    )
    response.headers.setdefault(
        "Content-Range",
        f"elements {offset}-{offset + len(elements)}/{total_elements}",
    )

    return elements


# NOTE: Order matters for path parameters
# Should use label repository API
#@router.post('/bulk', response_model=SuccessResponse)
async def bulk_create_elements(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    data: list[LabelBoxCreate],
):
    domain.bulk_create_datas(
        current_user=current_user,
        session=session,
        data=data,
    )

    session.commit()

    return SuccessResponse()


# Should use label repository API
# @router.put('/bulk', response_model=SuccessResponse)
# @router.patch('/bulk', response_model=SuccessResponse)
async def bulk_update_elements(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    ids: list[uuid.UUID],
    group_id: Annotated[int, Query()],
    commit_hash: Annotated[uuid.UUID, Query()],
    data: LabelBoxBulkUpdate,
):
    domain.bulk_update_datas(
        current_user=current_user,
        session=session,
        ids=set(ids),
        group_id=group_id,
        commit_hash=commit_hash,
        data=data,
    )

    session.commit()

    return SuccessResponse()


# Should use label repository API
# @router.delete('/bulk', response_model=SuccessResponse)
async def bulk_delete_elements(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    ids: list[uuid.UUID],
    group_id: Annotated[int, Query()],
    commit_hash: Annotated[uuid.UUID, Query()],
):
    domain.bulk_delete_datas(
        current_user=current_user,
        session=session,
        ids=set(ids),
        group_id=group_id,
        commit_hash=commit_hash,
    )

    session.commit()

    return SuccessResponse()


@router.get('/{id}', response_model=LabelBoxPublic)
async def read_element(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    id: uuid.UUID,
    group_id: Annotated[int, Query()],
    commit_hash: Annotated[uuid.UUID, Query()],
):
    return domain.read_data(
        current_user=current_user,
        session=session,
        id=id,
        group_id=group_id,
        commit_hash=commit_hash,
    )


# Should use label repository API
# @router.put('/{id}', response_model=LabelBoxPublic)
# @router.patch('/{id}', response_model=LabelBoxPublic)
async def update_element(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    id: uuid.UUID,
    group_id: Annotated[int, Query()],
    commit_hash: Annotated[uuid.UUID, Query()],
    data: LabelBoxUpdate,
):
    record = domain.update_data(
        current_user=current_user,
        session=session,
        id=id,
        group_id=group_id,
        commit_hash=commit_hash,
        data=data,
    )

    session.commit()
    session.refresh(record)

    return record


# Should use label repository API
# @router.delete('/{id}', response_model=SuccessResponse)
async def delete_element(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    id: uuid.UUID,
    group_id: Annotated[int, Query()],
    commit_hash: Annotated[uuid.UUID, Query()],
):
    domain.delete_data(
        current_user=current_user,
        session=session,
        id=id,
        group_id=group_id,
        commit_hash=commit_hash,
    )

    session.commit()

    return SuccessResponse()
