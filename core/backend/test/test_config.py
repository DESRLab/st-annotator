"""Tests for the application configuration bootstrap in :mod:`sta.config`."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

from sta import config as config_module
from sta.common.database import DatabaseConfig, InMemoryDatabaseConfig
from sta.common.filesystem import FilesystemConfig
from sta.config import AppConfig, AppConfigArgs, config_ctx, get_config, obj_from_path

IN_MEMORY_DB_PATH = "sta.common.database.config:InMemoryDatabaseConfig"
FS_FACTORY_PATH = f"{__name__}:fs_config_factory"

_fs_factory_root: Path | None = None


def fs_config_factory() -> FilesystemConfig:
    """A zero-argument factory resolving to a filesystem config rooted at a test-controlled path."""
    assert _fs_factory_root is not None
    return FilesystemConfig(root=_fs_factory_root)


@pytest.fixture(autouse=True)
def _restore_config_global():
    yield
    config_module._config = None


@pytest.fixture
def fs_factory_root(tmp_path, monkeypatch) -> Path:
    root = tmp_path / "fs-root"
    monkeypatch.setattr(sys.modules[__name__], "_fs_factory_root", root)
    return root


def make_app_config(*, root: Path) -> AppConfig:
    return AppConfig(
        db_config=InMemoryDatabaseConfig(),
        fs_config=FilesystemConfig(root=root),
    )


def write_config_file(tmp_path: Path, content: str | dict) -> Path:
    path = tmp_path / "app-config.json"
    if isinstance(content, dict):
        content = json.dumps(content)
    path.write_text(content)
    return path


class TestObjFromPath:
    def test_rejects_path_without_colon(self):
        with pytest.raises(ValueError, match="import path should be in the form"):
            obj_from_path("sta.config", DatabaseConfig)

    def test_resolves_single_attribute(self):
        config = obj_from_path(IN_MEMORY_DB_PATH, DatabaseConfig)
        assert isinstance(config, InMemoryDatabaseConfig)

    def test_resolves_nested_attribute_path(self):
        config = obj_from_path("sta.common.database:config.InMemoryDatabaseConfig", DatabaseConfig)
        assert isinstance(config, InMemoryDatabaseConfig)

    def test_rejects_non_callable(self):
        with pytest.raises(ValueError, match="is not callable"):
            obj_from_path("sta.config:__all__", DatabaseConfig)

    def test_rejects_object_of_wrong_type(self):
        with pytest.raises(ValueError, match="not of the expected type"):
            obj_from_path(IN_MEMORY_DB_PATH, FilesystemConfig)


class TestAppConfigArgs:
    def test_from_file(self, tmp_path, fs_factory_root):
        path = write_config_file(tmp_path, {"db": IN_MEMORY_DB_PATH, "fs": FS_FACTORY_PATH})

        args = AppConfigArgs.from_file(path)

        assert args.db == IN_MEMORY_DB_PATH
        assert args.fs == FS_FACTORY_PATH

    def test_from_file_wraps_invalid_content(self, tmp_path):
        path = write_config_file(tmp_path, '{"db": 1, "fs": 2}')

        with pytest.raises(ValueError, match="Failed to parse application config"):
            AppConfigArgs.from_file(path)

    def test_from_file_wraps_malformed_json(self, tmp_path):
        path = write_config_file(tmp_path, "not-json")

        with pytest.raises(ValueError, match="Failed to parse application config"):
            AppConfigArgs.from_file(path)

    def test_from_file_rejects_unknown_keys(self, tmp_path):
        # A retired key (here the old plugin list) must not parse into a config
        # whose settings the operator believes are active.
        path = write_config_file(
            tmp_path,
            {"db": IN_MEMORY_DB_PATH, "fs": FS_FACTORY_PATH, "plugins": ["pcd"]},
        )

        with pytest.raises(ValueError, match="Failed to parse application config") as excinfo:
            AppConfigArgs.from_file(path)

        assert "plugins" in str(excinfo.value.__cause__)

    def test_as_config(self, fs_factory_root):
        args = AppConfigArgs(db=IN_MEMORY_DB_PATH, fs=FS_FACTORY_PATH)

        config = args.as_config()

        assert isinstance(config.db_config, InMemoryDatabaseConfig)
        assert isinstance(config.fs_config, FilesystemConfig)
        assert config.fs_config.root == fs_factory_root


class TestAppConfigTestFactory:
    def test_injects_db_config(self, tmp_path, monkeypatch):
        # Patch only the filesystem factory so the database branch stays real.
        monkeypatch.setattr(
            config_module.FilesystemConfig,
            "from_env",
            staticmethod(lambda dotenv_path=None: FilesystemConfig(root=tmp_path)),
        )

        db_config = InMemoryDatabaseConfig()
        config = AppConfig.test(db_config=db_config)

        assert config.db_config is db_config
        assert config.fs_config.root == tmp_path


class TestConfigContext:
    def test_yields_config_and_resets_on_exit(self, tmp_path):
        config = make_app_config(root=tmp_path)

        with config_ctx(config) as yielded:
            assert yielded is config
            assert get_config() is config

        with pytest.raises(RuntimeError, match="Not inside config context"):
            get_config()

    def test_rejects_reentrancy(self, tmp_path):
        config = make_app_config(root=tmp_path)

        with config_ctx(config):
            with pytest.raises(RuntimeError, match="Already inside the context"):
                with config_ctx(config):
                    pass

            assert get_config() is config

    def test_get_config_outside_context_raises(self):
        with pytest.raises(RuntimeError, match="Not inside config context"):
            get_config()
