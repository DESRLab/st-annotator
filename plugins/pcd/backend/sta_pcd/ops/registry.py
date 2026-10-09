from __future__ import annotations

from collections.abc import ItemsView, KeysView, ValuesView

import pydantic

from sta.common.utils.json import JSONType
from sta.common.utils.registry import Registry

from .models import *
from .operation import AnyOperation, Operation, OperationParamsType, P

__all__ = ['InvalidOpName', 'InvalidOpParams', 'OperationRegistry']


class InvalidOpName(ValueError):
    def __init__(self, op_name: str) -> None:
        super().__init__(f'Invalid operation name: {op_name}')


class InvalidOpParams(ValueError):
    def __init__(self, op_params: object, reason: str) -> None:
        super().__init__(f'Invalid operation parameters.\nReceived value:\n{op_params}\nDetails:\n{reason}')


class OperationRegistry:
    def __init__(self) -> None:
        super().__init__()

        self._registry: Registry[str, tuple[type[AnyOperation], type[OperationParamsType]]] = Registry()

    def register(self, op_name: str, op_type: type[Operation[P]], params_type: type[P]) -> None:
        self._registry.register(op_name, (op_type, params_type))

    def deregister(self, op_name: str) -> None:
        self._registry.deregister(op_name)

    def get_op_type(self, op_name: str) -> type[AnyOperation]:
        return self._registry.get(op_name)[0]

    def get_params_type(self, op_name: str) -> type[OperationParamsType]:
        return self._registry.get(op_name)[1]

    def keys(self) -> KeysView[str]:
        return self._registry.keys()

    def values(self) -> ValuesView[tuple[type[AnyOperation], type[OperationParamsType]]]:
        return self._registry.values()

    def items(self) -> ItemsView[str, tuple[type[AnyOperation], type[OperationParamsType]]]:
        return self._registry.items()

    def create_op(self, op_name: str, op_params: JSONType | OperationParamsType) -> AnyOperation:
        try:
            op_type = self.get_op_type(op_name)
        except ValueError as exc:
            raise InvalidOpName(op_name) from exc

        params_type = self.get_params_type(op_name)
        if not isinstance(op_params, params_type):
            try:
                op_params = pydantic.TypeAdapter(params_type).validate_python(op_params)
            except pydantic.ValidationError as exc:
                raise InvalidOpParams(op_params, exc.json()) from exc

        try:
            return op_type(op_name, op_params)
        except ValueError as exc:
            raise InvalidOpParams(op_params, str(exc)) from exc
