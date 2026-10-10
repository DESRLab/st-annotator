import asyncio

import pytest

from sta.api.body_limit import RequestBodyLimitMiddleware


async def _run_request(chunks: list[bytes], declared_length: int | None = None):
    received: list[dict] = []
    messages = [
        {
            "type": "http.request",
            "body": chunk,
            "more_body": index < len(chunks) - 1,
        }
        for index, chunk in enumerate(chunks)
    ]

    async def receive():
        return messages.pop(0)

    async def send(message):
        received.append(message)

    async def consume_body(_scope, receive, send):
        while True:
            message = await receive()
            if not message.get("more_body", False):
                break
        await send({"type": "http.response.start", "status": 204, "headers": []})
        await send({"type": "http.response.body", "body": b""})

    headers = []
    if declared_length is not None:
        headers.append((b"content-length", str(declared_length).encode()))
    middleware = RequestBodyLimitMiddleware(consume_body, max_bytes=4)
    await middleware(
        {"type": "http", "method": "POST", "headers": headers},
        receive,
        send,
    )
    return received


@pytest.mark.parametrize("declared_length", [None, 1])
def test_body_limit_rejects_multichunk_body_without_trusting_declared_length(
    declared_length: int | None,
):
    messages = asyncio.run(_run_request([b"abc", b"de"], declared_length))

    assert messages[0]["status"] == 413
    assert b"too large" in messages[1]["body"]
