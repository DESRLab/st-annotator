"""Inherit from these base classes to construct models for label data specifications."""

from collections.abc import Sequence
from typing import TYPE_CHECKING, Any, ClassVar

from pydantic_extra_types.color import Color

from pydantic import create_model
from sqlalchemy.sql.sqltypes import Boolean, Integer, String, Text
from sqlmodel import Field, Relationship, SQLModel

from sta.common.spatial import DecimalSize
from sta.models.base import sqlmodel_sa_type

from ...base import (
    OptimisticLockingSQLModel,
    OptimisticLockingUpdate,
    RequiredFieldNullGuard,
    non_nullable_field_names,
    st_bounds_coord_type,
)
from ...types import Name
from ..group import LabelGroup, LabelGroupPublic
from .base import LabelSpecSQLModel

__all__ = [
    "ObjectClass",
    "ObjectClassBulkUpdate",
    "ObjectClassCreate",
    "ObjectClassPublic",
    "ObjectClassSelection",
    "ObjectClassSelectionBulkUpdate",
    "ObjectClassSelectionCreate",
    "ObjectClassSelectionPublic",
    "ObjectClassSelectionUpdate",
    "ObjectClassUpdate",
]


class _ObjectClassBase(OptimisticLockingSQLModel):
    name: Name = Field(sa_type=sqlmodel_sa_type(String(255)), nullable=False, unique=True)
    description: str = Field(sa_type=Text, nullable=False, default="")
    color_rgb: int = Field(sa_type=Integer, nullable=False, default=16777215)

    default_size_x: DecimalSize | None = Field(
        sa_type=sqlmodel_sa_type(st_bounds_coord_type()), default=None
    )
    default_size_y: DecimalSize | None = Field(
        sa_type=sqlmodel_sa_type(st_bounds_coord_type()), default=None
    )
    default_size_z: DecimalSize | None = Field(
        sa_type=sqlmodel_sa_type(st_bounds_coord_type()), default=None
    )

    is_deleted: bool = Field(sa_type=Boolean, nullable=False, default=False)

    @property
    def color(self) -> Color:
        return Color(f"#{self.color_rgb:06X}")

    def update_from_color(self, color: Color):
        r, g, b, *_ = color.as_rgb_tuple()
        color_rgb = (r << 16) + (g << 8) + b

        return self.sqlmodel_update({"color_rgb": color_rgb})


class ObjectClassSelectionAssociation(SQLModel, table=True):
    __tablename__: ClassVar[Any] = "object_class_selection_association"

    selection_id: int = Field(
        foreign_key="object_class_selection.id",
        ondelete="CASCADE",
        primary_key=True,
        nullable=False,
    )
    objclass_id: int = Field(
        foreign_key="object_class.id",
        ondelete="CASCADE",
        primary_key=True,
        nullable=False,
    )


class ObjectClass(_ObjectClassBase, table=True):
    __tablename__: ClassVar[Any] = "object_class"

    id: int | None = Field(
        default=None,
        sa_type=Integer,
        primary_key=True,
        sa_column_kwargs={"autoincrement": True},
    )

    selections: list["ObjectClassSelection"] = Relationship(
        back_populates="objclasses",
        link_model=ObjectClassSelectionAssociation,
    )


class ObjectClassCreate(_ObjectClassBase):
    pass


class ObjectClassPublic(_ObjectClassBase):
    id: int


class ObjectClassUpdate(OptimisticLockingUpdate):
    # A null description is this form's "clear the description" gesture: both write paths
    # normalize it to "" (definitions.update_objclass / bulk_update_objclasses), which is a
    # stored value rather than a null, so the column's NOT NULL does not forbid it.
    _null_forbidden_fields: ClassVar[frozenset[str]] = non_nullable_field_names(_ObjectClassBase)
    _null_normalized_fields: ClassVar[frozenset[str]] = frozenset({"description"})

    name: Name | None = None
    description: str | None = None
    color_rgb: int | None = None

    default_size_x: DecimalSize | None = None
    default_size_y: DecimalSize | None = None
    default_size_z: DecimalSize | None = None

    is_deleted: bool | None = None


