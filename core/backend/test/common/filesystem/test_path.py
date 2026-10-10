"""Tests for ``sta.common.filesystem.path.FileSystemPath``."""

from __future__ import annotations

from pathlib import Path

from fsspec.implementations.dirfs import DirFileSystem
from fsspec.implementations.memory import MemoryFileSystem

import pytest

# Importing the `base` submodule through the package also guards against the
# star-import shadowing it with `sta.common.filesystem.io.base`.
from sta.common.filesystem import base as filesystem_base
from sta.common.filesystem.path import FileSystemPath


class TestFromUri:
    def test_binds_default_filesystem_to_relative_uri(self, fs_root: Path):
        path = FileSystemPath.from_uri("data/file.txt")

        assert isinstance(path.fs, DirFileSystem)
        assert path.path == Path("data/file.txt")

    def test_paths_from_same_context_share_filesystem(self, fs_root: Path):
        a = FileSystemPath.from_uri("a.txt")
        b = FileSystemPath.from_uri("b.txt")

        assert a.fs is b.fs

    def test_scheme_uri_is_not_supported(self, fs_root: Path):
        with pytest.raises(NotImplementedError, match="not supported"):
            FileSystemPath.from_uri("memory:///data/file.txt")

    def test_schemeless_uri_outside_context_raises(self):
        filesystem_base._default_fs = None

        with pytest.raises(RuntimeError, match="Not inside filesystem context"):
            FileSystemPath.from_uri("data/file.txt")


class TestAsUri:
    def test_returns_plain_path_for_dir_filesystem(self, fs_root: Path):
        assert FileSystemPath.from_uri("data/file.txt").as_uri() == "data/file.txt"

    def test_raises_for_unsupported_filesystem(self):
        path = FileSystemPath(fs=MemoryFileSystem(), path=Path("data/file.txt"))

        with pytest.raises(NotImplementedError, match="not supported"):
            path.as_uri()


class TestPathlibDelegation:
    def test_relative_path_properties(self, fs_root: Path):
        path = FileSystemPath.from_uri("dir/sub/file.tar.gz")

        assert path.path_str == "dir/sub/file.tar.gz"
        assert path.parts == ("dir", "sub", "file.tar.gz")
        assert path.drive == ""
        assert path.root == ""
        assert path.anchor == ""
        assert path.name == "file.tar.gz"
        assert path.suffix == ".gz"
        assert path.suffixes == [".tar", ".gz"]
        assert path.stem == "file.tar"
        assert not path.is_absolute()

    def test_absolute_path_properties(self, fs_root: Path):
        # URI resolution rejects absolute user paths, but FileSystemPath still
        # delegates pathlib properties for paths supplied by filesystem code.
        relative_path = FileSystemPath.from_uri("file.txt")
        path = FileSystemPath(fs=relative_path.fs, path=Path("/abs/dir/file.txt"))

        assert path.is_absolute()
        assert path.root == "/"
        assert path.anchor == "/"

    def test_match(self, fs_root: Path):
        path = FileSystemPath.from_uri("data/sub/file.txt")

        assert path.match("*.txt")
        assert path.match("sub/*.txt")
        assert not path.match("*.csv")

    def test_with_name_keeps_filesystem(self, fs_root: Path):
        path = FileSystemPath.from_uri("data/file.txt")

        renamed = path.with_name("other.csv")

        assert renamed.path == Path("data/other.csv")
        assert renamed.fs is path.fs

    def test_with_stem_keeps_filesystem(self, fs_root: Path):
        path = FileSystemPath.from_uri("data/file.txt")

        renamed = path.with_stem("renamed")

        assert renamed.path == Path("data/renamed.txt")
        assert renamed.fs is path.fs

    def test_with_suffix_keeps_filesystem(self, fs_root: Path):
        path = FileSystemPath.from_uri("data/file.txt")

        renamed = path.with_suffix(".json")

        assert renamed.path == Path("data/file.json")
        assert renamed.fs is path.fs

    def test_truediv_appends_child(self, fs_root: Path):
        path = FileSystemPath.from_uri("data")

        child = path / "sub" / "file.txt"

        assert child.path == Path("data/sub/file.txt")
        assert child.fs is path.fs

    def test_rtruediv_prepends_parent(self, fs_root: Path):
        path = FileSystemPath.from_uri("data/file.txt")

        joined = "prefix" / path

        assert joined.path == Path("prefix/data/file.txt")
        assert joined.fs is path.fs

    def test_parent_and_parents(self, fs_root: Path):
        path = FileSystemPath.from_uri("a/b/c.txt")

        assert path.parent.path == Path("a/b")
        assert path.parent.fs is path.fs
        assert [parent.path for parent in path.parents] == [Path("a/b"), Path("a"), Path()]
        assert all(parent.fs is path.fs for parent in path.parents)


class TestRelativeTo:
    def test_returns_self_relative_to_other(self, fs_root: Path):
        parent = FileSystemPath.from_uri("data")
        child = FileSystemPath.from_uri("data/sub/file.txt")

        assert child.relative_to(parent).path == Path("sub/file.txt")

    def test_relative_to_non_ancestor_raises(self, fs_root: Path):
        parent = FileSystemPath.from_uri("data")
        child = FileSystemPath.from_uri("data/sub/file.txt")

        with pytest.raises(ValueError):
            parent.relative_to(child)

    def test_different_filesystems_raise(self, fs_root: Path):
        a = FileSystemPath.from_uri("data/file.txt")
        b = FileSystemPath(fs=MemoryFileSystem(), path=Path("data/file.txt"))

        with pytest.raises(ValueError, match="different filesystems"):
            a.relative_to(b)

    def test_is_relative_to_matches_pathlib_semantics(self, fs_root: Path):
        parent = FileSystemPath.from_uri("data")
        child = FileSystemPath.from_uri("data/sub/file.txt")

        assert child.is_relative_to(parent)
        assert not parent.is_relative_to(child)

    def test_is_relative_to_is_false_for_different_filesystems(self, fs_root: Path):
        a = FileSystemPath.from_uri("data/file.txt")
        b = FileSystemPath(fs=MemoryFileSystem(), path=Path("data/file.txt"))

        assert not a.is_relative_to(b)


