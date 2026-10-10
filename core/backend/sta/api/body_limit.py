import os
from http import HTTPStatus

from starlette.types import ASGIApp, Message, Receive, Scope, Send

from sta.envs import STA_MAX_REQUEST_BYTES

DEFAULT_MAX_REQUEST_BYTES = 256 * 1024 * 1024  # 256 MiB


def max_request_bytes_from_env() -> int:
    raw = os.getenv(STA_MAX_REQUEST_BYTES)
    if raw is None:
        return DEFAULT_MAX_REQUEST_BYTES

    message = f"{STA_MAX_REQUEST_BYTES} must be a positive integer"
    try:
        value = int(raw)
    except ValueError:
        raise ValueError(message) from None
    if value <= 0:
        raise ValueError(message)
    return value


class RequestBodyLimitMiddleware:
    """Reject oversized HTTP bodies before endpoint model validation begins."""

    def __init__(self, app: ASGIApp, *, max_bytes: int) -> None:
        super().__init__()
        self.app = app
        self.max_bytes = max_bytes

    async def _reject(self, send: Send, status: HTTPStatus, detail: str) -> None:
        body = ('{"detail":"' + detail + '"}').encode()
        await send(
            {
                "type": "http.response.start",
                "status": status.value,
                "headers": [
                    (b"content-type", b"application/json"),
                    (b"content-length", str(len(body)).encode()),
                ],
            }
        )
        await send({"type": "http.response.body", "body": body})

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        headers = dict(scope.get("headers", ()))
        raw_content_length = headers.get(b"content-length")
        if raw_content_length is not None:
            try:
                content_length = int(raw_content_length)
            except ValueError:
                await self._reject(send, HTTPStatus.BAD_REQUEST, "Invalid Content-Length header.")
                return
            if content_length < 0:
                await self._reject(send, HTTPStatus.BAD_REQUEST, "Invalid Content-Length header.")
                return
            if content_length > self.max_bytes:
                await self._reject(
                    send, HTTPStatus.REQUEST_ENTITY_TOO_LARGE, "Request body is too large."
                )
                return

        received = 0

        async def limited_receive() -> Message:
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > self.max_bytes:
                    raise _RequestTooLarge
            return message

        try:
            await self.app(scope, limited_receive, send)
        except _RequestTooLarge:
            await self._reject(
                send, HTTPStatus.REQUEST_ENTITY_TOO_LARGE, "Request body is too large."
            )


class _RequestTooLarge(Exception):
    pass
