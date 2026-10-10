from __future__ import annotations

import uuid
from collections.abc import Sequence

import pytest
from hypothesis import given, strategies as st

from sta.common.testing import st_with_idx, st_with_idxs
from sta.common.utils.collections import SizedIterator, take


@given(st_with_idxs(st.lists(st.uuids())))
def test_take_len(lst_with_idxs: tuple[Sequence[uuid.UUID], Sequence[int]]):
    lst, idxs = lst_with_idxs

    assert len(take(lst, idxs)) == len(idxs)


@given(st_with_idx(st.lists(st.uuids(), min_size=1)))
def test_take_item(lst_with_idx: tuple[Sequence[uuid.UUID], int]):
    lst, idx = lst_with_idx

    assert take(lst, [idx])[0] == lst[idx]


@given(st_with_idxs(st.lists(st.uuids(), min_size=1), idxs_min_size=1))
def test_take_ordering(lst_with_idxs: tuple[Sequence[uuid.UUID], Sequence[int]]):
    lst, idxs = lst_with_idxs

    assert take(lst, idxs) == take(lst, idxs[::-1])[::-1]


@given(st.lists(st.uuids()))
def test_sized_iterator_wrap_valid(lst: list[uuid.UUID]):
    for i, v in enumerate(SizedIterator(iter(lst), len(lst))):
        assert v is lst[i]

    assert len(lst) == len(SizedIterator(iter(lst), len(lst)))


@given(st.lists(st.uuids()), st.integers(min_value=1))
def test_sized_iterator_wrap_invalid_length_negative(lst: list[uuid.UUID], offset: int):
    with pytest.raises(ValueError, match="The length must be non-negative"):
        SizedIterator(iter(lst), -offset)


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
