from __future__ import annotations

from collections.abc import Callable, Sequence
from dataclasses import asdict, is_dataclass
from typing import Any
from typing_extensions import TypeAliasType

import pydantic
from pydantic import TypeAdapter

from jsoncomparison import NO_DIFF, Compare, TypesNotEqual, ValueNotFound

__all__ = ["CompareJSON", "JSONType", "JSONUnit", "jsons_equal", "map_values", "to_json"]

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
        return obj.model_dump(mode="json")
    if is_dataclass(obj) and not isinstance(obj, type):
        return to_json(asdict(obj))

    if isinstance(obj, dict):
        return {k: to_json(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [to_json(v) for v in obj]

    try:
        return TypeAdapter(JSONType).validate_python(obj)
    except pydantic.ValidationError as e:
        msg = f"Object is not JSON serializable.\nGiven:{obj}"
        raise ValueError(msg) from e


def map_values(json: JSONType, mapper: Callable[[JSONUnit], Any]) -> Any:
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


class CompareJSON(Compare):
    """
    Helper class to compare between expected and actual JSON data.

    Parameters
    ----------
    config : dict
        As :attr:`Compare.config`. We also support `types.tuple.check_length`
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
        path = "types.tuple.check_length"
        return self._config.get(path) is True

    def _tuple_diff(self, e: tuple[JSONType, ...], a: tuple[JSONType, ...]) -> dict[str, Any]:
        d = {}
        if self._need_compare_length():
            d["_length"] = self._list_len_diff(e, a)
        d["_content"] = self._list_content_diff(e, a)
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


_json_comparer = CompareJSON(allow_mixed_numeric=True, allow_mixed_sequence=True)


def jsons_equal(expected: JSONType, actual: JSONType) -> bool:
    """
    Tests whether expected and actual data of the :class:`sqlalchemy.types.JSON` type
    are equivalent to each other.
    """
    return _json_comparer.check(expected, actual) == NO_DIFF
