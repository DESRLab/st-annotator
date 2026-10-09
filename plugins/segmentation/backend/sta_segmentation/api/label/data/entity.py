import uuid
from collections.abc import Set
from typing import Annotated

from fastapi import APIRouter, Body, Depends, Query, Response
from sqlmodel import Session

from sta.services.api.auth import get_current_user
from sta.services.api.responses import SuccessResponse
from sta.services.models.user import UserPublic
from sta.services.session import get_session

from ....domain.label.data import entity as domain
from ....models.label.data import (
    LabelInstanceBulkUpdate,
    LabelInstanceCreate,
    LabelInstancePublic,
    LabelInstanceUpdate,
)

router = APIRouter(prefix='/entity', tags=['entity'])


@router.post('/', response_model=LabelInstancePublic)
async def create_entity(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    data: LabelInstanceCreate,
):
    record = domain.create_data(
        current_user=current_user,
        session=session,
        data=data,
    )

    session.commit()
    session.refresh(record)

    return record


@router.get('/', response_model=list[LabelInstancePublic])
async def list_entities(
    response: Response,
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int | None, Query(ge=0)] = None,
    ids: Annotated[Set[int] | None, Query()] = None,
    group_id: Annotated[int, Query()],
    commit_hash: Annotated[uuid.UUID, Query()],
):
    entities = domain.list_datas(
        current_user=current_user,
        session=session,
        offset=offset,
        limit=limit,
        ids=ids,
        group_id=group_id,
        commit_hash=commit_hash,
    )

    total_entities = domain.count_datas(
        current_user=current_user,
        session=session,
        ids=ids,
        group_id=group_id,
        commit_hash=commit_hash,
    )
    response.headers.setdefault(
        "Content-Range",
        f"entities {offset}-{offset + len(entities)}/{total_entities}",
    )

    return entities


# NOTE: Order matters for path parameters
@router.post('/bulk', response_model=SuccessResponse)
async def bulk_create_entities(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    data: list[LabelInstanceCreate],
):
    domain.bulk_create_datas(
        current_user=current_user,
        session=session,
        data=data,
    )

    session.commit()

    return SuccessResponse()


@router.put('/bulk', response_model=SuccessResponse)
@router.patch('/bulk', response_model=SuccessResponse)
async def bulk_update_entities(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    ids: Annotated[list[uuid.UUID], Query()],
    group_id: Annotated[int, Query()],
    commit_hash: Annotated[uuid.UUID, Query()],
    data: Annotated[LabelInstanceBulkUpdate, Body()],
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


@router.delete('/bulk', response_model=SuccessResponse)
async def bulk_delete_entities(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    ids: Annotated[list[uuid.UUID], Query()],
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


@router.get('/{id}', response_model=LabelInstancePublic)
async def read_entity(
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


@router.put('/{id}', response_model=LabelInstancePublic)
@router.patch('/{id}', response_model=LabelInstancePublic)
async def update_entity(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    id: uuid.UUID,
    group_id: Annotated[int, Query()],
    commit_hash: Annotated[uuid.UUID, Query()],
    data: LabelInstanceUpdate,
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


@router.delete('/{id}', response_model=SuccessResponse)
async def delete_entity(
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
