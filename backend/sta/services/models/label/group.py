from typing import ClassVar

from sqlalchemy.sql.sqltypes import Integer, String, Text
from sqlmodel import Field, SQLModel

from ..base import OptimisticLockingSQLModel
from ..types import Name


class _LabelGroupBase(OptimisticLockingSQLModel):
    name: Name = Field(sa_type=String(255), nullable=False, unique=True)
    description: str = Field(sa_type=Text, nullable=False, default='')


class LabelGroup(_LabelGroupBase, table=True):
    __tablename__: ClassVar[str] = 'label_group'

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


class LabelGroupUpdate(SQLModel):
    name: Name | None = None
    description: str | None = None


class LabelGroupBulkUpdate(SQLModel):
    description: str | None = None
