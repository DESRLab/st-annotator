"""Relation class definitions and their group-scoped selections."""

from collections.abc import Sequence
from typing import TYPE_CHECKING, Any, ClassVar

from pydantic_extra_types.color import Color

from pydantic import create_model
from sqlalchemy.sql.sqltypes import Boolean, Integer, String, Text
from sqlmodel import Field, Relationship, SQLModel

from sta.models.base import (
    OptimisticLockingSQLModel,
    OptimisticLockingUpdate,
    RequiredFieldNullGuard,
    non_nullable_field_names,
    sqlmodel_sa_type,
)
from sta.models.label.group import LabelGroup, LabelGroupPublic
from sta.models.label.spec.base import LabelSpecSQLModel
from sta.models.types import Name

__all__ = [
    "RelationClass",
    "RelationClassBulkUpdate",
    "RelationClassCreate",
    "RelationClassPublic",
    "RelationClassSelection",
    "RelationClassSelectionBulkUpdate",
    "RelationClassSelectionCreate",
    "RelationClassSelectionPublic",
    "RelationClassSelectionUpdate",
    "RelationClassUpdate",
]


class _RelationClassBase(OptimisticLockingSQLModel):
    name: Name = Field(sa_type=sqlmodel_sa_type(String(255)), nullable=False, unique=True)
    description: str = Field(sa_type=Text, nullable=False, default="")
    color_rgb: int = Field(sa_type=Integer, nullable=False, default=16777215)

    is_deleted: bool = Field(sa_type=Boolean, nullable=False, default=False)

    @property
    def color(self) -> Color:
        return Color(f"#{self.color_rgb:06X}")

    def update_from_color(self, color: Color):
        r, g, b, *_ = color.as_rgb_tuple()
        color_rgb = (r << 16) + (g << 8) + b

        return self.sqlmodel_update({"color_rgb": color_rgb})


class RelationClassSelectionAssociation(SQLModel, table=True):
    __tablename__: ClassVar[Any] = "relation_class_selection_association"

    selection_id: int = Field(
        foreign_key="relation_class_selection.id",
        ondelete="CASCADE",
        primary_key=True,
        nullable=False,
    )
    relclass_id: int = Field(
        foreign_key="relation_class.id",
        ondelete="CASCADE",
        primary_key=True,
        nullable=False,
    )


class RelationClass(_RelationClassBase, table=True):
    __tablename__: ClassVar[Any] = "relation_class"

    id: int | None = Field(
        default=None,
        sa_type=Integer,
        primary_key=True,
        sa_column_kwargs={"autoincrement": True},
    )

    selections: list["RelationClassSelection"] = Relationship(
        back_populates="relclasses",
        link_model=RelationClassSelectionAssociation,
    )


class RelationClassCreate(_RelationClassBase):
    pass


class RelationClassPublic(_RelationClassBase):
    id: int


class RelationClassUpdate(OptimisticLockingUpdate):
    # A null description is this form's "clear the description" gesture: both write paths
    # normalize it to "" (definitions.update_relclass / bulk_update_relclasses), which is a
    # stored value rather than a null, so the column's NOT NULL does not forbid it.
    _null_forbidden_fields: ClassVar[frozenset[str]] = non_nullable_field_names(_RelationClassBase)
    _null_normalized_fields: ClassVar[frozenset[str]] = frozenset({"description"})

    name: Name | None = None
    description: str | None = None
    color_rgb: int | None = None

    is_deleted: bool | None = None


class RelationClassBulkUpdate(RequiredFieldNullGuard):
    _null_forbidden_fields: ClassVar[frozenset[str]] = non_nullable_field_names(_RelationClassBase)
    _null_normalized_fields: ClassVar[frozenset[str]] = frozenset({"description"})

    description: str | None = None
    color_rgb: int | None = None

    is_deleted: bool | None = None


class RelationClassSelectionSQLModel(LabelSpecSQLModel):
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

        class RelationClassSelectionBase(cls.build_table_base_cls(tablename)):
            if TYPE_CHECKING:
                group_links: list[LabelSpecGroupBase]

            @classmethod
            def get_group_links_cls(cls):
                return LabelSpecGroup

            @property
            def groups(self) -> Sequence[LabelGroup]:
                return [link.group for link in self.group_links]

            if TYPE_CHECKING:
                relclasses: list[RelationClass]

            @classmethod
            def get_association_cls(cls):
                return RelationClassSelectionAssociation

        RelationClassSelection = create_model(
            cls.__name__.replace("SQLModel", ""),
            group_links=(list[LabelSpecGroup], Relationship()),
            relclasses=(
                list[RelationClass],
                Relationship(
                    back_populates="selections",
                    link_model=RelationClassSelectionAssociation,
                ),
            ),
            __base__=RelationClassSelectionBase,
            __cls_kwargs__={"table": True},
        )

        return RelationClassSelection

    @classmethod
    def get_create_cls(cls) -> type[Any]:
        class RelationClassSelectionCreate(super().get_create_cls()):
            relclass_ids: list[int]

        return RelationClassSelectionCreate

    @classmethod
    def get_public_cls(cls) -> type[Any]:
        class RelationClassSelectionPublic(super().get_public_cls()):
            relclasses: list[RelationClassPublic]

        return RelationClassSelectionPublic

    @classmethod
    def get_update_cls(cls) -> type[Any]:
        class RelationClassSelectionUpdate(super().get_update_cls()):
            # update_spec normalizes an explicit null to "", which is how the form clears a
            # description; name stays guarded, and its null is already refused with a 422.
            _null_normalized_fields: ClassVar[frozenset[str]] = frozenset({"description"})

            description: str | None = None

            relclass_ids: list[int] | None = None

        return RelationClassSelectionUpdate


if TYPE_CHECKING:

    class RelationClassSelection(RelationClassSelectionSQLModel):
        id: int
        group_links: list[Any]
        relclasses: list[RelationClass]

        @classmethod
        def get_group_links_cls(cls) -> type[Any]: ...

        @classmethod
        def get_association_cls(cls) -> type[RelationClassSelectionAssociation]: ...

        @property
        def groups(self) -> Sequence[LabelGroup]: ...

    class RelationClassSelectionCreate(RelationClassSelectionSQLModel):
        group_ids: list[int]
        relclass_ids: list[int]

    class RelationClassSelectionPublic(RelationClassSelectionSQLModel):
        id: int
        groups: list[LabelGroupPublic]
        relclasses: list[RelationClassPublic]

    class RelationClassSelectionUpdate(OptimisticLockingUpdate):
        name: Name | None = None
        description: str | None = None
        group_ids: list[int] | None = None
        relclass_ids: list[int] | None = None

    class RelationClassSelectionBulkUpdate(RelationClassSelectionUpdate):
        pass
else:
    RelationClassSelection = RelationClassSelectionSQLModel.get_table_cls(
        "relation_class_selection"
    )
    RelationClassSelectionCreate = RelationClassSelectionSQLModel.get_create_cls()
    RelationClassSelectionPublic = RelationClassSelectionSQLModel.get_public_cls()
    RelationClassSelectionUpdate = RelationClassSelectionSQLModel.get_update_cls()
    RelationClassSelectionBulkUpdate = RelationClassSelectionSQLModel.get_update_cls()
