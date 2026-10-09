from __future__ import annotations

from datetime import datetime

__all__ = ['utc_equal']

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
    return a.timestamp() == b.timestamp()
