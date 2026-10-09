from datetime import timedelta
from http import HTTPStatus
from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, Response
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from pydantic import BaseModel
from sqlmodel import Session

from ..domain import auth as domain, users
from ..models.user import UserPublic
from ..session import get_session
from .responses import SuccessResponse

router = APIRouter(
    prefix='/auth',
    tags=['auth'],
    responses={HTTPStatus.NOT_FOUND: {"description": "Not found"}},
)


oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


class OAuth2Token(BaseModel):
    access_token: str
    token_type: str
    expires_in: int


JWT_ACCESS_EXPIRY_MINS = 600
JWT_REFRESH_EXPIRY_MINS = 60000


def get_current_user(
    *,
    session: Annotated[Session, Depends(get_session)],
    token: Annotated[str, Depends(oauth2_scheme)],
) -> UserPublic:
    user_id = domain.verify_jwt_token(token, grant_type="access")

    user = domain.get_user(session, user_id=user_id)
    if user is None:
        raise domain.INVALID_CREDENTIALS

    return user


def _set_tokens(
    user_id: int,
    response: Response,
):
    access_token = domain.create_jwt_token(
        user_id,
        grant_type="access",
        expires_in=timedelta(minutes=JWT_ACCESS_EXPIRY_MINS),
    )

    refresh_token = domain.create_jwt_token(
        user_id,
        grant_type="refresh",
        expires_in=timedelta(minutes=JWT_REFRESH_EXPIRY_MINS),
    )
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=True,
        samesite="lax",
        max_age=JWT_REFRESH_EXPIRY_MINS * 60,
    )

    return OAuth2Token(
        access_token=access_token,
        token_type="bearer",
        expires_in=JWT_ACCESS_EXPIRY_MINS * 60,
    )


def _unset_tokens(
    user_id: int,
    response: Response,
):
    response.delete_cookie(key="refresh_token")


@router.post("/login")
async def login(
    response: Response,
    *,
    session: Annotated[Session, Depends(get_session)],
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
) -> OAuth2Token:
    user = domain.auth_user(session, username=form_data.username, password=form_data.password)

    users.login_user(
        current_user=user,
        session=session,
        id=user.id,
    )

    return _set_tokens(user.id, response)


@router.post("/refresh")
async def refresh(
    response: Response,
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    refresh_token: Annotated[str, Cookie()],
) -> OAuth2Token:
    domain.verify_jwt_token(refresh_token, grant_type="refresh")

    users.login_user(
        current_user=current_user,
        session=session,
        id=current_user.id,
    )

    return _set_tokens(current_user.id, response)


@router.post("/logout")
async def logout(
    response: Response,
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
) -> SuccessResponse:
    users.logout_user(
        current_user=current_user,
        session=session,
        id=current_user.id,
    )

    _unset_tokens(current_user.id, response)

    return SuccessResponse()


@router.get("/whoami", response_model=UserPublic)
async def whoami(current_user: Annotated[UserPublic, Depends(get_current_user)]):
    return current_user


class CheckPasswordData(BaseModel):
    password: str


@router.post("/check_password")
async def check_password(
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    data: CheckPasswordData,
):
    domain.auth_user(session, username=current_user.username, password=data.password)
