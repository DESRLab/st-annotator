"""Fixtures for the repo-level backend integration tests.

These tests live outside the core library because they require the plugin
backends (``sta_pcd``/``sta_bbox``/``sta_segmentation``), which depend on
``sta`` themselves and therefore cannot be core dependencies. They run in
this project's own venv, which declares ``sta`` and the plugin backends
(see ``scripts/install.sh`` and the integration phase of ``scripts/test.sh``).
"""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest

from sta.common.filesystem import FilesystemConfig, fs_ctx

pytest_plugins = [
    "sta.testing.pytest_fixtures",
]


@pytest.fixture
def fs_root(tmp_path: Path) -> Iterator[Path]:
    """Yields a temporary directory with an active filesystem context rooted at it."""
    with fs_ctx(FilesystemConfig(root=tmp_path).get_fs()):
        yield tmp_path
