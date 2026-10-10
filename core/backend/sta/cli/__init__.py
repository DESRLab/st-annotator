"""The `sta` command group and its subcommands."""

from typing import Any

import click

from .base import *
from .bench import *
from .init import *
from .plugin import *
from .porter import *
from .serve import *

__all__ = [
    "cli",
    "get_config_path_option",
    "label_export_by_src_command",
    "label_import_by_st_command",
    "plugins_cli",
    "source_export_to_filetree_command",
    "source_import_by_st_command",
]


class PluginCLIGroup(click.Group):
    """Load plugin entry points before Click lists, resolves, or invokes commands."""

    def __init__(self, *args: Any, **kwargs: Any):
        super().__init__(*args, **kwargs)

        self._plugins_loaded = False

    def _load_plugins(self):
        if self._plugins_loaded:
            return

        from ..plugin import load_plugins

        load_plugins()

        self._plugins_loaded = True

    def list_commands(self, ctx: click.Context):
        self._load_plugins()
        return super().list_commands(ctx)

    def get_command(self, ctx: click.Context, cmd_name: str):
        self._load_plugins()
        return super().get_command(ctx, cmd_name)

    def invoke(self, ctx: click.Context):
        self._load_plugins()
        return super().invoke(ctx)


@click.group(cls=PluginCLIGroup)
def cli():
    """Command-line interface for the ST Annotator platform."""
    pass


# Named explicitly: the callbacks follow the `<name>_command` convention so
# that star-imports do not shadow same-named submodules (e.g. `sta.cli.init`)
# in the package namespace.
cli.command("init")(init_command)
cli.command("serve")(serve_command)
plugins_cli = cli.group("plugins", cls=PluginCLIGroup, invoke_without_command=True)(plugins_command)
attach_bench_cli(cli)
