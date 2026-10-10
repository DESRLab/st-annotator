from __future__ import annotations

import uuid

from pydantic import BaseModel
from sqlmodel import Session

from sta.domain.label.repo.ops import UpdateBase
from sta.models.label.repo import LabelsetCommit
from sta.models.user import UserPublic

from ......api.label.data.element import domain
from ......api.label.data.entity import domain as entity_domain
from ......models.label.data import LabelSelectionUpdate

__all__ = ["AssignEntity", "AssignEntityParams"]


class AssignEntityParams(BaseModel):
    selection_id: uuid.UUID
    entity_id: uuid.UUID | None


class AssignEntity(UpdateBase[AssignEntityParams, LabelSelectionUpdate]):
    @classmethod
    def get_domain(cls):
        return domain

    @classmethod
    def get_id(cls, params: AssignEntityParams):
        return params.selection_id

    @classmethod
    def get_data(cls, params: AssignEntityParams):
        return LabelSelectionUpdate(entity_id=params.entity_id)

    def apply(self, current_user: UserPublic, session: Session, commit: LabelsetCommit):
        selection = domain.read_data_for_operation(
            current_user=current_user,
            session=session,
            id=self.params.selection_id,
            group_id=commit.group_id,
            commit_hash=commit.hash,
        )
        result = super().apply(current_user, session, commit)
        if self.params.entity_id is not None:
            entity_domain.set_has_children(
                current_user=current_user,
                session=session,
                id=self.params.entity_id,
                group_id=commit.group_id,
                commit_hash=commit.hash,
                value=True,
            )
        if selection.entity_id is not None and selection.entity_id != self.params.entity_id:
            entity_domain.set_has_children(
                current_user=current_user,
                session=session,
                id=selection.entity_id,
                group_id=commit.group_id,
                commit_hash=commit.hash,
                value=domain.has_live_children(
                    current_user=current_user,
                    session=session,
                    entity_id=selection.entity_id,
                    group_id=commit.group_id,
                    commit_hash=commit.hash,
                ),
            )
        return result
