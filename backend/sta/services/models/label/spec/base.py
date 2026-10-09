"""Inherit from these base classes to construct models for label data specifications."""
from collections.abc import Sequence
from typing import TYPE_CHECKING, ClassVar, Protocol

from pydantic import create_model
from sqlalchemy.sql.sqltypes import Integer, String
from sqlmodel import Field, Relationship, SQLModel

from ...base import OptimisticLockingSQLModel, SQLMixinBase, SQLModelLike
from ...types import Name
from ..group import LabelGroup, LabelGroupPublic

__all__ = [
    "LabelSpecCreateLike",
    "LabelSpecPublicLike",
    "LabelSpecSQLModel",
    "LabelSpecTableLike",
    "LabelSpecUpdateLike",
]


class _LabelSpecBaseLike(SQLModelLike, Protocol):
    name: Name


class _LabelSpecGroupLike(SQLModelLike, Protocol):
    spec_id: int

    group_id: int
    group: LabelGroup


class LabelSpecTableLike(_LabelSpecBaseLike, Protocol):
    id: int
    groups: Sequence[LabelGroup]

    @classmethod
    def get_group_links_cls(cls) -> type[_LabelSpecGroupLike]:
        ...


class LabelSpecCreateLike(_LabelSpecBaseLike, Protocol):
    group_ids: list[int]


class LabelSpecPublicLike(_LabelSpecBaseLike, Protocol):
    id: int
    groups: list[LabelGroupPublic]


class LabelSpecUpdateLike(SQLModelLike, Protocol):
    name: Name | None = None

    group_ids: list[int] | None = None


class LabelSpecSQLModel(OptimisticLockingSQLModel, SQLMixinBase):
    name: Name = Field(sa_type=String(255), nullable=False)

    @classmethod
    def _get_group_links_cls(cls, spec_tablename: str):
        """
        We cannot declare the relationship on :class:`LabelGroup` itself as
        there may be an arbitrary number of specification types.
        """
        class LabelSpecGroup(SQLModel):
            __tablename__: ClassVar[str] = f"{spec_tablename}_label_group"

            spec_id: int = Field(
                foreign_key=f'{spec_tablename}.id',
                ondelete='CASCADE',
                primary_key=True,
                nullable=False,
            )
            group_id: int = Field(
                foreign_key='label_group.id',
                ondelete='CASCADE',
                primary_key=True,
                nullable=False,
            )
            if TYPE_CHECKING:
                group: LabelGroup

        return LabelSpecGroup

    @classmethod
    def _get_table_cls(cls, tablename: str):
        class LabelSpecBase(cls):
            __tablename__: ClassVar[str] = tablename

            id: int | None = Field(
                default=None,
                sa_type=Integer,
                primary_key=True,
                sa_column_kwargs={"autoincrement": True},
            )

        return LabelSpecBase

    @classmethod
    def get_table_cls(cls, tablename: str):

        class LabelSpecGroupBase(cls._get_group_links_cls(tablename)):
            pass

        LabelSpecGroup = create_model(
            cls.__name__.replace("SQLModel", "") + "Group",
            group=(LabelGroup, Relationship()),
            __base__=LabelSpecGroupBase,
            __cls_kwargs__={"table": True},
        )

        class LabelSpecBase(cls._get_table_cls(tablename)):
            if TYPE_CHECKING:
                group_links: list[LabelSpecGroupBase]

            @classmethod
            def get_group_links_cls(cls):
                return LabelSpecGroup

            @property
            def groups(self) -> Sequence[LabelGroup]:
                return [link.group for link in self.group_links]

        LabelSpec = create_model(
            cls.__name__.replace("SQLModel", ""),
            group_links=(list[LabelSpecGroup], Relationship()),
            __base__=LabelSpecBase,
            __cls_kwargs__={"table": True},
        )

        return LabelSpec

    @classmethod
    def get_create_cls(cls):
        class LabelSpecCreate(super().get_create_cls()):
            group_ids: list[int]

        return LabelSpecCreate

    @classmethod
    def get_public_cls(cls):
        class LabelSpecPublic(super().get_public_cls()):
            id: int
            groups: list[LabelGroupPublic]

            def __hash__(self) -> int:
                return hash(self.id)

        return LabelSpecPublic

    @classmethod
    def get_update_cls(cls):
        class LabelMetadataUpdate(super().get_update_cls()):
            name: Name | None = None

            group_ids: list[int] | None = None

        return LabelMetadataUpdate
