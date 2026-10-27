"""Dataset CLI shared by the standalone executable and plugin host."""

import click

from . import argoverse2, rscan, semantickitti, st_data_info


@click.group()
def cli() -> None:
    """Import datasets and generate custom data metadata for ST Annotator."""


@cli.group("import")
def import_cli() -> None:
    """Import supported datasets into ST Annotator."""


@cli.group("generate")
def generate_cli() -> None:
    """Generate metadata for custom dataset imports."""


import_cli.add_command(semantickitti.cli, "semantickitti")
import_cli.add_command(rscan.cli, "3rscan")
import_cli.add_command(argoverse2.cli, "argoverse2")
generate_cli.add_command(st_data_info.cli, "st-data-info")
