"""Tests for ``sta.models.types.uri``: ``FileURIValidators`` and the ``FileURI`` type."""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

from pydantic import BaseModel, ValidationError

import pytest

from sta.common.filesystem import FilesystemConfig, base as filesystem_base, fs_ctx
from sta.models.types.uri import FileURI, FileURIValidators


@pytest.fixture(autouse=True)
def restore_default_filesystem() -> Iterator[None]:
    """Snapshot and restore the module-level default filesystem around every test.

    The valid-URI cases resolve schemeless paths against the global default
    filesystem; without restoration the context would leak into other tests.
    """
    saved = filesystem_base._default_fs
    yield
    filesystem_base._default_fs = saved


@pytest.fixture
def fs_root(tmp_path: Path) -> Iterator[Path]:
    """Yields a temporary directory with an active filesystem context rooted at it."""
    with fs_ctx(FilesystemConfig(root=tmp_path).get_fs()):
        yield tmp_path


class FileURIModel(BaseModel):
    uri: FileURI


class TestFileURIValidators:
    def test_returns_valid_uri_unchanged(self, fs_root: Path):
        assert FileURIValidators.validate("data/file.csv") == "data/file.csv"

    def test_rejects_non_strings(self):
        for value in (123, None, b"data/file.csv"):
            with pytest.raises(TypeError, match="Not a string"):
                FileURIValidators.validate(value)

    def test_rejects_blank_uri(self):
        with pytest.raises(ValueError, match="cannot be blank"):
            FileURIValidators.validate("")

    def test_rejects_uri_longer_than_the_maximum(self):
        with pytest.raises(ValueError, match="at most 255 characters"):
            FileURIValidators.validate("a" * (FileURIValidators.MAX_LENGTH + 1))

    def test_accepts_uris_at_the_length_boundaries(self, fs_root: Path):
        assert FileURIValidators.validate("a") == "a"

        longest = "a" * FileURIValidators.MAX_LENGTH
        assert FileURIValidators.validate(longest) == longest

    def test_rejects_null_characters(self):
        with pytest.raises(ValueError, match="null characters"):
            FileURIValidators.validate("data/\x00file.csv")

    def test_rejects_unresolvable_uris(self):
        with pytest.raises(ValueError, match="cannot navigate to a parent directory"):
            FileURIValidators.validate("nosuchproto://data/file.csv")

    @pytest.mark.parametrize("uri", ["/etc/passwd", "../secret", "data/../../secret"])
    def test_rejects_paths_outside_the_filesystem_root(self, fs_root: Path, uri: str):
        with pytest.raises(ValueError, match="cannot navigate to a parent directory"):
            FileURIValidators.validate(uri)

    @pytest.mark.parametrize("uri", ["file:///etc/passwd", "memory:///data/file.csv"])
    def test_rejects_supported_but_disallowed_schemes_as_validation_errors(self, uri: str):
        with pytest.raises(ValueError, match="cannot navigate to a parent directory"):
            FileURIValidators.validate(uri)


class TestFileURI:
    def test_model_accepts_valid_uri(self, fs_root: Path):
        assert FileURIModel(uri="data/file.csv").uri == "data/file.csv"

    @pytest.mark.parametrize(
        "uri",
        [
            "",
            "a" * (FileURIValidators.MAX_LENGTH + 1),
            "data/\x00file.csv",
            "nosuchproto://data/file.csv",
            "/etc/passwd",
            "../secret",
            "file:///etc/passwd",
            "memory:///data/file.csv",
        ],
    )
    def test_model_rejects_invalid_uri(self, uri: str):
        with pytest.raises(ValidationError):
            FileURIModel(uri=uri)

    def test_json_schema_carries_length_bounds(self):
        schema = FileURIModel.model_json_schema()["properties"]["uri"]

        assert schema["type"] == "string"
        assert schema["minLength"] == FileURIValidators.MIN_LENGTH
        assert schema["maxLength"] == FileURIValidators.MAX_LENGTH
