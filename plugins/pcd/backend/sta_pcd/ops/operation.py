from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Mapping, Sequence
from typing import Generic, TypeAlias, TypeVar

from pydantic import BaseModel

from sta.common.utils.json import JSONType, to_json

from ..filesystem import PointCloudData
from .models import OperationConfig

__all__ = ["AnyOperation", "Operation", "OperationParamsType"]


OperationParamsType: TypeAlias = "Mapping[str, BaseModel] | Sequence[BaseModel] | BaseModel"
P = TypeVar("P", bound=OperationParamsType)

P_co = TypeVar("P_co", bound=OperationParamsType, covariant=True)


class Operation(ABC, Generic[P_co]):
    def __init__(self, name: str, params: P_co) -> None:
        super().__init__()

        self._name = name
        self._params = params

    @property
    def name(self) -> str:
        return self._name

    @property
    def params(self) -> P_co:
        return self._params

    def to_config(self) -> OperationConfig:
        return OperationConfig(op_name=self.name, op_params=to_json(self.params))

    def to_json(self) -> JSONType:
        return to_json(self.to_config())

    @abstractmethod
    def apply(self, pcd: PointCloudData) -> PointCloudData:
        raise NotImplementedError


AnyOperation: TypeAlias = Operation[OperationParamsType]
