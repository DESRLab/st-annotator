from __future__ import annotations

from collections.abc import Mapping

import pandas as pd

from ..path import FileSystemPath
from .base import FileIO

__all__ = ['CSVFileIO']


class CSVFileIO(FileIO):
    @property
    def suffixes(self) -> tuple[str, ...] | str:
        return '.csv'

    @FileIO.reader
    def read(self, path: FileSystemPath, *, dtype: type | Mapping[str, type], parse_dates: list[str]) -> pd.DataFrame:
        if isinstance(dtype, Mapping):
            dtype = dict(dtype)

        with path.open('r') as f:
            return pd.read_csv(f, dtype=dtype, parse_dates=parse_dates)

    @FileIO.writer
    def write(self, path: FileSystemPath, data: pd.DataFrame) -> None:
        with path.open('w') as f:
            data.to_csv(f)
