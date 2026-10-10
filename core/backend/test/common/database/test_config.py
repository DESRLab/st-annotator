"""Tests for the database backend configurations in :mod:`sta.common.database.config`."""

from __future__ import annotations

import gc
import json
from types import SimpleNamespace
from unittest.mock import MagicMock

import uuid6

from psycopg2.errors import DuplicateDatabase as pg_DuplicateDatabase
from sqlalchemy import text
from sqlalchemy.exc import ProgrammingError
from sqlalchemy.pool import StaticPool

import pytest

from sta.common.database.config import (
    InMemoryDatabaseConfig,
    PostGISDatabaseConfig,
    PostgresDatabaseConfig,
    TempFileDatabaseConfig,
)


class TestInMemoryDatabaseConfig:
    def test_get_url(self):
        url = InMemoryDatabaseConfig()._get_url()

        assert url.drivername == "sqlite+pysqlite"
        assert url.database == ":memory:"
        assert url.query == {"cache": "shared"}

    def test_engine_uses_shared_static_pool(self):
        config = InMemoryDatabaseConfig()
        engine = config.get_engine()

        assert isinstance(engine.pool, StaticPool)
        assert config.get_engine() is engine

    def test_json_serializer_returns_text(self):
        serializer = InMemoryDatabaseConfig()._get_engine_options()["json_serializer"]

        serialized = serializer({"items": [1, True]})
        assert isinstance(serialized, str)
        assert json.loads(serialized) == {"items": [1, True]}

    def test_create_db_yields_usable_database(self):
        config = InMemoryDatabaseConfig()
        config.create_db()

        engine = config.get_engine()
        with engine.begin() as conn:
            conn.execute(text("CREATE TABLE example (value INTEGER)"))
            conn.execute(text("INSERT INTO example (value) VALUES (42)"))

        with engine.connect() as conn:
            assert conn.execute(text("SELECT value FROM example")).scalar_one() == 42

    def test_with_db_suffix_returns_distinct_database(self):
        config = InMemoryDatabaseConfig()
        suffixed = config.with_db_suffix("_test")

        assert isinstance(suffixed, InMemoryDatabaseConfig)
        assert suffixed is not config

        # The two configurations do not share their in-memory databases.
        config.create_db()
        suffixed.create_db()
        with config.get_engine().begin() as conn:
            conn.execute(text("CREATE TABLE example (value INTEGER)"))
        with suffixed.get_engine().connect() as conn:
            assert (
                conn.execute(
                    text(
                        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'example'",
                    )
                ).first()
                is None
            )


class _FakeUUID:
    def __init__(self, name: str) -> None:
        self._name = name

    def __str__(self) -> str:
        return self._name


class TestTempFileDatabaseConfig:
    def test_generates_database_name_under_workspace(self, tmp_path):
        config = TempFileDatabaseConfig(tmp_path)

        assert config.database
        assert config._filepath == tmp_path / f"{config.database}.db"
        assert not config._filepath.exists()

    def test_skips_existing_database_files_when_generating_name(self, tmp_path, monkeypatch):
        workspace = tmp_path / "workspace"
        workspace.mkdir()
        (workspace / "taken.db").touch()

        names = iter([_FakeUUID("taken"), _FakeUUID("free")])
        monkeypatch.setattr(uuid6, "uuid7", lambda: next(names))

        config = TempFileDatabaseConfig(workspace)

        assert config.database == "free"
        assert config._filepath == workspace / "free.db"

    def test_get_url_points_at_database_file(self, tmp_path):
        config = TempFileDatabaseConfig(tmp_path)

        url = config._get_url()

        assert url.drivername == "sqlite+pysqlite"
        assert url.database == str(config._filepath)
        assert url.query == {"cache": "shared"}

    def test_create_db_creates_workspace_and_usable_database(self, tmp_path):
        workspace = tmp_path / "workspace"
        config = TempFileDatabaseConfig(workspace)

        config.create_db()

        assert workspace.is_dir()
        assert config._filepath.exists()

        engine = config.get_engine()
        with engine.begin() as conn:
            conn.execute(text("CREATE TABLE example (value INTEGER)"))
            conn.execute(text("INSERT INTO example (value) VALUES (7)"))

        with engine.connect() as conn:
            assert conn.execute(text("SELECT value FROM example")).scalar_one() == 7

    def test_garbage_collection_removes_database_file(self, tmp_path):
        config = TempFileDatabaseConfig(tmp_path)
        config.create_db()
        filepath = config._filepath
        assert filepath.exists()

        # The finalizer callback must not hold a strong reference to the
        # config, or the file would only be removed at interpreter exit.
        del config
        gc.collect()

        assert not filepath.exists()

    def test_remove_db_deletes_database_file(self, tmp_path):
        config = TempFileDatabaseConfig(tmp_path)
        config.create_db()
        filepath = config._filepath
        assert filepath.exists()

        config._remove_db()

        assert not filepath.exists()

    def test_with_db_suffix_returns_distinct_database(self, tmp_path):
        config = TempFileDatabaseConfig(tmp_path)
        suffixed = config.with_db_suffix("_test")

        assert isinstance(suffixed, TempFileDatabaseConfig)
        assert suffixed is not config
        assert suffixed.workspace_dir == config.workspace_dir
        assert suffixed.database != config.database

    def test_remove_db_is_noop_when_file_missing(self, tmp_path):
        config = TempFileDatabaseConfig(tmp_path)

        config._remove_db()

        assert not config._filepath.exists()


