from http import HTTPStatus
from typing import Annotated

from fastapi import APIRouter, Body, Depends, Query, Response
from sqlmodel import Session

from ..domain import accounts as domain
from ..domain.querying import Pagination, pagination_params
from ..models.account import (
    AccountBulkUpdate,
    AccountCreate,
    AccountPublic,
    AccountPublicSummary,
    AccountUpdate,
)
from ..models.user import UserPublic
from ..session import get_session
from .auth import get_current_user
from .responses import SuccessResponse, set_content_range

router = APIRouter(
    prefix="/accounts",
    tags=["accounts"],
    dependencies=[Depends(get_current_user)],
    responses={HTTPStatus.NOT_FOUND: {"description": "Not found"}},
)


# Should create the user instead
# @router.post('/', response_model=AccountPublic)
def create_account(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    data: AccountCreate,
):
    record = domain.create_account(
        current_user=current_user,
        session=session,
        data=data,
    )

    session.commit()
    session.refresh(record)

    return record


@router.get("/", response_model=list[AccountPublic])
def list_accounts(
    response: Response,
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    pagination: Annotated[Pagination, Depends(pagination_params)],
    username: Annotated[str | None, Query()] = None,
):
    accounts = domain.list_accounts(
        current_user=current_user,
        session=session,
        offset=pagination.offset,
        limit=pagination.limit,
        username=username,
    )

    total_accounts = domain.count_accounts(
        current_user=current_user,
        session=session,
        username=username,
    )
    set_content_range(
        response,
        "accounts",
        pagination=pagination,
        page_length=len(accounts),
        total=total_accounts,
    )

    return accounts


# NOTE: Order matters for path parameters
@router.put("/bulk", response_model=SuccessResponse)
@router.patch("/bulk", response_model=SuccessResponse)
def bulk_update_accounts(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    ids: Annotated[list[int], Body()],
    data: Annotated[AccountBulkUpdate, Body()],
):
    domain.bulk_update_accounts(
        current_user=current_user,
        session=session,
        ids=set(ids),
        data=data,
    )

    session.commit()

    return SuccessResponse()


@router.get("/{id}", response_model=AccountPublicSummary)
def read_account(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    id: int,
):
    # The summary goes to every caller, the owner included: the profile page
    # that consumes this endpoint renders only the username, the admin grid
    # loads what it edits through the collection endpoint above, and there is no
    # self-service preferences editor. Returning the summary unconditionally is
    # what makes the projection structural rather than dependent on recognizing
    # the caller here.
    return domain.read_account(
        current_user=current_user,
        session=session,
        id=id,
    )


@router.put("/{id}", response_model=AccountPublic)
@router.patch("/{id}", response_model=AccountPublic)
def update_account(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    id: int,
    data: AccountUpdate,
):
    record = domain.update_account(
        current_user=current_user,
        session=session,
        id=id,
        data=data,
    )

    session.commit()
    session.refresh(record)

    return record


# Should delete the user instead
# @router.delete('/{id}', response_model=SuccessResponse)
def delete_account(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    id: int,
):
    domain.delete_account(
        current_user=current_user,
        session=session,
        id=id,
    )

    session.commit()

    return SuccessResponse()