class TestFilesystemOperations:
    def test_exists_is_dir_is_file(self, fs_root: Path):
        (fs_root / "dir").mkdir()
        (fs_root / "dir" / "file.txt").write_text("data")

        dir_path = FileSystemPath.from_uri("dir")
        file_path = FileSystemPath.from_uri("dir/file.txt")
        missing_path = FileSystemPath.from_uri("missing.txt")

        assert dir_path.exists()
        assert dir_path.is_dir()
        assert not dir_path.is_file()

        assert file_path.exists()
        assert file_path.is_file()
        assert not file_path.is_dir()

        assert not missing_path.exists()
        assert not missing_path.is_dir()
        assert not missing_path.is_file()

    def test_glob_yields_matching_children(self, fs_root: Path):
        (fs_root / "data").mkdir()
        (fs_root / "data" / "a.txt").write_text("a")
        (fs_root / "data" / "b.txt").write_text("b")
        (fs_root / "data" / "c.csv").write_text("c")

        found = sorted(child.path_str for child in FileSystemPath.from_uri("data").glob("*.txt"))

        assert found == ["data/a.txt", "data/b.txt"]

    def test_iterdir_yields_all_children(self, fs_root: Path):
        (fs_root / "data").mkdir()
        (fs_root / "data" / "a.txt").write_text("a")
        (fs_root / "data" / "b.csv").write_text("b")

        found = sorted(child.path_str for child in FileSystemPath.from_uri("data").iterdir())

        assert found == ["data/a.txt", "data/b.csv"]

    def test_mkdir_creates_directory(self, fs_root: Path):
        FileSystemPath.from_uri("new_dir").mkdir()

        assert (fs_root / "new_dir").is_dir()

    def test_mkdir_parents_creates_nested_directories(self, fs_root: Path):
        FileSystemPath.from_uri("a/b/c").mkdir(parents=True)

        assert (fs_root / "a/b/c").is_dir()

    def test_mkdir_missing_parent_raises(self, fs_root: Path):
        with pytest.raises(FileNotFoundError):
            FileSystemPath.from_uri("a/b").mkdir()

    def test_mkdir_existing_raises_without_exist_ok(self, fs_root: Path):
        (fs_root / "existing").mkdir()

        with pytest.raises(FileExistsError):
            FileSystemPath.from_uri("existing").mkdir()

    def test_mkdir_existing_is_noop_with_exist_ok(self, fs_root: Path):
        (fs_root / "existing").mkdir()

        FileSystemPath.from_uri("existing").mkdir(exist_ok=True)

        assert (fs_root / "existing").is_dir()

    def test_mkdir_existing_file_raises_even_with_exist_ok(self, fs_root: Path):
        (fs_root / "blocker").write_text("not a directory")

        with pytest.raises(FileExistsError):
            FileSystemPath.from_uri("blocker").mkdir()
        with pytest.raises(FileExistsError):
            FileSystemPath.from_uri("blocker").mkdir(exist_ok=True)

        assert (fs_root / "blocker").is_file()

    def test_stat_reports_file_info(self, fs_root: Path):
        (fs_root / "file.txt").write_text("data")

        stat = FileSystemPath.from_uri("file.txt").stat()

        assert stat["size"] == 4
        assert stat["type"] == "file"

    def test_open_round_trips_text_and_binary(self, fs_root: Path):
        text = FileSystemPath.from_uri("file.txt")
        with text.open("w") as f:
            f.write("hello")
        with text.open("r") as f:
            assert f.read() == "hello"

        binary = FileSystemPath.from_uri("file.bin")
        with binary.open("wb") as f:
            f.write(b"\x00\x01")
        with binary.open("rb") as f:
            assert f.read() == b"\x00\x01"

    def test_unlink_existing_removes_file(self, fs_root: Path):
        (fs_root / "file.txt").write_text("data")
        path = FileSystemPath.from_uri("file.txt")

        path.unlink()

        assert not path.exists()

    def test_unlink_existing_with_missing_ok_removes_file(self, fs_root: Path):
        (fs_root / "file.txt").write_text("data")
        path = FileSystemPath.from_uri("file.txt")

        path.unlink(missing_ok=True)

        assert not path.exists()

    def test_unlink_missing_raises_file_not_found(self, fs_root: Path):
        path = FileSystemPath.from_uri("missing.txt")

        with pytest.raises(FileNotFoundError):
            path.unlink()

    def test_unlink_missing_with_missing_ok_is_silent(self, fs_root: Path):
        path = FileSystemPath.from_uri("missing.txt")

        path.unlink(missing_ok=True)

    def test_copyfile_to_copies_contents(self, fs_root: Path):
        (fs_root / "src.txt").write_text("payload")
        (fs_root / "dst").mkdir()
        src = FileSystemPath.from_uri("src.txt")
        dst = FileSystemPath.from_uri("dst/copy.txt")

        src.copyfile_to(dst)

        assert src.exists()
        assert dst.exists()
        assert (fs_root / "dst" / "copy.txt").read_text() == "payload"
