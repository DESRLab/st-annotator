from __future__ import annotations

from collections.abc import Collection, Hashable, Mapping
from dataclasses import dataclass
from datetime import datetime, tzinfo
from decimal import Decimal
from pathlib import Path
from typing import Any, cast

import pandas as pd

from pydantic import BaseModel

from sta.common.filesystem import FileSystemPath
from sta.common.spatial import OptionalDecimalCoord3, Transform

__all__ = ["STInfoRow", "STMetadata", "STMetadataReader"]


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
        # An unparsed text frame reports empty cells as NaN on both pandas 2 and
        # 3, where a date-parsed frame reports them as NaT instead. Either would
        # leak into the metadata because NaN is an instance of float, which the
        # optional numeric fields accept.
        return {k: None if pd.isna(cast(Any, v)) else v for k, v in d.items()}

    @classmethod
    def _parse_data_info(cls, data_path: str, row_schema: type[STInfoRow]) -> Collection[STInfoRow]:
        local_path = Path(data_path)
        # Metadata CSVs are CLI input rather than database-backed data, so
        # always resolve them as local paths (relative to the current working
        # directory when not absolute).
        if not local_path.is_file():
            msg = f"Provided invalid path to spatiotemporal metadata: {data_path}"
            raise ValueError(msg)

        if local_path.suffix != ".csv":
            msg = f"Unable to read CSV file at: {data_path}"
            raise ValueError(msg)

        try:
            # The row schema parses the timestamp columns rather than pandas,
            # because pandas reports them differently across major versions.
            # With `dtype=str`, pandas 2 never produces datetimes: it renders its
            # parsed column back into strings, so a uniformly aware column comes
            # back reformatted ('2024-01-01 00:00:00+00:00') and a uniformly naive
            # one comes back as epoch-nanosecond integers
            # ('1704067200000000000') that the row schema rejects. pandas 3 yields
            # datetime64 values in both cases. A column mixing UTC offsets is
            # reformatted by pandas 2 and left raw by pandas 3, and one mixing a
            # naive with an aware value is left raw by both; no pandas version
            # reports these shapes consistently, so the cells reach the schema
            # untouched instead.
            data_df = pd.read_csv(local_path, dtype=str, parse_dates=[])
        except Exception as e:
            msg = f"Unable to read CSV file at: {data_path}"
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
                    msg = f"Unable to parse row.\nSeries representation:\n{row}\nDictionary representation: {cls._replace_nans(row.to_dict())}"
                    raise ValueError(msg) from e

            msg = f"Unable to parse CSV file at: {data_path}"
            raise ValueError(msg) from e

    @classmethod
    def _get_timezone(cls, timestamp: datetime, data_tz: tzinfo | None) -> tzinfo:
        if timestamp.tzinfo is None:
            if data_tz is None:
                msg = f"Missing timezone from timestamp: {timestamp}"
                raise ValueError(msg)

            return data_tz

        # Compare by UTC offset rather than tzinfo identity: equivalent zones
        # do not compare equal (e.g. a parsed CSV column yields
        # `datetime.timezone.utc` while the CLI passes `pytz.utc`).
        if (
            data_tz is not None
            and timestamp.utcoffset() != timestamp.astimezone(data_tz).utcoffset()
        ):
            msg = f"Found conflicting timezones! The timestamp has: {timestamp.tzinfo}, but you specified the timezone: {data_tz}"
            raise ValueError(msg)

        return timestamp.tzinfo

    @classmethod
    def _resolve_timestamp(
        cls, timestamp: datetime | None, data_tz: tzinfo | None
    ) -> datetime | None:
        if timestamp is None:
            return None

        tz = cls._get_timezone(timestamp, data_tz)
        if timestamp.tzinfo is not None:
            return timestamp

        # Attach the timezone to a naive timestamp. `datetime.replace(tzinfo=...)`
        # is only correct for fixed-offset zones; pytz zones must go through
        # `localize` to pick the right offset rather than the zone's LMT.
        localize = getattr(tz, "localize", None)
        if localize is not None:
            return localize(timestamp)

        return timestamp.replace(tzinfo=tz)

    def read_csv(
        self,
        data_info_path: str,
        data_info_row_schema: type[STInfoRow] = STInfoRow,
        data_tz: tzinfo | None = None,
    ) -> Collection[STMetadata]:
        """
        Reads a CSV file and returns a :class:`STMetadata` for each file
        to convert to a database record.

        Parameters
        ----------
        data_info_path : str
            A local path to the CSV file containing the metadata.

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
            data_path=data_info_path,
            row_schema=data_info_row_schema,
        )

        def _parse_row(row: STInfoRow):
            filepath = FileSystemPath.from_uri(row.file_uri)
            if not filepath.is_file():
                msg = f"Provided invalid path to file: {filepath}"
                raise ValueError(msg)

            translation = OptionalDecimalCoord3(
                x=row.translate_x, y=row.translate_y, z=row.translate_z
            )
            rotation = OptionalDecimalCoord3(x=row.rotate_x, y=row.rotate_y, z=row.rotate_z)
            scale = OptionalDecimalCoord3(x=row.scale_x, y=row.scale_y, z=row.scale_z)
            transform = Transform.from_optional(
                translation=translation, rotation=rotation, scale=scale
            )

            min_timestamp = self._resolve_timestamp(row.min_timestamp, data_tz)
            max_timestamp = self._resolve_timestamp(row.max_timestamp, data_tz)

            return STMetadata(
                filepath=filepath,
                file_coords_to_db_coords=transform,
                min_timestamp=min_timestamp,
                max_timestamp=max_timestamp,
            )

        return [_parse_row(row) for row in data_info]
