"""Inherit from these base classes to construct models for source data specifications."""

from collections.abc import Mapping, Sequence
from typing import TYPE_CHECKING, Any, ClassVar, Protocol

from pydantic import create_model
from sqlalchemy.sql.sqltypes import Integer, String
from sqlmodel import Field, Relationship, SQLModel

from sta.models.base import sqlmodel_sa_type

from ...base import OptimisticLockingSQLModel, SQLMixinBase, SQLModelLike
from ...types import Name
from ..group import SourceGroup, SourceGroupPublic

__all__ = [
    "SourceSpecCreateLike",
    "SourceSpecPublicLike",
    "SourceSpecSQLModel",
    "SourceSpecTableLike",
    "SourceSpecUpdateLike",
]


class _SourceSpecBaseLike(SQLModelLike, Protocol):
    name: Name


class _SourceSpecGroupLike(SQLModelLike, Protocol):
    spec_id: int

    group_id: int
    group: SourceGroup


class SourceSpecTableLike(_SourceSpecBaseLike, Protocol):
    id: int

    def check_edit_conflict(self, values: Mapping[str, Any]) -> None: ...

    @property
    def group_links(self) -> Sequence[_SourceSpecGroupLike]: ...

    @property
    def groups(self) -> Sequence[SourceGroup]: ...

    @classmethod
    def get_group_links_cls(cls) -> type[_SourceSpecGroupLike]: ...


class SourceSpecCreateLike(_SourceSpecBaseLike, Protocol):
    group_ids: list[int]


class SourceSpecPublicLike(_SourceSpecBaseLike, Protocol):
    id: int
    groups: list[SourceGroupPublic]


class SourceSpecUpdateLike(SQLModelLike, Protocol):
    name: Name | None = None

    group_ids: list[int] | None = None


class SourceSpecSQLModel(OptimisticLockingSQLModel, SQLMixinBase):
    name: Name = Field(sa_type=sqlmodel_sa_type(String(255)), nullable=False)

    @classmethod
    def build_group_links_cls(cls, spec_tablename: str) -> type[Any]:
        """
        We cannot declare the relationship on :class:`SourceGroup` itself as
        there may be an arbitrary number of specification types.
        """

        class SourceSpecGroup(SQLModel):
            __tablename__: ClassVar[Any] = f"{spec_tablename}_source_group"

            spec_id: int = Field(
                foreign_key=f"{spec_tablename}.id",
                ondelete="CASCADE",
                primary_key=True,
                nullable=False,
            )
            group_id: int = Field(
                foreign_key="source_group.id",
                ondelete="CASCADE",
                primary_key=True,
                unique=True,
                nullable=False,
            )
            if TYPE_CHECKING:
                group: SourceGroup

        return SourceSpecGroup

    @classmethod
    def build_table_base_cls(cls, tablename: str) -> type[Any]:
        class SourceSpecBase(cls):
            __tablename__: ClassVar[Any] = tablename

            id: int | None = Field(
                default=None,
                sa_type=Integer,
                primary_key=True,
                sa_column_kwargs={"autoincrement": True},
            )

        return SourceSpecBase

    @classmethod
    def get_table_cls(cls, tablename: str) -> type[Any]:
        class SourceSpecGroupBase(cls.build_group_links_cls(tablename)):
            pass

        SourceSpecGroup = create_model(
            cls.__name__.replace("SQLModel", "") + "Group",
            group=(SourceGroup, Relationship()),
            __base__=SourceSpecGroupBase,
            __cls_kwargs__={"table": True},
        )

        class SourceSpecBase(cls.build_table_base_cls(tablename)):
            if TYPE_CHECKING:
                group_links: list[SourceSpecGroupBase]

            @classmethod
            def get_group_links_cls(cls):
                return SourceSpecGroup

            @property
            def groups(self) -> Sequence[SourceGroup]:
                return [link.group for link in self.group_links]

        SourceSpec = create_model(
            cls.__name__.replace("SQLModel", ""),
            group_links=(list[SourceSpecGroup], Relationship()),
            __base__=SourceSpecBase,
            __cls_kwargs__={"table": True},
        )

        return SourceSpec

    @classmethod
    def get_create_cls(cls) -> type[Any]:
        class SourceSpecCreate(super().get_create_cls()):
            group_ids: list[int]

        return SourceSpecCreate

    @classmethod
    def get_public_cls(cls) -> type[Any]:
        class SourceSpecPublic(super().get_public_cls()):
            id: int
            groups: list[SourceGroupPublic]

            def __hash__(self) -> int:
                return hash(self.id)

        return SourceSpecPublic

    @classmethod
    def get_update_cls(cls) -> type[Any]:
        class SourceMetadataUpdate(super().get_update_cls()):
            name: Name | None = None

            group_ids: list[int] | None = None

        return SourceMetadataUpdate