class ObjectClassBulkUpdate(RequiredFieldNullGuard):
    _null_forbidden_fields: ClassVar[frozenset[str]] = non_nullable_field_names(_ObjectClassBase)
    _null_normalized_fields: ClassVar[frozenset[str]] = frozenset({"description"})

    description: str | None = None
    color_rgb: int | None = None

    default_size_x: DecimalSize | None = None
    default_size_y: DecimalSize | None = None
    default_size_z: DecimalSize | None = None

    is_deleted: bool | None = None


class ObjectClassSelectionSQLModel(LabelSpecSQLModel):
    description: str = Field(sa_type=Text, nullable=False, default="")

    @classmethod
    def get_table_cls(cls, tablename: str) -> type[Any]:

        class LabelSpecGroupBase(cls.build_group_links_cls(tablename)):
            pass

        LabelSpecGroup = create_model(
            cls.__name__.replace("SQLModel", "") + "Group",
            group=(LabelGroup, Relationship()),
            __base__=LabelSpecGroupBase,
            __cls_kwargs__={"table": True},
        )

        class ObjectClassSelectionBase(cls.build_table_base_cls(tablename)):
            if TYPE_CHECKING:
                group_links: list[LabelSpecGroupBase]

            @classmethod
            def get_group_links_cls(cls):
                return LabelSpecGroup

            @property
            def groups(self) -> Sequence[LabelGroup]:
                return [link.group for link in self.group_links]

            if TYPE_CHECKING:
                objclasses: list[ObjectClass]

            @classmethod
            def get_association_cls(cls):
                return ObjectClassSelectionAssociation

        ObjectClassSelection = create_model(
            cls.__name__.replace("SQLModel", ""),
            group_links=(list[LabelSpecGroup], Relationship()),
            objclasses=(
                list[ObjectClass],
                Relationship(
                    back_populates="selections",
                    link_model=ObjectClassSelectionAssociation,
                ),
            ),
            __base__=ObjectClassSelectionBase,
            __cls_kwargs__={"table": True},
        )

        return ObjectClassSelection

    @classmethod
    def get_create_cls(cls) -> type[Any]:
        class ObjectClassSelectionCreate(super().get_create_cls()):
            objclass_ids: list[int]

        return ObjectClassSelectionCreate

    @classmethod
    def get_public_cls(cls) -> type[Any]:
        class ObjectClassSelectionPublic(super().get_public_cls()):
            objclasses: list[ObjectClassPublic]

        return ObjectClassSelectionPublic

    @classmethod
    def get_update_cls(cls) -> type[Any]:
        class ObjectClassSelectionUpdate(super().get_update_cls()):
            # update_spec normalizes an explicit null to "", which is how the form clears a
            # description; name stays guarded, and its null is already refused with a 422.
            _null_normalized_fields: ClassVar[frozenset[str]] = frozenset({"description"})

            description: str | None = None

            objclass_ids: list[int] | None = None

        return ObjectClassSelectionUpdate


if TYPE_CHECKING:

    class ObjectClassSelection(ObjectClassSelectionSQLModel):
        id: int
        group_links: list[Any]
        objclasses: list[ObjectClass]

        @classmethod
        def get_group_links_cls(cls) -> type[Any]: ...

        @classmethod
        def get_association_cls(cls) -> type[ObjectClassSelectionAssociation]: ...

        @property
        def groups(self) -> Sequence[LabelGroup]: ...

    class ObjectClassSelectionCreate(ObjectClassSelectionSQLModel):
        group_ids: list[int]
        objclass_ids: list[int]

    class ObjectClassSelectionPublic(ObjectClassSelectionSQLModel):
        id: int
        groups: list[LabelGroupPublic]
        objclasses: list[ObjectClassPublic]

    class ObjectClassSelectionUpdate(OptimisticLockingUpdate):
        name: Name | None = None
        description: str | None = None
        group_ids: list[int] | None = None
        objclass_ids: list[int] | None = None

    class ObjectClassSelectionBulkUpdate(ObjectClassSelectionUpdate):
        pass
else:
    ObjectClassSelection = ObjectClassSelectionSQLModel.get_table_cls("object_class_selection")
    ObjectClassSelectionCreate = ObjectClassSelectionSQLModel.get_create_cls()
    ObjectClassSelectionPublic = ObjectClassSelectionSQLModel.get_public_cls()
    ObjectClassSelectionUpdate = ObjectClassSelectionSQLModel.get_update_cls()
    ObjectClassSelectionBulkUpdate = ObjectClassSelectionSQLModel.get_update_cls()
