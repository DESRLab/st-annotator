"""CORS configuration extension points for API plugins."""

import os
from collections.abc import Iterable

from sta.envs import STA_FRONTEND_URL

DEFAULT_FRONTEND_URL = "http://localhost:5173"
"""Origin allowed when neither --frontend-url nor STA_FRONTEND_URL is set."""


def _single_origin(value: str, source: str) -> str:
    """Strip `value`, rejecting a comma-separated list of origins."""
    origin = value.strip()
    if "," in origin:
        msg = f"{source} accepts a single origin, got: {value!r}"
        raise ValueError(msg)
    return origin


def resolve_frontend_url(explicit: str | None = None) -> str:
    """CORS origin from the explicit flag, else STA_FRONTEND_URL, else the dev default."""
    if explicit:
        return _single_origin(explicit, "--frontend-url")
    env_origin = os.environ.get(STA_FRONTEND_URL)
    if env_origin is not None:
        origin = _single_origin(env_origin, STA_FRONTEND_URL)
        if origin:
            return origin
    return DEFAULT_FRONTEND_URL


DEFAULT_EXPOSED_HEADERS = {
    "Content-Range",
}

EXPOSED_HEADERS = set(DEFAULT_EXPOSED_HEADERS)
"""Response headers that browser clients may read from CORS responses."""


def expose_headers(headers: Iterable[str]) -> None:
    """Allow browser clients to read plugin-defined response headers."""
    EXPOSED_HEADERS.update(headers)


def get_exposed_headers() -> list[str]:
    return sorted(EXPOSED_HEADERS)
