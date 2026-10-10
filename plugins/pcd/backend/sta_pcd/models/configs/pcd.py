from typing import Literal, TypeAlias

from pydantic import BaseModel, Field

from ...ops.preprocessing import (
    CropBoxParams,
    CropPolygonParams,
    DenoiseParams,
    PreprocessingOperationType,
    RandomDownsampleParams,
    RemoveBackgroundParams,
)

__all__ = ["PointCloudConfig"]


class CropBoxConfig(BaseModel):
    op_name: Literal[PreprocessingOperationType.CROP_BOX]
    op_params: CropBoxParams


class CropPolygonConfig(BaseModel):
    op_name: Literal[PreprocessingOperationType.CROP_POLYGON]
    op_params: CropPolygonParams


class DenoiseConfig(BaseModel):
    op_name: Literal[PreprocessingOperationType.DENOISE]
    op_params: DenoiseParams


class RandomDownsampleConfig(BaseModel):
    op_name: Literal[PreprocessingOperationType.DOWNSAMPLE_RANDOM]
    op_params: RandomDownsampleParams


class RemoveBackgroundConfig(BaseModel):
    op_name: Literal[PreprocessingOperationType.REMOVE_BG]
    op_params: RemoveBackgroundParams


PreprocessorConfig: TypeAlias = (
    CropPolygonConfig
    | CropBoxConfig
    | DenoiseConfig
    | RandomDownsampleConfig
    | RemoveBackgroundConfig
)


class PointCloudConfig(BaseModel):
    """Represents the configuration of a point cloud."""

    @staticmethod
    def default():
        return PointCloudConfig(
            channel_headers=["x", "y", "z", "intensity"],
            dtype="float32",
        )

    channel_headers: list[str] = Field(min_length=1)
    """
    `channel_headers[i]` refers to the name of the `i`th channel.
    Example: ['x', 'y', 'z', 'intensity', 'reflectivity', 'ambient']
    """

    dtype: str
    """
    The NumPy data type of the point cloud.
    Only applicable for point clouds stored in `.bin` format.
    """

    width: int | None = None
    """"The width of the point cloud. (Currently unused)"""

    height: int | None = None
    """"The height of the point cloud. (Currently unused)"""

    preprocessors: list[PreprocessorConfig] = Field(default_factory=list)
    """A list of preprocessors to apply to the point cloud"""
