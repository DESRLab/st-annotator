from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal

from pydantic import AwareDatetime, BaseModel, model_validator

from .vectors import BaseOptionalVector3, DecimalCoord3, OptionalDecimalCoord3

__all__ = ["PartialSTBounds", "STBounds"]


def _validate_spatial_volume_not_negative(
    *,
    min_coords: DecimalCoord3 | OptionalDecimalCoord3,
    max_coords: DecimalCoord3 | OptionalDecimalCoord3,
) -> None:
    for k in ("x", "y", "z"):
        min_c = min_coords.get(k)
        max_c = max_coords.get(k)

        if min_c is not None and max_c is not None and min_c > max_c:
            msg = f"The minimum coordinates cannot be greater than the maximum coordinates. Found: {min_coords} > {max_coords}"
            raise ValueError(msg)


def _validate_timestamp_volume_not_negative(
    *,
    min_timestamp: AwareDatetime | None,
    max_timestamp: AwareDatetime | None,
) -> None:
    if min_timestamp is not None and max_timestamp is not None and min_timestamp > max_timestamp:
        msg = f"The minimum timestamp cannot be greater than the maximum timestamp. Found: {min_timestamp} > {max_timestamp}"
        raise ValueError(msg)


class PartialSTBounds(BaseModel, frozen=True):
    """Represents a closed or open boundary in time and 3D space."""

    min_coords: OptionalDecimalCoord3
    max_coords: OptionalDecimalCoord3
    min_timestamp: AwareDatetime | None
    max_timestamp: AwareDatetime | None

    @model_validator(mode="after")
    def spatial_volume_not_negative(self):
        _validate_spatial_volume_not_negative(
            min_coords=self.min_coords,
            max_coords=self.max_coords,
        )

        return self

    @model_validator(mode="after")
    def timestamp_volume_not_negative(self):
        _validate_timestamp_volume_not_negative(
            min_timestamp=self.min_timestamp,
            max_timestamp=self.max_timestamp,
        )

        return self

    def _to_filled_vector(
        self, vector: DecimalCoord3 | OptionalDecimalCoord3 | None, fill_value: Decimal
    ) -> DecimalCoord3:
        if vector is None:
            vector = OptionalDecimalCoord3.empty()
        if isinstance(vector, BaseOptionalVector3):
            filled = vector.filled(fill_value)
            vector = DecimalCoord3.model_construct(x=filled.x, y=filled.y, z=filled.z)

        return vector

    def filled(self) -> STBounds:
        """
        Returns a copy of this object that is cast to :class:`STBounds` by
        considering that `None` values represent unbounded values.
        """
        min_coords = self._to_filled_vector(self.min_coords, Decimal("-Infinity"))
        max_coords = self._to_filled_vector(self.max_coords, Decimal("+Infinity"))

        min_timestamp, max_timestamp = self.min_timestamp, self.max_timestamp
        if min_timestamp is None:
            # Keep the lower sentinel in the upper bound's timezone.  A
            # historical positive UTC offset at year 1 otherwise represents
            # an instant before ``datetime.min`` in UTC.
            min_timestamp = datetime.min.replace(
                tzinfo=(max_timestamp.tzinfo if max_timestamp is not None else timezone.utc)
            )
        if max_timestamp is None:
            # Symmetrically, avoid overflowing beyond ``datetime.max`` for
            # historical negative UTC offsets.
            max_timestamp = datetime.max.replace(tzinfo=min_timestamp.tzinfo)

        return STBounds(
            min_coords=min_coords,
            max_coords=max_coords,
            min_timestamp=min_timestamp,
            max_timestamp=max_timestamp,
        )

    def contains(self, other: PartialSTBounds | STBounds) -> bool:
        """
        Returns `true` if the this bounds contains another bounds, i.e.,
        the other bounds is inside this bounds (inclusive of the borders of this bounds).
        """
        return self.filled().contains(other)

    def intersects(self, other: PartialSTBounds | STBounds) -> bool:
        """
        Returns `true` if the this bounds intersects another bounds, i.e.,
        they have at least one point in common.
        """
        return self.filled().intersects(other)


class STBounds(BaseModel, frozen=True):
    """Represents a closed boundary in time and 3D space."""

    min_coords: DecimalCoord3
    max_coords: DecimalCoord3
    min_timestamp: AwareDatetime
    max_timestamp: AwareDatetime

    @model_validator(mode="after")
    def spatial_volume_not_negative(self):
        _validate_spatial_volume_not_negative(
            min_coords=self.min_coords,
            max_coords=self.max_coords,
        )

        return self

    @model_validator(mode="after")
    def timestamp_volume_not_negative(self):
        _validate_timestamp_volume_not_negative(
            min_timestamp=self.min_timestamp,
            max_timestamp=self.max_timestamp,
        )

        return self

    def contains(self, other: PartialSTBounds | STBounds) -> bool:
        """
        Returns `true` if the this bounds contains another bounds, i.e.,
        the other bounds is inside this bounds (inclusive of the borders of this bounds).
        """
        if isinstance(other, PartialSTBounds):
            other = other.filled()

        for k in ("x", "y", "z"):
            other_min_c = other.min_coords.get(k)
            other_max_c = other.max_coords.get(k)
            self_min_c = self.min_coords.get(k)
            self_max_c = self.max_coords.get(k)

            if other_min_c < self_min_c:
                return False
            if other_max_c > self_max_c:
                return False

        other_min_t = other.min_timestamp
        other_max_t = other.max_timestamp
        self_min_t = self.min_timestamp
        self_max_t = self.max_timestamp

        if other_min_t < self_min_t:
            return False
        if other_max_t > self_max_t:  # noqa: SIM103
            return False

        return True

    def intersects(self, other: PartialSTBounds | STBounds) -> bool:
        """
        Returns `true` if the this bounds intersects another bounds, i.e.,
        they have at least one point in common.
        """
        if isinstance(other, PartialSTBounds):
            other = other.filled()

        for k in ("x", "y", "z"):
            other_min_c = other.min_coords.get(k)
            other_max_c = other.max_coords.get(k)
            self_min_c = self.min_coords.get(k)
            self_max_c = self.max_coords.get(k)

            if other_max_c < self_min_c:
                return False
            if other_min_c > self_max_c:
                return False

        other_min_t = other.min_timestamp
        other_max_t = other.max_timestamp
        self_min_t = self.min_timestamp
        self_max_t = self.max_timestamp

        if other_max_t < self_min_t:
            return False
        if other_min_t > self_max_t:  # noqa: SIM103
            return False

        return True
