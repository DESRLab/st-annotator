"""Tests for the production application context in :mod:`sta.entrypoints`."""

from __future__ import annotations

import logging
from pathlib import Path

from fsspec.implementations.dirfs import DirFileSystem

import pytest

from sta.common.database import InMemoryDatabaseConfig
from sta.common.filesystem import FilesystemConfig
from sta.common.filesystem.base import resolve_uri
from sta.config import AppConfig, get_config
from sta.entrypoints import app_ctx


@pytest.fixture(autouse=True)
def _restore_logger_level():
    logger = logging.getLogger("sta")
    level = logger.level
    yield
    logger.setLevel(level)


@pytest.fixture
def app_config(tmp_path) -> AppConfig:
    fs_root = tmp_path / "fs-root"
    fs_root.mkdir()

    return AppConfig(
        db_config=InMemoryDatabaseConfig(),
        fs_config=FilesystemConfig(root=fs_root),
    )


def test_app_ctx_sets_up_config_and_filesystem_contexts(app_config):
    with app_ctx(app_config):
        assert get_config() is app_config

        fs, uri = resolve_uri("some/local/path")
        assert uri == "some/local/path"
        assert isinstance(fs, DirFileSystem)
        assert Path(fs.path) == app_config.fs_config.root

    with pytest.raises(RuntimeError, match="Not inside config context"):
        get_config()

    with pytest.raises(RuntimeError, match="Not inside filesystem context"):
        resolve_uri("some/local/path")


def test_app_ctx_debug_flag_sets_logger_level(app_config):
    with app_ctx(app_config, debug=True):
        assert logging.getLogger("sta").level == logging.DEBUG

    with app_ctx(app_config):
        assert logging.getLogger("sta").level == logging.INFO
