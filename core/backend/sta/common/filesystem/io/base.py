from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Callable
from typing import Concatenate, Protocol, TypeVar, overload
from typing_extensions import ParamSpec, Self

from ..path import FileSystemPath

__all__ = ["FileIO", "FilesystemIO"]


class FilesystemIO:
    """Base class that defines how to interact with the filesystem."""


TIO_contra = TypeVar("TIO_contra", bound="FileIO", contravariant=True)
P = ParamSpec("P")
R_co = TypeVar("R_co", covariant=True)


class NormalizedFileIOFunc(Protocol[TIO_contra, P, R_co]):
    @overload
    def __get__(self, obj: None, owner: type[TIO_contra] | None = ...) -> Self: ...
    @overload
    def __get__(
        self, obj: TIO_contra, owner: type[TIO_contra] | None = ...
    ) -> Callable[Concatenate[FileSystemPath, P], R_co]: ...

    def __call__(
        __self, self: TIO_contra, path: FileSystemPath, *args: P.args, **kwargs: P.kwargs
    ) -> R_co: ...


class FileIOFunc(Protocol[TIO_contra, P, R_co]):
    @overload
    def __get__(self, obj: None, owner: type[TIO_contra] | None = ...) -> Self: ...
    @overload
    def __get__(
        self, obj: TIO_contra, owner: type[TIO_contra] | None = ...
    ) -> Callable[Concatenate[str | FileSystemPath, P], R_co]: ...

    def __call__(
        __self,
        self: TIO_contra,
        uri_or_path: str | FileSystemPath,
        *args: P.args,
        **kwargs: P.kwargs,
    ) -> R_co: ...


class FileIO(FilesystemIO, ABC):
    """Base class that defines how to interact with a particular type of file."""

    def normalize_uri_or_path(self, uri_or_path: str | FileSystemPath) -> FileSystemPath:
        return FileSystemPath.from_uri(uri_or_path) if isinstance(uri_or_path, str) else uri_or_path

    def supports_read(self, uri_or_path: str | FileSystemPath) -> bool:
        """
        Returns `True` if the given file, as identified by its URI or path,
        can be read by this instance; otherwise, `False`.
        """
        path = self.normalize_uri_or_path(uri_or_path)
        return self._matches_suffix(self.read_suffixes, path)

    def supports_write(self, uri_or_path: str | FileSystemPath) -> bool:
        """
        Returns `True` if the given file, as identified by its URI or path,
        can be written by this instance; otherwise, `False`.
        """
        path = self.normalize_uri_or_path(uri_or_path)
        return self._matches_suffix(self.write_suffixes, path)

    @staticmethod
    def _matches_suffix(suffixes: tuple[str, ...] | str, path: FileSystemPath) -> bool:
        if isinstance(suffixes, str):
            return path.suffix == suffixes

        return path.suffix in suffixes

    @property
    @abstractmethod
    def read_suffixes(self) -> tuple[str, ...] | str:
        """
        A tuple containing each file suffix (including the leading dot) this instance can read.

        If only one file suffix is supported, you may instead pass in a string.
        """
        raise NotImplementedError

    @property
    def write_suffixes(self) -> tuple[str, ...] | str:
        """
        A tuple containing each file suffix (including the leading dot) this instance can write.

        Defaults to `read_suffixes`; override when the instance can read formats it cannot write.
        If only one file suffix is supported, you may instead pass in a string.
        """
        return self.read_suffixes

    @staticmethod
    def reader(fn: NormalizedFileIOFunc[TIO_contra, P, R_co]) -> FileIOFunc[TIO_contra, P, R_co]:
        """
        Wraps a reader function so that it checks the suffix of the given path against
        `read_suffixes` before attempting to read from it.

        It also allows the reader function to accept a URI instead of only a path.
        """

        def wrapper(
            self: TIO_contra, uri_or_path: str | FileSystemPath, *args: P.args, **kwargs: P.kwargs
        ) -> R_co:
            path = self.normalize_uri_or_path(uri_or_path)
            if not self.supports_read(path):
                msg = (
                    f"Unsupported file suffix: {path.suffix}. Valid suffixes: {self.read_suffixes}"
                )
                raise ValueError(msg)

            return fn(self, path, *args, **kwargs)

        return wrapper

    @staticmethod
    def writer(fn: NormalizedFileIOFunc[TIO_contra, P, R_co]) -> FileIOFunc[TIO_contra, P, R_co]:
        """
        Wraps a writer function so that it checks the suffix of the given path against
        `write_suffixes` and creates the necessary directories before attempting to write to it.

        It also allows the writer function to accept a URI instead of only a path.
        """

        def wrapper(
            self: TIO_contra, uri_or_path: str | FileSystemPath, *args: P.args, **kwargs: P.kwargs
        ) -> R_co:
            path = self.normalize_uri_or_path(uri_or_path)
            if not self.supports_write(path):
                msg = (
                    f"Unsupported file suffix: {path.suffix}. Valid suffixes: {self.write_suffixes}"
                )
                raise ValueError(msg)

            path.parent.mkdir(parents=True, exist_ok=True)

            return fn(self, path, *args, **kwargs)

        return wrapper
