from __future__ import annotations

from collections.abc import Generator, Sequence
from io import TextIOWrapper
from pathlib import Path
from typing import TYPE_CHECKING, Any, BinaryIO, IO, NamedTuple, overload
from typing_extensions import Self

from fsspec import AbstractFileSystem

from .base import format_uri, resolve_uri

if TYPE_CHECKING:
    from _typeshed import OpenBinaryMode, OpenTextMode

__all__ = ["FileSystemPath"]


class FileSystemPath(NamedTuple):
    fs: AbstractFileSystem
    path: Path

    @staticmethod
    def from_uri(uri: str) -> FileSystemPath:
        fs, path = resolve_uri(uri)
        return FileSystemPath(fs, Path(path))

    def as_uri(self) -> str:
        return format_uri(self.fs, self.path_str)

    def _with_path(self, path: Path) -> Self:
        return type(self)(fs=self.fs, path=path)

    @property
    def path_str(self) -> str:
        return str(self.path)

    @property
    def parts(self) -> tuple[str, ...]:
        return self.path.parts

    @property
    def drive(self) -> str:
        return self.path.drive

    @property
    def root(self) -> str:
        return self.path.root

    @property
    def anchor(self) -> str:
        return self.path.anchor

    @property
    def name(self) -> str:
        return self.path.name

    @property
    def suffix(self) -> str:
        return self.path.suffix

    @property
    def suffixes(self) -> list[str]:
        return self.path.suffixes

    @property
    def stem(self) -> str:
        return self.path.stem

    def is_absolute(self) -> bool:
        return self.path.is_absolute()

    def relative_to(self, other: FileSystemPath) -> Self:
        if self.fs != other.fs:
            msg = f"The two paths have different filesystems: {self.fs} vs. {other.fs}"
            raise ValueError(msg)

        return self._with_path(self.path.relative_to(other.path))

    def match(self, path_pattern: str) -> bool:
        return self.path.match(path_pattern)

    def with_name(self, name: str) -> Self:
        return self._with_path(self.path.with_name(name))

    def with_stem(self, stem: str) -> Self:
        return self._with_path(self.path.with_stem(stem))

    def with_suffix(self, suffix: str) -> Self:
        return self._with_path(self.path.with_suffix(suffix))

    def is_relative_to(self, other: FileSystemPath) -> bool:
        try:
            self.relative_to(other)
            return True
        except ValueError:
            return False

    def __truediv__(self, key: str) -> Self:
        return self._with_path(self.path / key)

    def __rtruediv__(self, key: str) -> Self:
        return self._with_path(key / self.path)

    @property
    def parent(self) -> Self:
        return self._with_path(self.path.parent)

    @property
    def parents(self) -> Sequence[Self]:
        return [self._with_path(parent) for parent in self.path.parents]

    def exists(self) -> bool:
        return self.fs.exists(self.path_str)

    def is_dir(self) -> bool:
        return self.fs.isdir(self.path_str)

    def is_file(self) -> bool:
        return self.fs.isfile(self.path_str)

    def glob(self, pattern: str) -> Generator[Self, None, None]:
        for child in self.fs.glob(f"{self.path}/{pattern}"):
            yield self._with_path(Path(child))  # pyright: ignore[reportArgumentType]

    def iterdir(self) -> Generator[Self, None, None]:
        for child in self.fs.ls(self.path_str, detail=False):
            yield self._with_path(Path(child))

    def mkdir(self, mode: int = 0o777, parents: bool = False, exist_ok: bool = False) -> None:  # noqa: FBT001, FBT002
        if self.exists():
            # Mirror pathlib: exist_ok only tolerates an existing directory,
            # never a path that exists as a file.
            if exist_ok and self.is_dir():
                return

            msg = f"Path already exists: {self.path}"
            raise FileExistsError(msg)

        self.fs.mkdir(self.path_str, mode=mode, create_parents=parents)

    def stat(self):
        return self.fs.stat(self.path_str)

    @overload
    def open(self, mode: OpenTextMode = "r") -> TextIOWrapper: ...
    @overload
    def open(self, mode: OpenBinaryMode) -> BinaryIO: ...
    @overload
    def open(self, mode: str) -> IO[Any]: ...

    def open(self, mode: str = "r") -> IO[Any]:
        return self.fs.open(self.path_str, mode=mode)  # pyright: ignore[reportReturnType]

    def unlink(self, *, missing_ok: bool = False) -> None:
        if not self.exists():
            if missing_ok:
                return

            msg = f"No file to delete at path: {self.path}"
            raise FileNotFoundError(msg)

        self.fs.rm_file(self.path_str)

    def copyfile_to(self, dst: Self) -> None:
        self.fs.cp_file(self.path_str, dst.path_str)
