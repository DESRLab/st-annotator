from __future__ import annotations

from collections.abc import Callable, Sequence

import pytest
from hypothesis import assume, given, note, strategies as st

from sta.common.utils.func import OptionalEquals, T, retry


def st_any() -> st.SearchStrategy[object]:
    return st.none() | st.booleans() | st.binary() | st.integers() | st.floats() | st.functions()

def st_count(
    *,
    valid_value: bool = True,
    min_valid: int = 1,
    max_valid: int = 8,
) -> st.SearchStrategy[int]:
    if valid_value:
        return st.integers(min_value=min_valid, max_value=max_valid)

    return st.integers(max_value=0)

def st_values_with_delay(
    st_value: st.SearchStrategy[T],
    *,
    min_size: int = 1,
    max_size: int = 16,
    delay_multiple: float = 1e-5,
) -> st.SearchStrategy[Sequence[tuple[T, float]]]:
    @st.composite
    def build_st(draw: st.DrawFn) -> Sequence[tuple[T, float]]:
        values = draw(st.lists(st_value, min_size=min_size, max_size=max_size, unique=True), label='values')
        random = draw(st.randoms(), label='random')

        idxs = list(range(len(values)))
        random.shuffle(idxs)
        note(f'idxs={idxs}')

        return [(value, idx * delay_multiple) for value, idx in zip(values, idxs, strict=True)]

    return build_st()

def st_delay_secs(*, valid: bool = True, max_valid: float = 1e-5) -> st.SearchStrategy[float]:
    if valid:
        return st.floats(min_value=0, max_value=max_valid, allow_nan=False)

    return st.floats(max_value=0, exclude_max=True)

def st_exc_or_tuple(*, min_size: int = 0) -> st.SearchStrategy[Exception | tuple[Exception, ...]]:
    return st.one_of(
        st.from_type(Exception),
        st.lists(st.from_type(Exception), min_size=min_size).map(lambda x: tuple(x)),
    )


@given(st_exc_or_tuple(), st_count(valid_value=False), st_delay_secs())
def test_retry_invalid_count_value(
    exc_or_tuple: Exception | tuple[Exception, ...],
    count: int,
    delay_secs: float,
):
    if isinstance(exc_or_tuple, Exception):
        on = type(exc_or_tuple)
    else:
        on = tuple(type(exc) for exc in exc_or_tuple)

    with pytest.raises(ValueError):
        @retry(on, count=count, delay_secs=delay_secs)
        def identity(x: T) -> T:
            return x

@given(st_exc_or_tuple(), st_count(), st_delay_secs(valid=False))
def test_retry_invalid_delay_value(
    exc_or_tuple: Exception | tuple[Exception, ...],
    count: int,
    delay_secs: float,
):
    if isinstance(exc_or_tuple, Exception):
        on = type(exc_or_tuple)
    else:
        on = tuple(type(exc) for exc in exc_or_tuple)

    with pytest.raises(ValueError):
        @retry(on, count=count, delay_secs=delay_secs)
        def identity(x: T) -> T:
            return x

@given(st_exc_or_tuple(), st_count(), st_delay_secs())
def test_retry_success_no_retry(
    exc_or_tuple: Exception | tuple[Exception, ...],
    count: int,
    delay_secs: float,
):
    if isinstance(exc_or_tuple, Exception):
        on = type(exc_or_tuple)
    else:
        on = tuple(type(exc) for exc in exc_or_tuple)

    attempt_count = 0

    @retry(on, count=count, delay_secs=delay_secs)
    def identity(x: T) -> T:
        nonlocal attempt_count
        attempt_count += 1

        return x

    assert identity(1) == 1, 'Incorrect value'
    assert attempt_count == 1, 'Incorrect number of attempts'

@given(st_exc_or_tuple(min_size=1), st_count(min_valid=2), st_delay_secs())
def test_retry_success_on_retry(
    exc_or_tuple: Exception | tuple[Exception, ...],
    count: int,
    delay_secs: float,
):
    if isinstance(exc_or_tuple, Exception):
        on = type(exc_or_tuple)
        exc = exc_or_tuple
    else:
        on = tuple(type(exc) for exc in exc_or_tuple)
        exc = exc_or_tuple[0]

    attempt_count = 0
    is_fail = True

    @retry(on, count=count, delay_secs=delay_secs)
    def identity(x: T) -> T:
        nonlocal attempt_count
        attempt_count += 1

        nonlocal is_fail

        if is_fail:
            is_fail = False
            raise exc

        return x

    assert identity(1) == 1, 'Incorrect value'
    assert attempt_count == 2, 'Incorrect number of attempts'

@given(st_exc_or_tuple(min_size=1), st_count(), st_delay_secs())
def test_retry_fail_exc_type_mismatch(
    exc_or_tuple: Exception | tuple[Exception, ...],
    count: int,
    delay_secs: float,
):
    if isinstance(exc_or_tuple, Exception):
        on = ()
        exc = exc_or_tuple
    else:
        on = tuple(type(exc) for exc in exc_or_tuple[1:])
        exc = exc_or_tuple[0]

    assume(type(exc) not in on)

    attempt_count = 0

    @retry(on, count=count, delay_secs=delay_secs)
    def identity(x: T) -> T:
        nonlocal attempt_count
        attempt_count += 1

        raise exc

    with pytest.raises(type(exc)):
        identity(1)

    assert attempt_count == 1, 'Incorrect number of attempts'

@given(st_exc_or_tuple(min_size=1), st_count(), st_delay_secs())
def test_retry_fail_out_of_attempts(
    exc_or_tuple: Exception | tuple[Exception, ...],
    count: int,
    delay_secs: float,
):
    if isinstance(exc_or_tuple, Exception):
        on = type(exc_or_tuple)
        exc = exc_or_tuple
    else:
        on = tuple(type(exc) for exc in exc_or_tuple)
        exc = exc_or_tuple[0]

    attempt_count = 0

    @retry(on, count=count, delay_secs=delay_secs)
    def identity(x: T) -> T:
        nonlocal attempt_count
        attempt_count += 1

        raise exc

    with pytest.raises(type(exc)):
        identity(1)

    assert attempt_count == count, 'Incorrect number of attempts'


def build_tests_for_optional_equals(
    fn: Callable[[T, T], bool],
    st_value: st.SearchStrategy[T],
):
    optional_fn = OptionalEquals(fn)

    class TestOptionalEquals:
        @given(a=st_value, b=st_value)
        def test_base(self, a: T, b: T):
            assert optional_fn(a, b) == fn(a, b)

        @given(a=st_value)
        def test_one_none(self, a: T):
            assert optional_fn(a, None) == (a is None)
            assert optional_fn(None, a) == (a is None)

        def test_both_none(self):
            assert optional_fn(None, None)

    return TestOptionalEquals

TestOptionalEquals_BuiltInEquals = build_tests_for_optional_equals(lambda a, b: a == b, st.integers())
TestOptionalEquals_Approx = build_tests_for_optional_equals(lambda a, b: a == pytest.approx(b), st.floats())
