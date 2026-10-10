from __future__ import annotations

import json
import subprocess
import sys
import uuid as stdlib_uuid
from contextlib import contextmanager
from pathlib import Path
from types import SimpleNamespace

from click.testing import CliRunner

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import ValidationError

import pytest

from sta.cli import cli as sta_cli, serve as serve_module
from sta.cli.serve import HTTPArgs, HTTPSArgs, _parse_http_or_https_args
from sta.common.database import PostgresDatabaseConfig
from sta.common.filesystem import FilesystemConfig
from sta.testing.keys import generate_signing_key_pem

# `sta.cli.serve.serve_command` is a plain callback; it only becomes a click command when
# the CLI group in `sta.cli` is assembled, so invoke the command as registered there.
serve_command = sta_cli.commands["serve"]

HTTP_ARGS_MESSAGE = "The input string should be in the form `<host>:<port>`."
HTTPS_ARGS_MESSAGE = (
    "The input string should be in the form `<host>:<port>,<cert_file>,<pkey_file>`."
)

PG_FACTORY_PATH = f"{__name__}:pg_config_factory"
FS_FACTORY_PATH = f"{__name__}:fs_config_factory"

_pg_config_database: str | None = None
_fs_config_root: Path | None = None
_pg_configs: list[PostgresDatabaseConfig] = []


@pytest.fixture(autouse=True)
def configured_signing_key(isolated_signing_key, tmp_path, monkeypatch):
    """A real ES256 key for the production-mode startup guard.

    Requested after the suite-wide `isolated_signing_key` fixture, so the environment is
    the only key source these tests can reach: `--jwt-private-key` outranks it, and
    `CliRunner` records that option in a process global this interpreter shares.
    """
    key_path = tmp_path / "jwt-signing.key"
    key_path.write_text(generate_signing_key_pem())
    monkeypatch.setenv("STA_JWT_PRIVATE_KEY_PATH", str(key_path))


def pg_config_factory() -> PostgresDatabaseConfig:
    """A zero-argument factory for a Postgres config named by the test; never connects."""
    assert _pg_config_database is not None
    config = PostgresDatabaseConfig(
        host="localhost",
        port=5432,
        database=_pg_config_database,
        user="sta",
        password="sta",
    )
    _pg_configs.append(config)

    return config


def fs_config_factory() -> FilesystemConfig:
    """A zero-argument factory resolving to a filesystem config rooted at a test-controlled path."""
    assert _fs_config_root is not None
    return FilesystemConfig(root=_fs_config_root)


def test_help():
    assert subprocess.call(["python", "-m", "sta", "serve", "--help"]) == 0
    assert subprocess.call(["sta", "serve", "--help"]) == 0


@pytest.fixture
def fs_root(tmp_path, monkeypatch) -> Path:
    root = tmp_path / "fs-root"
    root.mkdir()
    monkeypatch.setattr(sys.modules[__name__], "_fs_config_root", root)
    return root


@pytest.fixture
def database_name(monkeypatch) -> str:
    name = f"sta_serve_test_{stdlib_uuid.uuid4().hex[:8]}"
    monkeypatch.setattr(sys.modules[__name__], "_pg_config_database", name)
    monkeypatch.setattr(sys.modules[__name__], "_pg_configs", [])
    return name


def write_config_file(tmp_path: Path) -> Path:
    path = tmp_path / "app-config.json"
    path.write_text(json.dumps({"db": PG_FACTORY_PATH, "fs": FS_FACTORY_PATH}))
    return path


@pytest.fixture
def serve_stubs(monkeypatch) -> SimpleNamespace:
    """Replace uvicorn and both app contexts with recording, server-less equivalents."""
    stubs = SimpleNamespace(
        uvicorn=SimpleNamespace(configs=[], servers=[], serve_calls=0), prod=[], testing=[]
    )

    class Config:
        def __init__(self, app, **kwargs):
            self.app = app
            self.kwargs = kwargs
            self.load_calls = 0
            stubs.uvicorn.configs.append(self)

        def load(self):
            self.load_calls += 1

    class Server:
        def __init__(self, config):
            self.config = config
            stubs.uvicorn.servers.append(self)

        async def serve(self):
            stubs.uvicorn.serve_calls += 1

    @contextmanager
    def fake_app_ctx(config, *, debug=False):
        stubs.prod.append((config, debug))
        yield

    @contextmanager
    def fake_test_app_ctx(config, *, debug=False):
        stubs.testing.append((config, debug))
        yield

    monkeypatch.setattr(serve_module, "uvicorn", SimpleNamespace(Config=Config, Server=Server))
    monkeypatch.setattr(serve_module, "app_ctx", fake_app_ctx)
    monkeypatch.setattr(serve_module, "test_app_ctx", fake_test_app_ctx)
    return stubs


