from __future__ import annotations

import click
from tqdm import tqdm

from sta.cli import get_config_path_option
from sta.common.filesystem import FileSystemPath
from sta.services.config import AppConfigArgs
from sta.services.entrypoints import app_ctx
from sta_gmesh.filesystem import GroundMeshData, GroundMeshFileIO
from sta_pcd.filesystem import PointCloudFileIO


@click.command()
@click.argument('data_uri', type=click.Path(file_okay=False, dir_okay=True, path_type=str), required=True)
@get_config_path_option()
def generate(data_uri: str, *, config_path: str):
    """
    Generate a ground mesh for each point cloud file
    in DATA_URI (relative to FILESYSTEM_ROOT in the ST Annotator configuration).
    """
    config = AppConfigArgs.from_file(config_path).as_config()

    with app_ctx(config):
        data_dir = FileSystemPath.from_uri(data_uri)

        pcd_io = PointCloudFileIO()
        gmesh_io = GroundMeshFileIO()

        in_files = [in_file for in_file in data_dir.iterdir() if pcd_io.supports(in_file)]

        for in_file in tqdm(in_files, "Generating ground mesh for point clouds"):
            pcd = pcd_io.read(in_file, dtype="float", channel_headers=["x", "y", "z", "intensity"])
            gmesh = GroundMeshData.from_pcd(pcd)

            out_file = in_file.with_suffix(".obj")
            gmesh_io.write(out_file, gmesh)


if __name__ == '__main__':
    generate()