@pytest.fixture
def pg_config() -> PostgresDatabaseConfig:
    # Uses fake credentials: these tests mock the engine and never open a real connection.
    return PostgresDatabaseConfig(
        host="localhost",
        port=5432,
        database="sta_test_throwaway_db",
        user="sta",
        password="sta",
    )


@pytest.fixture
def mock_tmp_connection(monkeypatch):
    """Mock out the maintenance engine; return the connection that records SQL statements."""
    conn = MagicMock(name="connection")
    engine = MagicMock(name="engine")
    engine.connect.return_value.__enter__.return_value = conn

    monkeypatch.setattr(PostgresDatabaseConfig, "_get_tmp_engine", lambda self: engine)

    return conn


@pytest.fixture
def mock_tmp_engine(monkeypatch):
    """Mock out the maintenance engine; return it so its disposal can be asserted."""
    engine = MagicMock(name="engine")
    engine.connect.return_value.__enter__.return_value = MagicMock(name="connection")

    monkeypatch.setattr(PostgresDatabaseConfig, "_get_tmp_engine", lambda self: engine)

    return engine


def _duplicate_database_error() -> ProgrammingError:
    return ProgrammingError(
        'CREATE DATABASE "sta_test_throwaway_db"',
        {},
        pg_DuplicateDatabase('database "sta_test_throwaway_db" already exists'),
    )


class TestPostgresDatabaseConfig:
    def test_get_url(self, pg_config):
        url = pg_config._get_url()

        assert url.drivername == "postgresql"
        assert url.username == "sta"
        assert url.password == "sta"
        assert url.host == "localhost"
        assert url.port == 5432
        assert url.database == "sta_test_throwaway_db"

    def test_get_url_allows_overriding_database(self, pg_config):
        assert pg_config._get_url(database="postgres").database == "postgres"

    def test_with_db_suffix_appends_suffix_and_preserves_settings(self, pg_config):
        suffixed = pg_config.with_db_suffix("_test")

        assert type(suffixed) is PostgresDatabaseConfig
        assert suffixed is not pg_config
        assert suffixed.database == "sta_test_throwaway_db_test"
        assert suffixed.host == pg_config.host
        assert suffixed.port == pg_config.port
        assert suffixed.user == pg_config.user
        assert suffixed._password == pg_config._password
        # The source configuration is left unchanged.
        assert pg_config.database == "sta_test_throwaway_db"

    def test_create_db_executes_create_database(self, pg_config, mock_tmp_connection):
        pg_config.create_db()

        mock_tmp_connection.exec_driver_sql.assert_called_once_with(
            'CREATE DATABASE "sta_test_throwaway_db"',
        )

    def test_database_identifier_quotes_are_escaped(self, mock_tmp_connection):
        config = PostgresDatabaseConfig(
            host="localhost",
            port=5432,
            database='sta"; DROP DATABASE postgres; --',
            user="sta",
            password="sta",
        )

        config.create_db()
        mock_tmp_connection.exec_driver_sql.assert_called_once_with(
            'CREATE DATABASE "sta""; DROP DATABASE postgres; --"',
        )

        mock_tmp_connection.reset_mock()
        config.remove_db(force=True)
        mock_tmp_connection.exec_driver_sql.assert_called_once_with(
            'DROP DATABASE IF EXISTS "sta""; DROP DATABASE postgres; --" WITH (FORCE)',
        )

    def test_create_db_drop_if_exists_removes_first(
        self, pg_config, mock_tmp_connection, monkeypatch
    ):
        forces = []
        monkeypatch.setattr(
            PostgresDatabaseConfig,
            "remove_db",
            lambda self, *, force: forces.append(force),
        )

        pg_config.create_db(drop_if_exists=True)

        assert forces == [True]
        mock_tmp_connection.exec_driver_sql.assert_called_once_with(
            'CREATE DATABASE "sta_test_throwaway_db"',
        )

    def test_create_db_exist_ok_swallows_duplicate_database(self, pg_config, mock_tmp_connection):
        mock_tmp_connection.exec_driver_sql.side_effect = _duplicate_database_error()

        pg_config.create_db(exist_ok=True)

    def test_create_db_raises_duplicate_database_without_exist_ok(
        self, pg_config, mock_tmp_connection
    ):
        mock_tmp_connection.exec_driver_sql.side_effect = _duplicate_database_error()

        with pytest.raises(ProgrammingError):
            pg_config.create_db()

    def test_create_db_reraises_other_programming_errors(self, pg_config, mock_tmp_connection):
        mock_tmp_connection.exec_driver_sql.side_effect = ProgrammingError(
            "stmt", {}, ValueError("boom")
        )

        with pytest.raises(ProgrammingError, match="boom"):
            pg_config.create_db(exist_ok=True)

    def test_remove_db_without_force(self, pg_config, mock_tmp_connection):
        pg_config.remove_db()

        mock_tmp_connection.exec_driver_sql.assert_called_once_with(
            'DROP DATABASE IF EXISTS "sta_test_throwaway_db"',
        )

    def test_remove_db_with_force(self, pg_config, mock_tmp_connection):
        pg_config.remove_db(force=True)

        mock_tmp_connection.exec_driver_sql.assert_called_once_with(
            'DROP DATABASE IF EXISTS "sta_test_throwaway_db" WITH (FORCE)',
        )

    def test_create_db_disposes_maintenance_engine(self, pg_config, mock_tmp_engine):
        pg_config.create_db()

        mock_tmp_engine.dispose.assert_called_once_with()

    def test_remove_db_disposes_maintenance_engine(self, pg_config, mock_tmp_engine):
        pg_config.remove_db(force=True)

        mock_tmp_engine.dispose.assert_called_once_with()

    def test_maintenance_engine_disposed_when_create_database_fails(
        self, pg_config, mock_tmp_engine
    ):
        conn = mock_tmp_engine.connect.return_value.__enter__.return_value
        conn.exec_driver_sql.side_effect = ProgrammingError("stmt", {}, ValueError("boom"))

        with pytest.raises(ProgrammingError, match="boom"):
            pg_config.create_db(exist_ok=True)

        mock_tmp_engine.dispose.assert_called_once_with()


