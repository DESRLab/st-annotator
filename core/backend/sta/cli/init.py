from __future__ import annotations

import click

from sta.common.database import PostgresDatabaseConfig

from ..config import AppConfigArgs
from ..session import create_tables, get_engine, insert_default_user
from .base import get_config_path_option

__all__ = ["init_command"]


@get_config_path_option()
@click.option(
    "--drop-if-exists",
    is_flag=True,
    default=False,
    help="If the database already exists, drops it first before recreating it.",
)
def init_command(*, config_path: str, drop_if_exists: bool = False) -> None:
    """Create the remote database for the ST Annotator platform."""
    config = AppConfigArgs.from_file(config_path).as_config()

    db_config = config.db_config
    if not isinstance(db_config, PostgresDatabaseConfig):
        msg = f"The configuration should refer to a remote database. Found: {type(db_config)}"
        raise TypeError(msg)

    database = click.prompt(
        "Please type in the name of the configured database to confirm this operation"
    )
    if database != db_config.database:
        msg = "Incorrect database"
        raise ValueError(msg)

    click.echo("Creating database...")
    db_config.create_db(drop_if_exists=drop_if_exists)

    engine = get_engine(config)
    create_tables(engine)

    click.echo("Finished creating database.")

    click.echo("Please enter the credentials of the default account:")
    username = click.prompt("Username")
    password = click.prompt("Password", hide_input=True)
    click.echo()

    insert_default_user(engine, username=username, password=password)
