"""Dataset importer fixtures using the standard test application."""

from collections.abc import Callable, Iterator
from pathlib import Path

import pytest

from sta.common.filesystem import FilesystemConfig, fs_ctx

from .semantickitti_helpers import write_semantickitti_frame as _write_semantickitti_frame

pytest_plugins = ["sta.testing.pytest_fixtures"]


@pytest.fixture
def fs_root(tmp_path: Path) -> Iterator[Path]:
    """Yields a temporary directory with an active filesystem context rooted at it."""
    with fs_ctx(FilesystemConfig(root=tmp_path).get_fs()):
        yield tmp_path


@pytest.fixture
def write_semantickitti_frame() -> Callable[..., Path]:
    """Yields a callable that writes synthetic SemanticKITTI frames to a dataset root."""
    return _write_semantickitti_frame
