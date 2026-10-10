from __future__ import annotations

from datetime import datetime
from pathlib import Path

import click

import pandas as pd

from sta.cli import get_config_path_option
from sta.common.filesystem import FileSystemPath
from sta.config import AppConfigArgs
from sta.entrypoints import app_ctx
from sta.porter.st_metadata import STInfoRow
from sta_pcd.filesystem import PointCloudFileIO


def _get_st_info_row(file: FileSystemPath) -> STInfoRow | None:
    """
    Provide a custom implementation of this method to generate the values in the
    corresponding row of the CSV file.

    If the file does not contain valid data to import, instead return `None`.
    """
    st_info_row = STInfoRow(
        file_uri=file.as_uri(),
        translate_x=None,
        translate_y=None,
        translate_z=None,
        rotate_x=None,
        rotate_y=None,
        rotate_z=None,
        scale_x=None,
        scale_y=None,
        scale_z=None,
    )

    if PointCloudFileIO().supports_read(file):
        timestamp = datetime.strptime(file.stem, r"%Y_%m_%d=%H_%M_%S_%f").astimezone()
    else:
        # when generating csv file for the json label data that are exported from export_label_data.py.
        # since the json files during export are saved with name timestamp.pcd_file_extension.json file.
        _, dot, src_file_extension = file.stem.rpartition(".")
        if not dot:
            return None

        try:
            timestamp = datetime.strptime(
                file.stem, rf"%Y_%m_%d=%H_%M_%S_%f.{src_file_extension}"
            ).astimezone()
        except ValueError:
            return None

    st_info_row.min_timestamp = st_info_row.max_timestamp = timestamp

    return st_info_row


def _write_data_info_csv(output_path: str, rows: list[STInfoRow]) -> None:
    """Write metadata CSV output relative to the current working directory."""
    path = Path(output_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    pd.DataFrame([row.model_dump() for row in rows]).to_csv(path, index=False)


@click.command()
@click.argument(
    "data_uri", type=click.Path(file_okay=False, dir_okay=True, path_type=str), required=True
)
@click.option(
    "-o",
    "--output",
    "output_path",
    type=click.Path(file_okay=True, dir_okay=False, path_type=str),
    required=True,
    help="Specifies the CSV file to output, relative to the current working directory.",
)
@get_config_path_option()
def generate_st_data_info(data_uri: str, output_path: str, *, config_path: str):
    """
    Generate a CSV file containing the spatiotemporal metadata for each data file located
    in DATA_URI (relative to FILESYSTEM_ROOT in the ST Annotator configuration).

    This CSV file is outputted relative to the current working directory and
    can then be used to import the data via plugin-specific importers.

    Note that the search for data files is performed non-recursively.
    """
    config = AppConfigArgs.from_file(config_path).as_config()

    with app_ctx(config):
        data_dir = FileSystemPath.from_uri(data_uri)

        rows: list[STInfoRow] = []
        for file in data_dir.iterdir():
            row = _get_st_info_row(file)
            if row is not None:
                rows.append(row)

        _write_data_info_csv(output_path, rows)


if __name__ == "__main__":
    generate_st_data_info()
