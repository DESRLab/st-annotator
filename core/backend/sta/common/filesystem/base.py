from __future__ import annotations

from contextlib import contextmanager
from pathlib import Path
from urllib.parse import urlparse

from fsspec import AbstractFileSystem, url_to_fs
from fsspec.implementations.dirfs import DirFileSystem

__all__ = ["fs_ctx", "init_fs"]


_default_fs: AbstractFileSystem | None = None


def init_fs(fs: AbstractFileSystem) -> AbstractFileSystem:
    global _default_fs

    _default_fs = fs

    return fs


@contextmanager
def fs_ctx(fs: AbstractFileSystem):
    global _default_fs

    prev_fs = _default_fs
    _default_fs = fs

    try:
        yield fs
    finally:
        _default_fs = prev_fs


def resolve_uri(uri: str) -> tuple[AbstractFileSystem, str]:
    """Resolve the filesystem and path of a URI."""
    if not urlparse(uri).scheme:
        path = Path(uri)
        if path.is_absolute() or ".." in path.parts:
            msg = "Filesystem paths must be relative and cannot navigate to a parent directory"
            raise ValueError(msg)

        if _default_fs is None:
            msg = "Not inside filesystem context"
            raise RuntimeError(msg)

        # Local paths are assumed to be under _default_fs
        return _default_fs, uri

    fs, _ = url_to_fs(uri)

    msg = f"The filesystem protocol '{fs.protocol}' is not supported"
    raise NotImplementedError(msg)


def format_uri(fs: AbstractFileSystem, path: str) -> str:
    if isinstance(fs, DirFileSystem):
        return path

    msg = f"The filesystem protocol '{fs.protocol}' is not supported"
    raise NotImplementedError(msg)
