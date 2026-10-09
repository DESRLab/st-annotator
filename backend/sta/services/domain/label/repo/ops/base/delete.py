from __future__ import annotations

import uuid
from abc import abstractmethod
from typing import Any

from sqlmodel import Session

from sta.common.utils.json import JSONType
from sta.services.models.label.repo import LabelsetCommit
from sta.services.models.user import UserPublic

from ....data.base import LabelDataDomain
from .operation import Operation, P

__all__ = ['DeleteBase']


class DeleteBase(Operation[P]):

    @classmethod
    @abstractmethod
    def get_domain(cls) -> LabelDataDomain[Any, Any, Any, Any, Any]:
        raise NotImplementedError

    @classmethod
    @abstractmethod
    def get_id(cls, params: P) -> uuid.UUID:
        raise NotImplementedError

    def apply(
        self,
        current_user: UserPublic,
        session: Session,
        commit: LabelsetCommit,
    ) -> JSONType:
        self.get_domain().delete_data(
            current_user=current_user,
            session=session,
            id=self.get_id(self.params),
            group_id=commit.group_id,
            commit_hash=commit.hash,
        )

        return None
