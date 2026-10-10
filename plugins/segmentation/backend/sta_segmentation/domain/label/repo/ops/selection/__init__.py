from __future__ import annotations

from collections.abc import Iterator
from enum import Enum

from sta.domain.label.repo.ops import (
    AnyOperation,
    OperationParamsType,
    OperationRegistry,
)

from .assign_class import *
from .assign_distinctive_lv import *
from .assign_entity import *
from .assign_occlusion_lv import *
from .create import *
from .delete import *
from .edit import *

__all__ = ["SelectionOperationType", "register_selection_ops"]


class SelectionOperationType(str, Enum):
    CREATE = "selection-create"
    EDIT = "selection-edit"
    DELETE = "selection-delete"
    ASSIGN_CLASS = "selection-assign-class"
    ASSIGN_ENTITY = "selection-assign-entity"
    ASSIGN_DISTINCTIVE_LV = "selection-assign-distinctive-level"
    ASSIGN_OCCLUSION_LV = "selection-assign-occlusion-level"


def _iter_selection_op_setups_tuple() -> Iterator[
    tuple[str, type[AnyOperation], type[OperationParamsType]]
]:
    yield SelectionOperationType.ASSIGN_CLASS, AssignClass, AssignClassParams
    yield (
        SelectionOperationType.ASSIGN_DISTINCTIVE_LV,
        AssignDistinctiveLv,
        AssignDistinctiveLvParams,
    )
    yield SelectionOperationType.ASSIGN_ENTITY, AssignEntity, AssignEntityParams
    yield SelectionOperationType.ASSIGN_OCCLUSION_LV, AssignOcclusionLv, AssignOcclusionLvParams
    yield SelectionOperationType.CREATE, Create, CreateParams
    yield SelectionOperationType.DELETE, Delete, DeleteParams
    yield SelectionOperationType.EDIT, Edit, EditParams


def register_selection_ops(registry: OperationRegistry) -> None:
    for op_name, op_type, params_type in _iter_selection_op_setups_tuple():
        registry.register(op_name, op_type, params_type)