def cors_allow_origins(app: FastAPI) -> list[str]:
    # The application may have unrelated global middleware, such as the request-body
    # limiter. Locate CORS by type so this assertion remains scoped to serve's URL setup.
    middleware = next(item for item in app.user_middleware if item.cls is CORSMiddleware)
    return middleware.kwargs["allow_origins"]


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("localhost:8000", ("localhost", 8000)),
        ("0.0.0.0:0", ("0.0.0.0", 0)),
        ("my-host:65535", ("my-host", 65535)),
    ],
    ids=["localhost", "min-port", "max-port"],
)
def test_http_args_parse_str(raw: str, expected: tuple[str, int]):
    args = HTTPArgs.parse_str(raw)

    assert (args.host, args.port) == expected


@pytest.mark.parametrize(
    "raw",
    ["missing-port", "a:b:c", ""],
    ids=["no-colon", "too-many-parts", "empty"],
)
def test_http_args_parse_str_rejects_malformed_input(raw: str):
    with pytest.raises(ValueError, match="The input string should be in the form"):
        HTTPArgs.parse_str(raw)


@pytest.mark.parametrize(
    "port",
    ["-1", "70000", "not-a-port"],
    ids=["negative", "above-range", "non-numeric"],
)
def test_http_args_parse_str_rejects_invalid_port(port: str):
    with pytest.raises(ValidationError):
        HTTPArgs.parse_str(f"localhost:{port}")


@pytest.mark.parametrize(
    "raw",
    [
        "localhost:8000,cert.pem",
        "localhost:8000,cert.pem,key.pem,extra",
        "no-port,cert.pem,key.pem",
    ],
    ids=["missing-key", "too-many-parts", "socket-without-port"],
)
def test_https_args_parse_str_rejects_malformed_input(raw: str):
    with pytest.raises(ValueError, match="The input string should be in the form"):
        HTTPSArgs.parse_str(raw)


def test_https_args_parse_str_valid_input():
    args = HTTPSArgs.parse_str("localhost:8443,cert.pem,key.pem")

    assert args.host == "localhost"
    assert args.port == 8443
    assert args.ssl_certfile == "cert.pem"
    assert args.ssl_keyfile == "key.pem"


def test_parse_http_or_https_args_requires_one():
    with pytest.raises(ValueError, match="Must specify one of"):
        _parse_http_or_https_args(http=None, https=None)


def test_parse_http_or_https_args_rejects_both():
    with pytest.raises(ValueError, match="Can only specify one of"):
        _parse_http_or_https_args(http="localhost:8000", https="localhost:8443,cert.pem,key.pem")


def test_parse_http_or_https_args_dispatches_http():
    args = _parse_http_or_https_args(http="localhost:9000", https=None)

    assert isinstance(args, HTTPArgs)
    assert (args.host, args.port) == ("localhost", 9000)


def test_parse_http_or_https_args_dispatches_https():
    args = _parse_http_or_https_args(http=None, https="localhost:8443,cert.pem,key.pem")

    assert isinstance(args, HTTPSArgs)
    assert (args.host, args.port) == ("localhost", 8443)


def test_serve_http_uses_prod_context_and_uvicorn_config(
    tmp_path,
    fs_root,
    database_name,
    serve_stubs,
    monkeypatch,
):
    monkeypatch.delenv("STA_FRONTEND_URL", raising=False)
    config_path = write_config_file(tmp_path)

    result = CliRunner().invoke(
        serve_command,
        [
            "-c",
            str(config_path),
            "--http",
            "0.0.0.0:8080",
            "--frontend-url",
            "http://frontend.example.com",
        ],
    )

    assert result.exit_code == 0, result.output
    assert serve_stubs.testing == []
    ((config, debug),) = serve_stubs.prod
    assert debug is False
    assert config.db_config.database == database_name
    assert config.fs_config.root == fs_root

    (uvicorn_config,) = serve_stubs.uvicorn.configs
    assert uvicorn_config.kwargs == {
        "host": "0.0.0.0",
        "port": 8080,
        "limit_concurrency": None,
        "timeout_keep_alive": 5,
    }
    assert uvicorn_config.load_calls == 1
    assert isinstance(uvicorn_config.app, FastAPI)
    assert cors_allow_origins(uvicorn_config.app) == ["http://frontend.example.com"]

    (server,) = serve_stubs.uvicorn.servers
    assert server.config is uvicorn_config
    assert serve_stubs.uvicorn.serve_calls == 1


