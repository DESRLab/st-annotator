"""Tests for ``sta.common.filesystem.io.base``: normalization, `supports_read`/`supports_write`, reader/writer wrappers."""

from __future__ import annotations

from pathlib import Path

import pytest

from sta.common.filesystem.io.base import FileIO
from sta.common.filesystem.io.csv import CSVFileIO
from sta.common.filesystem.io.json import JSONFileIO
from sta.common.filesystem.path import FileSystemPath


class RecordingFileIO(FileIO):
    """Minimal FileIO used to exercise the reader/writer wrappers in isolation."""

    def __init__(self) -> None:
        self.written: list[tuple[FileSystemPath, str]] = []

    @property
    def read_suffixes(self) -> tuple[str, ...] | str:
        return ".rec"

    @FileIO.reader
    def read(self, path: FileSystemPath) -> str:
        return path.path_str

    @FileIO.writer
    def write(self, path: FileSystemPath, data: str) -> None:
        self.written.append((path, data))


class ReadMostlyFileIO(RecordingFileIO):
    """FileIO that can read more formats than it can write, like ``PointCloudFileIO``."""

    @property
    def read_suffixes(self) -> tuple[str, ...] | str:
        return ".rec", ".readonly"

    @property
    def write_suffixes(self) -> tuple[str, ...] | str:
        return ".rec"


class TestNormalizeUriOrPath:
    def test_converts_uri_string_to_path(self, fs_root: Path):
        path = JSONFileIO().normalize_uri_or_path("data/file.json")

        assert isinstance(path, FileSystemPath)
        assert path.path == Path("data/file.json")

    def test_passes_filesystem_path_through_unchanged(self, fs_root: Path):
        path = FileSystemPath.from_uri("data/file.json")

        assert JSONFileIO().normalize_uri_or_path(path) is path


class TestSupportsReadAndWrite:
    def test_single_suffix(self, fs_root: Path):
        io = CSVFileIO()

        assert io.supports_read("data.csv")
        assert io.supports_read(FileSystemPath.from_uri("data.csv"))
        assert not io.supports_read("data.txt")

    def test_multiple_suffixes(self, fs_root: Path):
        io = JSONFileIO()

        assert io.supports_read("data.json")
        assert io.supports_read("data.geojson")
        assert not io.supports_read("data.yaml")

    def test_supports_write_defaults_to_read_suffixes(self, fs_root: Path):
        io = JSONFileIO()

        assert io.supports_write("data.json")
        assert io.supports_write("data.geojson")
        assert not io.supports_write("data.yaml")

    def test_supports_read_and_supports_write_can_differ(self, fs_root: Path):
        io = ReadMostlyFileIO()

        assert io.supports_read("data.readonly")
        assert not io.supports_write("data.readonly")
        assert io.supports_read("data.rec")
        assert io.supports_write("data.rec")


class TestReaderWrapper:
    def test_rejects_unsupported_suffix(self, fs_root: Path):
        with pytest.raises(ValueError, match=r"Unsupported file suffix: \.txt"):
            RecordingFileIO().read("data.txt")

    def test_accepts_supported_uri(self, fs_root: Path):
        assert RecordingFileIO().read("data.rec") == "data.rec"

    def test_accepts_filesystem_path(self, fs_root: Path):
        path = FileSystemPath.from_uri("data.rec")

        assert RecordingFileIO().read(path) == "data.rec"


class TestWriterWrapper:
    def test_rejects_unsupported_suffix(self, fs_root: Path):
        with pytest.raises(ValueError, match=r"Unsupported file suffix: \.txt"):
            RecordingFileIO().write("data.txt", "payload")

    def test_rejects_read_only_suffix(self, fs_root: Path):
        with pytest.raises(ValueError, match=r"Unsupported file suffix: \.readonly"):
            ReadMostlyFileIO().write("data.readonly", "payload")

    def test_accepts_writable_suffix_of_read_mostly_io(self, fs_root: Path):
        io = ReadMostlyFileIO()

        io.write("data.rec", "payload")

        assert io.written == [(FileSystemPath.from_uri("data.rec"), "payload")]

    def test_creates_parent_directories(self, fs_root: Path):
        io = RecordingFileIO()

        io.write("a/b/c/data.rec", "payload")

        assert (fs_root / "a/b/c").is_dir()
        assert io.written == [(FileSystemPath.from_uri("a/b/c/data.rec"), "payload")]

    def test_accepts_filesystem_path(self, fs_root: Path):
        io = RecordingFileIO()
        path = FileSystemPath.from_uri("out/data.rec")

        io.write(path, "payload")

        ((written_path, data),) = io.written
        assert written_path == path
        assert data == "payload"
