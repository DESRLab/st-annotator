from http import HTTPStatus
from typing import Annotated

from fastapi import APIRouter, Body, Depends, Query, Response
from sqlmodel import Session

from ..domain import tasks as domain
from ..models.task import TaskBulkUpdate, TaskCreate, TaskPublicWithParents, TaskUpdate
from ..models.user import UserPublic
from ..session import get_session
from .auth import get_current_user
from .responses import SuccessResponse

router = APIRouter(
    prefix='/tasks',
    tags=['tasks'],
    dependencies=[Depends(get_current_user)],
    responses={HTTPStatus.NOT_FOUND: {"description": "Not found"}},
)


@router.post('/', response_model=TaskPublicWithParents)
async def create_task(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    data: TaskCreate,
):
    record = domain.create_task(
        current_user=current_user,
        session=session,
        data=data,
    )

    session.commit()
    session.refresh(record)

    return record


@router.get('/', response_model=list[TaskPublicWithParents])
async def list_tasks(
    response: Response,
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int | None, Query(ge=0)] = None,
    project_id: Annotated[int | None, Query()] = None,
    name: Annotated[str | None, Query()] = None,
):
    tasks = domain.list_tasks(
        current_user=current_user,
        session=session,
        offset=offset,
        limit=limit,
        project_id=project_id,
        name=name,
    )

    total_tasks = domain.count_tasks(
        current_user=current_user,
        session=session,
        project_id=project_id,
        name=name,
    )
    response.headers.setdefault(
        "Content-Range",
        f"tasks {offset}-{offset + len(tasks)}/{total_tasks}",
    )

    return tasks


# NOTE: Order matters for path parameters
@router.put('/bulk', response_model=SuccessResponse)
@router.patch('/bulk', response_model=SuccessResponse)
async def bulk_update_tasks(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    ids: Annotated[list[int], Body()],
    data: Annotated[TaskBulkUpdate, Body()],
):
    domain.bulk_update_tasks(
        current_user=current_user,
        session=session,
        ids=set(ids),
        data=data,
    )

    session.commit()

    return SuccessResponse()


@router.get('/{id}', response_model=TaskPublicWithParents)
async def read_task(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    id: int,
):
    return domain.read_task(
        current_user=current_user,
        session=session,
        id=id,
    )


@router.put('/{id}', response_model=TaskPublicWithParents)
@router.patch('/{id}', response_model=TaskPublicWithParents)
async def update_task(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    id: int,
    data: TaskUpdate,
):
    record = domain.update_task(
        current_user=current_user,
        session=session,
        id=id,
        data=data,
    )

    session.commit()
    session.refresh(record)

    return record


@router.delete('/{id}', response_model=SuccessResponse)
async def delete_task(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    id: int,
):
    domain.delete_task(
        current_user=current_user,
        session=session,
        id=id,
    )

    session.commit()

    return SuccessResponse()
