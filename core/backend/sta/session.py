"""Database engine caching, table creation and teardown, and request-scoped sessions."""

from contextlib import contextmanager
from typing import Annotated, Any

from fastapi import Depends
from sqlalchemy import Engine, Table
from sqlmodel import Session, SQLModel

from sta.common.logging import get_logger

from .config import AppConfig, get_config
from .domain.users import create_root_user
from .models.user import UserPublic

logger = get_logger()


def _is_geometry_column(column: Any) -> bool:
    return type(column.type).__module__.startswith("geoalchemy2")


def _tables_for_engine(engine: Engine) -> list[Table]:
    tables = list(SQLModel.metadata.tables.values())

    if engine.dialect.name == "sqlite":
        # Plain SQLite has no SpatiaLite extension, so the geometry columns
        # geoalchemy2 registers cannot be created there. Skip any table that
        # has one; the non-spatial suites that run on SQLite never touch them.
        tables = [
            table
            for table in tables
            if not any(_is_geometry_column(column) for column in table.columns)
        ]

    return tables


def create_tables(engine: Engine) -> list[Table]:
    tables = _tables_for_engine(engine)

    SQLModel.metadata.create_all(engine, tables=tables)

    return tables


def insert_default_user(
    engine: Engine,
    *,
    username: str = "admin",
    password: str = "admin",
):
    with Session(engine) as session:
        record = create_root_user(
            session=session,
            username=username,
            password=password,
        )
        user = UserPublic.model_validate(record)

        session.commit()

    return user


def drop_tables(engine: Engine):
    tables = list(SQLModel.metadata.tables.values())

    SQLModel.metadata.drop_all(engine, tables=tables)


_engines: dict[int, tuple[AppConfig, Engine]] = {}


def get_engine(config: AppConfig) -> Engine:
    # Cache by object identity: independently owned configs must never merge
    # merely because their fields compare equal.
    key = id(config)
    cached = _engines.get(key)
    if cached is None or cached[0] is not config:
        cached = (config, config.db_config.get_engine())
        _engines[key] = cached
    return cached[1]


def dispose_engine(config: AppConfig) -> None:
    """Dispose and evict exact config's engine."""
    cached = _engines.get(id(config))
    if cached is not None and cached[0] is config:
        _engines.pop(id(config))
        cached[1].dispose()


def get_session(config: Annotated[AppConfig, Depends(get_config)]):
    engine = get_engine(config)

    with Session(engine) as session:
        try:
            yield session

            if session.new or session.dirty or session.deleted:
                logger.warning(
                    "Detected uncommitted objects: %d new, %d dirty, %d deleted",
                    len(session.new),
                    len(session.dirty),
                    len(session.deleted),
                )
        finally:
            pass


session_ctx = contextmanager(get_session)
