from __future__ import annotations

import decimal
import itertools
from collections.abc import Callable
from decimal import Decimal
from math import isnan, nan
from typing import Any, Literal, Protocol, TypeVar

import numpy as np

import pytest
from hypothesis import given, strategies as st

from sta.common.spatial.vectors import (
    BaseOptionalVector3,
    BaseVector3,
    DecimalVector3,
    OptionalVector3,
    T,
    Vector3,
)
from sta.common.testing import build_equal_hash_tests, build_equivalence_relation_tests, st_decimals


def _component_is_not_nan(value: Decimal | float | None) -> bool:
    if value is None:
        return True
    if isinstance(value, Decimal):
        return not value.is_nan()

    return not isnan(value)


def _component_is_not_snan(value: Decimal | float | None) -> bool:
    if not isinstance(value, Decimal):
        return True

    return not value.is_snan()


def _vector_components_match(predicate: Callable[[Decimal | float | None], bool]):
    def match(vector: BaseVector3[Any] | BaseOptionalVector3[Any]) -> bool:
        return all(predicate(value) for value in vector.to_tuple())

    return match


st_decimal_vector3 = st.from_type(DecimalVector3)
st_decimal_vector3_no_nan = st_decimal_vector3.filter(_vector_components_match(_component_is_not_nan))
st_decimal_vector3_no_snan = st_decimal_vector3.filter(_vector_components_match(_component_is_not_snan))

st_vector3 = st.from_type(Vector3)
st_vector3_no_nan = st_vector3.filter(_vector_components_match(_component_is_not_nan))

st_optional_vector3 = st.from_type(OptionalVector3)
st_optional_vector3_no_nan = st_optional_vector3.filter(_vector_components_match(_component_is_not_nan))
st_optional_vector3_no_none = st_vector3.map(lambda v: OptionalVector3(**v.to_dict()))


T_co = TypeVar('T_co', float, Decimal, covariant=True)
class ComponentStrategyFactory(Protocol[T_co]):
    def __call__(self, *, min_value: float | None, max_value: float | None) -> st.SearchStrategy[T_co]: ...

def st_decimals_factory(*, min_value: float | None, max_value: float | None) -> st.SearchStrategy[Decimal]:
    return st_decimals(min_value=None if min_value is None else Decimal(min_value), max_value=None if max_value is None else Decimal(max_value)) \
        .filter(lambda x: not x.is_snan())

def st_floats_factory(*, min_value: float | None, max_value: float | None) -> st.SearchStrategy[float]:
    return st.floats(min_value=min_value, max_value=max_value)


def build_roundtrip_tests_for_vector(
    vector_cls: type[BaseVector3[T] | BaseOptionalVector3[T]],
    build_st_component: ComponentStrategyFactory[T],
):
    if issubclass(vector_cls, BaseVector3):
        def build_st_component_1(*, min_value: float | None, max_value: float | None) -> st.SearchStrategy[T]:
            return build_st_component(min_value=min_value, max_value=max_value)

        build_st_component_or_none = build_st_component_1
    else:
        def build_st_component_2(*, min_value: float | None, max_value: float | None) -> st.SearchStrategy[T | None]:
            return build_st_component(min_value=min_value, max_value=max_value) | st.none()

        build_st_component_or_none = build_st_component_2

    st_optional_component = build_st_component_or_none(min_value=None, max_value=None)
    st_optional_vector = st.tuples(st_optional_component, st_optional_component, st_optional_component) \
        .map(lambda xyz: vector_cls(x=xyz[0], y=xyz[1], z=xyz[2]))  # pyright: ignore[reportArgumentType]

    V = TypeVar('V', BaseVector3[Any], BaseOptionalVector3[Any])

    class TestRoundtrip:
        @pytest.fixture(scope='class', autouse=True)
        def suppress_invalid_operation(self):
            with decimal.localcontext() as ctx:
                ctx.traps[decimal.InvalidOperation] = False

                yield

        @given(st_optional_vector)
        def test_dict(self, v: V):
            assert v.from_dict(v.to_dict()).equals(v, nan_ok=True)

        @given(st_optional_vector)
        def test_tuple(self, v: V):
            assert v.from_tuple(v.to_tuple()).equals(v, nan_ok=True)

    return TestRoundtrip

