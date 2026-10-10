from typing import Any, ClassVar

from sqlalchemy.sql.sqltypes import Integer, String, Text
from sqlmodel import Field

from sta.models.base import sqlmodel_sa_type

from ..base import (
    OptimisticLockingSQLModel,
    OptimisticLockingUpdate,
    RequiredFieldNullGuard,
    non_nullable_field_names,
)
from ..types import Name


class _LabelGroupBase(OptimisticLockingSQLModel):
    name: Name = Field(sa_type=sqlmodel_sa_type(String(255)), nullable=False, unique=True)
    description: str = Field(sa_type=Text, nullable=False, default="")


class LabelGroup(_LabelGroupBase, table=True):
    __tablename__: ClassVar[Any] = "label_group"

    id: int | None = Field(
        default=None,
        sa_type=Integer,
        primary_key=True,
        sa_column_kwargs={"autoincrement": True},
    )


class LabelGroupCreate(_LabelGroupBase):
    pass


class LabelGroupPublic(_LabelGroupBase):
    id: int

    def __hash__(self) -> int:
        return hash(self.id)


class LabelGroupUpdate(OptimisticLockingUpdate):
    _null_forbidden_fields: ClassVar[frozenset[str]] = non_nullable_field_names(_LabelGroupBase)

    name: Name | None = None
    description: str | None = None


class LabelGroupBulkUpdate(RequiredFieldNullGuard):
    _null_forbidden_fields: ClassVar[frozenset[str]] = non_nullable_field_names(_LabelGroupBase)

    description: str | None = None
