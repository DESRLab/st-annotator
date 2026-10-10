"""Fixtures for the repo-level backend integration tests.

These tests live outside the core library because they require the plugin
backends (``sta_pcd``/``sta_bbox``/``sta_segmentation``), which depend on
``sta`` themselves and therefore cannot be core dependencies. They run in
this project's own venv, which declares ``sta`` and the plugin backends
(see ``scripts/install.sh`` and the integration phase of ``scripts/test.sh``).
"""

from __future__ import annotations

import sys
from collections.abc import Callable, Iterator
from pathlib import Path

import pytest

from sta.common.filesystem import FilesystemConfig, fs_ctx

from .semantickitti_helpers import (
    write_semantickitti_frame as _write_semantickitti_frame,
)

pytest_plugins = [
    "sta.testing.pytest_fixtures",
]

# The scripts under `scripts/` live outside the `sta` package (so they are
# never measured by `--cov=sta`). They are imported by inserting the repo
# root into `sys.path` here, mirroring how the e2e fixture servers used to
# import them via `PYTHONPATH`.
REPO_ROOT = Path(__file__).resolve().parents[2]

if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))


@pytest.fixture
def fs_root(tmp_path: Path) -> Iterator[Path]:
    """Yields a temporary directory with an active filesystem context rooted at it."""
    with fs_ctx(FilesystemConfig(root=tmp_path).get_fs()):
        yield tmp_path


@pytest.fixture
def write_semantickitti_frame() -> Callable[..., Path]:
    """Yields a callable that writes synthetic SemanticKITTI frames to a dataset root."""
    return _write_semantickitti_frame
