from __future__ import annotations

import uuid

import pytest
from hypothesis import given, strategies as st

from sta.common.utils.collections import SizedIterator, take


@pytest.mark.parametrize(
    "values, indices, expected",
    [
        ([], [], []),
        (["a", "b", "c"], [], []),
        (["a", "b", "c"], [1], ["b"]),
        (["a", "b", "c"], [2, 0, 1], ["c", "a", "b"]),
        (["a", "b", "c"], [1, 0, 1], ["b", "a", "b"]),
    ],
)
def test_take_preserves_requested_values_order_and_duplicates(values, indices, expected):
    assert take(values, indices) == expected


@given(st.lists(st.uuids()))
def test_sized_iterator_wrap_valid(lst: list[uuid.UUID]):
    for i, v in enumerate(SizedIterator(iter(lst), len(lst))):
        assert v is lst[i]

    assert len(lst) == len(SizedIterator(iter(lst), len(lst)))


@pytest.mark.parametrize("length", [-1, -100])
def test_sized_iterator_wrap_invalid_length_negative(length):
    with pytest.raises(ValueError, match="The length must be non-negative"):
        SizedIterator(iter([]), length)


@given(st.lists(st.uuids(), min_size=1), st.data())
def test_sized_iterator_wrap_invalid_length_actual_gt_given(
    lst: list[uuid.UUID], data: st.DataObject
):
    offset = data.draw(st.integers(1, len(lst)), label="offset")

    with pytest.raises(
        RuntimeError, match="The actual length of the iterator is greater than the given length"
    ):
        for i, v in enumerate(SizedIterator(iter(lst), len(lst) - offset)):
            assert v is lst[i]


@given(st.lists(st.uuids()), st.integers(min_value=1))
def test_sized_iterator_wrap_invalid_length_actual_lt_given(lst: list[uuid.UUID], offset: int):
    with pytest.raises(
        RuntimeError, match="The actual length of the iterator is less than the given length"
    ):
        for i, v in enumerate(SizedIterator(iter(lst), len(lst) + offset)):
            assert v is lst[i]
