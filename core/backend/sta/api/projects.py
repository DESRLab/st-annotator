from http import HTTPStatus
from typing import Annotated

from fastapi import APIRouter, Body, Depends, Query, Response
from sqlmodel import Session

from ..domain import projects as domain
from ..domain.querying import Pagination, Sorting, pagination_params, sorting_params
from ..models.project import ProjectBulkUpdate, ProjectCreate, ProjectPublic, ProjectUpdate
from ..models.user import UserPublic
from ..session import get_session
from .auth import get_current_user
from .responses import SuccessResponse, set_content_range

router = APIRouter(
    prefix="/projects",
    tags=["projects"],
    dependencies=[Depends(get_current_user)],
    responses={HTTPStatus.NOT_FOUND: {"description": "Not found"}},
)


@router.post("/", response_model=ProjectPublic)
def create_project(
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


@router.get("/", response_model=list[ProjectPublic])
def list_projects(
    response: Response,
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    pagination: Annotated[Pagination, Depends(pagination_params)],
    sorting: Annotated[Sorting, Depends(sorting_params)],
    id: Annotated[int | None, Query()] = None,
    id_ge: Annotated[int | None, Query()] = None,
    id_le: Annotated[int | None, Query()] = None,
    name: Annotated[str | None, Query()] = None,
    name_contains: Annotated[str | None, Query()] = None,
    description_contains: Annotated[str | None, Query()] = None,
    member_id: Annotated[list[int] | None, Query()] = None,
):
    projects = domain.list_projects(
        current_user=current_user,
        session=session,
        offset=pagination.offset,
        limit=pagination.limit,
        id=id,
        id_ge=id_ge,
        id_le=id_le,
        name=name,
        name_contains=name_contains,
        description_contains=description_contains,
        member_ids=member_id,
        sort_by=sorting.sort_by,
        sort_dir=sorting.sort_dir,
    )

    total_projects = domain.count_projects(
        current_user=current_user,
        session=session,
        id=id,
        id_ge=id_ge,
        id_le=id_le,
        name=name,
        name_contains=name_contains,
        description_contains=description_contains,
        member_ids=member_id,
    )
    set_content_range(
        response,
        "projects",
        pagination=pagination,
        page_length=len(projects),
        total=total_projects,
    )

    return projects


@router.get("/ids", response_model=list[int])
def list_project_ids(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    id: Annotated[int | None, Query()] = None,
    id_ge: Annotated[int | None, Query()] = None,
    id_le: Annotated[int | None, Query()] = None,
    name: Annotated[str | None, Query()] = None,
    name_contains: Annotated[str | None, Query()] = None,
    description_contains: Annotated[str | None, Query()] = None,
    member_id: Annotated[list[int] | None, Query()] = None,
):
    return domain.list_project_ids(
        current_user=current_user,
        session=session,
        id=id,
        id_ge=id_ge,
        id_le=id_le,
        name=name,
        name_contains=name_contains,
        description_contains=description_contains,
        member_ids=member_id,
    )


# NOTE: Order matters for path parameters
@router.put("/bulk", response_model=SuccessResponse)
@router.patch("/bulk", response_model=SuccessResponse)
def bulk_update_projects(
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


@router.get("/{id}", response_model=ProjectPublic)
def read_project(
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


@router.put("/{id}", response_model=ProjectPublic)
@router.patch("/{id}", response_model=ProjectPublic)
def update_project(
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


@router.delete("/{id}", response_model=SuccessResponse)
def delete_project(
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
