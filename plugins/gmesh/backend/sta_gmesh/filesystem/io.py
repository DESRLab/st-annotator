from __future__ import annotations

from shutil import copyfileobj
from tempfile import NamedTemporaryFile

import open3d as o3d

from sta.common.filesystem import FileIO, FileSystemPath

from .data import GroundMeshData

__all__ = ["GroundMeshFileIO"]


class GroundMeshFileIO(FileIO):
    @property
    def read_suffixes(self) -> tuple[str, ...] | str:
        return ".obj", ".ply", ".off", ".stl", ".gltf", ".glb"

    @FileIO.reader
    def read(self, path: FileSystemPath) -> GroundMeshData:
        with path.open("rb") as f, NamedTemporaryFile("w+b", suffix=path.suffix) as temp_f:
            copyfileobj(f, temp_f)
            temp_f.flush()

            mesh = o3d.io.read_triangle_mesh(temp_f.name)
            return GroundMeshData(mesh)

    @FileIO.writer
    def write(self, path: FileSystemPath, data: GroundMeshData) -> None:
        with path.open("wb") as f:
            f.write(data.as_bytes(path.suffix))
