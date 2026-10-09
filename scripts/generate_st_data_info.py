from __future__ import annotations

import click

import pandas as pd

from sta.common.filesystem import CSVFileIO, FileSystemPath
from sta.cli import get_config_path_option
from sta.services.config import AppConfigArgs
from sta.services.entrypoints import app_ctx
from sta.services.porter.st_metadata import STInfoRow


def _get_st_info_row(file: FileSystemPath) -> STInfoRow | None:
    """
    Provide a custom implementation of this method to generate the values in the
    corresponding row of the CSV file.

    If the file does not contain valid data to import, instead return `None`.
    """
    from datetime import datetime

    from sta_pcd.filesystem import PointCloudFileIO

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

    if PointCloudFileIO().supports(file):
        timestamp = datetime.strptime(file.stem, r'%Y_%m_%d=%H_%M_%S_%f').astimezone()
    else:
        # when generating csv file for the json label data that are exported from export_label_data.py.
        # since the json files during export are saved with name timestamp.pcd_file_extension.json file.
        src_file_extension = file.stem.split('.')[1]
        timestamp = datetime.strptime(file.stem, rf'%Y_%m_%d=%H_%M_%S_%f.{src_file_extension}').astimezone()

    st_info_row.min_timestamp = st_info_row.max_timestamp = timestamp

    return st_info_row

@click.command()
@click.argument('data_uri', type=click.Path(file_okay=False, dir_okay=True, path_type=str), required=True)
@click.option('-o', '--output', 'output_uri', type=click.Path(file_okay=True, dir_okay=False, path_type=str), required=True, help='Specifies the CSV file to output.')
@get_config_path_option()
def generate_st_data_info(data_uri: str, output_uri: str, *, config_path: str):
    """
    Generate a CSV file containing the spatiotemporal metadata for each data file located
    in DATA_URI (relative to FILESYSTEM_ROOT in the ST Annotator configuration).

    This CSV file can then be used to import the data via plugin-specific importers.

    Note that the search for data files is performed non-recursively.
    """
    config = AppConfigArgs.from_file(config_path).as_config()

    with app_ctx(config):
        data_dir = FileSystemPath.from_uri(data_uri)
        output_dir = FileSystemPath.from_uri(output_uri)

        rows: list[STInfoRow] = []
        for file in data_dir.iterdir():
            row = _get_st_info_row(file)
            if row is not None:
                rows.append(row)

        rows_df = pd.DataFrame([row.model_dump() for row in rows])

        CSVFileIO().write(output_dir, rows_df)

if __name__ == '__main__':
    generate_st_data_info()
