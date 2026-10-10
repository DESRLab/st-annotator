from __future__ import annotations

import uuid
from abc import abstractmethod
from typing import Any, Generic, TypeVar

from sqlmodel import Session

from sta.models.label.repo import LabelsetCommit
from sta.models.user import UserPublic

from ......models.label.data import LabelDataSQLModel
from ....data.base import LabelDataDomain
from .operation import Operation, P

__all__ = ["CreateBase"]

_C = TypeVar("_C", bound=LabelDataSQLModel)


class CreateBase(Operation[P], Generic[P, _C]):
    @classmethod
    @abstractmethod
    def get_domain(cls) -> LabelDataDomain[Any, _C, Any, Any, Any]:
        raise NotImplementedError

    @classmethod
    @abstractmethod
    def get_data(cls, commit: LabelsetCommit, params: P) -> _C:
        raise NotImplementedError

    def apply(
        self,
        current_user: UserPublic,
        session: Session,
        commit: LabelsetCommit,
    ) -> uuid.UUID:
        new_data = self.get_domain().create_data(
            current_user=current_user,
            session=session,
            data=self.get_data(commit, self.params),
        )

        return new_data.id
