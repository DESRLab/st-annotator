"""Structural coverage gates for the authorization inventory."""

from __future__ import annotations

import re
from collections.abc import Iterator
from pathlib import Path

from fastapi.routing import APIRoute
from fastapi.testclient import TestClient

import pytest

from sta.api.root import build_api
from sta.config import AppConfig
from sta.plugin import load_plugins

REPO_ROOT = Path(__file__).resolve().parents[2]
BACKEND_MANIFEST = Path(__file__).with_name("authorization_routes.tsv")
FRONTEND_MANIFEST = Path(__file__).with_name("frontend_authorization_routes.tsv")
CLASSIFICATIONS = {"protected", "public"}
PATH_VALUE = re.compile(r"\{[^}]+\}")


def _read_manifest(path: Path, *, columns: int) -> list[tuple[str, ...]]:
    rows = [
        tuple(line.replace("\\t", "\t").split("\t"))
        for line in path.read_text(encoding="utf-8").splitlines()
        if line and not line.startswith("#")
    ]
    assert rows
    assert all(len(row) == columns for row in rows)
    assert all(row[0] in CLASSIFICATIONS for row in rows)
    assert len(rows) == len(set(rows))
    return rows


@pytest.fixture
def composed_client(plugin_import_app_config: AppConfig) -> Iterator[TestClient]:
    """Yield the application with every shipped backend plugin registered."""
    del plugin_import_app_config
    load_plugins()
    with TestClient(build_api(frontend_url="http://localhost:5174")) as client:
        yield client


def test_every_composed_backend_operation_has_an_explicit_classification():
    """Match the full core-plus-plugin FastAPI operation set to the manifest."""
    load_plugins()
    app = build_api(frontend_url="http://localhost:5174")
    registered = {
        f"{method} {route.path}"
        for route in app.routes
        if isinstance(route, APIRoute)
        for method in route.methods - {"HEAD", "OPTIONS"}
    }
    classified = {operation for _, operation in _read_manifest(BACKEND_MANIFEST, columns=2)}

    assert classified == registered


def test_every_classified_protected_operation_rejects_anonymous_requests(
    composed_client: TestClient,
):
    """Exercise the manifest's protected label at the composed HTTP boundary."""
    protected = [
        operation
        for classification, operation in _read_manifest(BACKEND_MANIFEST, columns=2)
        if classification == "protected"
    ]

    failures = []
    for operation in protected:
        method, path = operation.split(" ", 1)
        response = composed_client.request(method, PATH_VALUE.sub("1", path))
        if response.status_code != 401:
            failures.append((operation, response.status_code, response.text))

    assert failures == []


def test_every_shipped_plugin_frontend_route_has_an_explicit_classification():
    """Match plugin route contributions to their classified public URL patterns."""
    rows = _read_manifest(FRONTEND_MANIFEST, columns=3)
    classified = {(url, module) for _, url, module in rows if ":" in module}
    discovered = set()

    for routes_file in sorted((REPO_ROOT / "plugins").glob("*/frontend/app/routes.ts")):
        plugin = routes_file.parents[2].name
        source = routes_file.read_text(encoding="utf-8")
        discovered_before = len(discovered)
        sections = (("source", "data"), ("source", "specs"), ("label", "data"), ("label", "specs"))
        for area, section in sections:
            marker = f"{area}: {{"
            section_marker = f"{section}: ["
            if marker not in source or section_marker not in source:
                continue
            block = source.split(section_marker, 1)[1].split("]", 1)[0]
            path = block.split('path: "', 1)[1].split('"', 1)[0]
            module = block.split('routeModule("./', 1)[1].split('"', 1)[0]
            discovered.add((f"/{area}/{section}/{path}", f"{plugin}:{module}"))

        # The parser intentionally supports one contribution per section. This
        # assertion makes a second declaration fail closed instead of silently
        # leaving the new route outside the manifest.
        assert source.count('path: "') == len(discovered) - discovered_before

    assert classified == discovered
