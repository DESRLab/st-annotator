"""Inherit from these base classes to construct models for label data."""

import uuid
from typing import TYPE_CHECKING, Any, ClassVar, Protocol

import uuid6

from pydantic import create_model
from sqlalchemy.orm import declared_attr
from sqlalchemy.sql.schema import ForeignKeyConstraint, Index
from sqlalchemy.sql.sqltypes import Boolean
from sqlmodel import Field, Relationship

from sta.common.database.types import GUID

from ...base import (
    OptimisticLockingSQLModel,
    PartialSTBoundsSQLMixin,
    PartialSTBoundsSQLMixinLike,
    SQLMixinBase,
    SQLModelLike,
)
from ..repo import LabelsetCommit, LabelsetCommitPublic

__all__ = [
    "LabelDataPublicLike",
    "LabelDataSQLModel",
    "LabelDataTableLike",
    "LabelDataUpdateLike",
    "LabelElementPublicLike",
    "LabelElementSQLModel",
    "LabelElementTableLike",
    "LabelElementUpdateLike",
    "LabelEntityPublicLike",
    "LabelEntitySQLModel",
    "LabelEntityTableLike",
    "LabelEntityUpdateLike",
]


class _LabelDataBaseLike(SQLModelLike, Protocol):
    group_id: int
    commit_hash: str
    is_deleted: bool


class LabelDataTableLike(_LabelDataBaseLike, Protocol):
    __table__: ClassVar[Any]
    __tablename__: ClassVar[Any]
    id: uuid.UUID
    commit: LabelsetCommit


class LabelDataPublicLike(_LabelDataBaseLike, Protocol):
    id: uuid.UUID
    commit: LabelsetCommitPublic


class LabelDataUpdateLike(SQLModelLike, Protocol):
    is_deleted: bool | None = None


class LabelDataSQLModel(OptimisticLockingSQLModel, SQLMixinBase):
    """
    Base class for storing label data instances.

    For a given label instance, its state is only contained in the commits in which it was added to,
    updated, or deleted from the labelset. Therefore, at any commit, the state of a label instance
    can be found by traversing backwards until a commit contains a state of that label instance.

    Provides foreign key columns to reference the commit, as well as indicator columns to
    mark if the label instance was deleted in that commit.
    """

    group_id: int = Field(primary_key=True, nullable=False)
    commit_hash: str = Field(primary_key=True, nullable=False)

    is_deleted: bool = Field(sa_type=Boolean, nullable=False, default=False)

    @classmethod
    def build_table_base_cls(cls, tablename: str) -> type[Any]:
        class LabelDataBase(cls):
            __tablename__: ClassVar[Any] = tablename

            id: uuid.UUID = Field(
                sa_type=GUID,
                primary_key=True,
                nullable=False,
                index=True,
                default_factory=uuid6.uuid7,
            )

            if TYPE_CHECKING:
                commit: list[LabelsetCommit]

            @declared_attr.directive
            def __table_args__(cls) -> tuple[Any, ...]:
                return (
                    ForeignKeyConstraint(
                        ["group_id", "commit_hash"],
                        ["labelset_commit.group_id", "labelset_commit.hash"],
                        ondelete="CASCADE",
                        onupdate="CASCADE",
                    ),
                    Index(f"ix_{cls.__tablename__}_labelset_commit", "group_id", "commit_hash"),
                )

        return LabelDataBase

    @classmethod
    def get_table_cls(cls, tablename: str) -> type[Any]:
        LabelData = create_model(
            cls.__name__.replace("SQLModel", ""),
            commit=(LabelsetCommit, Relationship()),
            __base__=cls.build_table_base_cls(tablename),
            __cls_kwargs__={"table": True},
        )

        return LabelData

    @classmethod
    def get_public_cls(cls) -> type[Any]:
        class LabelDataPublic(super().get_public_cls()):
            id: uuid.UUID
            commit: LabelsetCommitPublic

            def __hash__(self) -> int:
                return hash(self.id)

        # Give each subclass's public model a stable, unique name. Otherwise
        # every subclass produces a local class named `LabelDataPublic`, and
        # the OpenAPI schema disambiguates them with an unstable auto-numbered
        # `LabelDataPublic<N>` whose ordering shifts with schema emission order.
        # model_rebuild is required because pydantic captures the core-schema ref
        # (which drives the OpenAPI definition name) at class-creation time,
        # before this rename takes effect.
        LabelDataPublic.__name__ = cls.__name__.replace("SQLModel", "Public")
        LabelDataPublic.__qualname__ = LabelDataPublic.__name__
        LabelDataPublic.model_rebuild(force=True)
        return LabelDataPublic

    @classmethod
    def get_update_cls(cls) -> type[Any]:
        class LabelDataUpdate(super().get_update_cls()):
            is_deleted: bool | None = None

        return LabelDataUpdate


class LabelEntityTableLike(LabelDataTableLike, Protocol):
    pass


class LabelEntityPublicLike(LabelDataPublicLike, Protocol):
    pass


class LabelEntityUpdateLike(LabelDataUpdateLike, Protocol):
    pass


class LabelEntitySQLModel(LabelDataSQLModel):
    @classmethod
    def build_table_base_cls(cls, tablename: str) -> type[Any]:
        class LabelEntityBase(super().build_table_base_cls(tablename)):
            has_children: bool = Field(
                sa_type=Boolean,
                nullable=False,
                default=False,
                index=True,
            )

        return LabelEntityBase


class LabelElementTableLike(PartialSTBoundsSQLMixinLike, LabelDataTableLike, Protocol):
    entity_id: uuid.UUID | None


class LabelElementPublicLike(PartialSTBoundsSQLMixinLike, LabelDataPublicLike, Protocol):
    entity_id: uuid.UUID | None


class LabelElementUpdateLike(PartialSTBoundsSQLMixinLike, LabelDataUpdateLike, Protocol):
    entity_id: uuid.UUID | None = None


class LabelElementSQLModel(PartialSTBoundsSQLMixin(queryable=True), LabelDataSQLModel):
    entity_id: uuid.UUID | None = Field(sa_type=GUID, default=None)

    @classmethod
    def get_update_cls(cls) -> type[Any]:
        class LabelElementUpdate(super().get_update_cls()):
            entity_id: uuid.UUID | None = None

        return LabelElementUpdate
