"""Custom data types for database tables."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from fastapi.encoders import jsonable_encoder
from sqlalchemy.dialects.postgresql import JSONB as pg_JSONB, UUID as pg_UUID
from sqlalchemy.engine import Dialect
from sqlalchemy.sql.expression import cast
from sqlalchemy.sql.sqltypes import DateTime, Numeric
from sqlalchemy.types import CHAR, JSON, TypeDecorator

from sta.common.utils.json import JSONType

__all__ = ["GUID", "JSONB", "DecimalString", "UTCDateTime"]


class DecimalString(TypeDecorator):  # pyright: ignore[reportMissingTypeArgument]
    """
    Platform-independent :class:`Decimal` type.

    Stores decimal values as strings.

    Parameters
    ----------
    precision : int
        The total number of significant digits.
    scale : int
        The number of digits to the right of the decimal point.
    """

    impl = CHAR
    cache_ok = True

    def load_dialect_impl(self, dialect: Dialect):
        # +1 for negative sign, +1 for zero, +1 for decimal point
        return dialect.type_descriptor(CHAR(self.precision + 3))

    def __init__(self, precision: int, scale: int) -> None:
        if precision < scale:
            msg = f"Precision ({precision}) cannot be smaller than scale ({scale})"
            raise ValueError(msg)

        super().__init__()

        self._precision = precision
        self._scale = scale
        self._min_value, self._max_value = self._get_bounds()

    @property
    def precision(self) -> int:
        return self._precision

    @precision.setter
    def precision(self, value: int) -> None:
        self._precision = value
        self._min_value, self._max_value = self._get_bounds()

    @property
    def scale(self) -> int:
        return self._scale

    @scale.setter
    def scale(self, value: int) -> None:
        self._scale = value
        self._min_value, self._max_value = self._get_bounds()

    @property
    def min_value(self) -> Decimal:
        """The minimum allowed value (exclusive)."""
        return self._min_value

    @property
    def max_value(self) -> Decimal:
        """The maximum allowed value (exclusive)."""
        return self._max_value

    def _get_bounds(self) -> tuple[Decimal, Decimal]:
        max_abs = Decimal(10) ** (self._precision - self._scale)

        return -max_abs, max_abs

    def process_bind_param(self, value: Decimal | float | None, dialect: Dialect) -> str | None:
        if value is None:
            return None

        if not isinstance(value, Decimal):
            # Decimal(float) preserves binary approximation artifacts. String
            # conversion preserves user's decimal spelling instead.
            value = Decimal(str(value))

        if value.is_qnan():
            return "NaN"

        if not self.min_value < value < self.max_value:
            msg = f"The input value ({value}) is out of range. The valid interval is: ({self.min_value}, {self.max_value})"
            raise ValueError(msg)

        return str(round(value, self.scale))

    def process_result_value(self, value: str | None, dialect: Dialect) -> Decimal | None:
        if value is None:
            return None

        return Decimal(value)

    class comparator_factory(Numeric.Comparator):  # pyright: ignore[reportIncompatibleMethodOverride, reportMissingTypeArgument]
        def operate(self, op: Any, other: Any, **kwargs: Any):
            return cast(super(), Numeric).operate(op, cast(other, Numeric), **kwargs)

        def reverse_operate(self, op: Any, other: Any, **kwargs: Any):
            return cast(super(), Numeric).reverse_operate(op, cast(other, Numeric), **kwargs)


class JSONB(TypeDecorator):  # pyright: ignore[reportMissingTypeArgument]
    """
    Platform-independent :class:`JSONB` type.

    Stores nested JSON values as binary if possible; otherwise falls back to strings.
    """

    impl = JSON
    cache_ok = True

    def load_dialect_impl(self, dialect: Dialect):
        if dialect.name == "postgresql":
            return dialect.type_descriptor(pg_JSONB(none_as_null=True))
        else:
            return dialect.type_descriptor(JSON(none_as_null=True))

    def process_bind_param(self, value: JSONType | None, dialect: Dialect) -> JSONType | None:
        # Underlying JSON/JSONB type and engine serializer own serialization.
        # Returning None here preserves SQL NULL rather than JSON null.
        return None if value is None else jsonable_encoder(value)


class GUID(TypeDecorator):  # pyright: ignore[reportMissingTypeArgument]
    """
    Platform-independent :class:`uuid.UUID` type.

    Uses PostgreSQL's `UUID` type, otherwise uses `CHAR(32)`, storing as stringified hex values.

    The implementation is based on `this official recipe <https://docs.sqlalchemy.org/en/14/core/custom_types.html#typedecorator-recipes>`_.
    """

    impl = CHAR
    cache_ok = True

    def load_dialect_impl(self, dialect: Dialect):
        if dialect.name == "postgresql":
            return dialect.type_descriptor(pg_UUID())
        else:
            return dialect.type_descriptor(CHAR(32))

    def process_bind_param(self, value: uuid.UUID | str | None, dialect: Dialect) -> str | None:
        if value is None:
            return None
        elif dialect.name == "postgresql":
            return str(value)

        if not isinstance(value, uuid.UUID):
            value = uuid.UUID(value)

        return value.hex

    def process_result_value(self, value: str | None, dialect: Dialect) -> uuid.UUID | None:
        if value is None:
            return None

        if not isinstance(value, uuid.UUID):
            return uuid.UUID(value)

        return value


class UTCDateTime(TypeDecorator):  # pyright: ignore[reportMissingTypeArgument]
    """
    A type for :class:`datetime` objects that are timezone aware.

    Values are stored as UTC timestamps without timezone information,
    and read as UTC datetime objects.

    The implementation is based on `this official recipe <https://docs.sqlalchemy.org/en/14/core/custom_types.html#typedecorator-recipes>`_.
    """

    impl = DateTime
    cache_ok = True

    def process_bind_param(self, value: datetime | None, dialect: Dialect) -> datetime | None:
        if value is None:
            return None

        if value.tzinfo is None:
            msg = "The input datetime must be timezone aware"
            raise ValueError(msg)

        # Convert to UTC, them store as timezone-naive
        return value.astimezone(timezone.utc).replace(tzinfo=None)

    def process_result_value(self, value: datetime | None, dialect: Dialect) -> datetime | None:
        if value is None:
            return None

        # Stored naive timestamp represents UTC; public contract also returns UTC.
        return value.replace(tzinfo=timezone.utc)
