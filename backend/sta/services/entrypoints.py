import logging
from contextlib import contextmanager

from sta.common.logging import set_logger_level

from ..plugin import load_plugins
from .config import AppConfig, config_ctx
from .filesystem import filesystem_ctx
from .session import tmp_db_ctx


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
    app_config: AppConfig | None = None,
    *,
    debug: bool = False,
    root_username: str = "admin",
    root_password: str = "admin",
):
    if app_config is None:
        app_config = AppConfig.test()

    _setup(app_config, debug=debug)

    with config_ctx(app_config) as config:
        with filesystem_ctx(config):
            with tmp_db_ctx(
                config,
                root_username=root_username,
                root_password=root_password,
            ) as user:
                yield user
