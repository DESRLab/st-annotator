import click

from .base import *
from .bench import *
from .init import *
from .plugin import *
from .porter import *
from .serve import *

__all__ = [
    'cli',
    'get_config_path_option',
    'label_export_by_src_command',
    'label_import_by_st_command',
    'plugins_cli',
    'source_export_to_filetree_command',
    'source_import_by_st_command',
]

@click.group
def cli():
    """Command-line interface for the ST Annotator platform."""
    pass

cli.command(init)
cli.command(serve)
plugins_cli = cli.group(plugins)
attach_bench_cli(cli)
