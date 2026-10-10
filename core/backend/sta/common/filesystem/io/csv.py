from __future__ import annotations

from collections.abc import Mapping
from typing import Any

import pandas as pd

from ..path import FileSystemPath
from .base import FileIO

__all__ = ["CSVFileIO"]


class CSVFileIO(FileIO):
    @property
    def read_suffixes(self) -> tuple[str, ...] | str:
        return ".csv"

    @FileIO.reader
    def read(
        self,
        path: FileSystemPath,
        *,
        dtype: Any | Mapping[str, Any],
        parse_dates: list[str],
    ) -> pd.DataFrame:
        if isinstance(dtype, Mapping):
            dtype = dict(dtype)
        dtype_arg: Any = dtype

        with path.open("r") as f:
            return pd.read_csv(f, dtype=dtype_arg, parse_dates=parse_dates)

    @FileIO.writer
    def write(self, path: FileSystemPath, data: pd.DataFrame) -> None:
        # The reader does not restore an index column, so never write one.
        with path.open("w") as f:
            data.to_csv(f, index=False)
