from http import HTTPStatus
from typing import Annotated

from fastapi import APIRouter, Body, Depends, Query, Response
from sqlmodel import Session

from ..domain import projects as domain
from ..models.project import ProjectBulkUpdate, ProjectCreate, ProjectPublic, ProjectUpdate
from ..models.user import UserPublic
from ..session import get_session
from .auth import get_current_user
from .responses import SuccessResponse

router = APIRouter(
    prefix='/projects',
    tags=['projects'],
    dependencies=[Depends(get_current_user)],
    responses={HTTPStatus.NOT_FOUND: {"description": "Not found"}},
)


@router.post('/', response_model=ProjectPublic)
async def create_project(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    data: ProjectCreate,
):
    record = domain.create_project(
        current_user=current_user,
        session=session,
        data=data,
    )

    session.commit()
    session.refresh(record)

    return record


@router.get('/', response_model=list[ProjectPublic])
async def list_projects(
    response: Response,
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int | None, Query(ge=0)] = None,
    name: Annotated[str | None, Query()] = None,
):
    projects = domain.list_projects(
        current_user=current_user,
        session=session,
        offset=offset,
        limit=limit,
        name=name,
    )

    total_projects = domain.count_projects(
        current_user=current_user,
        session=session,
        name=name,
    )
    response.headers.setdefault(
        "Content-Range",
        f"projects {offset}-{offset + len(projects)}/{total_projects}",
    )

    return projects


# NOTE: Order matters for path parameters
@router.put('/bulk', response_model=SuccessResponse)
@router.patch('/bulk', response_model=SuccessResponse)
async def bulk_update_projects(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    ids: Annotated[list[int], Body()],
    data: Annotated[ProjectBulkUpdate, Body()],
):
    domain.bulk_update_projects(
        current_user=current_user,
        session=session,
        ids=set(ids),
        data=data,
    )

    session.commit()

    return SuccessResponse()


@router.get('/{id}', response_model=ProjectPublic)
async def read_project(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    id: int,
):
    return domain.read_project(
        current_user=current_user,
        session=session,
        id=id,
    )


@router.put('/{id}', response_model=ProjectPublic)
@router.patch('/{id}', response_model=ProjectPublic)
async def update_project(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    id: int,
    data: ProjectUpdate,
):
    record = domain.update_project(
        current_user=current_user,
        session=session,
        id=id,
        data=data,
    )

    session.commit()
    session.refresh(record)

    return record


@router.delete('/{id}', response_model=SuccessResponse)
async def delete_project(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    id: int,
):
    domain.delete_project(
        current_user=current_user,
        session=session,
        id=id,
    )

    session.commit()

    return SuccessResponse()
