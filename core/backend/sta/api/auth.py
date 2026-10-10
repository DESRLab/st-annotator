import hashlib
import ipaddress
import os
from datetime import timedelta
from http import HTTPStatus
from typing import Annotated, TypeAlias

from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from pydantic import BaseModel
from sqlmodel import Session

from sta.envs import STA_JWT_ACCESS_EXPIRY_SECONDS, STA_TRUSTED_PROXY_IPS

from ..domain import auth as domain, users
from ..models.user import User, UserPublic
from ..session import get_session
from .responses import SuccessResponse

router = APIRouter(
    prefix="/auth",
    tags=["auth"],
    responses={HTTPStatus.NOT_FOUND: {"description": "Not found"}},
)


oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


class OAuth2Token(BaseModel):
    access_token: str
    token_type: str
    expires_in: int
    refresh_token: str


JWT_ACCESS_EXPIRY_MINS = 600
JWT_REFRESH_EXPIRY_MINS = 60000

ProxyNetwork: TypeAlias = ipaddress.IPv4Network | ipaddress.IPv6Network


def _trusted_proxy_networks(raw: str) -> tuple[ProxyNetwork, ...]:
    """Parse `STA_TRUSTED_PROXY_IPS` into the networks allowed to forward addresses.

    Parsing happens once, at startup. A malformed entry raises here so the
    server refuses to boot with an unusable setting rather than failing every
    login from inside the request path, where no exception handler maps
    `RuntimeError` onto the API's JSON error shape.
    """
    networks: list[ProxyNetwork] = []
    for value in raw.split(","):
        value = value.strip()
        if not value:
            continue
        try:
            networks.append(ipaddress.ip_network(value, strict=False))
        except ValueError as exc:
            msg = f"{STA_TRUSTED_PROXY_IPS} must contain IP addresses or CIDR networks"
            raise RuntimeError(msg) from exc

    return tuple(networks)


def trusted_proxy_networks_from_env() -> tuple[ProxyNetwork, ...]:
    """Trusted reverse-proxy networks from `STA_TRUSTED_PROXY_IPS`, empty when unset."""
    return _trusted_proxy_networks(os.environ.get(STA_TRUSTED_PROXY_IPS, ""))


def jwt_access_expiry_seconds_from_env() -> int:
    """Access-token lifetime in seconds from `STA_JWT_ACCESS_EXPIRY_SECONDS`.

    Resolved at startup, allowing short-lived integration tests, so an invalid
    value cannot raise from every login and refresh response.
    """
    configured_seconds = os.environ.get(STA_JWT_ACCESS_EXPIRY_SECONDS)
    if configured_seconds is None:
        return JWT_ACCESS_EXPIRY_MINS * 60

    msg = f"{STA_JWT_ACCESS_EXPIRY_SECONDS} must be a positive integer"
    try:
        seconds = int(configured_seconds)
    except ValueError as exc:
        raise RuntimeError(msg) from exc
    if seconds <= 0:
        raise RuntimeError(msg)

    return seconds


def get_current_user(
    *,
    session: Annotated[Session, Depends(get_session)],
    token: Annotated[str, Depends(oauth2_scheme)],
) -> UserPublic:
    user = domain.verify_user_jwt_token(session, token, grant_type="access")
    return UserPublic.model_validate(user)


def _set_tokens(
    request: Request,
    user: User,
    response: Response,
):
    if user.id is None or user.current_login_at is None:
        raise domain.INVALID_CREDENTIALS

    user_id = user.id
    auth_epoch = user.last_edit_at or user.created_at
    access_expiry = timedelta(seconds=request.app.state.jwt_access_expiry_seconds)
    access_token = domain.create_jwt_token(
        user_id,
        grant_type="access",
        expires_in=access_expiry,
        auth_epoch=auth_epoch,
    )

    refresh_token = domain.create_jwt_token(
        user_id,
        grant_type="refresh",
        expires_in=timedelta(minutes=JWT_REFRESH_EXPIRY_MINS),
        auth_epoch=auth_epoch,
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
        expires_in=int(access_expiry.total_seconds()),
        refresh_token=refresh_token,
    )


def _unset_tokens(
    user_id: int,
    response: Response,
):
    response.delete_cookie(key="refresh_token")


