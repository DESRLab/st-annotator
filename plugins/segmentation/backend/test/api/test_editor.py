import asyncio
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock

import httpx

from fastapi import HTTPException, Response
from fastapi.testclient import TestClient
from starlette.requests import Request

import pytest

from sta.api.auth import get_current_user
from sta.api.root import build_api
from sta.models.user import Role, UserPublic
from sta.testing.config import TestApp
from sta_segmentation.api import editor
from sta_segmentation.api.editor import (
    DEFAULT_ASSISTANT_MAX_REQUEST_BYTES,
    _assistant_max_request_bytes,
    _assistant_url,
    get_assistant_headers,
)


def _request(body: bytes, *, declared_length: int | None = None) -> Request:
    sent = False

    async def receive():
        nonlocal sent
        if sent:
            return {"type": "http.request", "body": b"", "more_body": False}
        sent = True
        return {"type": "http.request", "body": body, "more_body": False}

    headers = []
    if declared_length is not None:
        headers.append((b"content-length", str(declared_length).encode()))
    return Request({"type": "http", "method": "POST", "headers": headers}, receive)


def _user() -> UserPublic:
    return UserPublic(
        id=42,
        username="annotator",
        password_hash="not-used-by-this-test",
        roles={Role.ANNOTATOR},
    )


@asynccontextmanager
async def _mock_assistant_client(
    monkeypatch,
    handler: Callable[
        [httpx.Request],
        httpx.Response | Awaitable[httpx.Response],
    ],
) -> AsyncIterator[httpx.AsyncClient]:
    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    monkeypatch.setattr(editor, "_assistant_client", client)
    async with asynccontextmanager(editor.assistant_client_lifespan)(object()):
        yield client


def test_assistant_url_requires_a_full_url(monkeypatch):
    monkeypatch.setenv("STA_ASSISTANT_URL", "9000")

    assert _assistant_url() is None


def test_assistant_url_preserves_a_full_url_with_port(monkeypatch):
    monkeypatch.setenv("STA_ASSISTANT_URL", "http://127.0.0.1:9000/")

    assert _assistant_url() == "http://127.0.0.1:9000"


def test_assistant_request_limit_has_a_bounded_default(monkeypatch):
    monkeypatch.delenv("STA_ASSISTANT_MAX_REQUEST_BYTES", raising=False)

    assert _assistant_max_request_bytes() == DEFAULT_ASSISTANT_MAX_REQUEST_BYTES


def test_assistant_request_limit_can_be_configured(monkeypatch):
    monkeypatch.setenv("STA_ASSISTANT_MAX_REQUEST_BYTES", "1024")

    assert _assistant_max_request_bytes() == 1024


def test_assistant_proxy_rejects_declared_oversized_payload(monkeypatch):
    monkeypatch.setenv("STA_ASSISTANT_URL", "http://assistant.test")
    monkeypatch.setenv("STA_ASSISTANT_MAX_REQUEST_BYTES", "3")

    async def proxy():
        return await editor._proxy_assistant_request(
            request=_request(b"data", declared_length=4),
            headers={},
            method="POST",
            endpoint="encode_pcd",
        )

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(proxy())
    assert exc_info.value.status_code == 413


def test_assistant_proxy_rejects_streamed_oversized_payload(monkeypatch):
    monkeypatch.setenv("STA_ASSISTANT_URL", "http://assistant.test")
    monkeypatch.setenv("STA_ASSISTANT_MAX_REQUEST_BYTES", "3")

    async def handler(request: httpx.Request):
        await request.aread()
        return httpx.Response(200)

    async def proxy():
        async with _mock_assistant_client(monkeypatch, handler):
            return await editor._proxy_assistant_request(
                request=_request(b"data"),
                headers={},
                method="POST",
                endpoint="encode_pcd",
            )

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(proxy())
    assert exc_info.value.status_code == 413


def test_assistant_proxy_streams_request_and_response(monkeypatch):
    monkeypatch.setenv("STA_ASSISTANT_URL", "http://assistant.test")
    monkeypatch.setenv("STA_ASSISTANT_MAX_REQUEST_BYTES", "16")
    received = []

    class PredictionStream(httpx.AsyncByteStream):
        async def __aiter__(self):
            yield b"prediction"

    async def handler(request: httpx.Request):
        received.append(await request.aread())
        return httpx.Response(200, stream=PredictionStream())

    async def proxy():
        async with _mock_assistant_client(monkeypatch, handler):
            response = await editor._proxy_assistant_request(
                request=_request(b"points"),
                headers={"Content-Type": "application/octet-stream"},
                method="POST",
                endpoint="encode_pcd",
            )
            body = b"".join([chunk async for chunk in response.body_iterator])
            if response.background is not None:
                await response.background()
            return body

    assert asyncio.run(proxy()) == b"prediction"
    assert received == [b"points"]


