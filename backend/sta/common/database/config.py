"""Configuration objects that are used to access the database."""
from __future__ import annotations

import json
import os
from abc import ABC, abstractmethod
from pathlib import Path
from typing import TYPE_CHECKING, Any
from typing_extensions import Self
from weakref import finalize

import uuid6
from dotenv import find_dotenv, load_dotenv

from fastapi.encoders import jsonable_encoder
from psycopg2.errors import DuplicateDatabase as pg_DuplicateDatabase
from psycopg2.extensions import QuotedString, register_adapter
from sqlalchemy import create_engine
from sqlalchemy.engine import URL, Engine
from sqlalchemy.exc import ProgrammingError
from sqlalchemy.pool import StaticPool
from sqlalchemy.sql.expression import text

if TYPE_CHECKING:
    from _typeshed import StrPath

__all__ = [
    'DatabaseConfig',
    'InMemoryDatabaseConfig',
    'PostGISDatabaseConfig',
    'PostgresDatabaseConfig',
    'TempFileDatabaseConfig',
]


class DatabaseConfig(ABC):
    """Represents the configuration for a database."""

    @abstractmethod
    def _get_url(self) -> URL:
        raise NotImplementedError

    def _get_engine_options(self) -> dict[str, Any]:
        return {"json_serializer": jsonable_encoder}

    def get_engine(self) -> Engine:
        url = self._get_url()
        return create_engine(url, **self._get_engine_options())

    @abstractmethod
    def create_db(self, *, drop_if_exists: bool = False, exist_ok: bool = False) -> None:
        raise NotImplementedError


class InMemoryDatabaseConfig(DatabaseConfig):
    """Represents the configuration for an in-memory SQLite database."""

    def _get_url(self) -> URL:
        return URL.create(
            drivername='sqlite+pysqlite',
            database=':memory:',
            query=dict(cache='shared'),
        )

    def _get_engine_options(self) -> dict[str, Any]:
        # Note that `pysqlite` is not thread safe when multiple threads share the same connection.
        # Therefore, the application code should guarantee thread safety if you want to take advantage
        # of multithreading.
        # Also see: https://docs.sqlalchemy.org/en/14/dialects/sqlite.html#threading-pooling-behavior
        return {
            **super()._get_engine_options(),
            "connect_args": dict(check_same_thread=False),
            "poolclass": StaticPool,
        }

    def create_db(self, *, drop_if_exists: bool = False, exist_ok: bool = False) -> None:
        """
        Creates the in-memory database associated with this configuration.

        The database is automatically dropped when the memory of the program is released.
        """
        self.get_engine().connect()


class TempFileDatabaseConfig(DatabaseConfig):
    """
    Represents the configuration for a temporary file-based SQLite database.

    Database files are given unique names and stored under a workspace directory.

    Parameters
    ----------
    workspace_dir : Path or str
        A path to the directory, under which the temporary file containing the database is created.
    """

    @classmethod
    def _get_filepath(cls, workspace_dir: Path, database: str) -> Path:
        return workspace_dir / f'{database}.db'

    def __init__(self, workspace_dir: StrPath) -> None:
        super().__init__()

        self.workspace_dir = Path(workspace_dir)

        # Ensure the database does not already exist
        while True:
            database = str(uuid6.uuid7())
            if not self._get_filepath(self.workspace_dir, database).exists():
                break

        self._database = database

    @property
    def database(self) -> str:
        return self._database

    @property
    def _filepath(self) -> Path:
        return self._get_filepath(self.workspace_dir, self._database)

    def _get_url(self) -> URL:
        return URL.create(
            drivername='sqlite+pysqlite',
            database=str(self._filepath),
            query=dict(cache='shared'),
        )

    def _get_engine_options(self) -> dict[str, Any]:
        return {
            **super()._get_engine_options(),
            "poolclass": StaticPool,
        }

    def create_db(self, *, drop_if_exists: bool = False, exist_ok: bool = False) -> None:
        """
        Creates the temporary file-based database associated with this configuration.

        The database is automatically dropped when this configuration instance is garbage
        collected.
        """
        self.workspace_dir.mkdir(exist_ok=True)

        self.get_engine().connect()
        finalize(self, self._remove_db)

    def _remove_db(self) -> None:
        filepath = self._filepath
        if filepath.exists():
            filepath.unlink()


