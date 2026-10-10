from __future__ import annotations

import json
import subprocess
import sys
import uuid as stdlib_uuid
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock

from click.testing import CliRunner

import pytest

from sta.cli import cli as sta_cli, init as init_module
from sta.common.database import PostgresDatabaseConfig
from sta.common.filesystem import FilesystemConfig

# `sta.cli.init.init_command` is a plain callback; it only becomes a click command when
# the CLI group in `sta.cli` is assembled, so invoke the command as registered there.
init_command = sta_cli.commands["init"]

IN_MEMORY_DB_PATH = "sta.common.database.config:InMemoryDatabaseConfig"
PG_FACTORY_PATH = f"{__name__}:pg_config_factory"
FS_FACTORY_PATH = f"{__name__}:fs_config_factory"

_pg_config_database: str | None = None
_fs_config_root: Path | None = None


def pg_config_factory() -> PostgresDatabaseConfig:
    """A zero-argument factory for a Postgres config named by the test; never connects."""
    assert _pg_config_database is not None
    return PostgresDatabaseConfig(
        host="localhost",
        port=5432,
        database=_pg_config_database,
        user="sta",
        password="sta",
    )


def fs_config_factory() -> FilesystemConfig:
    """A zero-argument factory resolving to a filesystem config rooted at a test-controlled path."""
    assert _fs_config_root is not None
    return FilesystemConfig(root=_fs_config_root)


def test_help():
    assert subprocess.call(["python", "-m", "sta", "init", "--help"]) == 0
    assert subprocess.call(["sta", "init", "--help"]) == 0


@pytest.fixture
def fs_root(tmp_path, monkeypatch) -> Path:
    root = tmp_path / "fs-root"
    monkeypatch.setattr(sys.modules[__name__], "_fs_config_root", root)
    return root


@pytest.fixture
def database_name(monkeypatch) -> str:
    name = f"sta_init_test_{stdlib_uuid.uuid4().hex[:8]}"
    monkeypatch.setattr(sys.modules[__name__], "_pg_config_database", name)
    return name


def write_config_file(tmp_path: Path, *, db: str, fs: str) -> Path:
    path = tmp_path / "app-config.json"
    path.write_text(json.dumps({"db": db, "fs": fs}))
    return path


@pytest.fixture
def mock_database_setup(monkeypatch) -> SimpleNamespace:
    """Mock out every side effect after the confirmation prompt; return the mocks."""
    create_db = MagicMock(name="create_db")
    engine = MagicMock(name="engine")
    create_tables = MagicMock(name="create_tables")
    insert_default_user = MagicMock(name="insert_default_user")

    monkeypatch.setattr(PostgresDatabaseConfig, "create_db", create_db)
    monkeypatch.setattr(init_module, "get_engine", lambda config: engine)
    monkeypatch.setattr(init_module, "create_tables", create_tables)
    monkeypatch.setattr(init_module, "insert_default_user", insert_default_user)

    return SimpleNamespace(
        create_db=create_db,
        engine=engine,
        create_tables=create_tables,
        insert_default_user=insert_default_user,
    )


def test_init_rejects_non_postgres_config(tmp_path, fs_root):
    config_path = write_config_file(tmp_path, db=IN_MEMORY_DB_PATH, fs=FS_FACTORY_PATH)

    result = CliRunner().invoke(init_command, ["-c", str(config_path)])

    assert result.exit_code != 0
    assert isinstance(result.exception, TypeError)
    assert "remote database" in str(result.exception)


def test_init_rejects_incorrect_database_confirmation(tmp_path, fs_root, database_name):
    config_path = write_config_file(tmp_path, db=PG_FACTORY_PATH, fs=FS_FACTORY_PATH)

    result = CliRunner().invoke(
        init_command, ["-c", str(config_path)], input="some_other_database\n"
    )

    assert result.exit_code != 0
    assert isinstance(result.exception, ValueError)
    assert str(result.exception) == "Incorrect database"


def test_init_creates_database_and_default_user(
    tmp_path, fs_root, database_name, mock_database_setup
):
    config_path = write_config_file(tmp_path, db=PG_FACTORY_PATH, fs=FS_FACTORY_PATH)

    result = CliRunner().invoke(
        init_command,
        ["-c", str(config_path)],
        input=f"{database_name}\nroot_user\nroot_password\n",
    )

    assert result.exit_code == 0, result.output
    assert "Creating database..." in result.output
    assert "Finished creating database." in result.output
    mock_database_setup.create_db.assert_called_once_with(drop_if_exists=False)
    mock_database_setup.create_tables.assert_called_once_with(mock_database_setup.engine)
    mock_database_setup.insert_default_user.assert_called_once_with(
        mock_database_setup.engine,
        username="root_user",
        password="root_password",
    )


def test_init_passes_drop_if_exists_flag(tmp_path, fs_root, database_name, mock_database_setup):
    config_path = write_config_file(tmp_path, db=PG_FACTORY_PATH, fs=FS_FACTORY_PATH)

    result = CliRunner().invoke(
        init_command,
        ["-c", str(config_path), "--drop-if-exists"],
        input=f"{database_name}\nroot_user\nroot_password\n",
    )

    assert result.exit_code == 0, result.output
    mock_database_setup.create_db.assert_called_once_with(drop_if_exists=True)
