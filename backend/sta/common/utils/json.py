from __future__ import annotations

from collections.abc import Callable
from dataclasses import asdict, is_dataclass
from typing_extensions import TypeAliasType

import pydantic
from pydantic import TypeAdapter

__all__ = ['JSONType', 'JSONUnit', 'map_values', 'to_json']

JSONUnit = TypeAliasType("JSONUnit", str | int | float | bool | None)
"""
Represents a smallest unit in JSON data.
"""

JSONType = TypeAliasType(
    "JSONType",
    "dict[str, JSONType] | list[JSONType] | tuple[JSONType, ...] | JSONUnit",
)
"""
Represents a type that can be passed to :func:`json.dumps`
while being compatible with :class:`pydantic.TypeAdapter`.
"""

def to_json(obj: object) -> JSONType:
    """Attempts to convert the given object to a JSON serializable type."""
    if isinstance(obj, pydantic.BaseModel):
        return obj.model_dump(mode='json')
    if is_dataclass(obj) and not isinstance(obj, type):
        return to_json(asdict(obj))

    if isinstance(obj, dict):
        return {k: to_json(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [to_json(v) for v in obj]

    try:
        return TypeAdapter(JSONType).validate_python(obj)
    except pydantic.ValidationError as e:
        msg = f'Object is not JSON serializable.\nGiven:{obj}'
        raise ValueError(msg) from e

def map_values(json: JSONType, mapper: Callable[[JSONUnit], JSONType]) -> JSONType:
    """
    Applies a mapping function to each unit in the given JSON data.

    Notes
    -----
    If the mapping function returns a dictionary, list, or tuple type, the mapping
    function will not be further applied to the returned value.
    """
    if isinstance(json, dict):
        return {k: map_values(v, mapper) for k, v in json.items()}
    if isinstance(json, list):
        return [map_values(e, mapper) for e in json]
    if isinstance(json, tuple):
        return tuple(map_values(e, mapper) for e in json)

    return mapper(json)
