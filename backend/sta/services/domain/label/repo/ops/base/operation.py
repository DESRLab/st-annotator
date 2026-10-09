from __future__ import annotations

import uuid
from abc import ABC, abstractmethod
from collections.abc import Mapping, Sequence
from typing import Generic, TypeAlias, TypeVar

from pydantic import BaseModel
from sqlmodel import Session

from sta.common.utils.json import JSONType

from ......models.label.repo import LabelsetCommit
from ......models.user import UserPublic

__all__ = ['AnyOperation', 'Operation', 'OperationParamsType']


OperationParamsType: TypeAlias = 'JSONType | Mapping[str, BaseModel] | Sequence[BaseModel] | BaseModel'

P = TypeVar('P', bound=OperationParamsType)
P_co = TypeVar('P_co', bound=OperationParamsType, covariant=True)

class Operation(ABC, Generic[P_co]):
    """An operation which can be applied to a labelset."""

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

    @abstractmethod
    def apply(
        self,
        current_user: UserPublic,
        session: Session,
        commit: LabelsetCommit,
    ) -> uuid.UUID | JSONType:
        """
        Applies this operation to a labelset.

        Parameters
        ----------
        commit : LabelsetCommit
            The commit in which to store the resulting label data states.
        """
        raise NotImplementedError


AnyOperation: TypeAlias = Operation[OperationParamsType]
