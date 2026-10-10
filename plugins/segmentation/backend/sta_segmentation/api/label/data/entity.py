import uuid
from collections.abc import Set
from typing import Annotated

from fastapi import APIRouter, Body, Depends, Query, Response
from sqlmodel import Session

from sta.api.auth import get_current_user
from sta.api.responses import SuccessResponse, set_content_range
from sta.domain.querying import Pagination, pagination_params
from sta.models.user import UserPublic
from sta.session import get_session

from ....domain.label.data import entity as domain
from ....models.label.data import (
    LabelInstanceBulkUpdate,
    LabelInstanceCreate,
    LabelInstancePublic,
    LabelInstanceUpdate,
)

router = APIRouter(prefix="/entity", tags=["entity"])


# Should use label repository API
# @router.post('/', response_model=LabelInstancePublic)
def create_entity(
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


@router.get("/", response_model=list[LabelInstancePublic])
def list_entities(
    response: Response,
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    pagination: Annotated[Pagination, Depends(pagination_params)],
    ids: Annotated[Set[uuid.UUID] | None, Query()] = None,
    group_id: Annotated[int, Query()],
    commit_hash: Annotated[str, Query()],
):
    entities = domain.list_datas(
        current_user=current_user,
        session=session,
        offset=pagination.offset,
        limit=pagination.limit,
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
    set_content_range(
        response,
        "entities",
        pagination=pagination,
        page_length=len(entities),
        total=total_entities,
    )

    return entities


# NOTE: Order matters for path parameters
# Should use label repository API
# @router.post('/bulk', response_model=SuccessResponse)
def bulk_create_entities(
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


# @router.put('/bulk', response_model=SuccessResponse)
# @router.patch('/bulk', response_model=SuccessResponse)
def bulk_update_entities(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    ids: Annotated[list[uuid.UUID], Query()],
    group_id: Annotated[int, Query()],
    commit_hash: Annotated[str, Query()],
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


# Should use label repository API
# @router.delete('/bulk', response_model=SuccessResponse)
def bulk_delete_entities(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    ids: Annotated[list[uuid.UUID], Query()],
    group_id: Annotated[int, Query()],
    commit_hash: Annotated[str, Query()],
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


@router.get("/{id}", response_model=LabelInstancePublic)
def read_entity(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    id: uuid.UUID,
    group_id: Annotated[int, Query()],
    commit_hash: Annotated[str, Query()],
):
    return domain.read_data(
        current_user=current_user,
        session=session,
        id=id,
        group_id=group_id,
        commit_hash=commit_hash,
    )


# Should use label repository API
# @router.put('/{id}', response_model=LabelInstancePublic)
# @router.patch('/{id}', response_model=LabelInstancePublic)
def update_entity(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    id: uuid.UUID,
    group_id: Annotated[int, Query()],
    commit_hash: Annotated[str, Query()],
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


# Should use label repository API
# @router.delete('/{id}', response_model=SuccessResponse)
def delete_entity(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    id: uuid.UUID,
    group_id: Annotated[int, Query()],
    commit_hash: Annotated[str, Query()],
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
