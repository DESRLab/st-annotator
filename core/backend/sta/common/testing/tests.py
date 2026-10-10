from __future__ import annotations

from collections.abc import Callable, Hashable
from decimal import Decimal
from typing import TypeVar

from hypothesis import given, strategies as st

from ..utils.json import NO_DIFF, CompareJSON, JSONType

__all__ = [
    "NO_DIFF",
    "CompareJSON",
    "build_equal_hash_tests",
    "build_equivalence_relation_tests",
    "jsontypes_equal",
]

T = TypeVar("T")


def build_equivalence_relation_tests(
    has_relation: Callable[[T, T], bool],
    *,
    st_value: st.SearchStrategy[T],
):
    """Generates a test suite for a relation to validate that it is an equivalence relation."""

    class TestEquivalenceRelation:
        @given(st_value)
        def test_reflexive(self, x: T):
            assert has_relation(x, x)

        @given(st_value, st_value)
        def test_symmetric(self, a: T, b: T):
            assert has_relation(a, b) == has_relation(b, a)

        @given(st_value, st_value, st_value)
        def test_transitive(self, a: T, b: T, c: T):
            if has_relation(a, b) and has_relation(b, c):
                assert has_relation(a, c)

    return TestEquivalenceRelation


def build_equal_hash_tests(st_value: st.SearchStrategy[object]):
    """
    Generates a test suite to validate the properties of
    :meth:`object.__eq__` and :meth:`object.__hash__`.
    """
    st_hashable = st.from_type(Hashable).filter(
        lambda x: (not isinstance(x, Decimal)) or (not x.is_snan())
    )

    class TestEqualsHash:
        # Omit st_hashable as it may generate NaN-like values
        @given(st_value)
        def test_reflexive(self, x: object):
            assert x == x

        @given(st_value | st_hashable, st_value | st_hashable)
        def test_symmetric(self, a: object, b: object):
            assert (a == b) == (b == a)

        @given(st_value | st_hashable, st_value | st_hashable, st_value | st_hashable)
        def test_transitive(self, a: object, b: object, c: object):
            if a == b and b == c:
                assert a == c

        @given(st_value | st_hashable, st_value | st_hashable)
        def test_equals_stricter_than_hash(self, a: object, b: object):
            if a == b:
                assert hash(a) == hash(b)

    return TestEqualsHash


_json_comparer = CompareJSON(allow_mixed_numeric=False, allow_mixed_sequence=True)


def jsontypes_equal(expected: JSONType, actual: JSONType) -> bool:
    """
    Tests whether expected and actual data of the :class:`JSONType` type
    are equivalent to each other.
    """
    return _json_comparer.check(expected, actual) == NO_DIFF
