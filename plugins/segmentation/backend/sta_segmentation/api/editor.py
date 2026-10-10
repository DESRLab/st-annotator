"""Editor routes that proxy assisted-labeling requests to the model service."""

from __future__ import annotations

import os
import threading
from collections.abc import AsyncGenerator, AsyncIterator
from typing import Annotated
from urllib.parse import urlparse

import httpx

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from starlette.background import BackgroundTask

from sta.api.auth import get_current_user
from sta.envs import STA_ASSISTANT_MAX_REQUEST_BYTES, STA_ASSISTANT_URL
from sta.models.user import UserPublic

router = APIRouter(prefix="/segmentation", tags=["segmentation"])

DEFAULT_ASSISTANT_MAX_REQUEST_BYTES = 256 * 1024 * 1024  # 256 MiB
BINARY_REQUEST_BODY_OPENAPI = {
    "requestBody": {
        "required": True,
        "content": {
            "application/octet-stream": {
                "schema": {"type": "string", "format": "binary"},
            },
        },
    },
}
_assistant_client: httpx.AsyncClient | None = None
_assistant_client_lock = threading.Lock()


class _AssistantPayloadTooLarge(Exception):
    pass


def _assistant_max_request_bytes() -> int:
    raw = os.getenv(STA_ASSISTANT_MAX_REQUEST_BYTES)
    if raw is None:
        return DEFAULT_ASSISTANT_MAX_REQUEST_BYTES
    error_message = "STA_ASSISTANT_MAX_REQUEST_BYTES must be a positive integer"
    try:
        value = int(raw)
    except ValueError as exc:
        raise RuntimeError(error_message) from exc
    if value <= 0:
        raise RuntimeError(error_message)
    return value


def _get_assistant_client() -> httpx.AsyncClient:
    global _assistant_client
    with _assistant_client_lock:
        if _assistant_client is None or _assistant_client.is_closed:
            _assistant_client = httpx.AsyncClient(
                timeout=httpx.Timeout(30.0, connect=5.0),
                limits=httpx.Limits(max_connections=20, max_keepalive_connections=10),
            )
        return _assistant_client


async def _close_assistant_client() -> None:
    global _assistant_client
    with _assistant_client_lock:
        client = _assistant_client
        _assistant_client = None
    if client is not None and not client.is_closed:
        await client.aclose()


async def assistant_client_lifespan(_: object) -> AsyncGenerator[None, None]:
    """Close the shared assistant connection pool during API shutdown."""
    try:
        yield
    finally:
        await _close_assistant_client()


class AssistantHealth(BaseModel):
    """Availability of the assisted-labeling service."""

    is_assistant_available: bool


def _assistant_url() -> str | None:
    """Return the configured, complete HTTP(S) assistant URL, if valid."""
    value = os.getenv(STA_ASSISTANT_URL)
    if value is None or not (value := value.strip()):
        return None

    parsed = urlparse(value)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        return None
    try:
        port = parsed.port
    except ValueError:
        return None
    if port is not None and not 1 <= port <= 65535:
        return None

    return value.rstrip("/")


def get_assistant_headers(
    current_user: UserPublic,
    num_points: int,
    pcd_id: int,
    labels: str | None = None,
) -> dict[str, str]:
    """Build the model request headers without trusting client identity headers."""
    headers = {
        "Content-Type": "application/octet-stream",
        "X-Num-Points": str(num_points),
        "X-Pcd-Id": str(pcd_id),
    }
    if labels is not None:
        headers["X-Labels"] = labels
    # The model associates encoded point clouds with users.  Never accept this
    # value from the browser: it must be the user authenticated by FastAPI.
    headers["X-User-Id"] = str(current_user.id)
    return headers


async def is_assistant_healthy() -> bool:
    """Probe the configured assistant without exposing its URL to clients."""
    assistant_url = _assistant_url()
    if assistant_url is None:
        return False

    try:
        response = await _get_assistant_client().get(
            f"{assistant_url}/health",
            timeout=2.0,
        )
    except httpx.HTTPError:
        return False

    return response.is_success


@router.get("/assistant/health")
async def read_assistant_health(
    _: Annotated[UserPublic, Depends(get_current_user)],
) -> AssistantHealth:
    """Report whether the configured assistant is currently reachable."""
    return AssistantHealth(is_assistant_available=await is_assistant_healthy())


async def _proxy_assistant_request(
    *,
    request: Request,
    headers: dict[str, str],
    method: str,
    endpoint: str,
) -> StreamingResponse:
    assistant_url = _assistant_url()
    if assistant_url is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The labeling assistant is not configured.",
        )

    max_request_bytes = _assistant_max_request_bytes()
    content_length = request.headers.get("content-length")
    if content_length is not None:
        try:
            declared_bytes = int(content_length)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid Content-Length header.") from None
        if declared_bytes < 0:
            raise HTTPException(status_code=400, detail="Invalid Content-Length header.")
        if declared_bytes > max_request_bytes:
            raise HTTPException(status_code=413, detail="Assistant request payload is too large.")

    async def request_body() -> AsyncIterator[bytes]:
        received_bytes = 0
        async for chunk in request.stream():
            received_bytes += len(chunk)
            if received_bytes > max_request_bytes:
                raise _AssistantPayloadTooLarge
            yield chunk

    client = _get_assistant_client()
    upstream_request = client.build_request(
        method,
        f"{assistant_url}/{endpoint}",
        content=request_body(),
        headers=headers,
    )
    try:
        upstream = await client.send(upstream_request, stream=True)
    except _AssistantPayloadTooLarge:
        raise HTTPException(
            status_code=413,
            detail="Assistant request payload is too large.",
        ) from None
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="The labeling assistant could not be reached.",
        ) from exc

    if not upstream.is_success:
        await upstream.aclose()
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="The labeling assistant rejected the request.",
        )

    return StreamingResponse(
        upstream.aiter_raw(),
        status_code=upstream.status_code,
        media_type=upstream.headers.get("content-type"),
        background=BackgroundTask(upstream.aclose),
    )


@router.post("/encode_pcd", openapi_extra=BINARY_REQUEST_BODY_OPENAPI)
async def encode_point_cloud(
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    request: Request,
    num_points: Annotated[int, Header(alias="X-Num-Points")],
    pcd_id: Annotated[int, Header(alias="X-Pcd-Id")],
) -> StreamingResponse:
    return await _proxy_assistant_request(
        request=request,
        headers=get_assistant_headers(current_user, num_points, pcd_id),
        method="POST",
        endpoint="encode_pcd",
    )


@router.post("/predict_mask", openapi_extra=BINARY_REQUEST_BODY_OPENAPI)
async def predict_mask(
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    request: Request,
    num_points: Annotated[int, Header(alias="X-Num-Points")],
    pcd_id: Annotated[int, Header(alias="X-Pcd-Id")],
    labels: Annotated[str, Header(alias="X-Labels")],
) -> StreamingResponse:
    return await _proxy_assistant_request(
        request=request,
        headers=get_assistant_headers(current_user, num_points, pcd_id, labels),
        method="PUT",
        endpoint="predict_mask",
    )
