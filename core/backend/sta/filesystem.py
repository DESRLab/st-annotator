"""Binds the configured filesystem to the current execution scope."""

from contextlib import contextmanager

from sta.common.filesystem import fs_ctx

from .config import AppConfig


@contextmanager
def filesystem_ctx(config: AppConfig):
    with fs_ctx(config.fs_config.get_fs()) as default_fs:
        yield default_fs
