import uuid
from collections.abc import Collection

from sta.common.utils.json import JSONType, JSONUnit, map_values

__all__ = ["Placeholders"]


class _Placeholder:
    class Empty:
        pass

    class NotResolved(RuntimeError):
        def __init__(self, key: str) -> None:
            super().__init__(f'Unresolved value for placeholder with key: {key}')

    class AlreadyResolved(RuntimeError):
        def __init__(self, key: str, existing_value: JSONType, new_value: JSONType) -> None:
            super().__init__(f'This placeholder has already been resolved. Key: {key}; Existing resolved value: {existing_value}; New resolved value: {new_value}')

    def __init__(self, key: str) -> None:
        super().__init__()

        self.key = key
        self._value: JSONType | uuid.UUID | _Placeholder.Empty = self.Empty()

    @property
    def is_resolved(self) -> bool:
        return not isinstance(self._value, self.Empty)

    def get(self) -> JSONType:
        if isinstance(self._value, self.Empty):
            raise self.NotResolved(self.key)

        return self._value

    def put(self, value: JSONType | uuid.UUID):
        if not isinstance(self._value, self.Empty):
            raise self.AlreadyResolved(self.key, self._value, value)

        self._value = value

    def __repr__(self) -> str:
        return f'{type(self).__name__}[is_resolved={self.is_resolved}]'


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
            msg = f'There is no placeholder with the following key: {key}'
            raise KeyError(msg) from exc

    def _get_resolved_params_value(self, value: JSONUnit) -> JSONType:
        if isinstance(value, str) and value in self.keys:
            resolved_value = self._get_placeholder(value).get()
        else:
            resolved_value = value

        return resolved_value

    def get_resolved_params(self, params: JSONType) -> JSONType:
        try:
            return map_values(params, self._get_resolved_params_value)
        except _Placeholder.NotResolved as exc:
            msg = f'`params` is not fully resolved. Received: {params}. Error: {exc!s}'
            raise ValueError(msg) from exc

    def resolve_item(self, key: str, value: JSONType | uuid.UUID) -> None:
        self._get_placeholder(key).put(value)

    def __repr__(self) -> str:
        return f'{type(self).__name__}[resolved_keys={self.resolved_keys}, unresolved_keys={self.unresolved_keys}]'
