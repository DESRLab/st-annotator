from __future__ import annotations

from pydantic import BaseModel
from sqlmodel import Session

from sta.common.utils.json import JSONType

from ......domain.label.data import LabelDataDomain
from ......models.label.repo import LabelsetCommit
from ......models.user import UserPublic
from ..base import Operation

__all__ = ["CheckpointLabelset", "CheckpointLabelsetParams"]


class CheckpointLabelsetParams(BaseModel):
    pass


class CheckpointLabelset(Operation[CheckpointLabelsetParams]):
    """Copies the latest state of each label data instance into a commit."""

    def apply(
        self,
        current_user: UserPublic,
        session: Session,
        commit: LabelsetCommit,
    ) -> JSONType:
        for _, crud in LabelDataDomain.iter_cruds():
            crud.refresh_states(
                current_user=current_user,
                session=session,
                group_id=commit.group_id,
                commit_hash=commit.hash,
            )
