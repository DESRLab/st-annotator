from __future__ import annotations

from collections.abc import Iterator
from enum import Enum

from sta.domain.label.repo.ops import (
    AnyOperation,
    OperationParamsType,
    OperationRegistry,
)

from .assign_class import AssignClass, AssignClassParams
from .assign_is_black import AssignIsBlack, AssignIsBlackParams
from .create import Create, CreateParams
from .delete import Delete, DeleteParams

__all__ = [
    "AssignClass",
    "AssignClassParams",
    "AssignIsBlack",
    "AssignIsBlackParams",
    "Create",
    "CreateParams",
    "Delete",
    "DeleteParams",
    "TrackOperationType",
    "register_track_ops",
]


class TrackOperationType(str, Enum):
    CREATE = "track-create"
    ASSIGN_CLASS = "track-assign-class"
    ASSIGN_IS_BLACK = "track-assign-is-black"
    DELETE = "track-delete"


def _iter_track_op_setups_tuple() -> Iterator[
    tuple[str, type[AnyOperation], type[OperationParamsType]]
]:
    yield TrackOperationType.ASSIGN_CLASS, AssignClass, AssignClassParams
    yield TrackOperationType.ASSIGN_IS_BLACK, AssignIsBlack, AssignIsBlackParams
    yield TrackOperationType.CREATE, Create, CreateParams
    yield TrackOperationType.DELETE, Delete, DeleteParams


def register_track_ops(registry: OperationRegistry) -> None:
    for op_name, op_type, params_type in _iter_track_op_setups_tuple():
        registry.register(op_name, op_type, params_type)
