from __future__ import annotations

from collections.abc import Collection, Hashable, Mapping
from dataclasses import dataclass
from datetime import datetime, tzinfo
from decimal import Decimal
from math import isnan

from pydantic import BaseModel

from sta.common.filesystem import CSVFileIO, FileSystemPath
from sta.common.spatial import OptionalDecimalCoord3, Transform

__all__ = ['STInfoRow', 'STMetadata', 'STMetadataReader']


class STInfoRow(BaseModel):
    file_uri: str
    translate_x: Decimal | None = None
    translate_y: Decimal | None = None
    translate_z: Decimal | None = None
    rotate_x: Decimal | None = None
    rotate_y: Decimal | None = None
    rotate_z: Decimal | None = None
    scale_x: Decimal | None = None
    scale_y: Decimal | None = None
    scale_z: Decimal | None = None
    min_timestamp: datetime | None = None
    max_timestamp: datetime | None = None


@dataclass(frozen=True)
class STMetadata:
    filepath: FileSystemPath
    file_coords_to_db_coords: Transform
    min_timestamp: datetime | None
    max_timestamp: datetime | None


class STMetadataReader:

    @classmethod
    def _replace_nans(cls, d: Mapping[Hashable, object]) -> Mapping[Hashable, object]:
        return {
            k: None if isinstance(v, float) and isnan(v) else v
            for k, v in d.items()
        }

    @classmethod
    def _parse_data_info(cls, uri: str, row_schema: type[STInfoRow]) -> Collection[STInfoRow]:
        data_path = FileSystemPath.from_uri(uri)
        if not data_path.is_file():
            msg = f'Provided invalid path to spatiotemporal metadata: {uri}'
            raise ValueError(msg)

        try:
            data_df = CSVFileIO().read(data_path, dtype=str, parse_dates=['min_timestamp', 'max_timestamp'])
        except Exception as e:
            msg = f'Unable to read CSV file at: {data_path.path}'
            raise ValueError(msg) from e

        try:
            return [
                row_schema.model_validate(cls._replace_nans(row.to_dict()))
                for _, row in data_df.iterrows()
            ]
        except Exception as e:
            # Get a exact row where parsing failed
            for _, row in data_df.iterrows():
                try:
                    row_schema.model_validate(cls._replace_nans(row.to_dict()))
                except Exception as e:
                    msg = f'Unable to parse row.\nSeries representation:\n{row}\nDictionary representation: {cls._replace_nans(row.to_dict())}'
                    raise ValueError(msg) from e

            msg = f'Unable to parse CSV file at: {data_path.path}'
            raise ValueError(msg) from e

    @classmethod
    def _get_timezone(cls, timestamp: datetime, data_tz: tzinfo | None) -> tzinfo:
        if timestamp.tzinfo is None:
            if data_tz is None:
                msg = f'Missing timezone from timestamp: {timestamp}'
                raise ValueError(msg)

            return data_tz

        if data_tz is not None and timestamp.tzinfo != data_tz:
            msg = f'Found conflicting timezones! The timestamp has: {timestamp.tzinfo}, but you specified the timezone: {data_tz}'
            raise ValueError(msg)

        return timestamp.tzinfo

    def read_csv(
        self,
        data_info_uri: str,
        data_info_row_schema: type[STInfoRow] = STInfoRow,
        data_tz: tzinfo | None = None,
    ) -> Collection[STMetadata]:
        """
        Reads a CSV file and returns a :class:`STMetadata` for each file
        to convert to a database record.

        Parameters
        ----------
        data_info_uri : str
            A URI that points to the CSV file containing the metadata.

            This CSV file should have one row for each file to apply the conversion to,
            as detailed in :attr:`data_info_row_schema`.

        data_info_row_schema : type of STInfoRow
            The schema of each row in the CSV file. It should contain:
                - A URI that points to the file to apply the conversion to.
                - A transformation that converts from the coordinate system in the file to
                that of the database. Defaults to the identity transform.
                - The minimum and maximum timestamp of the data. Defaults to `data_tz`.
        data_tz : tzinfo, optional
            The default value of `min_timestamp` and `max_timestamp`
            (see :attr:`data_info_row_schema`).

            If those values are overridden in the CSV file, they should have the same timezone.
        """
        data_info = self._parse_data_info(
            uri=data_info_uri,
            row_schema=data_info_row_schema,
        )

        def _parse_row(row: STInfoRow):
            filepath = FileSystemPath.from_uri(row.file_uri)
            if not filepath.is_file():
                msg = f'Provided invalid path to file: {filepath}'
                raise ValueError(msg)

            translation = OptionalDecimalCoord3(x=row.translate_x, y=row.translate_y, z=row.translate_z)
            rotation = OptionalDecimalCoord3(x=row.rotate_x, y=row.rotate_y, z=row.rotate_z)
            scale = OptionalDecimalCoord3(x=row.scale_x, y=row.scale_y, z=row.scale_z)
            transform = Transform.from_optional(translation=translation, rotation=rotation, scale=scale)

            min_timestamp = row.min_timestamp
            if min_timestamp is not None:
                min_timestamp = min_timestamp.replace(tzinfo=self._get_timezone(min_timestamp, data_tz))

            max_timestamp = row.max_timestamp
            if max_timestamp is not None:
                max_timestamp = max_timestamp.replace(tzinfo=self._get_timezone(max_timestamp, data_tz))

            yield STMetadata(
                filepath=filepath,
                file_coords_to_db_coords=transform,
                min_timestamp=min_timestamp,
                max_timestamp=max_timestamp,
            )

        return [_parse_row(row) for row in data_info]
