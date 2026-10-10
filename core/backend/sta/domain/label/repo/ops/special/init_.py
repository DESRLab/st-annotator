from __future__ import annotations

from pydantic import BaseModel
from sqlmodel import Session

from sta.common.utils.json import JSONType

from ......models.label.repo import LabelsetCommit
from ......models.user import UserPublic
from ..base import Operation

__all__ = ["InitLabelset", "InitLabelsetParams"]


class InitLabelsetParams(BaseModel):
    pass


class InitLabelset(Operation[InitLabelsetParams]):
    """A no-op representing the initial commit for a branch."""

    def apply(
        self,
        current_user: UserPublic,
        session: Session,
        commit: LabelsetCommit,
    ) -> JSONType:
        return None
