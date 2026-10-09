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

__all__ = ['TrackOperationType', 'register_track_ops']


class TrackOperationType(str, Enum):
    CREATE = 'track-create'
    ASSIGN_CLASS = 'track-assign-class'
    ASSIGN_IS_BLACK = 'track-assign-is-black'
    DELETE = 'track-delete'


def _iter_track_op_setups_tuple() -> Iterator[tuple[str, type[AnyOperation], type[OperationParamsType]]]:
    yield TrackOperationType.ASSIGN_CLASS, AssignClass, AssignClassParams
    yield TrackOperationType.ASSIGN_IS_BLACK, AssignIsBlack, AssignIsBlackParams
    yield TrackOperationType.CREATE, Create, CreateParams
    yield TrackOperationType.DELETE, Delete, DeleteParams

def register_track_ops(registry: OperationRegistry) -> None:
    for op_name, op_type, params_type in _iter_track_op_setups_tuple():
        registry.register(op_name, op_type, params_type)