def test_serve_refuses_a_missing_filesystem_root(
    tmp_path,
    database_name,
    serve_stubs,
    monkeypatch,
):
    missing_root = tmp_path / "missing-fs-root"
    monkeypatch.setattr(sys.modules[__name__], "_fs_config_root", missing_root)

    result = CliRunner().invoke(
        serve_command,
        ["-c", str(write_config_file(tmp_path)), "--http", "127.0.0.1:8080"],
    )

    assert result.exit_code != 0
    assert "FILESYSTEM_ROOT does not exist" in str(result.exception)
    assert serve_stubs.uvicorn.configs == []


def test_serve_production_requires_a_configured_signing_key(
    tmp_path,
    fs_root,
    database_name,
    serve_stubs,
    monkeypatch,
):
    monkeypatch.delenv("STA_JWT_PRIVATE_KEY_PATH", raising=False)
    config_path = write_config_file(tmp_path)

    result = CliRunner().invoke(
        serve_command,
        [
            "-c",
            str(config_path),
            "--http",
            "localhost:8080",
        ],
    )

    assert result.exit_code != 0
    assert isinstance(result.exception, RuntimeError)
    assert "STA_JWT_PRIVATE_KEY_PATH" in str(result.exception)
    assert serve_stubs.prod == []
    assert serve_stubs.uvicorn.configs == []


def test_serve_production_rejects_the_session_cookie_secret(
    tmp_path,
    fs_root,
    database_name,
    serve_stubs,
    monkeypatch,
):
    # `STA_SESSION_SECRET` signs the frontend's session cookie. It used to be accepted
    # here as a fallback, which let one secret mint API tokens as well as sessions; a
    # deployment relying on that must now be told to configure a key.
    monkeypatch.delenv("STA_JWT_PRIVATE_KEY_PATH", raising=False)
    monkeypatch.setenv("STA_SESSION_SECRET", "cookie-signing-secret")
    config_path = write_config_file(tmp_path)

    result = CliRunner().invoke(
        serve_command,
        ["-c", str(config_path), "--http", "localhost:8080"],
    )

    assert result.exit_code != 0
    assert isinstance(result.exception, RuntimeError)
    assert "STA_JWT_PRIVATE_KEY_PATH" in str(result.exception)
    assert serve_stubs.prod == []


def test_serve_jwt_private_key_option_replaces_the_environment(
    tmp_path,
    fs_root,
    database_name,
    serve_stubs,
    monkeypatch,
):
    key_path = tmp_path / "option.key"
    key_path.write_text(generate_signing_key_pem())
    monkeypatch.setenv("STA_JWT_PRIVATE_KEY_PATH", str(tmp_path / "unused-by-precedence"))
    config_path = write_config_file(tmp_path)

    result = CliRunner().invoke(
        serve_command,
        [
            "-c",
            str(config_path),
            "--http",
            "localhost:8080",
            "--jwt-private-key",
            str(key_path),
        ],
    )

    assert result.exit_code == 0, result.output
    assert len(serve_stubs.prod) == 1


def test_serve_rejects_a_missing_jwt_private_key_file(
    tmp_path, fs_root, database_name, serve_stubs
):
    config_path = write_config_file(tmp_path)

    result = CliRunner().invoke(
        serve_command,
        [
            "-c",
            str(config_path),
            "--http",
            "localhost:8080",
            "--jwt-private-key",
            str(tmp_path / "absent.key"),
        ],
    )

    assert result.exit_code == 2
    assert "--jwt-private-key" in result.output
    assert serve_stubs.prod == []
    assert serve_stubs.uvicorn.configs == []