def build_array_tests_for_vector(
    vector_cls: type[BaseVector3[T] | BaseOptionalVector3[T]],
    build_st_component: ComponentStrategyFactory[T],
):
    st_component = build_st_component(min_value=None, max_value=None)
    st_vector = st.tuples(st_component, st_component, st_component) \
        .map(lambda xyz: vector_cls(x=xyz[0], y=xyz[1], z=xyz[2]))

    st_component_positive = build_st_component(min_value=1e-8, max_value=4)
    st_vector_positive = st.tuples(st_component_positive, st_component_positive, st_component_positive) \
        .map(lambda xyz: vector_cls(x=xyz[0], y=xyz[1], z=xyz[2]))

    st_component_nonzero = st_component_positive | st_component_positive.map(lambda x: -x)
    st_vector_nonzero = st.tuples(st_component_nonzero, st_component_nonzero, st_component_nonzero) \
        .map(lambda xyz: vector_cls(x=xyz[0], y=xyz[1], z=xyz[2]))  # pyright: ignore[reportArgumentType]

    V = TypeVar('V', BaseVector3[Any], BaseOptionalVector3[Any])

    class TestArray:
        @pytest.fixture(scope='class', autouse=True)
        def suppress_invalid_operation(self):
            with decimal.localcontext() as ctx:
                ctx.traps[decimal.InvalidOperation] = False

                yield

        @given(st_vector, st_vector)
        def test_add(self, v1: V, v2: V):
            arr1 = np.array(v1.to_tuple())
            arr2 = np.array(v2.to_tuple())
            x, y, z = (arr1 + arr2).tolist()
            v = vector_cls(x=x, y=y, z=z)

            assert (v1 + v2).equals(v, nan_ok=True)

        @given(st_vector, st_vector)
        def test_sub(self, v1: V, v2: V):
            arr1 = np.array(v1.to_tuple())
            arr2 = np.array(v2.to_tuple())
            x, y, z = (arr1 - arr2).tolist()
            v = vector_cls(x=x, y=y, z=z)

            assert (v1 - v2).equals(v, nan_ok=True)

        @given(st_vector, st_vector)
        def test_mul(self, v1: V, v2: V):
            arr1 = np.array(v1.to_tuple())
            arr2 = np.array(v2.to_tuple())
            x, y, z = (arr1 * arr2).tolist()
            v = vector_cls(x=x, y=y, z=z)

            assert (v1 * v2).equals(v, nan_ok=True)

        @given(st_vector, st_vector_nonzero)
        def test_div(self, v1: V, v2: V):
            arr1 = np.array(v1.to_tuple())
            arr2 = np.array(v2.to_tuple())
            x, y, z = (arr1 / arr2).tolist()
            v = vector_cls(x=x, y=y, z=z)

            assert (v1 / v2).equals(v, nan_ok=True)

        @given(st_vector_positive, st_vector_nonzero)
        def test_pow(self, v1: V, v2: V):
            arr1 = np.array(v1.to_tuple())
            arr2 = np.array(v2.to_tuple())
            x, y, z = (arr1 ** arr2).tolist()
            v = vector_cls(x=x, y=y, z=z)

            assert (v1 ** v2).equals(v, nan_ok=True)

    return TestArray


