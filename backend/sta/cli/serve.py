
from __future__ import annotations

import asyncio
from typing import Annotated

import click
import uvicorn

from pydantic import BaseModel, Field

from ..services.api.root import build_api
from ..services.config import AppConfigArgs
from ..services.entrypoints import app_ctx, test_app_ctx
from .base import get_config_path_option

__all__ = ['serve']


class HTTPArgs(BaseModel, frozen=True):
    """Contains the arguments for hosting the server over HTTP."""

    host: str
    port: Annotated[int, Field(ge=0, le=65535)]

    @classmethod
    def parse_str(cls, s: str):
        try:
            host, port = s.split(':')
        except ValueError as exc:
            msg = 'The input string should be in the form `<host>:<port>`.'
            raise ValueError(msg) from exc

        return cls(host=host, port=port)


class HTTPSArgs(BaseModel, frozen=True):
    """Contains the arguments for hosting the server over HTTPS."""

    host: str
    port: Annotated[int, Field(ge=0, le=65535)]
    ssl_certfile: str
    ssl_keyfile: str

    @classmethod
    def parse_str(cls, s: str):
        try:
            socket, certificate, key = s.split(',')
            host, port = socket.split(':')
        except ValueError as exc:
            msg = 'The input string should be in the form `<host>:<port>,<cert_file>,<pkey_file>`.'
            raise ValueError(msg) from exc

        return cls(host=host, port=port, cert_file=certificate, pkey_file=key)


def _parse_http_or_https_args(*, http: str | None, https: str | None):
    if http is None:
        if https is None:
            msg = 'Must specify one of: `http` and `https`'
            raise ValueError(msg)
        else:
            return HTTPSArgs.parse_str(https)
    else:
        if https is None:
            return HTTPArgs.parse_str(http)
        else:
            msg = 'Can only specify one of: `http` and `https`'
            raise ValueError(msg)


@get_config_path_option()
@click.option('--http', type=str, metavar='<HOST:PORT>',
              help='Serve over HTTP.')
@click.option('--https', type=str, metavar='<HOST:PORT,CERT,KEY>',
              help='Serve over HTTPS.')
@click.option('--debug', is_flag=True, default=False,
              help='Enable debug logging.')
@click.option('--testing', is_flag=True, default=False,
              help='Use a temporary database for testing.')
def serve(
    *,
    config_path: str,
    http: str | None = None,
    https: str | None = None,
    debug: bool = False,
    testing: bool = False,
) -> None:
    """
    Host the ST Annotator platform on a production server.

    You must specify either `http` or `https`, their format being identical to those in uWSGI.

    - HTTP: https://uwsgi-docs.readthedocs.io/en/latest/HTTP.html

    - HTTPS: https://uwsgi-docs.readthedocs.io/en/latest/HTTPS.html
    """
    config = AppConfigArgs.from_file(config_path).as_config()
    args = _parse_http_or_https_args(http=http, https=https)

    with (test_app_ctx if testing else app_ctx)(config, debug=debug):
        api = build_api()

        config = uvicorn.Config(api, **args.model_dump())
        config.load()

        server = uvicorn.Server(config)
        asyncio.run(server.serve())