def _client_address(request: Request) -> tuple[str, bool]:
    """
    The address to key login buckets by, and whether it names a shared hop.

    A bucket keyed by an address that many clients share is not a weaker limit
    but a platform-wide lockout: a handful of failed guesses from anywhere would
    return 429 for every other user, including admins. Shared addresses are
    therefore skipped, while the per-account bucket still limits guesses against
    a single username.

    Three cases produce a shared address:

    * the peer is not an IP at all (e.g. `TestClient`'s ``testclient``);
    * the peer is a trusted proxy that sent no usable ``X-Forwarded-For``, so
      everything behind it collapses onto its own address;
    * the peer is untrusted and only privately reachable, which in the shipped
      topology means the SSR frontend rather than a browser.

    A trusted proxy that *does* forward an address yields a per-client address,
    and so does an untrusted public peer, which is the documented
    browsers-connect-directly deployment. Configuration does not opt out of
    shared-hop detection: only being resolved *through* a trusted proxy does.
    """
    peer = request.client.host if request.client is not None else "unknown"
    try:
        peer_ip = ipaddress.ip_address(peer)
    except ValueError:
        return peer, True

    # Forwarding headers are trustworthy only from explicitly configured
    # reverse proxies; accepting them from arbitrary clients lets attackers
    # rotate limiter buckets by spoofing an address. The networks are parsed
    # once by `build_api` so a malformed value cannot raise per request.
    networks = request.app.state.trusted_proxy_networks
    if any(peer_ip in network for network in networks):
        forwarded = request.headers.get("x-forwarded-for", "").split(",", 1)[0].strip()
        try:
            return str(ipaddress.ip_address(forwarded)), False
        except ValueError:
            return peer, True

    return peer, peer_ip.is_loopback or peer_ip.is_link_local or peer_ip.is_private


def _client_bucket_prefix(request: Request) -> tuple[str, bool]:
    """Address component for limiter keys, and whether it is shared by many clients."""
    host, shared = _client_address(request)
    return ("shared" if shared else host), shared


def _password_rate_limit_keys(request: Request, username: str) -> tuple[str | None, str]:
    # The IP bucket bounds password spraying across many usernames. It is absent
    # when the client address cannot be distinguished (see `_client_address`),
    # since a shared bucket would lock the whole platform out of logging in. The
    # narrower bucket separately protects one account without imposing a global
    # lockout on that username from unrelated client addresses; its account
    # component carries the meaning, so it stays valid with a shared prefix.
    prefix, shared = _client_bucket_prefix(request)
    # Hash the normalized account component so a very large attacker-provided
    # username cannot itself consume a correspondingly large key allocation.
    account = hashlib.sha256(username.casefold().encode()).hexdigest()
    return (None if shared else f"login:ip:{prefix}"), f"login:account:{prefix}:{account}"


@router.post("/login")
def login(
    request: Request,
    response: Response,
    *,
    session: Annotated[Session, Depends(get_session)],
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
) -> OAuth2Token:
    limiter = request.app.state.login_rate_limiter
    ip_rate_limit_key, account_rate_limit_key = _password_rate_limit_keys(
        request,
        form_data.username,
    )
    # The address bucket is skipped whenever it would be shared by every client
    # (see `_password_rate_limit_keys`); failing open on it is what stops one
    # attacker from locking the whole platform out of logging in.
    if ip_rate_limit_key is not None:
        limiter.check(ip_rate_limit_key)
    try:
        limiter.check(account_rate_limit_key)
    except HTTPException:
        # The account check did not reach password verification, so undo the
        # IP attempt recorded immediately above. The account bucket remains
        # blocked and continues to protect the targeted username.
        if ip_rate_limit_key is not None:
            limiter.refund(ip_rate_limit_key)
        raise

    user = domain.auth_user(session, username=form_data.username, password=form_data.password)
    # Successful authentication is not a failed guess. Clear this client's
    # account failures and remove only one IP attempt; resetting the entire IP
    # bucket here would erase failures against other usernames.
    limiter.reset(account_rate_limit_key)
    if ip_rate_limit_key is not None:
        limiter.refund(ip_rate_limit_key)

    record = users.login_user(
        current_user=user,
        session=session,
        id=user.id,
    )
    session.commit()
    session.refresh(record)

    return _set_tokens(request, record, response)


@router.post("/refresh")
def refresh(
    request: Request,
    response: Response,
    *,
    session: Annotated[Session, Depends(get_session)],
    refresh_token: Annotated[str, Cookie()],
) -> OAuth2Token:
    user = domain.verify_user_jwt_token(session, refresh_token, grant_type="refresh")
    current_user = UserPublic.model_validate(user)
    user_id = current_user.id

    record = users.login_user(
        current_user=current_user,
        session=session,
        id=user_id,
    )
    session.commit()
    session.refresh(record)

    return _set_tokens(request, record, response)


@router.post("/logout")
def logout(
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
    session.commit()

    _unset_tokens(current_user.id, response)

    return SuccessResponse()


@router.get("/whoami", response_model=UserPublic)
def whoami(current_user: Annotated[UserPublic, Depends(get_current_user)]):
    return current_user


class CheckPasswordData(BaseModel):
    password: str


@router.post("/check_password")
def check_password(
    request: Request,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    data: CheckPasswordData,
):
    prefix, _ = _client_bucket_prefix(request)
    # The user id keeps this bucket per account, so a client address that names
    # a shared hop rather than one browser cannot turn it into a platform-wide
    # lockout the way it would for a bare address bucket.
    rate_limit_key = f"check-password:{prefix}:{current_user.id}"
    request.app.state.login_rate_limiter.check(rate_limit_key)
    domain.auth_user(session, username=current_user.username, password=data.password)
    # Only success reaches this line. Failed guesses remain in the bucket.
    request.app.state.login_rate_limiter.reset(rate_limit_key)
