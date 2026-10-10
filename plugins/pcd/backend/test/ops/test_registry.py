"""Tests for :class:`OperationRegistry` and :class:`Operation` serialization."""

from __future__ import annotations

from pathlib import Path

from fsspec.implementations.dirfs import DirFileSystem

import pytest

from sta.common.filesystem import fs_ctx
from sta_pcd.ops import OperationConfig, OperationRegistry
from sta_pcd.ops.preprocessing import (
    CropPolygon,
    PreprocessingOperationType,
    RandomDownsample,
    RandomDownsampleParams,
    Transform,
    TransformParams,
    register_preprocessing_ops,
)
from sta_pcd.ops.registry import InvalidOpName, InvalidOpParams


def make_registry(*, allow_transform: bool) -> OperationRegistry:
    registry = OperationRegistry()
    register_preprocessing_ops(registry, allow_transform=allow_transform)
    return registry


def test_register_preprocessing_ops_includes_all_ops_when_transform_is_allowed():
    registry = make_registry(allow_transform=True)

    assert set(registry.keys()) == {op.value for op in PreprocessingOperationType}
    assert registry.get_op_type("transform") is Transform
    assert registry.get_params_type("transform") is TransformParams


def test_register_preprocessing_ops_excludes_transform_when_not_allowed():
    registry = make_registry(allow_transform=False)

    assert "transform" not in registry.keys()
    assert set(registry.keys()) == {
        op.value
        for op in PreprocessingOperationType
        if op is not PreprocessingOperationType.TRANSFORM
    }


def test_create_op_accepts_a_valid_mapping_of_params():
    registry = make_registry(allow_transform=False)

    op = registry.create_op("downsample-random", {"proportion": 0.5})

    assert isinstance(op, RandomDownsample)
    assert isinstance(op.params, RandomDownsampleParams)
    assert op.params.proportion == 0.5


def test_create_op_accepts_an_already_validated_params_model():
    registry = make_registry(allow_transform=False)
    params = RandomDownsampleParams(proportion=0.25)

    op = registry.create_op("downsample-random", params)

    assert op.params is params


def test_create_op_rejects_an_unknown_op_name():
    registry = make_registry(allow_transform=False)

    with pytest.raises(InvalidOpName):
        registry.create_op("not-a-real-op", {})


def test_create_op_rejects_invalid_params():
    registry = make_registry(allow_transform=False)

    with pytest.raises(InvalidOpParams):
        registry.create_op("downsample-random", {"proportion": "not-a-number"})


def test_deregister_removes_an_op():
    registry = make_registry(allow_transform=False)

    registry.deregister("downsample-random")

    assert "downsample-random" not in registry.keys()
    with pytest.raises(InvalidOpName):
        registry.create_op("downsample-random", {"proportion": 0.5})


def test_registry_views():
    registry = make_registry(allow_transform=False)

    assert len(list(registry.keys())) == 5
    assert len(list(registry.values())) == 5
    assert dict(registry.items())["downsample-random"][0] is RandomDownsample


def test_operation_serializes_to_operation_config_and_json():
    registry = make_registry(allow_transform=False)
    op = registry.create_op("downsample-random", {"proportion": 0.5})

    config = op.to_config()

    assert isinstance(config, OperationConfig)
    assert config == OperationConfig(op_name="downsample-random", op_params={"proportion": 0.5})
    assert op.to_json() == {"op_name": "downsample-random", "op_params": {"proportion": 0.5}}


def test_operation_config_equality_ignores_key_order():
    a = OperationConfig(op_name="denoise", op_params={"nb_neighbours": 8, "std_ratio": 1.0})
    b = OperationConfig(op_name="denoise", op_params={"std_ratio": 1.0, "nb_neighbours": 8})
    c = OperationConfig(op_name="denoise", op_params={"nb_neighbours": 9, "std_ratio": 1.0})

    assert a == b
    assert a != c
    assert a != "not-an-operation-config"


def test_create_op_wraps_constructor_value_errors(tmp_path: Path):
    registry = make_registry(allow_transform=False)

    # CropPolygon validates that its polygon file exists during construction.
    with fs_ctx(DirFileSystem(str(tmp_path))):
        with pytest.raises(InvalidOpParams):
            registry.create_op(
                PreprocessingOperationType.CROP_POLYGON.value,
                {"keep": True, "uri": "does-not-exist.csv"},
            )

    # Sanity check: the same call succeeds when the file does exist.
    with fs_ctx(DirFileSystem(str(tmp_path))):
        (tmp_path / "exists.csv").write_text("0,0,0,1,0,0,1,1,0,0,1,0")
        op = registry.create_op(
            PreprocessingOperationType.CROP_POLYGON.value,
            {"keep": True, "uri": "exists.csv"},
        )
        assert isinstance(op, CropPolygon)
