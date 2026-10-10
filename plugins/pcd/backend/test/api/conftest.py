"""Shared fixtures for exercising the pcd API routers with an authenticated TestClient."""

from __future__ import annotations

from collections.abc import Iterator

from fastapi import FastAPI
from fastapi.testclient import TestClient

import pytest

from sta.api.root import build_api
from sta.config import AppConfig
from sta.filesystem import filesystem_ctx
from sta.testing.config import TestApp

from ..register_plugin import register_pcd_once

FRONTEND_URL = "http://localhost:5174"


@pytest.fixture(scope="session")
def api() -> FastAPI:
    # The pcd routes are attached to the (module-level) core routers by register(); build the
    # app only once so those routers are not included repeatedly.
    register_pcd_once()
    return build_api(frontend_url=FRONTEND_URL)


@pytest.fixture
def client(api: FastAPI) -> Iterator[TestClient]:
    with TestClient(api) as client:
        yield client


@pytest.fixture
def auth_headers(client: TestClient, test_app: TestApp) -> dict[str, str]:
    del test_app  # Ensures the app/DB context is active before logging in.

    response = client.post("/auth/login", data={"username": "admin", "password": "admin"})
    assert response.status_code == 200, response.text

    return {"Authorization": f"Bearer {response.json()['access_token']}"}


@pytest.fixture
def tmp_fs(plugin_import_app_config: AppConfig) -> Iterator[None]:
    """Activates a filesystem context rooted at the test's tmp directory.

    Shares the test database (only the fs root differs from ``test_app_config``), so
    file-backed API calls read/write temp files instead of the plugin's data directory.
    """
    with filesystem_ctx(plugin_import_app_config):
        yield
