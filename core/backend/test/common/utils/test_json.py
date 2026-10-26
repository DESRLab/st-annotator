from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

import pydantic

import pytest
from hypothesis import given

from sta.common.testing import jsontypes_equal, st_jsontypes
from sta.common.utils.json import JSONType, map_values, to_json


@given(st_jsontypes())
def test_to_json_identity(v: JSONType):
    assert jsontypes_equal(to_json(v), v)


def test_map_values_nesting():
    json = {"a": ["b", ("c", "d", {"e": "f", "g": ("h",)})], "i": {"j": [()]}}
    expected = {"a": [None, (None, None, {"e": None, "g": (None,)})], "i": {"j": [()]}}

    assert map_values(json, lambda x: None) == expected


def test_map_values_no_postprocess():
    json = {"a": ["b", ("c", "d", {"e": "f", "g": ("h",)})], "i": {"j": [()]}}
    expected = {"a": [{}, ({}, {}, {"e": {}, "g": ({},)})], "i": {"j": [()]}}

    assert map_values(json, lambda x: {}) == expected


@pytest.mark.parametrize("value", [None, False, 0, 1.5, "text"])
def test_map_values_maps_scalar_leaves_once(value):
    seen = []

    def mapper(leaf):
        seen.append(leaf)
        return [leaf]

    assert map_values(value, mapper) == [value]
    assert seen == [value]


def test_map_values_transforms_each_leaf_preserving_keys_and_containers():
    value = {"key": [1, (2, {"nested": 3})], "empty": {}}
    assert map_values(value, lambda leaf: leaf + 10) == {
        "key": [11, (12, {"nested": 13})],
        "empty": {},
    }


def test_to_json_converts_models_and_dataclasses_inside_containers():
    class Event(pydantic.BaseModel):
        at: datetime

    @dataclass
    class Envelope:
        event: Event

    event = Event(at=datetime(2026, 1, 1, tzinfo=timezone.utc))
    assert to_json({"events": [Envelope(event)]}) == {
        "events": [{"event": {"at": "2026-01-01T00:00:00Z"}}]
    }


def test_to_json_rejects_non_serializable_objects():
    with pytest.raises(ValueError, match="Object is not JSON serializable"):
        to_json(object())
