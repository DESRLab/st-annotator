"""Inherit from these base classes to construct models for source data."""
from typing import TYPE_CHECKING, Any, ClassVar, Protocol

from pydantic import create_model
from sqlalchemy.orm import declared_attr
from sqlalchemy.sql.schema import ForeignKeyConstraint, Index, UniqueConstraint
from sqlalchemy.sql.sqltypes import Integer, String
from sqlmodel import Field, Relationship

from ...base import (
    OptimisticLockingSQLModel,
    PartialSTBoundsSQLMixin,
    PartialSTBoundsSQLMixinLike,
    TransformSQLMixin,
    TransformSQLMixinLike,
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


class SourceDataPublicLike(_LabelDataBaseLike, Protocol):
    id: int
    group: SourceGroupPublic


class SourceDataUpdateLike(PartialSTBoundsSQLMixinLike, Protocol):
    group_id: int | None = None


class SourceDataSQLModel(
    PartialSTBoundsSQLMixin(queryable=True),
    OptimisticLockingSQLModel,
):
    """Base class for storing source data instances."""

    group_id: int = Field(sa_type=Integer)

    @classmethod
    def _get_table_cls(cls, tablename: str):
        class SourceDataBase(cls):
            __tablename__: ClassVar[str] = tablename

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
                        ['group_id'],
                        ['source_group.id'],
                        ondelete='CASCADE',
                    ),
                )

        return SourceDataBase

    @classmethod
    def get_table_cls(cls, tablename: str):
        SourceData = create_model(
            cls.__name__.replace("SQLModel", ""),
            group=(SourceGroup, Relationship()),
            __base__=cls._get_table_cls(tablename),
            __cls_kwargs__={"table": True},
        )

        return SourceData

    @classmethod
    def get_public_cls(cls):
        class SourceDataPublic(super().get_public_cls()):
            id: int
            group: SourceGroupPublic

            def __hash__(self) -> int:
                return hash(self.id)

        return SourceDataPublic

    @classmethod
    def get_update_cls(cls):
        class SourceDataUpdate(super().get_update_cls()):
            group_id: int | None = None

        return SourceDataUpdate


class SourceMetadataTableLike(SourceDataTableLike, Protocol):
    uri: FileURI


class SourceMetadataPublicLike(SourceDataPublicLike, Protocol):
    uri: FileURI


class SourceMetadataUpdateLike(SourceDataUpdateLike, Protocol):
    uri: FileURI | None = None


class SourceMetadataSQLModel(SourceDataSQLModel):
    uri: FileURI = Field(sa_type=String(255), nullable=False)

    @classmethod
    def _get_table_cls(cls, tablename: str):
        class SourceMetadataBase(super()._get_table_cls(tablename)):
            @declared_attr.directive
            def __table_args__(cls) -> tuple[Any, ...]:
                return (
                    *super().__table_args__,
                    UniqueConstraint('uri', 'group_id'),
                    Index(f'ix_{cls.__tablename__}_uri', 'uri'),
                )

        return SourceMetadataBase

    @classmethod
    def get_update_cls(cls):
        class SourceMetadataUpdate(super().get_update_cls()):
            uri: FileURI | None = None

        return SourceMetadataUpdate


class SourceTransformMetadataTableLike(TransformSQLMixinLike, SourceDataTableLike, Protocol):
    pass


class SourceTransformMetadataPublicLike(TransformSQLMixinLike, SourceDataPublicLike, Protocol):
    pass


class SourceTransformMetadataUpdateLike(TransformSQLMixinLike, SourceDataUpdateLike, Protocol):
    pass


class SourceTransformMetadataSQLModel(TransformSQLMixin(), SourceMetadataSQLModel):
    pass