def build_broadcasting_tests_for_vector(
    vector_cls: type[BaseVector3[T] | BaseOptionalVector3[T]],
    build_st_component: ComponentStrategyFactory[T],
):
    if issubclass(vector_cls, BaseVector3):
        def build_st_component_1(*, min_value: float | None, max_value: float | None) -> st.SearchStrategy[T]:
            return build_st_component(min_value=min_value, max_value=max_value)

        build_st_component_or_none = build_st_component_1
    else:
        def build_st_component_2(*, min_value: float | None, max_value: float | None) -> st.SearchStrategy[T | None]:
            return build_st_component(min_value=min_value, max_value=max_value) | st.none()

        build_st_component_or_none = build_st_component_2

    st_component_or_none = build_st_component_or_none(min_value=None, max_value=None)
    st_optional_vector = st.tuples(st_component_or_none, st_component_or_none, st_component_or_none) \
        .map(lambda xyz: vector_cls(x=xyz[0], y=xyz[1], z=xyz[2]))  # pyright: ignore[reportArgumentType]

    st_component_positive_or_none = build_st_component_or_none(min_value=1e-8, max_value=4)
    st_optional_vector_positive = st.tuples(st_component_positive_or_none, st_component_positive_or_none, st_component_positive_or_none) \
        .map(lambda xyz: vector_cls(x=xyz[0], y=xyz[1], z=xyz[2]))  # pyright: ignore[reportArgumentType]

    st_component_nonzero_or_none = st_component_positive_or_none | st_component_positive_or_none.map(lambda x: None if x is None else -x)
    st_optional_vector_nonzero = st.tuples(st_component_nonzero_or_none, st_component_nonzero_or_none, st_component_nonzero_or_none) \
        .map(lambda xyz: vector_cls(x=xyz[0], y=xyz[1], z=xyz[2]))  # pyright: ignore[reportArgumentType]

    class TestBroadcasting:
        @pytest.fixture(scope='class', autouse=True)
        def suppress_invalid_operation(self):
            with decimal.localcontext() as ctx:
                ctx.traps[decimal.InvalidOperation] = False

                yield

        @given(st_optional_vector, st_component_or_none)
        def test_add(self, v: BaseVector3[T] | BaseOptionalVector3[T], c: T):
            assert (v + v.of(c)).equals(v + c, nan_ok=True)

        @given(st_optional_vector, st_component_or_none)
        def test_sub(self, v: BaseVector3[T] | BaseOptionalVector3[T], c: T):
            assert (v - v.of(c)).equals(v - c, nan_ok=True)

        @given(st_optional_vector, st_component_or_none)
        def test_mul(self, v: BaseVector3[T] | BaseOptionalVector3[T], c: T):
            assert (v * v.of(c)).equals(v * c, nan_ok=True)

        @given(st_optional_vector, st_component_nonzero_or_none)
        def test_div(self, v: BaseVector3[T] | BaseOptionalVector3[T], c: T):
            assert (v / v.of(c)).equals(v / c, nan_ok=True)

        @given(st_optional_vector_positive, st_component_nonzero_or_none)
        def test_pow(self, v: BaseVector3[T] | BaseOptionalVector3[T], c: T):
            assert (v ** v.of(c)).equals(v ** c, nan_ok=True)

        @given(st_optional_vector, st_component_or_none)
        def test_radd(self, v: BaseVector3[T] | BaseOptionalVector3[T], c: T):
            assert (v.of(c) + v).equals(c + v, nan_ok=True)

        @given(st_optional_vector, st_component_or_none)
        def test_rsub(self, v: BaseVector3[T] | BaseOptionalVector3[T], c: T):
            assert (v.of(c) - v).equals(c - v, nan_ok=True)

        @given(st_optional_vector, st_component_or_none)
        def test_rmul(self, v: BaseVector3[T] | BaseOptionalVector3[T], c: T):
            assert (v.of(c) * v).equals(c * v, nan_ok=True)

        @given(st_optional_vector_nonzero, st_component_nonzero_or_none)
        def test_rdiv(self, v: BaseVector3[T] | BaseOptionalVector3[T], c: T):
            assert (v.of(c) / v).equals(c / v, nan_ok=True)

        @given(st_optional_vector_nonzero, st_component_positive_or_none)
        def test_rpow(self, v: BaseVector3[T] | BaseOptionalVector3[T], c: T):
            assert (v.of(c) ** v).equals(c ** v, nan_ok=True)

    return TestBroadcasting


# Tests for DecimalVector3
TestDecimalVector3_EquivalenceRelation = build_equivalence_relation_tests(
    lambda a, b: a.equals(b, nan_ok=True),
    st_value=st_decimal_vector3,
)

TestDecimalVector3_EqualHash = build_equal_hash_tests(
    st_decimal_vector3_no_nan,
)

@given(st_decimal_vector3_no_nan)
def test_decimal_vector3_equal_add_zero(v: DecimalVector3):
    with decimal.localcontext() as ctx:
        ctx.prec = decimal.MAX_PREC

        assert v + DecimalVector3.zeros() == v

def test_decimal_vector3_equal_nan():
    component_choices: dict[Literal['a', 'b', 'c'], Decimal] = {
        'a': Decimal('NaN'),
        'b': Decimal('sNaN'),
        'c': Decimal(0),
    }

    def get_vector(choices: tuple[Literal['a', 'b', 'c'], ...]) -> DecimalVector3:
        return DecimalVector3(**{
            component: component_choices[choice]
            for component, choice in zip(('x', 'y', 'z'), choices, strict=True)
        })

    vectors = [get_vector(comb) for comb in itertools.combinations(('a', 'b', 'c'), 3)]

    for a, b in itertools.product(vectors, repeat=2):
        if a is b:
            assert a.equals(b, nan_ok=True)
        else:
            assert not a.equals(b, nan_ok=True)

@given(st_decimal_vector3_no_snan)
def test_decimal_vector3_equal_other(v: DecimalVector3):
    assert v != v.to_tuple()

TestDecimalVector3_Roundtrip = build_roundtrip_tests_for_vector(
    DecimalVector3,
    st_decimals_factory,
)

TestDecimalVector3_Array = build_array_tests_for_vector(
    DecimalVector3,
    st_decimals_factory,
)

