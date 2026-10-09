import secrets
from datetime import datetime, timedelta
from http import HTTPStatus
from typing import Literal, TypeAlias
from typing_extensions import NotRequired, TypedDict

import jwt
from passlib.context import CryptContext

from fastapi import HTTPException
from pydantic import SecretStr
from sqlmodel import Session, select

from ..models.user import Password, Role, User, UserPublic

pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")

def verify_password(plain_password: Password, hashed_password: str):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: Password):
    return pwd_context.hash(password)


JWT_SECRET_KEY = SecretStr(secrets.token_urlsafe(32))
JWT_ALGORITHM = "HS256"


GrantType: TypeAlias = Literal["access", "refresh"]


class JwtClaims(TypedDict):
    iss: NotRequired[str]
    sub: NotRequired[str]
    aud: NotRequired[str]
    exp: NotRequired[datetime]
    nbf: NotRequired[datetime]
    iat: NotRequired[datetime]
    jwt: NotRequired[str]


def create_jwt_token(
    user_id: int,
    *,
    grant_type: GrantType,
    expires_in: timedelta,
) -> str:
    data_to_encode = JwtClaims(sub=str(user_id)) | {
        "grant_type": grant_type,
        "exp": datetime.now().astimezone() + expires_in,
    }

    tok = jwt.encode(
        data_to_encode,
        JWT_SECRET_KEY.get_secret_value(),
        algorithm=JWT_ALGORITHM,
    )
    if isinstance(tok, bytes):
        tok = tok.decode()

    return tok


def verify_jwt_token(
    token: str,
    *,
    grant_type: GrantType,
) -> int:
    try:
        payload = jwt.decode(
            token,
            JWT_SECRET_KEY.get_secret_value(),
            algorithms=[JWT_ALGORITHM],
        )
    except jwt.InvalidTokenError:
        raise INVALID_CREDENTIALS from None

    user_id = payload.get("sub")
    if user_id is None:
        raise INVALID_CREDENTIALS

    payload_grant_type = payload.get("grant_type")
    if payload_grant_type != grant_type:
        msg = f"Expected {grant_type=} but got {payload_grant_type=}"
        raise RuntimeError(msg)

    return int(user_id)


INVALID_CREDENTIALS = HTTPException(
    status_code=HTTPStatus.UNAUTHORIZED,
    detail="Invalid authentication credentials",
    headers={"WWW-Authenticate": "Bearer"},
)

INVALID_LOGIN = HTTPException(
    status_code=HTTPStatus.BAD_REQUEST,
    detail="Incorrect username or password",
)


def require_role(user: UserPublic, *roles: Role) -> Literal[True]:
    if not user.has_role(*roles):
        raise HTTPException(
            status_code=HTTPStatus.FORBIDDEN,
            detail=f"You need one of the following roles to perform this action: {roles}",
        )

    return True


def get_user(session: Session, *, user_id: int) -> UserPublic | None:
    statement = select(User).where(User.id == user_id)
    user = session.exec(statement).one_or_none()
    if not user:
        return None

    return UserPublic.model_validate(user)


def auth_user(session: Session, *, username: str, password: str) -> UserPublic:
    statement = select(User).where(User.username == username)
    user = session.exec(statement).one_or_none()
    if not user:
        raise INVALID_LOGIN

    if not verify_password(password, user.password_hash):
        raise INVALID_LOGIN

    return UserPublic.model_validate(user)
