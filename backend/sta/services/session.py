from contextlib import contextmanager
from functools import lru_cache
from typing import Annotated

from fastapi import Depends
from sqlalchemy import Engine
from sqlmodel import Session, SQLModel

from sta.common.logging import get_logger

from .config import AppConfig, get_config
from .domain.users import create_root_user
from .models.user import UserPublic

logger = get_logger()


def create_tables(engine: Engine):
    tables = list(SQLModel.metadata.tables.values())

    SQLModel.metadata.create_all(engine, tables=tables)


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


@lru_cache
def get_engine(config: AppConfig) -> Engine:
    return config.db_config.get_engine()


@contextmanager
def tmp_db_ctx(
    config: AppConfig,
    *,
    root_username: str = "admin",
    root_password: str = "admin",
):
    config.db_config.create_db(drop_if_exists=True)

    engine = get_engine(config)

    create_tables(engine)
    try:
        yield insert_default_user(
            engine,
            username=root_username,
            password=root_password,
        )
    finally:
        drop_tables(engine)


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
