from __future__ import annotations

from enum import Enum

from ..registry import OperationRegistry
from .checkpoint import *
from .import_ import *
from .init_ import *

__all__ = ['SpecialOperationType', 'register_special_ops']


class SpecialOperationType(str, Enum):
    INIT = 'labelset-init'
    IMPORT = 'labelset-import'
    CHECKPOINT = 'labelset-checkpoint'


def register_special_ops(registry: OperationRegistry) -> None:
    registry.register(SpecialOperationType.INIT, InitLabelset, InitLabelsetParams)
    registry.register(SpecialOperationType.IMPORT, ImportLabelData, ImportLabelDataParams)
    registry.register(SpecialOperationType.CHECKPOINT, CheckpointLabelset, CheckpointLabelsetParams)
