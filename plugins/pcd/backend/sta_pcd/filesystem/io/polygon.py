from __future__ import annotations

import numpy as np
import pandas as pd

from sta.common.filesystem import FileIO, FileSystemPath

from ..data import PolygonData

__all__ = ["PolygonFileIO"]


class PolygonFileIO(FileIO):
    @property
    def read_suffixes(self) -> tuple[str, ...] | str:
        return ".csv", ".txt"

    @FileIO.reader
    def read(self, path: FileSystemPath) -> PolygonData:
        with path.open("r") as f:
            points = np.genfromtxt(f, delimiter=",")

        points = points.reshape(-1, 3)
        data_df = pd.DataFrame(points, columns=["x", "y", "z"])

        return PolygonData(data_df)

    @FileIO.writer
    def write(self, path: FileSystemPath, data: PolygonData) -> None:
        points = data.xyz

        with path.open("w") as f:
            points = ",".join(str(x) for x in points.flat)
            f.write(points)