def test_assistant_lifespan_closes_shared_client(monkeypatch):
    async def run_lifespan():
        async with _mock_assistant_client(
            monkeypatch,
            lambda _: httpx.Response(200),
        ) as client:
            assert not client.is_closed
        return client

    client = asyncio.run(run_lifespan())
    assert client.is_closed
    assert editor._assistant_client is None


def test_assistant_headers_forward_point_cloud_id_and_use_authenticated_user():
    headers = get_assistant_headers(
        _user(),
        num_points=10,
        pcd_id=99,
        labels="1,0",
    )

    assert headers == {
        "Content-Type": "application/octet-stream",
        "X-Num-Points": "10",
        "X-Pcd-Id": "99",
        "X-Labels": "1,0",
        "X-User-Id": "42",
    }


@pytest.mark.parametrize(
    ("method", "path", "headers"),
    [
        ("GET", "/editor/segmentation/assistant/health", {}),
        (
            "POST",
            "/editor/segmentation/encode_pcd",
            {"X-Num-Points": "10", "X-Pcd-Id": "99"},
        ),
        (
            "POST",
            "/editor/segmentation/predict_mask",
            {"X-Num-Points": "10", "X-Pcd-Id": "99", "X-Labels": "1,0"},
        ),
    ],
)
def test_assistant_public_routes_require_authentication(
    test_app: TestApp,
    method: str,
    path: str,
    headers: dict[str, str],
):
    del test_app
    with TestClient(build_api(frontend_url="http://localhost:5174")) as client:
        response = client.request(method, path, headers=headers, content=b"points")

    assert response.status_code == 401


def test_assistant_health_public_route_uses_authenticated_probe(
    monkeypatch,
    test_app: TestApp,
):
    app = build_api(frontend_url="http://localhost:5174")
    app.dependency_overrides[get_current_user] = lambda: test_app.root_user
    probe = AsyncMock(return_value=True)
    monkeypatch.setattr(editor, "is_assistant_healthy", probe)

    with TestClient(app) as client:
        response = client.get("/editor/segmentation/assistant/health")

    assert response.status_code == 200
    assert response.json() == {"is_assistant_available": True}
    probe.assert_awaited_once_with()


@pytest.mark.parametrize(
    ("path", "expected_method", "expected_endpoint", "request_headers", "upstream_headers"),
    [
        (
            "/editor/segmentation/encode_pcd",
            "POST",
            "encode_pcd",
            {"X-Num-Points": "10", "X-Pcd-Id": "99"},
            {
                "Content-Type": "application/octet-stream",
                "X-Num-Points": "10",
                "X-Pcd-Id": "99",
                "X-User-Id": "42",
            },
        ),
        (
            "/editor/segmentation/predict_mask",
            "PUT",
            "predict_mask",
            {"X-Num-Points": "10", "X-Pcd-Id": "99", "X-Labels": "1,0"},
            {
                "Content-Type": "application/octet-stream",
                "X-Num-Points": "10",
                "X-Pcd-Id": "99",
                "X-Labels": "1,0",
                "X-User-Id": "42",
            },
        ),
    ],
)
def test_assistant_public_routes_forward_method_and_authenticated_headers(
    monkeypatch,
    test_app: TestApp,
    path: str,
    expected_method: str,
    expected_endpoint: str,
    request_headers: dict[str, str],
    upstream_headers: dict[str, str],
):
    app = build_api(frontend_url="http://localhost:5174")
    app.dependency_overrides[get_current_user] = lambda: _user()
    proxy = AsyncMock(return_value=Response(content=b"result"))
    monkeypatch.setattr(editor, "_proxy_assistant_request", proxy)

    with TestClient(app) as client:
        response = client.post(path, headers=request_headers, content=b"points")

    assert response.status_code == 200
    assert response.content == b"result"
    proxy.assert_awaited_once()
    call = proxy.await_args.kwargs
    assert call["method"] == expected_method
    assert call["endpoint"] == expected_endpoint
    assert call["headers"] == upstream_headers
    assert call["request"].scope["path"] == path
