"""Dataset CLI shared by the standalone executable and plugin host."""

import click

from . import argoverse2, rscan, semantickitti


@click.group()
def cli() -> None:
    """Import supported datasets into ST Annotator."""


cli.add_command(semantickitti.cli, "semantickitti")
cli.add_command(rscan.cli, "3rscan")
cli.add_command(argoverse2.cli, "argoverse2")
