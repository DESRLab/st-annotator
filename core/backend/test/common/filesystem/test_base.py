"""Tests for ``sta.common.filesystem.base``: ``init_fs``/``fs_ctx``/``resolve_uri``/``format_uri``."""

from __future__ import annotations

from pathlib import Path

from fsspec.implementations.dirfs import DirFileSystem
from fsspec.implementations.memory import MemoryFileSystem

import pytest

# Importing the `base` submodule through the package also guards against the
# star-import shadowing it with `sta.common.filesystem.io.base`.
from sta.common.filesystem import base as filesystem_base
from sta.common.filesystem.base import format_uri, fs_ctx, init_fs, resolve_uri


class TestInitFs:
    def test_sets_and_returns_default_filesystem(self, tmp_path: Path):
        fs = DirFileSystem(tmp_path)

        returned = init_fs(fs)

        assert returned is fs
        assert filesystem_base._default_fs is fs

    def test_makes_schemeless_uris_resolvable(self, tmp_path: Path):
        fs = DirFileSystem(tmp_path)
        init_fs(fs)

        resolved_fs, resolved_path = resolve_uri("data/file.txt")

        assert resolved_fs is fs
        assert resolved_path == "data/file.txt"


class TestFsCtx:
    def test_yields_and_sets_default_filesystem(self, tmp_path: Path):
        fs = DirFileSystem(tmp_path)
        assert filesystem_base._default_fs is None

        with fs_ctx(fs) as yielded:
            assert yielded is fs
            assert filesystem_base._default_fs is fs

        assert filesystem_base._default_fs is None

    def test_restores_previous_default_on_exit(self, tmp_path: Path):
        outer = DirFileSystem(tmp_path)
        inner = MemoryFileSystem()
        init_fs(outer)

        with fs_ctx(inner):
            assert filesystem_base._default_fs is inner

        # On exit, the previously active default is restored rather than
        # cleared, so nested contexts do not drop the outer default.
        assert filesystem_base._default_fs is outer

    def test_restores_none_when_no_previous_default(self, tmp_path: Path):
        filesystem_base._default_fs = None
        fs = DirFileSystem(tmp_path)

        with fs_ctx(fs):
            assert filesystem_base._default_fs is fs

        assert filesystem_base._default_fs is None


class TestResolveUri:
    def test_returns_default_filesystem_for_schemeless_uri(self, fs_root: Path):
        fs, path = resolve_uri("data/file.txt")

        assert isinstance(fs, DirFileSystem)
        assert path == "data/file.txt"

    def test_raises_without_filesystem_context(self):
        filesystem_base._default_fs = None

        with pytest.raises(RuntimeError, match="Not inside filesystem context"):
            resolve_uri("data/file.txt")

    def test_raises_for_scheme_uris(self):
        with pytest.raises(
            NotImplementedError,
            match="The filesystem protocol 'memory' is not supported",
        ):
            resolve_uri("memory:///data/file.txt")

    @pytest.mark.parametrize("uri", ["/etc/passwd", "../secret", "data/../../secret"])
    def test_rejects_absolute_and_parent_paths(self, fs_root: Path, uri: str):
        with pytest.raises(ValueError, match="must be relative"):
            resolve_uri(uri)


class TestFormatUri:
    def test_returns_plain_path_for_dir_filesystem(self, tmp_path: Path):
        fs = DirFileSystem(tmp_path)

        assert format_uri(fs, "data/file.txt") == "data/file.txt"

    def test_raises_for_unsupported_filesystem(self):
        with pytest.raises(
            NotImplementedError,
            match="The filesystem protocol 'memory' is not supported",
        ):
            format_uri(MemoryFileSystem(), "data/file.txt")