def test_serve_production_rejects_an_unusable_key_file(
    tmp_path,
    fs_root,
    database_name,
    serve_stubs,
    monkeypatch,
):
    # Fail at startup rather than on the first login attempt.
    key_path = tmp_path / "not-a-key.key"
    key_path.write_text("-----BEGIN OPENSSH PRIVATE KEY-----\n")
    monkeypatch.delenv("STA_JWT_PRIVATE_KEY_PATH", raising=False)
    config_path = write_config_file(tmp_path)

    result = CliRunner().invoke(
        serve_command,
        [
            "-c",
            str(config_path),
            "--http",
            "localhost:8080",
            "--jwt-private-key",
            str(key_path),
        ],
    )

    assert result.exit_code != 0
    assert isinstance(result.exception, RuntimeError)
    assert "private key PEM" in str(result.exception)
    assert serve_stubs.prod == []


def test_debug_does_not_bypass_production_startup_checks(
    tmp_path, fs_root, database_name, serve_stubs, monkeypatch
):
    monkeypatch.delenv("STA_JWT_PRIVATE_KEY_PATH", raising=False)
    config_path = write_config_file(tmp_path)

    result = CliRunner().invoke(
        serve_command,
        ["-c", str(config_path), "--http", "localhost:8080", "--debug"],
    )

    assert result.exit_code != 0
    assert isinstance(result.exception, RuntimeError)
    assert serve_stubs.prod == []
    assert serve_stubs.uvicorn.configs == []


def test_serve_testing_appends_suffix_and_uses_test_context(
    tmp_path,
    fs_root,
    database_name,
    serve_stubs,
):
    config_path = write_config_file(tmp_path)

    result = CliRunner().invoke(
        serve_command,
        [
            "-c",
            str(config_path),
            "--http",
            "localhost:5000",
            "--testing",
            "--debug",
        ],
    )

    assert result.exit_code == 0, result.output
    assert serve_stubs.prod == []
    ((config, debug),) = serve_stubs.testing
    assert debug is True
    assert config.db_config.database == f"{database_name}_test"

    # The suffixed config is a new instance; the source config is not mutated.
    (source_config,) = _pg_configs
    assert config.db_config is not source_config
    assert source_config.database == database_name

    (uvicorn_config,) = serve_stubs.uvicorn.configs
    assert uvicorn_config.kwargs == {
        "host": "localhost",
        "port": 5000,
        "limit_concurrency": None,
        "timeout_keep_alive": 5,
    }
    assert serve_stubs.uvicorn.serve_calls == 1


def test_serve_testing_announces_the_database_it_drops(
    tmp_path, fs_root, database_name, serve_stubs
):
    config_path = write_config_file(tmp_path)

    result = CliRunner().invoke(
        serve_command,
        [
            "-c",
            str(config_path),
            "--http",
            "localhost:5000",
            "--testing",
        ],
    )

    assert result.exit_code == 0, result.output
    # Entering the test context drops and recreates the suffixed database,
    # terminating other live connections, so the exact name must be announced.
    assert f"{database_name}_test" in result.output
    assert "dropping and recreating" in result.output


def test_serve_testing_help_names_its_actual_mechanism():
    option = next(param for param in serve_command.params if param.name == "testing")

    assert option.help is not None
    assert option.help.startswith("Development only:")
    assert "drop and recreate" in option.help
    assert "_test" in option.help
    # The database is persistent, not temporary.
    assert "temporary" not in option.help

    # The command hosts either mode, so its summary must not claim production.
    assert serve_command.help is not None
    assert "production server" not in serve_command.help
    assert "development-only" in serve_command.help


def test_serve_warns_about_unconfigured_trusted_proxies_in_production(
    tmp_path, fs_root, database_name, serve_stubs, monkeypatch
):
    monkeypatch.delenv("STA_TRUSTED_PROXY_IPS", raising=False)
    config_path = write_config_file(tmp_path)

    result = CliRunner().invoke(
        serve_command,
        [
            "-c",
            str(config_path),
            "--http",
            "localhost:8080",
        ],
    )

    assert result.exit_code == 0, result.output
    assert "STA_TRUSTED_PROXY_IPS is not set" in result.output

    # The shared-bucket outage cannot happen in the development modes, whose
    # generated per-process key also makes this an unsuitable moment to warn.
    monkeypatch.setenv("STA_TRUSTED_PROXY_IPS", "10.0.0.4")
    configured = CliRunner().invoke(
        serve_command,
        [
            "-c",
            str(config_path),
            "--http",
            "localhost:8080",
        ],
    )
    assert configured.exit_code == 0, configured.output
    assert "STA_TRUSTED_PROXY_IPS is not set" not in configured.output

    development = CliRunner().invoke(
        serve_command,
        [
            "-c",
            str(config_path),
            "--http",
            "localhost:8080",
            "--testing",
        ],
    )
    assert development.exit_code == 0, development.output
    assert "STA_TRUSTED_PROXY_IPS is not set" not in development.output


