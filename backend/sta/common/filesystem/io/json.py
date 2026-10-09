from __future__ import annotations

import json

from ...utils.json import JSONType
from ..path import FileSystemPath
from .base import FileIO

__all__ = ['JSONFileIO']


class JSONFileIO(FileIO):
    @property
    def suffixes(self) -> tuple[str, ...] | str:
        return '.json', '.geojson'

    @FileIO.reader
    def read(self, path: FileSystemPath) -> JSONType:
        with path.open('r') as f:
            return json.load(f)

    @FileIO.writer
    def write(self, path: FileSystemPath, data: JSONType) -> None:
        with path.open('w') as f:
            json.dump(data, f)