@pytest.fixture
def postgis_config() -> PostGISDatabaseConfig:
    # Uses fake credentials: these tests mock the engine and never open a real connection.
    return PostGISDatabaseConfig(
        host="localhost",
        port=5432,
        database="sta_test_throwaway_db",
        user="sta",
        password="sta",
    )


def _mock_extension_probe(monkeypatch, config, *extension_names: str):
    results = iter([SimpleNamespace(name=name) for name in extension_names])
    conn = MagicMock(name="connection")
    conn.execute.return_value = results
    engine = MagicMock(name="engine")
    engine.connect.return_value.__enter__.return_value = conn

    monkeypatch.setattr(PostgresDatabaseConfig, "_get_tmp_engine", lambda self: engine)

    return engine


class TestPostGISDatabaseConfig:
    def test_with_db_suffix_preserves_subclass(self, postgis_config):
        suffixed = postgis_config.with_db_suffix("_test")

        assert type(suffixed) is PostGISDatabaseConfig
        assert suffixed is not postgis_config
        assert suffixed.database == "sta_test_throwaway_db_test"

    def test_is_postgis_installed_true(self, postgis_config, monkeypatch):
        _mock_extension_probe(monkeypatch, postgis_config, "plpgsql", "postgis")

        assert postgis_config.is_postgis_installed()

    def test_is_postgis_installed_false(self, postgis_config, monkeypatch):
        _mock_extension_probe(monkeypatch, postgis_config, "plpgsql")

        assert not postgis_config.is_postgis_installed()

    def test_create_db_raises_when_postgis_missing(self, postgis_config, monkeypatch):
        monkeypatch.setattr(postgis_config, "is_postgis_installed", lambda: False)

        with pytest.raises(RuntimeError, match="PostGIS is not installed"):
            postgis_config.create_db()

    def test_is_postgis_installed_disposes_maintenance_engine(self, postgis_config, monkeypatch):
        engine = _mock_extension_probe(monkeypatch, postgis_config, "plpgsql", "postgis")

        assert postgis_config.is_postgis_installed()

        engine.dispose.assert_called_once_with()

    def test_create_db_disposes_extension_engine(self, postgis_config, monkeypatch):
        _mock_extension_probe(monkeypatch, postgis_config, "postgis")
        extension_engine = MagicMock(name="extension-engine")
        monkeypatch.setattr(postgis_config, "get_engine", lambda: extension_engine)

        postgis_config.create_db()

        extension_engine.begin.assert_called_once_with()
        extension_engine.dispose.assert_called_once_with()
