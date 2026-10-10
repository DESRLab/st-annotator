import uuid
from collections.abc import Collection
from typing import Any

from pydantic import BaseModel

from sta.common.utils.json import JSONType

__all__ = ["Placeholders", "match_placeholder_key"]


def match_placeholder_key(value: object, keys: Collection[str]) -> str | None:
    """
    Returns the placeholder key referenced by ``value``, or ``None`` if the
    value is not a reference to one of ``keys``.

    A placeholder key is declared by the client as a braced UUID string (see
    ``Placeholder.wireKey`` in the frontend). When ``op_params`` is validated
    against the concrete params model of an operation, pydantic coerces any
    ``uuid.UUID``-typed field, and ``uuid.UUID()`` itself accepts -- and
    discards -- the surrounding braces. So the declared key never survives
    request-body validation verbatim: the value arrives as a ``uuid.UUID``
    whose ``str()`` is the key without braces. Matching therefore has to
    reconstruct the canonical braced form before looking it up, otherwise the
    reference goes unnoticed and the placeholder resolves to itself.

    Only ``str`` and :class:`uuid.UUID` values can be references. Placeholders
    carry operation results, and the operations that produce a referencable id
    return a ``uuid.UUID``, so no other value type can name a placeholder.
    """
    if isinstance(value, str):
        return value if value in keys else None

    if isinstance(value, uuid.UUID):
        braced_key = f"{{{value}}}"
        return braced_key if braced_key in keys else None

    return None


class _Placeholder:
    class Empty:
        pass

    class NotResolved(RuntimeError):
        def __init__(self, key: str) -> None:
            super().__init__(f"Unresolved value for placeholder with key: {key}")

    class AlreadyResolved(RuntimeError):
        def __init__(self, key: str, existing_value: object, new_value: object) -> None:
            super().__init__(
                f"This placeholder has already been resolved. Key: {key}; Existing resolved value: {existing_value}; New resolved value: {new_value}"
            )

    def __init__(self, key: str) -> None:
        super().__init__()

        self.key = key
        self._value: JSONType | uuid.UUID | _Placeholder.Empty = self.Empty()

    @property
    def is_resolved(self) -> bool:
        return not isinstance(self._value, self.Empty)

    def get(self) -> JSONType | uuid.UUID:
        if isinstance(self._value, self.Empty):
            raise self.NotResolved(self.key)

        return self._value

    def put(self, value: JSONType | uuid.UUID):
        if not isinstance(self._value, self.Empty):
            raise self.AlreadyResolved(self.key, self._value, value)

        self._value = value

    def __repr__(self) -> str:
        return f"{type(self).__name__}[is_resolved={self.is_resolved}]"


class Placeholders:
    """
    Helper class to keep track of the output values of previous operations
    and pass them to the input of subsequent operations for batch processing.
    """

    def __init__(self, keys: Collection[str]) -> None:
        super().__init__()

        self._placeholders = {k: _Placeholder(k) for k in keys}

    @property
    def keys(self) -> Collection[str]:
        return self._placeholders.keys()

    @property
    def resolved_keys(self) -> Collection[str]:
        return {k for k, v in self._placeholders.items() if v.is_resolved}

    @property
    def unresolved_keys(self) -> Collection[str]:
        return {k for k, v in self._placeholders.items() if not v.is_resolved}

    def _get_placeholder(self, key: str) -> _Placeholder:
        try:
            return self._placeholders[key]
        except KeyError as exc:
            msg = f"There is no placeholder with the following key: {key}"
            raise KeyError(msg) from exc

    def _get_resolved_params_value(self, value: object) -> Any:
        key = match_placeholder_key(value, self.keys)
        return self._get_placeholder(key).get() if key is not None else value

    def _get_resolved_params(self, value: Any) -> Any:
        if isinstance(value, BaseModel):
            updates = {
                name: resolved
                for name in type(value).model_fields
                if (resolved := self._get_resolved_params(getattr(value, name)))
                is not getattr(value, name)
            }
            return value if not updates else value.model_copy(update=updates)

        if isinstance(value, dict):
            resolved_items = {key: self._get_resolved_params(item) for key, item in value.items()}
            return (
                value
                if all(resolved_items[key] is item for key, item in value.items())
                else resolved_items
            )

        if isinstance(value, list):
            resolved_items = [self._get_resolved_params(item) for item in value]
            return (
                value
                if all(
                    resolved is item for resolved, item in zip(resolved_items, value, strict=True)
                )
                else resolved_items
            )

        if isinstance(value, tuple):
            resolved_items = tuple(self._get_resolved_params(item) for item in value)
            return (
                value
                if all(
                    resolved is item for resolved, item in zip(resolved_items, value, strict=True)
                )
                else resolved_items
            )

        return self._get_resolved_params_value(value)

    def get_resolved_params(self, params: Any) -> Any:
        try:
            return self._get_resolved_params(params)
        except _Placeholder.NotResolved as exc:
            msg = f"`params` is not fully resolved. Received: {params}. Error: {exc!s}"
            raise ValueError(msg) from exc

    def resolve_item(self, key: str, value: JSONType | uuid.UUID) -> None:
        self._get_placeholder(key).put(value)

    def __repr__(self) -> str:
        return f"{type(self).__name__}[resolved_keys={self.resolved_keys}, unresolved_keys={self.unresolved_keys}]"