class PostgresDatabaseConfig(DatabaseConfig):
    """
    Configuration for a persistent server-based PostgreSQL database.

    Parameters
    ----------
    host : str
        The `host` portion of the database URL.
    port : str
        The `port` portion of the database URL.
    database : str
        The `database` portion of the database URL.
    user : str
        The `user` portion of the database URL.
    password : str
        The `password` portion of the database URL.

    See Also
    --------
    `Database URLs in SQLAlchemy <https://docs.sqlalchemy.org/en/14/core/engines.html#database-urls>`_
    """

    @classmethod
    def from_env(cls, dotenv_path: StrPath | None = None, *, db_suffix: str = '') -> Self:
        """
        Creates a configuration instance from a `.env` file.

        The `.env` file should contain the following keys:

        - `POSTGRESQL_HOST`: The `host` portion of the database URL.
        - `POSTGRESQL_PORT`: The `port` portion of the database URL.
        - `POSTGRESQL_DBSE`: The `database` portion of the database URL.
        - `POSTGRESQL_USER`: The `user` portion of the database URL.
        - `POSTGRESQL_PASS`: The `password` portion of the database URL.

        Parameters
        ----------
        dotenv_path : Path or str
            A path to the `.env` file that contains information about the database URL.
        db_suffix : str, optional
            If provided, this suffix is appended to the `database` portion of the database URL.
            This is particularly useful for setting up multiple databases for testing purposes.

        See Also
        --------
        `Database URLs in SQLAlchemy <https://docs.sqlalchemy.org/en/14/core/engines.html#database-urls>`_
        """
        if dotenv_path is None:
            dotenv_path = find_dotenv(usecwd=True)

        if not load_dotenv(dotenv_path):
            msg = f'Unable to load `.env` file at path: {dotenv_path}'
            raise ValueError(msg)

        return cls(
            host=os.environ['POSTGRESQL_HOST'],
            port=int(os.environ['POSTGRESQL_PORT']),
            database=os.environ['POSTGRESQL_DBSE'] + db_suffix,
            user=os.environ['POSTGRESQL_USER'],
            password=os.environ['POSTGRESQL_PASS'],
        )

    def __init__(self, *, host: str, port: int, database: str, user: str, password: str) -> None:
        """For internal use only."""
        super().__init__()

        self._host = host
        self._port = port
        self._database = database
        self._user = user
        self._password = password

        register_adapter(dict, lambda x: QuotedString(json.dumps(x)))

    @property
    def host(self) -> str:
        return self._host

    @property
    def port(self) -> int:
        return self._port

    @property
    def database(self) -> str:
        return self._database

    @property
    def user(self) -> str:
        return self._user

    def _get_url(self, *, database: str | None = None) -> URL:
        return URL.create(
            drivername='postgresql',
            username=self.user,
            password=self._password,
            host=self.host,
            port=self.port,
            database=self.database if database is None else database,
        )

    def _get_tmp_engine(self) -> Engine:
        url = self._get_url(database='postgres')

        # PostgreSQL does not allow dropping the currently open database, so we connect to the
        # default database ('postgres'). It also does not support transactions for CREATE DATABASE
        # and DROP DATABASE, so we connect to it in AUTOCOMMIT mode.
        return create_engine(url, **self._get_engine_options()) \
            .execution_options(isolation_level='AUTOCOMMIT')

    def create_db(self, *, drop_if_exists: bool = False, exist_ok: bool = False) -> None:
        """
        Creates the PostgreSQL database associated with this configuration.

        Parameters
        ----------
        drop_if_exists : bool, default False
            If `True` and there is an existing database associated with this configuration,
            it is dropped before recreating the database.
        exist_ok : bool, default False
            If `True`, this operation does not create a new database if there is an existing one
            associated with this configuration; otherwise, an error is raised if such a database
            already exists. Note that `drop_if_exists` is still processed regardless of this.
        """
        if drop_if_exists:
            self.remove_db(force=True)

        try:
            stmt = f'CREATE DATABASE "{self.database}"'
            with self._get_tmp_engine().connect() as conn:
                conn.exec_driver_sql(stmt)
        except ProgrammingError as exc:
            if isinstance(exc.orig, pg_DuplicateDatabase) and exist_ok:
                pass
            else:
                raise

    def remove_db(self, *, force: bool = False) -> None:
        """
        Drops the PostgreSQL database associated with this configuration.

        This is a no-op if no such database exists.

        Parameters
        ----------
        force : bool, default False
            If `True`, attempts to terminate all existing connections to the database before
            dropping it; otherwise, existing connections will prevent the database from being
            dropped.
        """
        stmt = f'DROP DATABASE IF EXISTS "{self.database}"'
        if force:
            stmt += ' WITH (FORCE)'

        with self._get_tmp_engine().connect() as conn:
            conn.exec_driver_sql(stmt)

class PostGISDatabaseConfig(PostgresDatabaseConfig):
    """
    Configuration for a persistent server-based PostgreSQL database
    with the PostGIS extension applied.
    """

    def create_db(self, *, drop_if_exists: bool = False, exist_ok: bool = False) -> None:
        self._check_postgis_installed()

        super().create_db(drop_if_exists=drop_if_exists, exist_ok=exist_ok)

        with self.get_engine().begin() as conn:
            conn.execute(text('CREATE EXTENSION IF NOT EXISTS postgis'))

    def is_postgis_installed(self) -> bool:
        """
        Tests whether PostGIS is installed on the database server associated with
        this configuration, and thus able to be applied to the database.

        Returns
        -------
        `True` if PostGIS is installed; otherwise, `False`.
        """
        with self._get_tmp_engine().connect() as conn:
            results = conn.execute(text('SELECT * FROM pg_available_extensions'))

        extension_names = {row.name for row in results}

        return 'postgis' in extension_names

    def _check_postgis_installed(self) -> None:
        if not self.is_postgis_installed():
            msg = 'PostGIS is not installed on the database server'
            raise RuntimeError(msg)
