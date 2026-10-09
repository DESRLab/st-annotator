from __future__ import annotations

import uuid
from collections.abc import Sequence
from datetime import datetime
from decimal import Decimal
from string import printable

from sqlalchemy.types import BigInteger, Float, Integer, SmallInteger, String

from hypothesis import strategies as st

from sta.common.database.types import DecimalString, GUID, UTCDateTime
from sta.common.utils.json import JSONType

from ..strategies import st_decimals, st_jsontypes, st_numbers

__all__ = [
    'GUID',
    'DecimalString',
    'UTCDateTime',
    'st_decimal_strings',
    'st_floats',
    'st_guids',
    'st_integers',
    'st_jsons',
    'st_strings',
    'st_utc_datetimes',
]


# SQLAlchemy builtins
def st_floats(
    column_type: Float[int | float] | None = None,
    *,
    allow_infinity: bool = True,
    allow_nan: bool = False,
) -> st.SearchStrategy[int | float]:
    """
    Returns a strategy that generates valid data for the database
    :class:`sqlalchemy.types.Float` type.

    Parameters
    ----------
    allow_infinity : bool, default True
        If `True`, `+Inf` and `-Inf` values may be generated.
    allow_nan : bool, default False
        If `True`, `NaN` values may be generated.
        Note that SQLite cannot store `NaN` values, instead serializing them as `NULL`.
    """
    if column_type is None:
        column_type = Float()

    # Using IEEE 754 standard
    if column_type.precision is None or column_type.precision >= 53:
        width = 64
    elif column_type.precision >= 24:
        width = 32
    elif column_type.precision >= 11:
        width = 16
    else:
        msg = 'The minimum supported precision is 11 digits for half-precision format'
        raise ValueError(msg)

    return st_numbers(
        allow_infinity=allow_infinity,
        allow_nan=allow_nan,
        float_width=width,
    )

def st_integers(
    column_type: Integer | None = None,
    *,
    valid_range: bool = True,
    override_valid_min: int | None = None,
    override_valid_max: int | None = None,
) -> st.SearchStrategy[int]:
    """
    Returns a strategy that generates valid data for the database
    :class:`sqlalchemy.types.Integer` type.

    Parameters
    ----------
    valid_range : bool, default True
        If `True`, values are generated within the allowed range for this data type.
        This should hold regardless of the database implementation.
    override_valid_min : int, optional
        If provided, the minimum allowed value is considered to be this one instead
        of the value given by the data type.
    override_valid_max : int, optional
        If provided, the maximum allowed value is considered to be this one instead
        of the value given by the data type.
    """
    if column_type is None:
        column_type = Integer()

    if column_type.__visit_name__ == SmallInteger.__visit_name__:
        num_bits = 16
    elif column_type.__visit_name__ == Integer.__visit_name__:
        num_bits = 32
    elif column_type.__visit_name__ == BigInteger.__visit_name__:
        num_bits = 64
    else:
        msg = f'Unhandled integer column type: {column_type}'
        raise NotImplementedError(msg)

    min_value = -(2 ** (num_bits - 1)) if override_valid_min is None else override_valid_min
    max_value = ((2 ** (num_bits - 1)) - 1) if override_valid_max is None else override_valid_max

    if valid_range:
        return st.integers(min_value=min_value, max_value=max_value)

    return st.integers(max_value=min_value - 1) | st.integers(min_value=max_value + 1)

def st_jsons() -> st.SearchStrategy[JSONType]:
    """
    Returns a strategy that generates valid data for the database
    :class:`sqlalchemy.types.JSON` type.

    Note that the database may serialize integers as floats, and tuples as lists.
    As a result, the deserialized data may not be exactly equal to the original data.
    Keeping this in mind, :func:`sta.common.testing.database.jsons_equal` can be used to compare such data.
    """
    return st_jsontypes(
         st.text(printable) | st.floats(allow_nan=False, allow_infinity=False) | st.integers() | st.booleans() | st.none(),
    )

