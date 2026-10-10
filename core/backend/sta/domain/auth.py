import os
from datetime import datetime, timedelta
from http import HTTPStatus
from pathlib import Path
from typing import Literal, TypeAlias
from typing_extensions import NotRequired, TypedDict

import jwt
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.serialization import (
    Encoding,
    NoEncryption,
    PrivateFormat,
    PublicFormat,
    load_pem_private_key,
)
from passlib.context import CryptContext

from fastapi import HTTPException
from sqlmodel import Session, select

from sta.common.utils.env_path import anchored_path
from sta.envs import STA_JWT_PRIVATE_KEY_PATH

from ..models.user import Password, Role, User, UserPublic

pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")

# Keep the nonexistent-user authentication path computationally comparable to
# a real password check so usernames cannot be enumerated through hash timing.
DUMMY_PASSWORD_HASH = pwd_context.hash("st-annotator-invalid-login-sentinel")


def verify_password(plain_password: Password, hashed_password: str):
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: Password):
    return pwd_context.hash(password)


_KeySource: TypeAlias = tuple[str, Path | None]
"""Label of where the key came from (for error messages) and the file to read it from."""

# The source is the whole cache key: re-pointing the option or the environment loads the
# new key on the next use, while editing a file in place does not, because a token carries
# no `kid` and so exactly one key per process can verify - rotating a key means restarting
# the server.
_cached_keypair: tuple[_KeySource, str, str] | None = None

_signing_key_override: str | None = None


def configure_signing_key(path: str | None) -> None:
    """Name the key file an explicit command-line option takes over the environment.

    Parameters
    ----------
    path
        Private key PEM path, or None to leave `STA_JWT_PRIVATE_KEY_PATH` in charge.
    """
    global _signing_key_override

    _signing_key_override = path.strip() if path and path.strip() else None


def _key_source() -> _KeySource:
    """Where the signing key comes from: an explicit option, the environment, or neither.

    The label appears in startup errors, so it never contains key material. A None path
    means no key was configured, for which an ephemeral keypair is generated. Each source
    resolves as its own author expects: the environment variable against the `.env` that
    declares it, as `FILESYSTEM_ROOT` does, and the command-line option against the
    working directory, as any shell argument does.
    """
    if _signing_key_override is not None:
        return "--jwt-private-key", Path(_signing_key_override)

    configured = os.environ.get(STA_JWT_PRIVATE_KEY_PATH, "").strip()
    if configured:
        return f"${STA_JWT_PRIVATE_KEY_PATH}", anchored_path(configured)

    return "", None


def _generate_ephemeral_pem() -> str:
    """Fresh in-memory P-256 key: tokens die with the process that minted them."""
    private_key = ec.generate_private_key(ec.SECP256R1())

    return private_key.private_bytes(
        encoding=Encoding.PEM,
        format=PrivateFormat.PKCS8,
        encryption_algorithm=NoEncryption(),
    ).decode("ascii")


def _public_pem(private_pem: str, source: str) -> str:
    """Derive the verification half of a signing key.

    Only the public half reaches `verify_jwt_token`, so a leaked verification key
    cannot mint tokens - which is what keeps the frontend's session cookie secret
    in a separate trust domain from this key.
    """
    try:
        private_key = load_pem_private_key(private_pem.encode("ascii"), password=None)
    except (TypeError, ValueError) as exc:
        # `TypeError` is an encrypted key, `ValueError` unparseable content; neither
        # message is echoed, since both can carry key material.
        msg = f"{source} must hold an unencrypted private key PEM: {type(exc).__name__}"
        raise RuntimeError(msg) from exc

    if not isinstance(private_key, ec.EllipticCurvePrivateKey) or not isinstance(
        private_key.curve, ec.SECP256R1
    ):
        msg = f"{source} must hold an EC private key on curve P-256, as `ES256` requires"
        raise RuntimeError(msg)

    return (
        private_key.public_key()
        .public_bytes(
            encoding=Encoding.PEM,
            format=PublicFormat.SubjectPublicKeyInfo,
        )
        .decode("ascii")
    )


def _resolve_keypair() -> tuple[str, str]:
    """Signing and verification PEMs, loaded once per resolved key source."""
    global _cached_keypair

    source = _key_source()
    if _cached_keypair is not None and _cached_keypair[0] == source:
        return _cached_keypair[1], _cached_keypair[2]

    label, path = source
    if path is None:
        private_pem = _generate_ephemeral_pem()
    else:
        try:
            private_pem = path.read_text(encoding="utf-8")
        except OSError as exc:
            msg = f"{label} could not be read: {exc.strerror or type(exc).__name__} ({path})"
            raise RuntimeError(msg) from exc

    verification_pem = _public_pem(private_pem, label or "the ephemeral signing key")
    _cached_keypair = source, private_pem, verification_pem

    return private_pem, verification_pem


