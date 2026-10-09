from __future__ import annotations

import decimal
from datetime import datetime
from decimal import Decimal

import pydantic

import pytest
from hypothesis import assume, given, strategies as st

from sta.common.spatial import DecimalCoord3, OptionalDecimalCoord3
from sta.common.spatial.boundaries import PartialSTBounds, STBounds
from sta.common.testing import build_equal_hash_tests, build_equivalence_relation_tests


@given(
    min_coords=st.from_type(OptionalDecimalCoord3),
    max_coords=st.from_type(OptionalDecimalCoord3),
    min_timestamp=st.datetimes(timezones=st.timezones()) | st.none(),
    max_timestamp=st.datetimes(timezones=st.timezones()) | st.none(),
)
def test_partial_stbounds_volume_negative(
    min_coords: OptionalDecimalCoord3,
    max_coords: OptionalDecimalCoord3,
    min_timestamp: datetime | None,
    max_timestamp: datetime | None,
):
    min_x, min_y, min_z = (
        None if a is None or b is None else min(a, b)
        for a, b in zip(min_coords.to_tuple(), max_coords.to_tuple(), strict=True)
    )
    max_x, max_y, max_z = (
        None if a is None or b is None else max(a, b)
        for a, b in zip(min_coords.to_tuple(), max_coords.to_tuple(), strict=True)
    )

    if min_timestamp is not None and max_timestamp is not None:
        min_t = min(min_timestamp, max_timestamp)
        max_t = max(min_timestamp, max_timestamp)
    else:
        min_t = min_timestamp
        max_t = max_timestamp

    if min_x is not None and max_x is not None and min_x != max_x:
        with pytest.raises(pydantic.ValidationError, match='The minimum coordinates cannot be greater than the maximum coordinates'):
            PartialSTBounds(
                min_coords=OptionalDecimalCoord3(x=max_x, y=min_y, z=min_z),
                max_coords=OptionalDecimalCoord3(x=min_x, y=max_y, z=max_z),
                min_timestamp=min_t,
                max_timestamp=max_t,
            )

    if min_y is not None and max_y is not None and min_y != max_y:
        with pytest.raises(pydantic.ValidationError, match='The minimum coordinates cannot be greater than the maximum coordinates'):
            PartialSTBounds(
                min_coords=OptionalDecimalCoord3(x=min_x, y=max_y, z=min_z),
                max_coords=OptionalDecimalCoord3(x=max_x, y=min_y, z=max_z),
                min_timestamp=min_t,
                max_timestamp=max_t,
            )

    if min_z is not None and max_z is not None and min_z != max_z:
        with pytest.raises(pydantic.ValidationError, match='The minimum coordinates cannot be greater than the maximum coordinates'):
            PartialSTBounds(
                min_coords=OptionalDecimalCoord3(x=min_x, y=min_y, z=max_z),
                max_coords=OptionalDecimalCoord3(x=max_x, y=max_y, z=min_z),
                min_timestamp=min_t,
                max_timestamp=max_t,
            )

    if min_t is not None and max_t is not None and min_t != max_t:
        with pytest.raises(pydantic.ValidationError, match='The minimum timestamp cannot be greater than the maximum timestamp'):
            PartialSTBounds(
                min_coords=OptionalDecimalCoord3(x=min_x, y=min_y, z=min_z),
                max_coords=OptionalDecimalCoord3(x=max_x, y=max_y, z=max_z),
                min_timestamp=max_t,
                max_timestamp=min_t,
            )


TestPartialSTBounds_EquivalenceRelation = build_equivalence_relation_tests(
    lambda a, b: a == b,
    st_value=st.from_type(PartialSTBounds),
)


TestPartialSTBounds_EqualHash = build_equal_hash_tests(
    st_value=st.from_type(PartialSTBounds),
)


@given(st.from_type(PartialSTBounds))
def test_partial_stbounds_contains_unbounded(bounds: PartialSTBounds):
    unbounded_x = PartialSTBounds(
        min_coords=bounds.min_coords.copy_with(x=None),
        max_coords=bounds.max_coords.copy_with(x=None),
        min_timestamp=bounds.min_timestamp,
        max_timestamp=bounds.max_timestamp,
    )
    assert unbounded_x.contains(bounds)

    unbounded_y = PartialSTBounds(
        min_coords=bounds.min_coords.copy_with(y=None),
        max_coords=bounds.max_coords.copy_with(y=None),
        min_timestamp=bounds.min_timestamp,
        max_timestamp=bounds.max_timestamp,
    )
    assert unbounded_y.contains(bounds)

    unbounded_z = PartialSTBounds(
        min_coords=bounds.min_coords.copy_with(z=None),
        max_coords=bounds.max_coords.copy_with(z=None),
        min_timestamp=bounds.min_timestamp,
        max_timestamp=bounds.max_timestamp,
    )
    assert unbounded_z.contains(bounds)

@given(st.from_type(PartialSTBounds))
def test_partial_stbounds_contains_self(bounds: PartialSTBounds):
    assert bounds.contains(bounds)

@given(st.from_type(PartialSTBounds), st.from_type(PartialSTBounds))
def test_partial_stbounds_contains_antisymmetric(b1: PartialSTBounds, b2: PartialSTBounds):
    assume(b1 != b2)

    if b1.contains(b2):
        assert not b2.contains(b1)
    if b2.contains(b1):
        assert not b1.contains(b2)

@given(st.from_type(PartialSTBounds), st.from_type(PartialSTBounds))
def test_partial_stbounds_contains_stricter_than_intersects(b1: PartialSTBounds, b2: PartialSTBounds):
    if b1.contains(b2):
        assert b1.intersects(b2)
    if b2.contains(b1):
        assert b2.intersects(b1)


@given(
    st.from_type(PartialSTBounds),
    st.from_type(PartialSTBounds),
)
def test_partial_stbounds_intersects_symmetric(b1: PartialSTBounds, b2: PartialSTBounds):
    assert b1.intersects(b2) == b2.intersects(b1)

@given(
    st.from_type(STBounds),
    st.from_type(DecimalCoord3).filter(lambda v: all(0 <= a <= 1 for a in v.to_tuple())),
)
def test_stbounds_intersects_spatial_touching(bounds: STBounds, alpha: DecimalCoord3):
    with decimal.localcontext() as ctx:
        ctx.prec = decimal.MAX_PREC

        corner = DecimalCoord3.from_tuple(
            (alpha * bounds.min_coords + (Decimal(1) - alpha) * bounds.max_coords)
            .to_tuple(),
        )
        min_bounds = STBounds(
            min_coords=bounds.min_coords,
            max_coords=corner,
            min_timestamp=bounds.min_timestamp,
            max_timestamp=bounds.max_timestamp,
        )
        max_bounds = STBounds(
            min_coords=corner,
            max_coords=bounds.max_coords,
            min_timestamp=bounds.min_timestamp,
            max_timestamp=bounds.max_timestamp,
        )

        assert min_bounds.intersects(max_bounds)