def st_strings(
    column_type: String | None = None,
    *,
    override_characters: Sequence[str] | None = None,
    valid_length: bool = True,
    override_valid_min_length: int = 0,
    override_valid_max_length: int | None = None,
) -> st.SearchStrategy[str]:
    """
    Returns a strategy that generates valid data for the database
    :class:`sqlalchemy.types.String` type.

    Parameters
    ----------
    override_characters : sequence of str, optional
        If provided, the string consists only of these characters instead of drawing
        from the characters normally allowed by the data type.
    valid_length : bool, default True
        If `True`, values are generated within the allowed length for this data type.
        This should hold regardless of the database implementation.
    override_valid_min_length : int, optional
        If provided, the minimum allowed length is considered to be this one instead
        of the value given by the data type.
    override_valid_max_length : int, optional
        If provided, the maximum allowed length is considered to be this one instead
        of the value given by the data type.
    """
    if column_type is None:
        column_type = String()

    alphabet = st.characters(
        categories=None if override_characters is None else [],
        exclude_categories=['Cs'] if override_characters is None else None,
        exclude_characters='\0' if override_characters is None else None,
        include_characters=override_characters,
    )

    min_size = override_valid_min_length
    max_size = column_type.length if override_valid_max_length is None else override_valid_max_length

    if valid_length:
        return st.text(alphabet, min_size=min_size, max_size=max_size)

    result = st.nothing()
    if min_size > 0:
        result |= st.text(alphabet, max_size=min_size - 1)
    if max_size is not None:
        result |= st.text(alphabet, min_size=max_size + 1)

    return result


# SQLAlchemy custom data types
def st_decimal_strings(
    column_type: DecimalString,
    *,
    allow_nan: bool = True,
    valid_range: bool = True,
    override_valid_min: Decimal | None = None,
    override_valid_max: Decimal | None = None,
):
    """
    Returns a strategy that generates valid data for the database
    :class:`DecimalString` type.

    Parameters
    ----------
    allow_nan : bool, default False
        If `True`, `NaN` values may be generated.
        Note that SQLite cannot retrieve `NaN` values, instead deserializing them as `NULL`.
    valid_range : bool, default True
        If `True`, values are generated within the allowed range for this data type.
        This should hold regardless of the database implementation.
    override_valid_min : int, optional
        If provided, the minimum allowed value is considered to be this one instead
        of the value given by the data type.
    override_valid_max : int, optional
        If provided, the maximum allowed value is considered to be this one instead
        of the value given by the data type.
    """
    min_value = column_type.min_value if override_valid_min is None else override_valid_min
    max_value = column_type.max_value if override_valid_max is None else override_valid_max

    if valid_range:
        result = st_decimals(
            min_value=min_value,
            max_value=max_value,
            allow_nan=allow_nan,
            places=column_type.scale,
            exclude_min=True,
            exclude_max=True,
        )
    else:
        result = st_decimals(max_value=min_value, allow_nan=allow_nan) \
            | st_decimals(min_value=max_value, allow_nan=allow_nan)

    result = result.filter(lambda x: not x.is_snan())
    if not allow_nan:
        result = result.filter(lambda x: not x.is_qnan())

    return result

def st_guids() -> st.SearchStrategy[uuid.UUID]:
    """
    Returns a strategy that generates valid data for the database
    :class:`GUID` type.
    """
    return st.uuids()

def st_utc_datetimes(*, valid_timezone: bool = True) -> st.SearchStrategy[datetime]:
    """
    Returns a strategy that generates valid data for the database
    :class:`UTCDateTime` type.

    Parameters
    ----------
    valid_timezones : bool, default True
        If `True`, values are generated with the timezones required for this data type.
    """
    if valid_timezone:
        return st.datetimes(timezones=st.timezones())

    return st.datetimes(timezones=st.none())
