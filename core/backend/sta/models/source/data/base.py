"""Inherit from these base classes to construct models for source data."""

from typing import TYPE_CHECKING, Any, ClassVar, Protocol

from pydantic import create_model
from sqlalchemy.orm import declared_attr
from sqlalchemy.sql.schema import ForeignKeyConstraint, Index, UniqueConstraint
from sqlalchemy.sql.sqltypes import Integer, String, Text
from sqlmodel import Field, Relationship

from sta.models.base import sqlmodel_sa_type

from ...base import (
    OptimisticLockingSQLModel,
    PartialSTBoundsSQLMixin,
    PartialSTBoundsSQLMixinLike,
    PartialSTBoundsUpdateLike,
    SQLModelLike,
    TransformSQLMixin,
    TransformSQLMixinLike,
    TransformSQLMixinUpdateLike,
)
from ...types import FileURI
from ..group import SourceGroup, SourceGroupPublic

__all__ = [
    "SourceDataPublicLike",
    "SourceDataSQLModel",
    "SourceDataTableLike",
    "SourceDataUpdateLike",
    "SourceMetadataPublicLike",
    "SourceMetadataSQLModel",
    "SourceMetadataTableLike",
    "SourceMetadataUpdateLike",
    "SourceTransformMetadataPublicLike",
    "SourceTransformMetadataSQLModel",
    "SourceTransformMetadataTableLike",
    "SourceTransformMetadataUpdateLike",
]


class _LabelDataBaseLike(PartialSTBoundsSQLMixinLike, Protocol):
    group_id: int


class SourceDataTableLike(_LabelDataBaseLike, Protocol):
    id: int
    group: SourceGroup
    auto_bounds: bool
    # Derivation state, declared here because the generic source-data domain maintains it
    # on the table model: the identity of the configuration the stored box reflects (NULL
    # while the record awaits derivation) and why the last attempt gave up.
    bounds_config_hash: str | None
    bounds_error: str | None


class SourceDataPublicLike(_LabelDataBaseLike, Protocol):
    id: int
    group: SourceGroupPublic
    auto_bounds: bool


class SourceDataUpdateLike(PartialSTBoundsUpdateLike, SQLModelLike, Protocol):
    group_id: int | None = None
    auto_bounds: bool | None = None


class SourceDataSQLModel(
    PartialSTBoundsSQLMixin(queryable=True),
    OptimisticLockingSQLModel,
):
    """Base class for storing source data instances."""

    group_id: int = Field(sa_type=Integer)

    # Whether the spatial bounds above are still authoritative when derived from the
    # stored source file. Flipping this off pins a hand-set box so that the rewrites
    # and source-configuration changes which would otherwise recompute it leave it be.
    auto_bounds: bool = Field(default=True)

    # Identity of the reading configuration the recorded box was derived under, as
    # reported by the source plugin that owns the record's group. NULL means the box
    # reflects no live configuration: the record has never been derived, its file or
    # transform moved, or its group's configuration changed or disappeared. Together
    # with `auto_bounds` that is the whole definition of "awaiting recomputation", so a
    # job lost to a crash cannot hide unfinished work, and a hand-pinned box is never
    # mistaken for a pending one.
    bounds_config_hash: str | None = Field(
        default=None,
        sa_type=sqlmodel_sa_type(String(40)),
    )

    # Why the last derivation attempt gave up on this record, kept beside the pending
    # marker it explains: a group whose records cannot be derived (no specification, a
    # file that has gone) is otherwise indistinguishable from one nobody has looked at.
    bounds_error: str | None = Field(default=None, sa_type=Text)

    @classmethod
    def build_table_base_cls(cls, tablename: str) -> type[Any]:
        class SourceDataBase(cls):
            __tablename__: ClassVar[Any] = tablename

            id: int | None = Field(
                default=None,
                sa_type=Integer,
                primary_key=True,
                sa_column_kwargs={"autoincrement": True},
            )

            if TYPE_CHECKING:
                group: SourceGroup

            @declared_attr.directive
            def __table_args__(cls) -> tuple[Any, ...]:
                return (
                    ForeignKeyConstraint(
                        ["group_id"],
                        ["source_group.id"],
                        ondelete="CASCADE",
                    ),
                )

        return SourceDataBase

    @classmethod
    def get_table_cls(cls, tablename: str) -> type[Any]:
        SourceData = create_model(
            cls.__name__.replace("SQLModel", ""),
            group=(SourceGroup, Relationship()),
            __base__=cls.build_table_base_cls(tablename),
            __cls_kwargs__={"table": True},
        )

        return SourceData

    @classmethod
    def get_public_cls(cls) -> type[Any]:
        class SourceDataPublic(super().get_public_cls()):
            id: int
            group: SourceGroupPublic

            def __hash__(self) -> int:
                return hash(self.id)

        # Give each subclass's public model a stable, unique name. Otherwise
        # every subclass produces a local class named `SourceDataPublic`, and
        # the OpenAPI schema disambiguates them with an unstable auto-numbered
        # `SourceDataPublic<N>` whose ordering shifts with schema emission order.
        # model_rebuild is required because pydantic captures the core-schema ref
        # (which drives the OpenAPI definition name) at class-creation time,
        # before this rename takes effect.
        SourceDataPublic.__name__ = cls.__name__.replace("SQLModel", "Public")
        SourceDataPublic.__qualname__ = SourceDataPublic.__name__
        SourceDataPublic.model_rebuild(force=True)
        return SourceDataPublic

    @classmethod
    def get_update_cls(cls) -> type[Any]:
        class SourceDataUpdate(super().get_update_cls()):
            group_id: int | None = None
            auto_bounds: bool | None = None

        return SourceDataUpdate


class SourceMetadataTableLike(SourceDataTableLike, Protocol):
    uri: FileURI


class SourceMetadataPublicLike(SourceDataPublicLike, Protocol):
    uri: FileURI


class SourceMetadataUpdateLike(SourceDataUpdateLike, Protocol):
    uri: FileURI | None = None


class SourceMetadataSQLModel(SourceDataSQLModel):
    uri: FileURI = Field(sa_type=sqlmodel_sa_type(String(255)), nullable=False)

    @classmethod
    def build_table_base_cls(cls, tablename: str) -> type[Any]:
        class SourceMetadataBase(super().build_table_base_cls(tablename)):
            @declared_attr.directive
            def __table_args__(cls) -> tuple[Any, ...]:
                return (
                    *super().__table_args__,
                    UniqueConstraint("uri", "group_id"),
                    Index(f"ix_{cls.__tablename__}_uri", "uri"),
                )

        return SourceMetadataBase

    @classmethod
    def get_update_cls(cls) -> type[Any]:
        class SourceMetadataUpdate(super().get_update_cls()):
            uri: FileURI | None = None

        return SourceMetadataUpdate


class SourceTransformMetadataTableLike(TransformSQLMixinLike, SourceDataTableLike, Protocol):
    pass


class SourceTransformMetadataPublicLike(TransformSQLMixinLike, SourceDataPublicLike, Protocol):
    pass


class SourceTransformMetadataUpdateLike(
    TransformSQLMixinUpdateLike, SourceMetadataUpdateLike, Protocol
):
    pass


class SourceTransformMetadataSQLModel(TransformSQLMixin(), SourceMetadataSQLModel):
    pass
