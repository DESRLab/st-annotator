import ipaddress
import sqlite3

from fastapi.testclient import TestClient
from sqlalchemy import UniqueConstraint
from sqlalchemy.exc import IntegrityError

import pytest

from sta.api import cors
from sta.api.auth import JWT_ACCESS_EXPIRY_MINS
from sta.api.body_limit import DEFAULT_MAX_REQUEST_BYTES, max_request_bytes_from_env
from sta.api.root import _find_table_constraint, build_api, parse_integrity_violation
from sta.envs import STA_JWT_ACCESS_EXPIRY_SECONDS, STA_MAX_REQUEST_BYTES, STA_TRUSTED_PROXY_IPS
from sta.models.source.data.base import SourceMetadataSQLModel


def test_find_table_constraint_matches_postgresql_default_unique_name():
    table_cls = SourceMetadataSQLModel.get_table_cls("test_pcd_constraint_lookup")
    table = table_cls.__table__

    constraint = _find_table_constraint(
        table,
        "test_pcd_constraint_lookup_uri_group_id_key",
    )

    assert isinstance(constraint, UniqueConstraint)
    assert list(constraint.columns.keys()) == ["uri", "group_id"]


def test_parse_integrity_violation_is_total_for_unknown_and_malformed_errors():
    unknown_driver = IntegrityError("statement", {}, RuntimeError("driver failure"))
    malformed_sqlite = IntegrityError("statement", {}, sqlite3.IntegrityError())

    assert parse_integrity_violation(unknown_driver) is None
    assert parse_integrity_violation(malformed_sqlite) is None


def test_parse_integrity_violation_does_not_expose_sqlite_schema_names():
    unique = IntegrityError(
        "statement",
        {},
        sqlite3.IntegrityError(
            "UNIQUE constraint failed: object_class_selection_label_group.group_id"
        ),
    )
    foreign_key = IntegrityError(
        "statement",
        {},
        sqlite3.IntegrityError("FOREIGN KEY constraint failed"),
    )

    assert parse_integrity_violation(unique) == "A duplicate item already exists"
    assert parse_integrity_violation(foreign_key) == "A referenced item does not exist"


def test_build_api_uses_frontend_url_for_cors():
    client = TestClient(build_api(frontend_url="http://localhost:5174"))

    allowed_response = client.options(
        "/",
        headers={
            "Origin": "http://localhost:5174",
            "Access-Control-Request-Method": "GET",
        },
    )

    assert allowed_response.status_code == 200
    assert allowed_response.headers.get("access-control-allow-origin") == "http://localhost:5174"

    simple_response = client.get(
        "/",
        headers={"Origin": "http://localhost:5174"},
        follow_redirects=False,
    )
    exposed_headers = simple_response.headers.get("access-control-expose-headers", "")
    assert "Content-Range" in exposed_headers

    blocked_response = client.options(
        "/",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
        },
    )

    assert blocked_response.status_code == 400
    assert "access-control-allow-origin" not in blocked_response.headers


def test_request_body_limit_defaults_and_validates_env(monkeypatch):
    monkeypatch.delenv(STA_MAX_REQUEST_BYTES, raising=False)
    assert max_request_bytes_from_env() == DEFAULT_MAX_REQUEST_BYTES

    monkeypatch.setenv(STA_MAX_REQUEST_BYTES, "1024")
    assert max_request_bytes_from_env() == 1024

    for invalid in ("0", "-1", "nope"):
        monkeypatch.setenv(STA_MAX_REQUEST_BYTES, invalid)
        with pytest.raises(ValueError, match="positive integer"):
            max_request_bytes_from_env()


def test_build_api_resolves_trusted_proxy_ips_once(monkeypatch):
    monkeypatch.setenv(STA_TRUSTED_PROXY_IPS, "10.0.0.0/24, 192.168.1.5")
    app = build_api(frontend_url="http://localhost:5174")

    assert app.state.trusted_proxy_networks == (
        ipaddress.ip_network("10.0.0.0/24"),
        ipaddress.ip_network("192.168.1.5"),
    )

    monkeypatch.delenv(STA_TRUSTED_PROXY_IPS, raising=False)
    assert build_api(frontend_url="http://localhost:5174").state.trusted_proxy_networks == ()


def test_build_api_rejects_malformed_trusted_proxy_ips(monkeypatch):
    # The setting is only read at startup, so an operator typo aborts boot with a
    # configuration error instead of raising from inside every login.
    monkeypatch.setenv(STA_TRUSTED_PROXY_IPS, "10.0.0.0/24, 10.0.1.0/33")

    with pytest.raises(RuntimeError, match="STA_TRUSTED_PROXY_IPS"):
        build_api(frontend_url="http://localhost:5174")


def test_build_api_resolves_and_validates_jwt_access_expiry(monkeypatch):
    monkeypatch.delenv(STA_JWT_ACCESS_EXPIRY_SECONDS, raising=False)
    default = build_api(frontend_url="http://localhost:5174")
    assert default.state.jwt_access_expiry_seconds == JWT_ACCESS_EXPIRY_MINS * 60

    monkeypatch.setenv(STA_JWT_ACCESS_EXPIRY_SECONDS, "2")
    short = build_api(frontend_url="http://localhost:5174")
    assert short.state.jwt_access_expiry_seconds == 2

    for invalid in ("0", "-1", "nope"):
        monkeypatch.setenv(STA_JWT_ACCESS_EXPIRY_SECONDS, invalid)
        with pytest.raises(RuntimeError, match="STA_JWT_ACCESS_EXPIRY_SECONDS"):
            build_api(frontend_url="http://localhost:5174")


def test_build_api_rejects_request_bodies_over_configured_limit(monkeypatch):
    monkeypatch.setenv(STA_MAX_REQUEST_BYTES, "3")
    client = TestClient(build_api(frontend_url="http://localhost:5174"))

    assert client.post("/", content=b"123").status_code == 405
    response = client.post("/", content=b"1234")
    assert response.status_code == 413
    assert response.json() == {"detail": "Request body is too large."}


def test_build_api_uses_plugin_exposed_headers_for_cors(monkeypatch):
    monkeypatch.setattr(cors, "EXPOSED_HEADERS", set(cors.DEFAULT_EXPOSED_HEADERS))
    cors.expose_headers(("X-Plugin-Header",))

    client = TestClient(build_api(frontend_url="http://localhost:5174"))

    response = client.get(
        "/",
        headers={"Origin": "http://localhost:5174"},
        follow_redirects=False,
    )

    exposed_headers = response.headers.get("access-control-expose-headers", "")
    assert "Content-Range" in exposed_headers
    assert "X-Plugin-Header" in exposed_headers
