from __future__ import annotations

from contextlib import suppress
from datetime import datetime, timedelta, timezone

from hypothesis import given, strategies as st

from sta.common.testing import build_equivalence_relation_tests
from sta.common.utils.datetime import utc_equal

# Tests for utc_equal
TestUTCEqual_EquivalenceRelation = build_equivalence_relation_tests(
    utc_equal,
    st_value=st.datetimes(),
)


def test_utc_equal_at_datetime_boundaries():
    """UTC normalization must not overflow beyond datetime's year range."""
    # Naive boundary values reproduce the platform-local timestamp failure.
    assert utc_equal(datetime.min, datetime.min)  # noqa: DTZ901
    assert utc_equal(datetime.max, datetime.max)  # noqa: DTZ901

    positive_offset = timezone(timedelta(hours=1))
    negative_offset = timezone(-timedelta(hours=1))
    assert utc_equal(
        datetime.min.replace(tzinfo=positive_offset),
        datetime.min.replace(tzinfo=positive_offset),
    )
    assert utc_equal(
        datetime.max.replace(tzinfo=negative_offset),
        datetime.max.replace(tzinfo=negative_offset),
    )


@given(st.datetimes(), st.datetimes(), st.timedeltas())
def test_utc_equal_offset(a: datetime, b: datetime, offset: timedelta):
    with suppress(OverflowError):
        assert utc_equal(a, b) == utc_equal(a + offset, b + offset)

    with suppress(OverflowError):
        assert utc_equal(a, b) == utc_equal(a - offset, b - offset)
