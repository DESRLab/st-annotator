from __future__ import annotations

from collections.abc import Iterator
from enum import Enum

from sta.services.domain.label.repo.ops import (
    AnyOperation,
    OperationParamsType,
    OperationRegistry,
)

from .assign_class import *
from .assign_is_black import *
from .create import *
from .delete import *

__all__ = ['InstanceOperationType', 'register_instance_ops']


class InstanceOperationType(str, Enum):
    CREATE = 'instance-create'
    ASSIGN_CLASS = 'instance-assign-class'
    ASSIGN_IS_BLACK = 'instance-assign-is-black'
    DELETE = 'instance-delete'


def _iter_instance_op_setups_tuple() -> Iterator[tuple[str, type[AnyOperation], type[OperationParamsType]]]:
    yield InstanceOperationType.ASSIGN_CLASS, AssignClass, AssignClassParams
    yield InstanceOperationType.ASSIGN_IS_BLACK, AssignIsBlack, AssignIsBlackParams
    yield InstanceOperationType.CREATE, Create, CreateParams
    yield InstanceOperationType.DELETE, Delete, DeleteParams

def register_instance_ops(registry: OperationRegistry) -> None:
    for op_name, op_type, params_type in _iter_instance_op_setups_tuple():
        registry.register(op_name, op_type, params_type)
