"""Composition roots that start up and tear down the application and a disposable test app."""

import logging
from contextlib import contextmanager

from sta.common.database import SQLiteBackedDatabaseConfig
from sta.common.logging import set_logger_level

from .config import AppConfig, config_ctx
from .domain.label.data import LabelDataDomain
from .filesystem import filesystem_ctx
from .plugin import load_plugins
from .session import create_tables, dispose_engine, drop_tables, get_engine, insert_default_user


def _setup(app_config: AppConfig, *, debug: bool):
    set_logger_level(logging.DEBUG if debug else logging.INFO)
    load_plugins()


@contextmanager
def app_ctx(app_config: AppConfig, *, debug: bool = False):
    _setup(app_config, debug=debug)

    with config_ctx(app_config) as config:
        with filesystem_ctx(config):
            yield


@contextmanager
def test_app_ctx(
    app_config: AppConfig,
    *,
    debug: bool = False,
    with_plugins: bool = True,
    root_username: str = "admin",
    root_password: str = "admin",
):
    set_logger_level(logging.DEBUG if debug else logging.INFO)
    # Plugins are only loaded against server-based databases: the SQLite-backed
    # configurations boot a core-only test app, since plugins' geometry tables
    # need SpatiaLite to be created, and their label-data domains would join
    # commit-state preparation through `LabelDataDomain.iter_cruds`. Core
    # modules that register any plugin domains they need by direct import can
    # opt out of the entry-point load entirely via `with_plugins`.
    if with_plugins:
        if isinstance(app_config.db_config, SQLiteBackedDatabaseConfig):
            logging.getLogger(__name__).warning(
                "SQLite testing mode runs the core application without plugins; "
                "use a server database to exercise plugin schemas and routes."
            )
        else:
            load_plugins()

    with config_ctx(app_config) as config:
        with filesystem_ctx(config):
            config.db_config.create_db(drop_if_exists=True)

            engine = get_engine(config)
            tables_created = False
            parked_domains = {}
            try:
                created_tables = create_tables(engine)
                tables_created = True
                created_names = {table.name for table in created_tables}

                # Label domains registered by plugins loaded earlier in the same
                # process can reference tables that were not created on this
                # backend (e.g. geometry tables skipped on plain SQLite). Park
                # them so they do not join cross-domain commit-state preparation
                # (`LabelDataDomain.iter_cruds`) for the lifetime of this context.
                domain_registry = LabelDataDomain.domain_registry()
                parked_domains = {
                    table_cls: domain_registry.pop(table_cls)
                    for table_cls in list(domain_registry)
                    if table_cls.__tablename__ not in created_names
                }

                yield insert_default_user(
                    engine,
                    username=root_username,
                    password=root_password,
                )
            finally:
                LabelDataDomain.domain_registry().update(parked_domains)
                try:
                    if tables_created:
                        drop_tables(engine)
                finally:
                    # Tests create many identity-distinct configs. Release exact
                    # engine even when table cleanup fails, preventing pool leaks.
                    dispose_engine(config)
