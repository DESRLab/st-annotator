from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response
from sqlmodel import Session

from ....domain.label.repo import branches as domain
from ....models.label.repo import (
    LabelsetBranchCreate,
    LabelsetBranchPublic,
    LabelsetBranchUpdate,
)
from ....models.user import UserPublic
from ....session import get_session
from ...auth import get_current_user
from ...responses import SuccessResponse

router = APIRouter(prefix='/branches', tags=['branches'])


# Should use higher-level API
# @router.post('/', response_model=LabelsetBranchPublic)
async def create_branch(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    data: LabelsetBranchCreate,
):
    record = domain.create_branch(
        current_user=current_user,
        session=session,
        data=data,
    )

    session.commit()
    session.refresh(record)

    return record


@router.get('/', response_model=list[LabelsetBranchPublic])
async def list_branches(
    response: Response,
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int | None, Query(ge=0)] = None,
    group_id: Annotated[int | None, Query()] = None,
):
    branches = domain.list_branches(
        current_user=current_user,
        session=session,
        offset=offset,
        limit=limit,
        group_id=group_id,
    )

    total_branches = domain.count_branches(
        current_user=current_user,
        session=session,
        group_id=group_id,
    )
    response.headers.setdefault(
        "Content-Range",
        f"branches {offset}-{offset + len(branches)}/{total_branches}",
    )

    return branches


@router.get('/{id}', response_model=LabelsetBranchPublic)
async def read_branch(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    id: int,
):
    return domain.read_branch(
        current_user=current_user,
        session=session,
        id=id,
    )


@router.put('/{id}', response_model=LabelsetBranchPublic)
@router.patch('/{id}', response_model=LabelsetBranchPublic)
async def update_branch(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    id: int,
    data: LabelsetBranchUpdate,
):
    record = domain.update_branch(
        current_user=current_user,
        session=session,
        id=id,
        data=data,
    )

    session.commit()
    session.refresh(record)

    return record


@router.delete('/{id}', response_model=SuccessResponse)
async def delete_branch(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    id: int,
):
    domain.delete_branch(
        current_user=current_user,
        session=session,
        id=id,
    )

    session.commit()

    return SuccessResponse()
