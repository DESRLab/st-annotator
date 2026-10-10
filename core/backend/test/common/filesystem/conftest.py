"""Shared fixtures for the filesystem layer tests."""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest

# Importing the `base` submodule through the package also guards against the
# star-import shadowing it with `sta.common.filesystem.io.base`.
from sta.common.filesystem import FilesystemConfig, base as filesystem_base, fs_ctx


@pytest.fixture(autouse=True)
def restore_default_filesystem() -> Iterator[None]:
    """Snapshot and restore the module-level default filesystem around every test.

    Several tests mutate the global default (via ``init_fs`` or ``fs_ctx``);
    without restoration the mutation would leak into unrelated tests.
    """
    saved = filesystem_base._default_fs
    yield
    filesystem_base._default_fs = saved


@pytest.fixture
def fs_root(tmp_path: Path) -> Iterator[Path]:
    """Yields a temporary directory with an active filesystem context rooted at it."""
    with fs_ctx(FilesystemConfig(root=tmp_path).get_fs()):
        yield tmp_path
