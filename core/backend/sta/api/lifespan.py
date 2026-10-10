from __future__ import annotations

from collections.abc import AsyncGenerator, Callable
from contextlib import AsyncExitStack, asynccontextmanager

from fastapi import FastAPI

LifespanHandler = Callable[[FastAPI], AsyncGenerator[None, None]]

_handlers: list[LifespanHandler] = []


def register_lifespan_handler(handler: LifespanHandler) -> None:
    """Register a plugin resource context to enter for each API lifespan."""
    if handler not in _handlers:
        _handlers.append(handler)


@asynccontextmanager
async def api_lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    async with AsyncExitStack() as stack:
        for handler in _handlers:
            await stack.enter_async_context(asynccontextmanager(handler)(app))
        yield
