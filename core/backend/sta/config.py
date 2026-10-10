"""Application configuration parsing and context."""

from __future__ import annotations

import threading
from contextlib import contextmanager
from dataclasses import dataclass
from importlib import import_module
from pathlib import Path
from typing import TYPE_CHECKING, TypeVar

from pydantic import BaseModel, ConfigDict, ValidationError

from sta.common.database import DatabaseConfig, PostGISDatabaseConfig
from sta.common.filesystem import FilesystemConfig

if TYPE_CHECKING:
    from _typeshed import StrPath

__all__ = ["AppConfig"]


_T = TypeVar("_T")


def obj_from_path(path: str, typ: type[_T]) -> _T:
    """
    Constructs a Python object from a callable.

    The callable is invoked with no arguments.

    Parameters
    ----------
    path : str
        The import path to the callable, in the form `<module>:<attrpath>`.
        Example: `mypkg.submod:MyClass.myclassmethod`
    typ: type
        The type of object to construct.
    """
    try:
        module, attrpath = path.rsplit(":", 1)
    except ValueError as exc:
        msg = "The import path should be in the form `<module>:<attrpath>`. Example: `mypkg.submod:MyClass.myclassmethod`"
        raise ValueError(msg) from exc

    mod = import_module(module)

    factory = mod
    for attr in attrpath.split("."):
        factory = getattr(factory, attr)

    if not callable(factory):
        msg = f"The factory object at the path {path} is not callable"
        raise ValueError(msg)

    obj = factory()
    if not isinstance(obj, typ):
        msg = f"The constructed object is not of the expected type ({typ})"
        raise ValueError(msg)

    return obj


class AppConfigArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")

    db: str
    fs: str

    @classmethod
    def from_file(cls, path: StrPath):
        config_json = Path(path).read_text()

        try:
            return cls.model_validate_json(config_json)
        except ValidationError as exc:
            msg = f"Failed to parse application config at path ({path})"
            raise ValueError(msg) from exc

    def as_config(self):
        return AppConfig(
            db_config=obj_from_path(self.db, DatabaseConfig),
            fs_config=obj_from_path(self.fs, FilesystemConfig),
        )


@dataclass(frozen=True)
class AppConfig:
    db_config: DatabaseConfig
    fs_config: FilesystemConfig

    @staticmethod
    def test(db_config: DatabaseConfig | None = None):
        """
        Creates an application configuration for testing purposes.

        Parameters
        ----------
        db_config : DatabaseConfig, optional
            The database to run the tests against. If not provided, a
            per-thread PostGIS database is constructed from the environment.
            Suites that need neither spatial columns nor plugin routes can
            pass one of the SQLite-backed configurations instead.
        """
        if db_config is None:
            pid = threading.get_ident()
            db_config = PostGISDatabaseConfig.from_env(db_suffix=f"_test_pid_{pid}")

        fs_config = FilesystemConfig.from_env()

        return AppConfig(db_config=db_config, fs_config=fs_config)


_config: AppConfig | None = None


@contextmanager
def config_ctx(config: AppConfig):
    global _config

    if _config is not None:
        msg = f"Already inside the context of another config {_config}"
        raise RuntimeError(msg)

    _config = config

    try:
        yield config
    finally:
        _config = None


def get_config() -> AppConfig:
    if _config is None:
        msg = "Not inside config context"
        raise RuntimeError(msg)

    return _config
