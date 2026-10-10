from __future__ import annotations

import asyncio
import os
from dataclasses import replace
from typing import Annotated

import click
import uvicorn

from pydantic import BaseModel, Field

from sta.common.database import DatabaseConfig
from sta.envs import STA_TRUSTED_PROXY_IPS

from ..api.cors import resolve_frontend_url
from ..api.root import build_api
from ..config import AppConfigArgs
from ..domain.auth import configure_signing_key, require_configured_signing_key
from ..entrypoints import app_ctx, test_app_ctx
from .base import get_config_path_option

__all__ = ["serve_command"]


class HTTPArgs(BaseModel, frozen=True):
    """Contains the arguments for hosting the server over HTTP."""

    host: str
    port: Annotated[int, Field(ge=0, le=65535)]

    @classmethod
    def parse_str(cls, s: str):
        try:
            host, port = s.split(":")
        except ValueError as exc:
            msg = "The input string should be in the form `<host>:<port>`."
            raise ValueError(msg) from exc

        return cls.model_validate({"host": host, "port": port})


class HTTPSArgs(BaseModel, frozen=True):
    """Contains the arguments for hosting the server over HTTPS."""

    host: str
    port: Annotated[int, Field(ge=0, le=65535)]
    ssl_certfile: str
    ssl_keyfile: str

    @classmethod
    def parse_str(cls, s: str):
        try:
            socket, certificate, key = s.split(",")
            host, port = socket.split(":")
        except ValueError as exc:
            msg = "The input string should be in the form `<host>:<port>,<cert_file>,<pkey_file>`."
            raise ValueError(msg) from exc

        return cls(host=host, port=int(port), ssl_certfile=certificate, ssl_keyfile=key)


def _parse_http_or_https_args(*, http: str | None, https: str | None):
    if http is None:
        if https is None:
            msg = "Must specify one of: `http` and `https`"
            raise ValueError(msg)
        else:
            return HTTPSArgs.parse_str(https)
    else:
        if https is None:
            return HTTPArgs.parse_str(http)
        else:
            msg = "Can only specify one of: `http` and `https`"
            raise ValueError(msg)


def _test_database_name(db_config: DatabaseConfig) -> str:
    """Name of the database `db_config` points at, for messages that must announce it.

    Not every database configuration names its database (an in-memory one is
    private to its instance), so fall back to describing it generically.
    """
    database = getattr(db_config, "database", None)
    return f"database {database!r}" if database else "the instance-local database"


@get_config_path_option()
@click.option("--http", type=str, metavar="<HOST:PORT>", help="Serve over HTTP.")
@click.option("--https", type=str, metavar="<HOST:PORT,CERT,KEY>", help="Serve over HTTPS.")
@click.option(
    "--frontend-url",
    type=str,
    default=None,
    help="Expected frontend origin for CORS. Defaults to $STA_FRONTEND_URL, else http://localhost:5173.",
)
@click.option(
    "--jwt-private-key",
    type=click.Path(exists=True, dir_okay=False, readable=True),
    default=None,
    metavar="<PATH>",
    help=(
        "PEM P-256 key that signs access and refresh tokens. "
        "Defaults to $STA_JWT_PRIVATE_KEY_PATH, else an ephemeral key (--testing only)."
    ),
)
@click.option("--debug", is_flag=True, default=False, help="Enable debug logging.")
@click.option(
    "--limit-concurrency",
    type=click.IntRange(min=1),
    default=None,
    help="Maximum concurrent connections/tasks accepted by Uvicorn.",
)
@click.option(
    "--timeout-keep-alive",
    type=click.IntRange(min=0),
    default=5,
    show_default=True,
    help="Seconds to keep idle HTTP connections open.",
)
@click.option(
    "--testing",
    is_flag=True,
    default=False,
    help=(
        "Development only: drop and recreate the separate <db>_test database, "
        "with a default admin/admin root user."
    ),
)
def serve_command(
    *,
    config_path: str,
    http: str | None = None,
    https: str | None = None,
    frontend_url: str | None = None,
    jwt_private_key: str | None = None,
    debug: bool = False,
    testing: bool = False,
    limit_concurrency: int | None = None,
    timeout_keep_alive: int = 5,
) -> None:
    """
    Host the ST Annotator platform on a server.

    You must specify either `http` or `https`, their format being identical to those in uWSGI.

    - HTTP: https://uwsgi-docs.readthedocs.io/en/latest/HTTP.html

    - HTTPS: https://uwsgi-docs.readthedocs.io/en/latest/HTTPS.html

    Use `--frontend-url` to specify the browser origin that may access the API.

    `--testing` is a development-only mode. Outside it the
    server refuses to start unless a usable token-signing key is configured via
    `STA_JWT_PRIVATE_KEY_PATH` or `--jwt-private-key`, and warns when
    `STA_TRUSTED_PROXY_IPS` is unset while logins are proxied.
    """
    app_config = AppConfigArgs.from_file(config_path).as_config()
    app_config.fs_config.validate_root()

    # Applies to `--testing` too: an explicit key there keeps development
    # sessions alive across restarts. Unset, the environment decides.
    configure_signing_key(jwt_private_key)

    # Addressing and origin mistakes are user errors: report them as usage
    # errors with the CLI's own message instead of a raw traceback, and before
    # any database work starts.
    try:
        args = _parse_http_or_https_args(http=http, https=https)
        origin = resolve_frontend_url(frontend_url)
    except ValueError as exc:
        raise click.UsageError(str(exc)) from exc

    # Production tokens must survive restarts and work across server processes.
    if not testing:
        require_configured_signing_key()

        # Warn rather than fail: browsers connecting to this backend directly is
        # a supported topology, in which case the peer address is the client's.
        if not os.environ.get(STA_TRUSTED_PROXY_IPS, "").strip():
            warning = (
                f"{STA_TRUSTED_PROXY_IPS} is not set. Login requests that reach this backend "
                "through the frontend server (or any other reverse proxy) all appear to come "
                "from that proxy's address, so they share one login rate-limit bucket: 10 failed "
                "logins per minute from any client returns 429 for every user, including admins. "
                "Set it to the comma-separated IP addresses or CIDR networks of every server that "
                "connects directly to this backend to limit each browser separately. Ignore this "
                "warning when browsers connect to this backend directly."
            )
            click.echo(warning, err=True)

    if testing:
        # Use a separate database. The test context drops and recreates it as
        # soon as it is entered, terminating any other live connection to it,
        # so announce the exact database before that happens.
        test_db_config = app_config.db_config.with_db_suffix("_test")
        announcement = (
            "Development mode: dropping and recreating "
            f"{_test_database_name(test_db_config)} before serving."
        )
        click.echo(announcement, err=True)
        app_config = replace(app_config, db_config=test_db_config)
        app_context = test_app_ctx(app_config, debug=debug)
    else:
        app_context = app_ctx(app_config, debug=debug)

    with app_context:
        api = build_api(frontend_url=origin, start_job_worker=True)

        uvicorn_config = uvicorn.Config(
            api,
            **args.model_dump(),
            limit_concurrency=limit_concurrency,
            timeout_keep_alive=timeout_keep_alive,
        )
        uvicorn_config.load()

        server = uvicorn.Server(uvicorn_config)
        asyncio.run(server.serve())
