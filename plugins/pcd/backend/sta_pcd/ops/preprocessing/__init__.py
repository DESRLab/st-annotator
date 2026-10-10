from __future__ import annotations

from collections.abc import Iterable
from enum import Enum

from ..operation import AnyOperation, OperationParamsType
from ..registry import OperationRegistry
from .crop import *
from .denoise import *
from .downsample import *
from .remove_bg import *
from .transform import *

__all__ = ["PreprocessingOperationType", "register_preprocessing_ops"]


class PreprocessingOperationType(str, Enum):
    CROP_POLYGON = "crop-polygon"
    CROP_BOX = "crop-box"
    DENOISE = "denoise"
    DOWNSAMPLE_RANDOM = "downsample-random"
    REMOVE_BG = "remove-bg"
    TRANSFORM = "transform"


def _iter_preprocessing_op_configs_tuple(
    *, allow_transform: bool
) -> Iterable[tuple[str, type[AnyOperation], type[OperationParamsType]]]:
    yield PreprocessingOperationType.CROP_POLYGON, CropPolygon, CropPolygonParams
    yield PreprocessingOperationType.CROP_BOX, CropBox, CropBoxParams
    yield PreprocessingOperationType.DENOISE, Denoise, DenoiseParams
    yield PreprocessingOperationType.DOWNSAMPLE_RANDOM, RandomDownsample, RandomDownsampleParams
    yield PreprocessingOperationType.REMOVE_BG, RemoveBackground, RemoveBackgroundParams

    if allow_transform:
        yield PreprocessingOperationType.TRANSFORM, Transform, TransformParams


def register_preprocessing_ops(registry: OperationRegistry, *, allow_transform: bool) -> None:
    for op_name, op_type, params_type in _iter_preprocessing_op_configs_tuple(
        allow_transform=allow_transform
    ):
        registry.register(op_name, op_type, params_type)
