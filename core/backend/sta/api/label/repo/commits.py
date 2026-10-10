from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response
from sqlmodel import Session

from ....domain.label.repo import commits as domain
from ....domain.querying import Pagination, pagination_params
from ....models.label.repo import LabelsetCommitPublic
from ....models.user import UserPublic
from ....session import get_session
from ...auth import get_current_user
from ...responses import set_content_range

router = APIRouter(prefix="/commits", tags=["commits"])


@router.get("/", response_model=list[LabelsetCommitPublic])
def list_commits(
    response: Response,
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    pagination: Annotated[Pagination, Depends(pagination_params)],
    group_id: Annotated[int | None, Query()] = None,
):
    commits = domain.list_commits(
        current_user=current_user,
        session=session,
        offset=pagination.offset,
        limit=pagination.limit,
        group_id=group_id,
    )

    total_commits = domain.count_commits(
        current_user=current_user,
        session=session,
        group_id=group_id,
    )
    set_content_range(
        response,
        "commits",
        pagination=pagination,
        page_length=len(commits),
        total=total_commits,
    )

    return commits


@router.get("/{group_id}/{commit_hash}", response_model=LabelsetCommitPublic)
def read_commit(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    group_id: int,
    commit_hash: str,
):
    return domain.read_commit(
        current_user=current_user,
        session=session,
        group_id=group_id,
        commit_hash=commit_hash,
    )
