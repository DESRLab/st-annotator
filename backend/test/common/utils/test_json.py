from __future__ import annotations

from collections.abc import Callable
from typing import TypeVar

import pydantic

from hypothesis import given, note, strategies as st

from sta.common.testing import jsontypes_equal, st_jsontypes
from sta.common.utils.json import JSONType, JSONUnit, map_values, to_json

T = TypeVar('T', bound=JSONUnit)

def build_roundtrip_tests_for_map_values(
    st_unit: st.SearchStrategy[T],
    *,
    forward_fn: Callable[[T], T],
    backward_fn: Callable[[T], T],
):
    class TestMapValuesRoundtrip:
        @given(json=st_jsontypes(st_unit))
        def test_map_value_forward_backward(self, json: JSONType):
            json_forwarded = map_values(json, mapper=forward_fn)  # pyright: ignore[reportArgumentType]
            json_ = map_values(json_forwarded, mapper=backward_fn)  # pyright: ignore[reportArgumentType]

            note(f'json_forwarded={json_forwarded}')
            note(f'json_={json_}')

            assert json == json_

        @given(json=st_jsontypes(st_unit))
        def test_map_value_backward_forward(self, json: JSONType):
            json_backwarded = map_values(json, mapper=backward_fn)  # pyright: ignore[reportArgumentType]
            json_ = map_values(json_backwarded, mapper=forward_fn)  # pyright: ignore[reportArgumentType]

            note(f'json_backwarded={json_backwarded}')
            note(f'json_={json_}')

            assert json == json_

    return TestMapValuesRoundtrip


@given(st_jsontypes())
def test_jsontype_pydantic_identity(v: JSONType):
    assert jsontypes_equal(pydantic.TypeAdapter(JSONType).validate_python(v), v)


@given(st_jsontypes())
def test_to_json_identity(v: JSONType):
    assert jsontypes_equal(to_json(v), v)


TestMapValues_AddSub = build_roundtrip_tests_for_map_values(
    st.integers(),
    forward_fn=lambda x: x + 1,
    backward_fn=lambda x: x - 1,
)

TestMapValues_Neg = build_roundtrip_tests_for_map_values(
    st.integers(),
    forward_fn=lambda x: -x,
    backward_fn=lambda x: -x,
)

def test_map_values_nesting():
    json = {'a': ['b', ('c', 'd', {'e': 'f', 'g': ('h',)})], 'i': {'j': [()]}}
    expected = {'a': [None, (None, None, {'e': None, 'g': (None,)})], 'i': {'j': [()]}}

    assert map_values(json, lambda x: None) == expected

def test_map_values_no_postprocess():
    json = {'a': ['b', ('c', 'd', {'e': 'f', 'g': ('h',)})], 'i': {'j': [()]}}
    expected = {'a': [{}, ({}, {}, {'e': {}, 'g': ({},)})], 'i': {'j': [()]}}

    assert map_values(json, lambda x: {}) == expected