def require_configured_signing_key() -> None:
    """Reject production startup without a usable, stable token-signing key.

    The key is resolved here, so a missing file, an encrypted PEM, or a non-P-256
    key stops startup instead of failing the first login attempt. Resolution goes
    through the same path `signing_key()` takes, so the guard cannot pass while
    tokens are being signed with the ephemeral fallback keypair.
    """
    if _key_source()[1] is None:
        msg = (
            f"{STA_JWT_PRIVATE_KEY_PATH} (or `sta serve --jwt-private-key`) must name a readable "
            "P-256 private key PEM when serving outside explicit testing mode. Create one with "
            "`openssl ecparam -name prime256v1 -genkey -noout -out <jwt_path>`."
        )
        raise RuntimeError(msg)

    _resolve_keypair()


def signing_key() -> str:
    """The private key PEM tokens are signed with, resolved when a token is created.

    Resolution deliberately happens at use time and never at import time:
    `sta serve` imports this module through the API package well before
    `AppConfigArgs.as_config()` loads the process `.env`, so a key captured at
    import would ignore a key configured only there - minting a fresh keypair on
    every restart, invalidating all sessions, and preventing two processes from
    verifying each other's tokens.
    """
    return _resolve_keypair()[0]


def verification_key() -> str:
    """The public key PEM tokens are verified with, derived from `signing_key()`."""
    return _resolve_keypair()[1]


JWT_ALGORITHM = "ES256"


GrantType: TypeAlias = Literal["access", "refresh"]


class JwtClaims(TypedDict):
    iss: NotRequired[str]
    sub: NotRequired[str]
    aud: NotRequired[str]
    exp: NotRequired[datetime]
    nbf: NotRequired[datetime]
    iat: NotRequired[datetime]
    jwt: NotRequired[str]
    auth_epoch: NotRequired[str]


def create_jwt_token(
    user_id: int,
    *,
    grant_type: GrantType,
    expires_in: timedelta,
    auth_epoch: datetime | None = None,
) -> str:
    data_to_encode = JwtClaims(sub=str(user_id)) | {
        "grant_type": grant_type,
        "exp": datetime.now().astimezone() + expires_in,
    }
    if auth_epoch is not None:
        data_to_encode["auth_epoch"] = auth_epoch.isoformat()

    return jwt.encode(
        data_to_encode,
        signing_key(),
        algorithm=JWT_ALGORITHM,
    )


def verify_jwt_token(
    token: str,
    *,
    grant_type: GrantType,
) -> int:
    try:
        payload = jwt.decode(
            token,
            verification_key(),
            algorithms=[JWT_ALGORITHM],
        )
    except jwt.InvalidTokenError:
        raise INVALID_CREDENTIALS from None

    user_id = payload.get("sub")
    payload_grant_type = payload.get("grant_type")
    if user_id is None or payload_grant_type != grant_type:
        raise INVALID_CREDENTIALS

    try:
        return int(user_id)
    except (TypeError, ValueError):
        raise INVALID_CREDENTIALS from None


def verify_user_jwt_token(
    session: Session,
    token: str,
    *,
    grant_type: GrantType,
) -> User:
    """Verify a JWT and ensure it belongs to the user's active login epoch."""
    user_id = verify_jwt_token(token, grant_type=grant_type)
    user = session.get(User, user_id)
    if user is None or user.current_login_at is None:
        raise INVALID_CREDENTIALS

    try:
        payload = jwt.decode(
            token,
            verification_key(),
            algorithms=[JWT_ALGORITHM],
        )
        token_epoch = datetime.fromisoformat(payload["auth_epoch"])
    except (jwt.InvalidTokenError, KeyError, TypeError, ValueError):
        raise INVALID_CREDENTIALS from None

    auth_epoch = user.last_edit_at or user.created_at
    if token_epoch != auth_epoch:
        raise INVALID_CREDENTIALS

    return user


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
        verify_password(password, DUMMY_PASSWORD_HASH)
        raise INVALID_LOGIN

    if not verify_password(password, user.password_hash):
        raise INVALID_LOGIN

    return UserPublic.model_validate(user)
