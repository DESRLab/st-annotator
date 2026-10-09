from __future__ import annotations

from functools import cached_property
from importlib import import_module
from pathlib import Path
from typing import TYPE_CHECKING, TypeVar

from pydantic import BaseModel, ValidationError

from sta.common.database import DatabaseConfig
from sta.common.filesystem import FilesystemConfig

if TYPE_CHECKING:
    from _typeshed import StrPath

__all__ = ['AppConfig']


_T = TypeVar('_T')

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
        module, attrpath = path.rsplit(':', 1)
    except ValueError as exc:
        msg = 'The import path should be in the form `<module>:<attrpath>`. Example: `mypkg.submod:MyClass.myclassmethod`'
        raise ValueError(msg) from exc

    mod = import_module(module)

    factory = mod
    for attr in attrpath.split('.'):
        factory = getattr(factory, attr)

    if not callable(factory):
        msg = f'The factory object at the path {path} is not callable'
        raise ValueError(msg)

    obj = factory()
    if not isinstance(obj, typ):
        msg = f'The constructed object is not of the expected type ({typ})'
        raise ValueError(msg)

    return obj


class AppConfig(BaseModel, frozen=True):
    db: str
    fs: str

    @staticmethod
    def from_file(path: StrPath):
        config_json = Path(path).read_text()

        try:
            return AppConfig.model_validate_json(config_json)
        except ValidationError as exc:
            msg = f'Failed to parse application config at path ({path})'
            raise ValueError(msg) from exc

    @cached_property
    def db_config(self) -> DatabaseConfig:
        return obj_from_path(self.db, DatabaseConfig)

    @cached_property
    def fs_config(self) -> FilesystemConfig:
        return obj_from_path(self.fs, FilesystemConfig)