TestDecimalVector3_Broadcasting = build_broadcasting_tests_for_vector(
    DecimalVector3,
    st_decimals_factory,
)


# Tests for Vector3
TestVector3_EquivalenceRelation = build_equivalence_relation_tests(
    lambda a, b: a.equals(b, nan_ok=True),
    st_value=st_vector3,
)

TestVector3_EqualHash = build_equal_hash_tests(st_vector3_no_nan)

@given(st_vector3_no_nan)
def test_vector3_equal_add_zero(v: Vector3):
    assert v + Vector3.zeros() == v

def test_vector3_equal_nan():
    component_choices: dict[Literal['a', 'b'], float] = {
        'a': nan,
        'b': 0.0,
    }

    def get_vector(choices: tuple[Literal['a', 'b'], ...]) -> Vector3:
        return Vector3(**{
            component: component_choices[choice]
            for component, choice in zip(('x', 'y', 'z'), choices, strict=True)
        })

    vectors = [get_vector(comb) for comb in itertools.combinations(('a', 'b'), 3)]

    for a, b in itertools.product(vectors, repeat=2):
        if a is b:
            assert a.equals(b, nan_ok=True)
        else:
            assert not a.equals(b, nan_ok=True)

@given(st_vector3)
def test_vector3_equal_other(v: Vector3):
    assert v != v.to_tuple()

TestVector3_Roundtrip = build_roundtrip_tests_for_vector(
    Vector3,
    st_floats_factory,
)

@given(st_vector3)
def test_vector3_array_roundtrip(v: Vector3):
    assert Vector3.from_array(v.to_array()).equals(v, nan_ok=True)

TestVector3_Array = build_array_tests_for_vector(
    Vector3,
    st_floats_factory,
)

TestVector3_Broadcasting = build_broadcasting_tests_for_vector(
    Vector3,
    st_floats_factory,
)


# Tests for OptionalVector3
TestOptionalVector3_EquivalenceRelation = build_equivalence_relation_tests(
    lambda a, b: a.equals(b, nan_ok=True),
    st_value=st_optional_vector3,
)

TestOptionalVector3_EqualHash = build_equal_hash_tests(st_optional_vector3_no_nan)

@given(st_optional_vector3_no_nan)
def test_optional_vector3_equal_add_zero(v: OptionalVector3):
    assert v + Vector3.zeros() == v

def test_optional_vector3_equal_nan():
    component_choices: dict[Literal['a', 'b', 'c'], float | None] = {
        'a': nan,
        'b': 0.0,
        'c': None,
    }

    def get_vector(choices: tuple[Literal['a', 'b', 'c'], ...]) -> OptionalVector3:
        return OptionalVector3(**{
            component: component_choices[choice]
            for component, choice in zip(('x', 'y', 'z'), choices, strict=True)
        })

    vectors = [get_vector(comb) for comb in itertools.combinations(('a', 'b', 'c'), 3)]

    for a, b in itertools.product(vectors, repeat=2):
        if a is b:
            assert a.equals(b, nan_ok=True)
        else:
            assert not a.equals(b, nan_ok=True)

@given(st_optional_vector3)
def test_optional_vector3_equal_other(v: OptionalVector3):
    assert v != v.to_tuple()

TestOptionalVector3_Roundtrip = build_broadcasting_tests_for_vector(
    OptionalVector3,
    st_floats_factory,
)

TestOptionalVector3_Array = build_array_tests_for_vector(
    OptionalVector3,
    st_floats_factory,
)

TestOptionalVector3_Broadcasting = build_broadcasting_tests_for_vector(
    OptionalVector3,
    st_floats_factory,
)


class TestVectorsRoundtrip:
    @given(st_decimal_vector3_no_snan)
    def test_decimal_to_float(self, v: DecimalVector3):
        assert v.to_float().to_decimal().to_dict() == pytest.approx(v.to_dict(), nan_ok=True)

    @given(st_vector3)
    def test_float_to_decimal(self, v: Vector3):
        assert v.to_decimal().to_float().equals(v, nan_ok=True)

    @given(st_optional_vector3)
    def test_float_to_decimal_optional(self, v: OptionalVector3):
        expected = {
            component: None if value is None else pytest.approx(value, nan_ok=True)
            for component, value in v.to_dict().items()
        }
        assert v.to_decimal().to_dict() == expected

    @given(st_optional_vector3_no_none)
    def test_float_optional_to_required(self, v: OptionalVector3):
        x, y, z = v.to_tuple()
        assert x is not None and y is not None and z is not None
        assert v.filled(0).equals(Vector3.from_tuple((x, y, z)), nan_ok=True)
