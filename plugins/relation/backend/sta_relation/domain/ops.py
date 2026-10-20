"""Undo-compatible relation operations registered in the label repository."""

import uuid

from pydantic import BaseModel, StrictInt
from sqlmodel import Session

from sta.domain.label.data.endpoints import LabelElementReference
from sta.domain.label.repo.ops import Operation
from sta.models.label.repo import LabelsetCommit
from sta.models.user import UserPublic

from ..models.data import RelationSQLModel
from .data import domain, validate_relation


class RelationParams(BaseModel):
    source: LabelElementReference
    target: LabelElementReference
    relation_class_id: StrictInt


class UpdateParams(RelationParams):
    relation_id: uuid.UUID


class DeleteParams(BaseModel):
    relation_id: uuid.UUID


class Create(Operation[RelationParams]):
    def apply(
        self, current_user: UserPublic, session: Session, commit: LabelsetCommit
    ) -> uuid.UUID:
        params = self.params
        validate_relation(
            current_user,
            session,
            commit.group_id,
            commit.hash,
            params.source,
            params.target,
            params.relation_class_id,
        )
        record = domain.create_data(
            current_user=current_user,
            session=session,
            data=RelationSQLModel(
                group_id=commit.group_id,
                commit_hash=commit.hash,
                source_type=params.source.type,
                source_id=params.source.id,
                target_type=params.target.type,
                target_id=params.target.id,
                relation_class_id=params.relation_class_id,
            ),
        )
        return record.id


class Update(Operation[UpdateParams]):
    def apply(self, current_user: UserPublic, session: Session, commit: LabelsetCommit) -> None:
        params = self.params
        current = domain.read_data_for_operation(
            current_user=current_user,
            session=session,
            id=params.relation_id,
            group_id=commit.group_id,
            commit_hash=commit.hash,
        )
        validate_relation(
            current_user,
            session,
            commit.group_id,
            commit.hash,
            params.source,
            params.target,
            params.relation_class_id,
            existing_class_id=current.relation_class_id,
        )
        domain.update_data(
            current_user=current_user,
            session=session,
            id=params.relation_id,
            group_id=commit.group_id,
            commit_hash=commit.hash,
            data=domain.update_cls(
                source_type=params.source.type,
                source_id=params.source.id,
                target_type=params.target.type,
                target_id=params.target.id,
                relation_class_id=params.relation_class_id,
            ),
        )


class Delete(Operation[DeleteParams]):
    def apply(self, current_user: UserPublic, session: Session, commit: LabelsetCommit) -> None:
        domain.delete_data(
            current_user=current_user,
            session=session,
            id=self.params.relation_id,
            group_id=commit.group_id,
            commit_hash=commit.hash,
        )
