from __future__ import annotations

from collections.abc import Iterator
from enum import Enum

from sta.services.domain.label.repo.ops import (
    AnyOperation,
    OperationParamsType,
    OperationRegistry,
)

from .assign_class import *
from .create import *
from .delete import *
from .edit import *

__all__ = ['VectorOperationType', 'register_vector_ops']


class VectorOperationType(str, Enum):
    CREATE = 'vector-create'
    DELETE = 'vector-delete'
    EDIT = 'vector-edit'
    ASSIGN_CLASS = 'vector-assign-class'


def _iter_vector_op_setups_tuple() -> Iterator[tuple[str, type[AnyOperation], type[OperationParamsType]]]:
    yield VectorOperationType.ASSIGN_CLASS, AssignClass, AssignClassParams
    yield VectorOperationType.CREATE, Create, CreateParams
    yield VectorOperationType.DELETE, Delete, DeleteParams
    yield VectorOperationType.EDIT, Edit, EditParams

def register_vector_ops(registry: OperationRegistry) -> None:
    for op_name, op_type, params_type in _iter_vector_op_setups_tuple():
        registry.register(op_name, op_type, params_type)
