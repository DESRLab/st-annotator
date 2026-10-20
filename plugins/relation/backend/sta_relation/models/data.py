"""Commit-versioned directed relations between plugin label elements."""

import uuid
from typing import TYPE_CHECKING, Any, ClassVar

from sqlalchemy import String
from sqlmodel import Field

from sta.common.database.types import GUID
from sta.models.base import sqlmodel_sa_type
from sta.models.label.data import LabelDataSQLModel
from sta.models.label.repo import LabelsetCommit, LabelsetCommitPublic


class RelationSQLModel(LabelDataSQLModel):
    source_type: str = Field(sa_type=sqlmodel_sa_type(String(255)), nullable=False)
    source_id: uuid.UUID = Field(sa_type=GUID, nullable=False, index=True)
    target_type: str = Field(sa_type=sqlmodel_sa_type(String(255)), nullable=False)
    target_id: uuid.UUID = Field(sa_type=GUID, nullable=False, index=True)
    relation_class_id: int = Field(foreign_key="relation_class.id", nullable=False)

    @classmethod
    def get_update_cls(cls) -> type[Any]:
        class RelationUpdate(super().get_update_cls()):
            source_type: str | None = None
            source_id: uuid.UUID | None = None
            target_type: str | None = None
            target_id: uuid.UUID | None = None
            relation_class_id: int | None = None

        return RelationUpdate


if TYPE_CHECKING:

    class Relation(RelationSQLModel):
        __table__: ClassVar[Any]
        __tablename__: ClassVar[Any]
        id: uuid.UUID
        commit: LabelsetCommit

    class RelationPublic(RelationSQLModel):
        id: uuid.UUID
        commit: LabelsetCommitPublic
else:
    # Keep the persisted table name so existing relation revisions remain readable.
    Relation = RelationSQLModel.get_table_cls("label_relation")
    RelationPublic = RelationSQLModel.get_public_cls()
