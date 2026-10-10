from __future__ import annotations

import click

from ..config import AppConfigArgs
from .base import get_config_path_option

__all__ = ["plugins_command"]


@get_config_path_option()
@click.pass_context
def plugins_command(ctx: click.Context, *, config_path: str) -> None:
    """
    Access the command-line interface of a ST Annotator plugin.

    To list the available plugins, run this command with `-c` but without `--help`.
    """
    ctx.obj = AppConfigArgs.from_file(config_path).as_config()

    if ctx.invoked_subcommand is None:
        click.echo(ctx.command.get_help(ctx))
