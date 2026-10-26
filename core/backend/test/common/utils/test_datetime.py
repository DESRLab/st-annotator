from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from hypothesis import given, strategies as st

from sta.common.utils.datetime import utc_equal


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


def test_utc_equal_distinguishes_wall_times_from_instants():
    utc = datetime(2024, 1, 1, 12, tzinfo=timezone.utc)
    east = timezone(timedelta(hours=1))
    assert utc_equal(utc, datetime(2024, 1, 1, 13, tzinfo=east))
    assert not utc_equal(utc, utc.replace(tzinfo=east))
    assert not utc_equal(utc, utc.replace(tzinfo=None))
    assert not utc_equal(utc.replace(tzinfo=None), utc)
    naive = utc.replace(tzinfo=None)
    assert utc_equal(naive, naive.replace())
    assert not utc_equal(naive, naive + timedelta(days=1))
    repeated = datetime(2024, 11, 3, 1, 30, tzinfo=ZoneInfo("America/New_York"))
    assert not utc_equal(repeated, repeated.replace(fold=1))
    for fold in (0, 1):
        instant = repeated.replace(fold=fold)
        assert utc_equal(instant, instant.astimezone(timezone.utc))


@given(
    # Hypothesis requires naive bounds even when it generates aware values.
    st.datetimes(
        min_value=datetime(2, 1, 1, tzinfo=timezone.utc).replace(tzinfo=None),
        max_value=datetime(9998, 12, 30, tzinfo=timezone.utc).replace(tzinfo=None),
        timezones=st.just(timezone.utc),
    ),
    st.integers(min_value=-1380, max_value=1380),
)
def test_utc_equal_normalizes_offsets(instant: datetime, minutes: int):
    other = instant.astimezone(timezone(timedelta(minutes=minutes)))
    assert utc_equal(instant, other)
    assert utc_equal(other, instant)
    assert not utc_equal(instant, other + timedelta(seconds=1))
