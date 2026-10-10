from __future__ import annotations

from typing import Any

import numpy as np
import numpy.typing as npt

from ..path import FileSystemPath
from .base import FileIO

__all__ = ["NumPyFileIO"]


class NumPyFileIO(FileIO):
    @property
    def read_suffixes(self) -> tuple[str, ...] | str:
        return ".npy"

    @FileIO.reader
    def read(self, path: FileSystemPath) -> npt.NDArray[Any]:
        with path.open("rb") as f:
            data = np.load(f)
            if not isinstance(data, np.ndarray):
                msg = "File data is not a NumPy array"
                raise TypeError(msg)

            return data

    @FileIO.writer
    def write(self, path: FileSystemPath, data: npt.NDArray[Any]) -> None:
        with path.open("wb") as f:
            np.save(f, data)
