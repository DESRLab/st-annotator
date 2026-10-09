from .cli import cli
from .plugin import load_plugins

load_plugins()

cli()
