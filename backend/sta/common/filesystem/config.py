from __future__ import annotations

import os
from pathlib import Path
from typing import TYPE_CHECKING
from typing_extensions import Self

from dotenv import find_dotenv, load_dotenv
from fsspec import AbstractFileSystem
from fsspec.implementations.dirfs import DirFileSystem

if TYPE_CHECKING:
    from _typeshed import StrPath

__all__ = ['FilesystemConfig']


class FilesystemConfig:
    @classmethod
    def from_env(cls, dotenv_path: str | StrPath | None = None) -> Self:
        if dotenv_path is None:
            dotenv_path = find_dotenv(usecwd=True)

        if not load_dotenv(dotenv_path):
            msg = f'Unable to load `.env` file at path: {dotenv_path}'
            raise ValueError(msg)

        return cls(root=Path(os.environ['FILESYSTEM_ROOT']))

    def __init__(self, *, root: Path) -> None:
        """For internal use only."""
        super().__init__()

        self._root = root

    @property
    def root(self) -> Path:
        return self._root

    def get_fs(self) -> AbstractFileSystem:
        return DirFileSystem(self.root)
