from __future__ import annotations

from ...utils.json import JSONType
from ..tests import NO_DIFF, CompareJSON

__all__ = ['jsons_equal']

_json_comparer = CompareJSON(allow_mixed_numeric=True, allow_mixed_sequence=True)

def jsons_equal(expected: JSONType, actual: JSONType) -> bool:
    """
    Tests whether expected and actual data of the :class:`sqlalchemy.types.JSON` type
    are equivalent to each other.
    """
    return _json_comparer.check(expected, actual) == NO_DIFF
