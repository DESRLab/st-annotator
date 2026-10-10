from __future__ import annotations

from collections.abc import Iterator
from enum import Enum

from sta.domain.label.repo.ops import (
    AnyOperation,
    OperationParamsType,
    OperationRegistry,
)

from .assign_class import AssignClass, AssignClassParams
from .assign_distinctive_lv import AssignDistinctiveLv, AssignDistinctiveLvParams
from .assign_entity import AssignEntity, AssignEntityParams
from .assign_occlusion_lv import AssignOcclusionLv, AssignOcclusionLvParams
from .assign_type import AssignType, AssignTypeParams
from .create import Create, CreateParams
from .delete import Delete, DeleteParams
from .transform import Transform, TransformParams

__all__ = [
    "AssignClass",
    "AssignClassParams",
    "AssignDistinctiveLv",
    "AssignDistinctiveLvParams",
    "AssignEntity",
    "AssignEntityParams",
    "AssignOcclusionLv",
    "AssignOcclusionLvParams",
    "AssignType",
    "AssignTypeParams",
    "BoxOperationType",
    "Create",
    "CreateParams",
    "Delete",
    "DeleteParams",
    "Transform",
    "TransformParams",
    "register_box_ops",
]


class BoxOperationType(str, Enum):
    CREATE = "box-create"
    TRANSFORM = "box-transform"
    DELETE = "box-delete"
    ASSIGN_CLASS = "box-assign-class"
    ASSIGN_ENTITY = "box-assign-entity"
    ASSIGN_TYPE = "box-assign-type"
    ASSIGN_DISTINCTIVE_LV = "box-assign-distinctive-level"
    ASSIGN_OCCLUSION_LV = "box-assign-occlusion-level"


def _iter_box_op_setups_tuple() -> Iterator[
    tuple[str, type[AnyOperation], type[OperationParamsType]]
]:
    yield BoxOperationType.ASSIGN_CLASS, AssignClass, AssignClassParams
    yield BoxOperationType.ASSIGN_DISTINCTIVE_LV, AssignDistinctiveLv, AssignDistinctiveLvParams
    yield BoxOperationType.ASSIGN_ENTITY, AssignEntity, AssignEntityParams
    yield BoxOperationType.ASSIGN_OCCLUSION_LV, AssignOcclusionLv, AssignOcclusionLvParams
    yield BoxOperationType.ASSIGN_TYPE, AssignType, AssignTypeParams
    yield BoxOperationType.CREATE, Create, CreateParams
    yield BoxOperationType.DELETE, Delete, DeleteParams
    yield BoxOperationType.TRANSFORM, Transform, TransformParams


def register_box_ops(registry: OperationRegistry) -> None:
    for op_name, op_type, params_type in _iter_box_op_setups_tuple():
        registry.register(op_name, op_type, params_type)
