from __future__ import annotations

from datetime import datetime, timedelta

__all__ = ["utc_equal"]


def utc_equal(a: datetime, b: datetime) -> bool:
    """
    Tests whether two timestamps are equal in terms of UTC.

    This is different from :meth:`datetime.__eq__` due to the possibility of ambiguous local time.
    (See `PEP 495 <https://peps.python.org/pep-0495/#aware-datetime-equality-comparison>`_
    for more details.)

    Parameters
    ----------
    a : datetime
        The first datetime to test.
    b : datetime
        The second datetime to test.
    """
    a_offset = a.utcoffset()
    b_offset = b.utcoffset()

    # Naive datetimes have no UTC offset to normalize. Keep Python's usual
    # semantics: compare two naive wall times directly, and never equate a
    # naive datetime with an aware one.
    if a_offset is None or b_offset is None:
        return a_offset is None and b_offset is None and a == b

    # Compare positions on a proleptic UTC timeline without constructing a
    # normalized datetime. datetime.timestamp() and astimezone() can underflow
    # at datetime.min (or overflow at datetime.max) when applying an offset.
    day_us = 24 * 60 * 60 * 1_000_000

    def utc_microseconds(value: datetime, offset: timedelta) -> int:
        wall_microseconds = (
            value.toordinal() * day_us
            + ((value.hour * 60 + value.minute) * 60 + value.second) * 1_000_000
            + value.microsecond
        )
        return wall_microseconds - (
            offset.days * day_us + offset.seconds * 1_000_000 + offset.microseconds
        )

    return utc_microseconds(a, a_offset) == utc_microseconds(b, b_offset)
