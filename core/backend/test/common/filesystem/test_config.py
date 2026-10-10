"""`FILESYSTEM_ROOT` resolution by `FilesystemConfig.from_env`."""

from __future__ import annotations

from pathlib import Path

import pytest

from sta.common.filesystem import FilesystemConfig


def write_dotenv(directory: Path, root: str) -> Path:
    """Writes a minimal `.env` declaring `FILESYSTEM_ROOT` as `root`."""
    path = directory / ".env"
    path.write_text(f"FILESYSTEM_ROOT={root}\n")
    return path


@pytest.fixture
def clean_root(monkeypatch) -> None:
    """Clears an inherited value, since `load_dotenv` never overrides the environment."""
    monkeypatch.delenv("FILESYSTEM_ROOT", raising=False)


def test_relative_root_is_anchored_to_its_env_file(tmp_path, clean_root, monkeypatch):
    env_path = write_dotenv(tmp_path, "data")

    # A different working directory proves the root does not follow the caller.
    elsewhere = tmp_path / "elsewhere"
    elsewhere.mkdir()
    monkeypatch.chdir(elsewhere)

    assert FilesystemConfig.from_env(env_path).root == tmp_path / "data"


def test_absolute_root_is_used_as_is(tmp_path, clean_root):
    root = tmp_path / "data"
    env_path = write_dotenv(tmp_path, str(root))

    assert FilesystemConfig.from_env(env_path).root == root


def test_validate_root_rejects_a_missing_directory(tmp_path):
    config = FilesystemConfig(root=tmp_path / "missing")

    with pytest.raises(ValueError, match=r"FILESYSTEM_ROOT does not exist"):
        config.validate_root()


def test_missing_env_file_raises(tmp_path, clean_root):
    with pytest.raises(ValueError, match=r"Unable to load `\.env` file"):
        FilesystemConfig.from_env(tmp_path / "absent.env")