def test_serve_frontend_url_defaults_without_flag_or_env(
    tmp_path,
    fs_root,
    database_name,
    serve_stubs,
    monkeypatch,
):
    monkeypatch.delenv("STA_FRONTEND_URL", raising=False)
    config_path = write_config_file(tmp_path)

    result = CliRunner().invoke(serve_command, ["-c", str(config_path), "--http", "localhost:8080"])

    assert result.exit_code == 0, result.output
    (uvicorn_config,) = serve_stubs.uvicorn.configs
    assert cors_allow_origins(uvicorn_config.app) == ["http://localhost:5173"]


def test_serve_frontend_url_reads_env_var(
    tmp_path,
    fs_root,
    database_name,
    serve_stubs,
    monkeypatch,
):
    monkeypatch.setenv("STA_FRONTEND_URL", "http://env.example.com")
    config_path = write_config_file(tmp_path)

    result = CliRunner().invoke(serve_command, ["-c", str(config_path), "--http", "localhost:8080"])

    assert result.exit_code == 0, result.output
    (uvicorn_config,) = serve_stubs.uvicorn.configs
    assert cors_allow_origins(uvicorn_config.app) == ["http://env.example.com"]


def test_serve_requires_http_or_https(tmp_path, fs_root, database_name, serve_stubs):
    config_path = write_config_file(tmp_path)

    result = CliRunner().invoke(serve_command, ["-c", str(config_path)])

    assert result.exit_code == 2
    assert "Must specify one of" in result.output
    assert serve_stubs.prod == []
    assert serve_stubs.testing == []
    assert serve_stubs.uvicorn.configs == []


def test_serve_rejects_http_and_https_together(tmp_path, fs_root, database_name, serve_stubs):
    config_path = write_config_file(tmp_path)

    result = CliRunner().invoke(
        serve_command,
        [
            "-c",
            str(config_path),
            "--http",
            "localhost:8080",
            "--https",
            "localhost:8443,cert.pem,key.pem",
        ],
    )

    assert result.exit_code == 2
    assert "Can only specify one of" in result.output
    assert serve_stubs.uvicorn.configs == []


def test_serve_rejects_malformed_http_args(tmp_path, fs_root, database_name, serve_stubs):
    config_path = write_config_file(tmp_path)

    result = CliRunner().invoke(serve_command, ["-c", str(config_path), "--http", "missing-port"])

    assert result.exit_code == 2
    assert HTTP_ARGS_MESSAGE in result.output
    assert serve_stubs.uvicorn.configs == []


def test_serve_rejects_multiple_frontend_url_origins(
    tmp_path,
    fs_root,
    database_name,
    serve_stubs,
):
    config_path = write_config_file(tmp_path)

    result = CliRunner().invoke(
        serve_command,
        [
            "-c",
            str(config_path),
            "--http",
            "localhost:8080",
            "--frontend-url",
            "http://a.example.com,http://b.example.com",
        ],
    )

    assert result.exit_code == 2
    assert "--frontend-url accepts a single origin" in result.output
    assert serve_stubs.uvicorn.configs == []


def test_serve_https_passes_ssl_args_to_uvicorn(
    tmp_path,
    fs_root,
    database_name,
    serve_stubs,
):
    config_path = write_config_file(tmp_path)

    result = CliRunner().invoke(
        serve_command,
        [
            "-c",
            str(config_path),
            "--https",
            "localhost:8443,cert.pem,key.pem",
        ],
    )

    assert result.exit_code == 0, result.output
    ((config, debug),) = serve_stubs.prod
    assert debug is False
    assert config.db_config.database == database_name

    (uvicorn_config,) = serve_stubs.uvicorn.configs
    assert uvicorn_config.kwargs == {
        "host": "localhost",
        "port": 8443,
        "ssl_certfile": "cert.pem",
        "ssl_keyfile": "key.pem",
        "limit_concurrency": None,
        "timeout_keep_alive": 5,
    }
    assert serve_stubs.uvicorn.serve_calls == 1


def test_serve_requires_config_option():
    result = CliRunner().invoke(serve_command, ["--http", "localhost:8080"])

    assert result.exit_code == 2
    assert "Missing option" in result.output
