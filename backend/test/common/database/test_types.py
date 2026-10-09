from datetime import timezone
from decimal import Decimal

from sqlalchemy.dialects import postgresql, sqlite

import pytest
from hypothesis import given

from sta.common.database.types import DecimalString, GUID, UTCDateTime
from sta.common.testing.database import st_decimal_strings, st_guids, st_utc_datetimes

SQLITE_DIALECT = sqlite.dialect()
POSTGRES_DIALECT = postgresql.dialect()


def test_decimal_string_rejects_precision_smaller_than_scale() -> None:
    with pytest.raises(ValueError, match='cannot be smaller than scale'):
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

    serialized = col_type.process_bind_param(Decimal('NaN'), SQLITE_DIALECT)
    result = col_type.process_result_value(serialized, SQLITE_DIALECT)

    assert serialized == 'NaN'
    assert result is not None and result.is_qnan()


@given(value=st_decimal_strings(DecimalString(precision=6, scale=2), allow_nan=False, valid_range=False))
def test_decimal_string_rejects_out_of_range_values(value: Decimal) -> None:
    col_type = DecimalString(precision=6, scale=2)

    with pytest.raises(ValueError, match='out of range'):
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
    with pytest.raises(ValueError, match='timezone aware'):
        UTCDateTime().process_bind_param(value, SQLITE_DIALECT)
