from __future__ import annotations

import yaml

from ...utils.json import JSONType
from ..path import FileSystemPath
from .base import FileIO

__all__ = ["YAMLFileIO"]


class YAMLFileIO(FileIO):
    @property
    def read_suffixes(self) -> tuple[str, ...] | str:
        return ".yaml", ".yml"

    @FileIO.reader
    def read(self, path: FileSystemPath) -> JSONType:
        with path.open("r") as f:
            return yaml.load(f, Loader=yaml.FullLoader)

    @FileIO.writer
    def write(self, path: FileSystemPath, data: JSONType) -> None:
        with path.open("w") as f:
            return yaml.dump(data, f)
