"""Tests for the session helpers in :mod:`sta.session`."""

from __future__ import annotations

import logging

from sqlmodel import SQLModel

import pytest

from sta.common.database import InMemoryDatabaseConfig
from sta.common.filesystem import FilesystemConfig
from sta.config import AppConfig
from sta.models.user import User, UserRole
from sta.session import _engines, dispose_engine, get_engine, session_ctx


@pytest.fixture(autouse=True)
def _capture_sta_logs(caplog, monkeypatch):
    monkeypatch.setattr(logging.getLogger("sta"), "propagate", True)
    caplog.set_level(logging.WARNING, logger="sta")


@pytest.fixture
def app_config(tmp_path) -> AppConfig:
    config = AppConfig(
        db_config=InMemoryDatabaseConfig(),
        fs_config=FilesystemConfig(root=tmp_path),
    )
    engine = get_engine(config)
    SQLModel.metadata.create_all(engine, tables=[User.__table__, UserRole.__table__])
    yield config
    dispose_engine(config)


def test_dispose_engine_evicts_exact_config(tmp_path):
    config = AppConfig(
        db_config=InMemoryDatabaseConfig(),
        fs_config=FilesystemConfig(root=tmp_path),
    )
    engine = get_engine(config)

    assert _engines[id(config)] == (config, engine)
    dispose_engine(config)
    assert id(config) not in _engines


def test_get_session_warns_about_uncommitted_new_objects(app_config, caplog):
    with session_ctx(app_config) as session:
        session.add(User(username="uncommitted_new_user", password_hash="not-a-hash"))
    assert "Detected uncommitted objects: 1 new, 0 dirty, 0 deleted" in caplog.text


def test_get_session_warns_about_uncommitted_dirty_objects(app_config, caplog):
    with session_ctx(app_config) as session:
        user = User(username="uncommitted_dirty_user", password_hash="not-a-hash")
        session.add(user)
        session.commit()
        user.password_hash = "changed-but-not-committed"
    assert "Detected uncommitted objects: 0 new, 1 dirty, 0 deleted" in caplog.text


def test_get_session_warns_about_uncommitted_deleted_objects(app_config, caplog):
    with session_ctx(app_config) as session:
        user = User(username="uncommitted_deleted_user", password_hash="not-a-hash")
        session.add(user)
        session.commit()
        session.delete(user)
    assert "Detected uncommitted objects: 0 new, 0 dirty, 1 deleted" in caplog.text


def test_get_session_does_not_warn_when_everything_is_committed(app_config, caplog):
    with session_ctx(app_config) as session:
        session.add(User(username="committed_user", password_hash="not-a-hash"))
        session.commit()
    assert "Detected uncommitted objects" not in caplog.text
