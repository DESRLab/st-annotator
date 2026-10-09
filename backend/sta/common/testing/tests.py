from __future__ import annotations

from collections.abc import Callable, Hashable, Sequence
from decimal import Decimal
from typing import Any, TypeVar

from hypothesis import given, strategies as st
from jsoncomparison import NO_DIFF, Compare, TypesNotEqual, ValueNotFound

from ..utils.json import JSONType

__all__ = [
    'NO_DIFF',
    'CompareJSON',
    'build_equal_hash_tests',
    'build_equivalence_relation_tests',
    'jsontypes_equal',
]

T = TypeVar('T')

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
    st_hashable = st.from_type(Hashable) \
        .filter(lambda x: (not isinstance(x, Decimal)) or (not x.is_snan()))

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


class CompareJSON(Compare):
    """
    Helper class to compare between expected and actual JSON data.

    Parameters
    ----------
    config : dict
        As :attr:`Compare.config`. We additionally support `types.tuple.check_length`
        which is similar to `types.list.check_length` except that it applies to tuples.
    rules : dict
        As :attr:`Compare.rules`.
    allow_mixed_numeric : bool, default False
        If `True`, floats and integers are considered to be equivalent
        as long as their numeric values are equal.
    allow_mixed_sequence : bool, default False
        If `True`, lists and tuples are considered to be equivalent
        as long as their elements are equal.
    """

    def __init__(
        self,
        *,
        config: dict[str, Any] | None = None,
        rules: dict[str, Any] | None = None,
        allow_mixed_numeric: bool = False,
        allow_mixed_sequence: bool = False,
    ):
        super().__init__(config, rules)  # pyright: ignore[reportArgumentType]

        self.allow_mixed_numeric = allow_mixed_numeric
        self.allow_mixed_sequence = allow_mixed_sequence

    def check(self, expected: JSONType, actual: JSONType) -> dict[str, Any]:
        return super().check(expected, actual)

    def _diff(self, e: Any, a: Any) -> dict[str, Any]:
        t = type(e)
        if not isinstance(a, t):
            if self.allow_mixed_numeric:
                if isinstance(e, int) and isinstance(a, float) and a.is_integer():
                    return self._int_diff(e, int(a))
                elif isinstance(e, float) and isinstance(a, int):
                    return self._int_diff(e, float(a))
            if self.allow_mixed_sequence:
                if isinstance(e, list) and isinstance(a, tuple):
                    return self._list_diff(e, list(a))
                elif isinstance(e, tuple) and isinstance(a, list):
                    return self._tuple_diff(e, tuple(a))

            return TypesNotEqual(e, a).explain()
        if t is int:
            return self._int_diff(e, a)
        if t is str:
            return self._str_diff(e, a)
        if t is bool:
            return self._bool_diff(e, a)
        if t is float:
            return self._float_diff(e, a)
        if t is dict:
            return self._dict_diff(e, a)
        if t is list:
            return self._list_diff(e, a)
        if t is tuple:
            return self._tuple_diff(e, a)
        return NO_DIFF

    def _need_compare_length(self):
        path = 'types.tuple.check_length'
        return self._config.get(path) is True

    def _tuple_diff(self, e: tuple[JSONType, ...], a: tuple[JSONType, ...]) -> dict[str, Any]:
        d = {}
        if self._need_compare_length():
            d['_length'] = self._list_len_diff(e, a)
        d['_content'] = self._list_content_diff(e, a)
        return self._without_empties(d)

    def _list_content_diff(self, e: Sequence[JSONType], a: Sequence[JSONType]) -> dict[str, Any]:
        d = {}
        for i, v in enumerate(e):
            if any(self._diff(v, va) == NO_DIFF for va in a):
                continue
            t = type(v)
            if t in (int, str, bool, float):
                d[i] = ValueNotFound(v, None).explain()
            elif t is dict:
                d[i] = self._max_diff(v, a, self._dict_diff)
            elif t is list:
                d[i] = self._max_diff(v, a, self._list_diff)
        return self._without_empties(d)


_json_comparer = CompareJSON(allow_mixed_numeric=False, allow_mixed_sequence=True)

def jsontypes_equal(expected: JSONType, actual: JSONType) -> bool:
    """
    Tests whether expected and actual data of the :class:`JSONType` type
    are equivalent to each other.
    """
    return _json_comparer.check(expected, actual) == NO_DIFF
