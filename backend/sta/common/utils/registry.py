from __future__ import annotations

from collections.abc import Hashable, ItemsView, KeysView, ValuesView
from typing import Generic, TypeVar

__all__ = ['Registry']


TKey = TypeVar('TKey', bound=Hashable)
TValue = TypeVar('TValue')

class Registry(Generic[TKey, TValue]):
    def __init__(self) -> None:
        super().__init__()

        self._registry: dict[TKey, TValue] = {}

    def __bool__(self) -> bool:
        return bool(self._registry)

    def __contains__(self, key: TKey) -> bool:
        return key in self._registry

    def register(self, key: TKey, value: TValue) -> None:
        registry = self._registry
        if key in registry:
            msg = f'Duplicate registration of key: {key}'
            raise ValueError(msg)

        registry[key] = value

    def deregister(self, key: TKey) -> None:
        registry = self._registry
        if key not in registry:
            msg = f'Attempted deregistration of unknown key: {key}'
            raise ValueError(msg)

        del registry[key]

    def clear(self) -> None:
        self._registry.clear()

    def get(self, key: TKey) -> TValue:
        try:
            return self._registry[key]
        except KeyError as exc:
            msg = f'Unknown key: {key}'
            raise ValueError(msg) from exc

    def keys(self) -> KeysView[TKey]:
        return self._registry.keys()

    def values(self) -> ValuesView[TValue]:
        return self._registry.values()

    def items(self) -> ItemsView[TKey, TValue]:
        return self._registry.items()
