"""Unit tests for the operation registry's views and error paths."""

import uuid

from pydantic import BaseModel
from sqlmodel import Session

import pytest

from sta.common.utils.json import JSONType
from sta.domain.label.repo.ops import (
    InvalidOpName,
    InvalidOpParams,
    Operation,
    OperationRegistry,
)
from sta.models.label.repo import LabelsetCommit, LabelsetCommitInstruction
from sta.models.user import UserPublic

_OP_NAME = "op-registry-test-op"
_RAISING_OP_NAME = "op-registry-test-raising-op"


class RegistryTestParams(BaseModel):
    id: uuid.UUID


class RegistryTestOperation(Operation[RegistryTestParams]):
    def apply(
        self,
        current_user: UserPublic,
        session: Session,
        commit: LabelsetCommit,
    ) -> JSONType:
        pass


class RaisingOperation(Operation[RegistryTestParams]):
    def __init__(self, name: str, params: RegistryTestParams) -> None:
        super().__init__(name, params)

        msg = "constructor failed on purpose"
        raise ValueError(msg)

    def apply(
        self,
        current_user: UserPublic,
        session: Session,
        commit: LabelsetCommit,
    ) -> JSONType:
        pass


def _make_registry() -> OperationRegistry:
    registry = OperationRegistry()
    registry.register(_OP_NAME, RegistryTestOperation, RegistryTestParams)

    return registry


def test_create_op_unknown_name_raises_invalid_op_name():
    registry = _make_registry()

    with pytest.raises(InvalidOpName, match="does-not-exist"):
        registry.create_op("does-not-exist", {})


def test_create_op_invalid_params_raises_invalid_op_params():
    registry = _make_registry()

    with pytest.raises(InvalidOpParams):
        registry.create_op(_OP_NAME, {"id": "not-a-uuid"})


def test_create_op_raising_constructor_raises_invalid_op_params():
    registry = OperationRegistry()
    registry.register(_RAISING_OP_NAME, RaisingOperation, RegistryTestParams)

    with pytest.raises(InvalidOpParams, match="constructor failed on purpose"):
        registry.create_op(_RAISING_OP_NAME, {"id": str(uuid.uuid4())})


def test_registry_views():
    registry = _make_registry()

    assert set(registry.keys()) == {_OP_NAME}
    assert list(registry.values()) == [(RegistryTestOperation, RegistryTestParams)]
    assert dict(registry.items()) == {_OP_NAME: (RegistryTestOperation, RegistryTestParams)}


def test_create_op_returns_validated_instance():
    registry = _make_registry()
    op_id = uuid.uuid4()

    op = registry.create_op(_OP_NAME, {"id": str(op_id)})

    assert isinstance(op, RegistryTestOperation)
    assert op.name == _OP_NAME
    assert op.params == RegistryTestParams(id=op_id)


def test_create_instruction_type_empty_registry_falls_back():
    registry = OperationRegistry()

    assert registry.create_instruction_type() is LabelsetCommitInstruction
