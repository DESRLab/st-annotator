
from __future__ import annotations

import click

from ..services.app import AppConfig
from .base import get_config_path_option

__all__ = ['plugins']

@get_config_path_option()
@click.pass_context
def plugins(ctx: click.Context, *, config_path: str) -> None:
    """
    Access the command-line interface of a ST Annotator plugin.

    To list the available plugins, run this command with `-c` but without `--help`.
    """
    ctx.obj = AppConfig.from_file(config_path)

    if ctx.invoked_subcommand is None:
        click.echo(ctx.command.get_help(ctx))
