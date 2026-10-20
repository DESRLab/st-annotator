"""Read-only relation snapshots; writes go through labelset operations."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response
from sqlmodel import Session

from sta.api.auth import get_current_user
from sta.api.responses import set_content_range
from sta.domain.querying import Pagination, pagination_params
from sta.models.user import UserPublic
from sta.session import get_session

from ..domain.data import domain
from ..models.data import RelationPublic

router = APIRouter(prefix="/relation", tags=["relation"])


@router.get("/", response_model=list[RelationPublic])
def list_relations(
    response: Response,
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    pagination: Annotated[Pagination, Depends(pagination_params)],
    group_id: int,
    commit_hash: str,
    ids: Annotated[list[uuid.UUID] | None, Query()] = None,
):
    records = domain.list_datas(
        current_user=current_user,
        session=session,
        group_id=group_id,
        commit_hash=commit_hash,
        ids=None if ids is None else set(ids),
        offset=pagination.offset,
        limit=pagination.limit,
    )
    total = domain.count_datas(
        current_user=current_user,
        session=session,
        group_id=group_id,
        commit_hash=commit_hash,
        ids=None if ids is None else set(ids),
    )
    set_content_range(
        response, "relations", pagination=pagination, page_length=len(records), total=total
    )
    return records
