from __future__ import annotations

from collections.abc import Callable
from unittest.mock import Mock, call

import pytest
from hypothesis import given, strategies as st

from sta.common.utils.func import OptionalEquals, T, retry


@pytest.mark.parametrize(
    "kwargs, message",
    [
        ({"count": 0}, "positive integer"),
        ({"count": -1}, "positive integer"),
        ({"delay_secs": -0.1}, "non-negative number"),
    ],
)
def test_retry_invalid_arguments(kwargs, message):
    with pytest.raises(ValueError, match=message):
        retry(ValueError, **kwargs)


@pytest.mark.parametrize("on", [ValueError, (TypeError, ValueError)])
@pytest.mark.parametrize("count, failures", [(1, 0), (1, 1), (4, 0), (4, 1), (4, 3), (4, 4)])
def test_retry_attempts_and_delays(monkeypatch, on, count, failures):
    # Exercise the real decorator; only the wall-clock wait is replaced.
    sleep = Mock()
    monkeypatch.setattr("sta.common.utils.func.time.sleep", sleep)
    errors = [ValueError(f"attempt {i}") for i in range(failures)]
    operation = Mock(side_effect=[*errors, "result"])
    wrapped = retry(on, count=count, delay_secs=0.25)(operation)

    if failures == count:
        with pytest.raises(ValueError) as raised:
            wrapped("argument", flag=True)
        assert raised.value is errors[-1]
    else:
        assert wrapped("argument", flag=True) == "result"

    attempts = min(failures + 1, count)
    assert operation.call_args_list == [call("argument", flag=True)] * attempts
    assert sleep.call_args_list == [call(0.25)] * (attempts - 1)


@pytest.mark.parametrize("on", [ValueError, (ValueError,), ()])
def test_retry_propagates_unmatched_exception_without_waiting(monkeypatch, on):
    sleep = Mock()
    monkeypatch.setattr("sta.common.utils.func.time.sleep", sleep)
    error = TypeError("unmatched")
    operation = Mock(side_effect=error)

    with pytest.raises(TypeError) as raised:
        retry(on, count=4, delay_secs=0.25)(operation)()

    assert raised.value is error
    operation.assert_called_once_with()
    sleep.assert_not_called()


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


TestOptionalEquals_BuiltInEquals = build_tests_for_optional_equals(
    lambda a, b: a == b, st.integers()
)
TestOptionalEquals_Approx = build_tests_for_optional_equals(
    lambda a, b: a == pytest.approx(b), st.floats()
)
