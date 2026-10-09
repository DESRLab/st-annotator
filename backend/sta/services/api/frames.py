from http import HTTPStatus
from typing import Annotated

from fastapi import APIRouter, Body, Depends, Query, Response
from sqlmodel import Session

from ..domain import frames as domain
from ..models.frame import FrameBulkUpdate, FrameCreate, FramePublicWithParents, FrameUpdate
from ..models.task import WorkType
from ..models.user import UserPublic
from ..session import get_session
from .auth import get_current_user
from .responses import CreatedIDsResponse, SuccessResponse

router = APIRouter(
    prefix='/frames',
    tags=['frames'],
    dependencies=[Depends(get_current_user)],
    responses={HTTPStatus.NOT_FOUND: {"description": "Not found"}},
)


@router.post('/', response_model=FramePublicWithParents)
async def create_frame(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    data: FrameCreate,
):
    record = domain.create_frame(
        current_user=current_user,
        session=session,
        data=data,
    )

    session.commit()
    session.refresh(record)

    return record


@router.get('/', response_model=list[FramePublicWithParents])
async def list_frames(
    response: Response,
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int | None, Query(ge=0)] = None,
    task_id: Annotated[int | None, Query()] = None,
    work_type: Annotated[WorkType | None, Query()] = None,
    source_group_id: Annotated[int | None, Query()] = None,
    label_branch_id: Annotated[int | None, Query()] = None,
):
    frames = domain.list_frames(
        current_user=current_user,
        session=session,
        offset=offset,
        limit=limit,
        task_id=task_id,
        work_type=work_type,
        source_group_id=source_group_id,
        label_branch_id=label_branch_id,
    )

    total_frames = domain.count_frames(
        current_user=current_user,
        session=session,
        task_id=task_id,
        work_type=work_type,
        source_group_id=source_group_id,
        label_branch_id=label_branch_id,
    )
    response.headers.setdefault(
        "Content-Range",
        f"frames {offset}-{offset + len(frames)}/{total_frames}",
    )

    return frames


# NOTE: Order matters for path parameters
@router.post('/bulk', response_model=CreatedIDsResponse)
async def bulk_create_frames(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    data: list[FrameCreate],
):
    ids = domain.bulk_create_frames(
        current_user=current_user,
        session=session,
        data=data,
    )

    session.commit()

    return CreatedIDsResponse(ids=ids)


@router.put('/bulk', response_model=SuccessResponse)
@router.patch('/bulk', response_model=SuccessResponse)
async def bulk_update_frames(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    ids: Annotated[list[int], Body()],
    data: Annotated[FrameBulkUpdate, Body()],
):
    domain.bulk_update_frames(
        current_user=current_user,
        session=session,
        ids=set(ids),
        data=data,
    )

    session.commit()

    return SuccessResponse()


@router.get('/{id}', response_model=FramePublicWithParents)
async def read_frame(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    id: int,
):
    return domain.read_frame(
        current_user=current_user,
        session=session,
        id=id,
    )


@router.put('/{id}', response_model=FramePublicWithParents)
@router.patch('/{id}', response_model=FramePublicWithParents)
async def update_frame(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    id: int,
    data: FrameUpdate,
):
    record = domain.update_frame(
        current_user=current_user,
        session=session,
        id=id,
        data=data,
    )

    session.commit()
    session.refresh(record)

    return record


@router.delete('/{id}', response_model=SuccessResponse)
async def delete_frame(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    id: int,
):
    domain.delete_frame(
        current_user=current_user,
        session=session,
        id=id,
    )

    session.commit()

    return SuccessResponse()
