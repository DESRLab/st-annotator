from __future__ import annotations

from contextlib import suppress
from datetime import datetime, timedelta

from hypothesis import given, strategies as st

from sta.common.testing import build_equivalence_relation_tests
from sta.common.utils.datetime import utc_equal

# Tests for utc_equal
TestUTCEqual_EquivalenceRelation = build_equivalence_relation_tests(
    utc_equal,
    st_value=st.datetimes(),
)

@given(st.datetimes(), st.datetimes(), st.timedeltas())
def test_utc_equal_offset(a: datetime, b: datetime, offset: timedelta):
    with suppress(OverflowError):
        assert utc_equal(a, b) == utc_equal(a + offset, b + offset)

    with suppress(OverflowError):
        assert utc_equal(a, b) == utc_equal(a - offset, b - offset)
