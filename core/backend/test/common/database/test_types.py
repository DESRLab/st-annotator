import os
import time
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import Column, Integer, MetaData, Table, create_engine, insert, select, text
from sqlalchemy.dialects import postgresql, sqlite

import pytest
from hypothesis import given

from sta.common.database.types import JSONB, DecimalString, GUID, UTCDateTime
from sta.common.testing.database import st_decimal_strings, st_guids, st_utc_datetimes

SQLITE_DIALECT = sqlite.dialect()
POSTGRES_DIALECT = postgresql.dialect()


def test_decimal_string_rejects_precision_smaller_than_scale() -> None:
    with pytest.raises(ValueError, match="cannot be smaller than scale"):
        DecimalString(precision=2, scale=3)


@given(value=st_decimal_strings(DecimalString(precision=6, scale=2), allow_nan=False))
def test_decimal_string_roundtrips_valid_values(value: Decimal) -> None:
    col_type = DecimalString(precision=6, scale=2)

    serialized = col_type.process_bind_param(value, SQLITE_DIALECT)
    assert isinstance(serialized, str)

    assert serialized == str(round(value, col_type.scale))
    assert col_type.process_result_value(serialized, SQLITE_DIALECT) == Decimal(serialized)


def test_decimal_string_roundtrips_qnan() -> None:
    col_type = DecimalString(precision=6, scale=2)

    serialized = col_type.process_bind_param(Decimal("NaN"), SQLITE_DIALECT)
    result = col_type.process_result_value(serialized, SQLITE_DIALECT)

    assert serialized == "NaN"
    assert result is not None and result.is_qnan()


def test_decimal_string_converts_float_through_decimal_text() -> None:
    serialized = DecimalString(precision=25, scale=20).process_bind_param(1.1, SQLITE_DIALECT)

    assert serialized == "1.10000000000000000000"


def test_jsonb_preserves_python_values_and_sql_null() -> None:
    col_type = JSONB()

    assert col_type.process_bind_param(None, SQLITE_DIALECT) is None
    assert col_type.process_bind_param({"items": [1, True]}, SQLITE_DIALECT) == {
        "items": [1, True],
    }


def test_jsonb_roundtrips_objects_without_double_encoding_and_keeps_sql_null() -> None:
    engine = create_engine("sqlite:///:memory:")
    metadata = MetaData()
    records = Table(
        "jsonb_records",
        metadata,
        Column("id", Integer, primary_key=True),
        Column("payload", JSONB(), nullable=True),
    )
    metadata.create_all(engine)

    with engine.begin() as connection:
        connection.execute(
            insert(records),
            [
                {"id": 1, "payload": {"items": [1, True]}},
                {"id": 2, "payload": None},
            ],
        )
        assert connection.execute(
            select(records.c.payload).where(records.c.id == 1),
        ).scalar_one() == {"items": [1, True]}
        assert (
            connection.execute(
                text("SELECT typeof(payload) FROM jsonb_records WHERE id = 2"),
            ).scalar_one()
            == "null"
        )


@given(
    value=st_decimal_strings(
        DecimalString(precision=6, scale=2), allow_nan=False, valid_range=False
    )
)
def test_decimal_string_rejects_out_of_range_values(value: Decimal) -> None:
    col_type = DecimalString(precision=6, scale=2)

    with pytest.raises(ValueError, match="out of range"):
        col_type.process_bind_param(value, SQLITE_DIALECT)


@given(value=st_guids())
def test_guid_process_bind_param_uses_canonical_string_for_postgresql(value) -> None:
    assert GUID().process_bind_param(value, POSTGRES_DIALECT) == str(value)


@given(value=st_guids())
def test_guid_roundtrips_hex_encoding_for_non_postgresql(value) -> None:
    col_type = GUID()

    serialized = col_type.process_bind_param(value, SQLITE_DIALECT)

    assert serialized == value.hex
    assert col_type.process_result_value(serialized, SQLITE_DIALECT) == value


@given(value=st_guids())
def test_guid_accepts_string_input_for_non_postgresql(value) -> None:
    assert GUID().process_bind_param(str(value), SQLITE_DIALECT) == value.hex


@given(value=st_utc_datetimes())
def test_utc_datetime_roundtrips_timezone_aware_values(value) -> None:
    col_type = UTCDateTime()

    serialized = col_type.process_bind_param(value, SQLITE_DIALECT)
    result = col_type.process_result_value(serialized, SQLITE_DIALECT)

    assert serialized == value.astimezone(timezone.utc).replace(tzinfo=None)
    assert result is not None and result.tzinfo is not None
    assert result.astimezone(timezone.utc) == value.astimezone(timezone.utc)


@given(value=st_utc_datetimes(valid_timezone=False))
def test_utc_datetime_rejects_timezone_naive_values(value) -> None:
    with pytest.raises(ValueError, match="timezone aware"):
        UTCDateTime().process_bind_param(value, SQLITE_DIALECT)


def test_utc_datetime_result_is_utc_outside_utc_process_timezone(monkeypatch) -> None:
    previous_tz = os.environ.get("TZ")
    monkeypatch.setenv("TZ", "America/Los_Angeles")
    time.tzset()
    try:
        result = UTCDateTime().process_result_value(
            datetime(2024, 1, 2, 3, 4, 5, tzinfo=timezone.utc).replace(tzinfo=None),
            SQLITE_DIALECT,
        )
        assert result is not None
        assert result.tzinfo == timezone.utc
        assert result.hour == 3
    finally:
        if previous_tz is None:
            monkeypatch.delenv("TZ", raising=False)
        else:
            monkeypatch.setenv("TZ", previous_tz)
        time.tzset()
