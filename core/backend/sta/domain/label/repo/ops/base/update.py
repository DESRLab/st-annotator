from __future__ import annotations

import uuid
from abc import abstractmethod
from typing import Any, Generic, TypeVar

from sqlmodel import Session

from sta.common.utils.json import JSONType
from sta.models.label.repo import LabelsetCommit
from sta.models.user import UserPublic

from ......models.label.data import LabelDataUpdateLike
from ....data.base import LabelDataDomain
from .operation import Operation, P

__all__ = ["UpdateBase"]

_U = TypeVar("_U", bound=LabelDataUpdateLike)


class UpdateBase(Operation[P], Generic[P, _U]):
    @classmethod
    @abstractmethod
    def get_domain(cls) -> LabelDataDomain[Any, Any, Any, _U, Any]:
        raise NotImplementedError

    @classmethod
    @abstractmethod
    def get_id(cls, params: P) -> uuid.UUID:
        raise NotImplementedError

    @classmethod
    @abstractmethod
    def get_data(cls, params: P) -> _U:
        raise NotImplementedError

    def apply(
        self,
        current_user: UserPublic,
        session: Session,
        commit: LabelsetCommit,
    ) -> JSONType:
        params = self.params

        self.get_domain().update_data(
            current_user=current_user,
            session=session,
            id=self.get_id(params),
            group_id=commit.group_id,
            commit_hash=commit.hash,
            data=self.get_data(params),
        )

        return None
