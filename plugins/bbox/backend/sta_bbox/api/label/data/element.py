import uuid
from collections.abc import Set
from datetime import datetime
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response
from pydantic import AwareDatetime, BaseModel, Field
from sqlalchemy.orm import load_only
from sqlmodel import Session

from sta.api.auth import get_current_user
from sta.api.responses import SuccessResponse, set_content_range
from sta.common.database.execution import sql_column
from sta.common.utils.json import JSONType
from sta.domain.querying import Pagination, pagination_params
from sta.models.user import UserPublic
from sta.session import get_session

from ....domain.label.data import element as domain
from ....models.label.data import (
    LabelBox,
    LabelBoxBulkUpdate,
    LabelBoxCreate,
    LabelBoxUpdate,
)

router = APIRouter(prefix="/element", tags=["element"])


class LabelBoxSummary(BaseModel):
    last_edit_at: AwareDatetime | None = None
    group_id: int
    commit_hash: str
    is_deleted: bool = False
    entity_id: uuid.UUID | None = None
    type: str
    quality_rank: int | None = None
    distinctive_lv: int | None = None
    occlusion_lv: int | None = None
    perceived_class_id: int | None = None
    id: uuid.UUID


class LabelBoxDataManagerPublic(LabelBoxSummary):
    min_x: Decimal | None = None
    min_y: Decimal | None = None
    min_z: Decimal | None = None
    max_x: Decimal | None = None
    max_y: Decimal | None = None
    max_z: Decimal | None = None
    min_timestamp: AwareDatetime | None = None
    max_timestamp: AwareDatetime | None = None
    center_x: Decimal
    center_y: Decimal
    center_z: Decimal
    angle: Decimal
    size_x: Decimal
    size_y: Decimal
    size_z: Decimal
    timestamp: AwareDatetime | None = None
    model_data: dict[str, JSONType] = Field(default_factory=dict)


def _dump_element(element: LabelBox) -> LabelBoxDataManagerPublic:
    return LabelBoxDataManagerPublic(
        **element.model_dump(mode="json", exclude={"commit"}),
    )


def _query_elements(
    *,
    current_user: UserPublic,
    session: Session,
    offset: int = 0,
    limit: int | None = None,
    ids: Set[uuid.UUID] | None = None,
    group_id: int,
    commit_hash: str,
    min_x: float | None = None,
    min_y: float | None = None,
    min_z: float | None = None,
    max_x: float | None = None,
    max_y: float | None = None,
    max_z: float | None = None,
    min_timestamp: datetime | None = None,
    max_timestamp: datetime | None = None,
    entity_id: uuid.UUID | None = None,
):
    return domain.build_list_query(
        current_user,
        session,
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


# Should use label repository API
# @router.post('/', response_model=LabelBoxPublic)
def create_element(
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


@router.get("/", response_model=list[LabelBoxDataManagerPublic])
def list_elements(
    response: Response,
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    pagination: Annotated[Pagination, Depends(pagination_params)],
    ids: Annotated[Set[uuid.UUID] | None, Query()] = None,
    group_id: Annotated[int, Query()],
    commit_hash: Annotated[str, Query()],
    min_x: Annotated[float | None, Query()] = None,
    min_y: Annotated[float | None, Query()] = None,
    min_z: Annotated[float | None, Query()] = None,
    max_x: Annotated[float | None, Query()] = None,
    max_y: Annotated[float | None, Query()] = None,
    max_z: Annotated[float | None, Query()] = None,
    min_timestamp: Annotated[datetime | None, Query()] = None,
    max_timestamp: Annotated[datetime | None, Query()] = None,
    entity_id: Annotated[uuid.UUID | None, Query()] = None,
):
    elements = domain.list_datas(
        current_user=current_user,
        session=session,
        offset=pagination.offset,
        limit=pagination.limit,
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
    set_content_range(
        response,
        "elements",
        pagination=pagination,
        page_length=len(elements),
        total=total_elements,
    )

    return [_dump_element(element) for element in elements]


@router.get("/summary", response_model=list[LabelBoxSummary])
def list_element_summaries(
    response: Response,
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    pagination: Annotated[Pagination, Depends(pagination_params)],
    ids: Annotated[Set[uuid.UUID] | None, Query()] = None,
    group_id: Annotated[int, Query()],
    commit_hash: Annotated[str, Query()],
    min_x: Annotated[float | None, Query()] = None,
    min_y: Annotated[float | None, Query()] = None,
    min_z: Annotated[float | None, Query()] = None,
    max_x: Annotated[float | None, Query()] = None,
    max_y: Annotated[float | None, Query()] = None,
    max_z: Annotated[float | None, Query()] = None,
    min_timestamp: Annotated[datetime | None, Query()] = None,
    max_timestamp: Annotated[datetime | None, Query()] = None,
    entity_id: Annotated[uuid.UUID | None, Query()] = None,
):
    q = (
        _query_elements(
            current_user=current_user,
            session=session,
            offset=pagination.offset,
            limit=pagination.limit,
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
        .options(
            load_only(
                sql_column(LabelBox.last_edit_at),
                sql_column(LabelBox.group_id),
                sql_column(LabelBox.commit_hash),
                sql_column(LabelBox.is_deleted),
                sql_column(LabelBox.entity_id),
                sql_column(LabelBox.type),
                sql_column(LabelBox.quality_rank),
                sql_column(LabelBox.distinctive_lv),
                sql_column(LabelBox.occlusion_lv),
                sql_column(LabelBox.perceived_class_id),
                sql_column(LabelBox.id),
            )
        )
        .where(sql_column(LabelBox.is_deleted).is_(False))
    )
    elements = session.exec(q).all()

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
    set_content_range(
        response,
        "elements",
        pagination=pagination,
        page_length=len(elements),
        total=total_elements,
    )

    return elements


# NOTE: Order matters for path parameters
# Should use label repository API
# @router.post('/bulk', response_model=SuccessResponse)
def bulk_create_elements(
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
def bulk_update_elements(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    ids: list[uuid.UUID],
    group_id: Annotated[int, Query()],
    commit_hash: Annotated[str, Query()],
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
def bulk_delete_elements(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    ids: list[uuid.UUID],
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


@router.get("/{id}", response_model=LabelBoxDataManagerPublic)
def read_element(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    id: uuid.UUID,
    group_id: Annotated[int, Query()],
    commit_hash: Annotated[str, Query()],
):
    element = domain.read_data(
        current_user=current_user,
        session=session,
        id=id,
        group_id=group_id,
        commit_hash=commit_hash,
    )
    return _dump_element(element)


# Should use label repository API
# @router.put('/{id}', response_model=LabelBoxPublic)
# @router.patch('/{id}', response_model=LabelBoxPublic)
def update_element(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    id: uuid.UUID,
    group_id: Annotated[int, Query()],
    commit_hash: Annotated[str, Query()],
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
def delete_element(
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
