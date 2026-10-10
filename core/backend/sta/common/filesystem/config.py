from __future__ import annotations

import os
from pathlib import Path
from typing import TYPE_CHECKING
from typing_extensions import Self

from dotenv import find_dotenv, load_dotenv
from fsspec import AbstractFileSystem
from fsspec.implementations.dirfs import DirFileSystem

from sta.common.utils.env_path import anchored_path
from sta.envs import FILESYSTEM_ROOT

if TYPE_CHECKING:
    from _typeshed import StrPath

__all__ = ["FilesystemConfig"]


class FilesystemConfig:
    @classmethod
    def from_env(cls, dotenv_path: str | StrPath | None = None) -> Self:
        if dotenv_path is None:
            dotenv_path = find_dotenv(usecwd=True)

        if not load_dotenv(dotenv_path):
            msg = f"Unable to load `.env` file at path: {dotenv_path}"
            raise ValueError(msg)

        root = anchored_path(os.environ[FILESYSTEM_ROOT], dotenv_path)

        return cls(root=root)

    def __init__(self, *, root: Path) -> None:
        """For internal use only."""
        super().__init__()

        self._root = root

    @property
    def root(self) -> Path:
        return self._root

    def validate_root(self) -> None:
        """Ensure the configured filesystem root is an existing directory."""
        if not self.root.is_dir():
            msg = f"FILESYSTEM_ROOT does not exist or is not a directory: {self.root}"
            raise ValueError(msg)

    def get_fs(self) -> AbstractFileSystem:
        return DirFileSystem(self.root)
