"""Register the dataset import CLI without contributing API routes."""

from sta.cli import plugins_cli

from .cli import cli


def register() -> None:
    plugins_cli.add_command(cli, "datasets")
