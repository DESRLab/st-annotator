from typing import ClassVar

from sqlalchemy.sql.sqltypes import String
from sqlmodel import Field, Relationship, SQLModel

from sta.common.database.types import JSONB
from sta.common.utils.json import JSONType

from .base import OptimisticLockingSQLModel
from .user import User, Username


class _AccountBase(OptimisticLockingSQLModel):
    username: Username = Field(sa_type=String(31), nullable=False, unique=True)
    preferences: JSONType = Field(sa_type=JSONB, default=None)


class Account(_AccountBase, table=True):
    __tablename__: ClassVar[str] = 'account'

    id: int = Field(
        foreign_key='user.id',
        ondelete='CASCADE',
        primary_key=True,
        nullable=False,
    )
    user: User = Relationship()


class AccountCreate(_AccountBase):
    pass


class AccountPublic(_AccountBase):
    id: int

    def __hash__(self) -> int:
        return hash(self.id)


class AccountUpdate(SQLModel):
    username: Username | None = None
    preferences: JSONType | None = None


class AccountBulkUpdate(SQLModel):
    preferences: JSONType | None = None
