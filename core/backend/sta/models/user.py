import re
from collections.abc import Set
from datetime import datetime
from enum import Enum
from string import ascii_letters, digits
from typing import Annotated, Any, ClassVar

from pydantic import AfterValidator, WithJsonSchema
from sqlalchemy.sql.sqltypes import Integer, SmallInteger, String
from sqlmodel import Field, Relationship, SQLModel

from sta.common.database.types import UTCDateTime
from sta.models.base import sqlmodel_sa_type

from .base import (
    OptimisticLockingSQLModel,
    OptimisticLockingUpdate,
    non_nullable_field_names,
)


class UsernameValidators:
    PATTERN = r"^[a-zA-Z0-9*.!@$%^&(){}\[\]:;<>,.?/~_\+\-\=|\\]{4,31}\Z"
    REGEX = re.compile(PATTERN)

    MIN_LENGTH = 4
    MAX_LENGTH = 31

    VALID_SPECIAL_CHARS = r"*.!@$%^&(){}[]:;<>,.?/~_+-=|\\"
    VALID_CHARS = ascii_letters + digits + VALID_SPECIAL_CHARS

    INVALID_MSG = f"The username must consist of {MIN_LENGTH}-{MAX_LENGTH} characters. Apart from letters and numbers, you may also use special characters from this list: <code>{VALID_SPECIAL_CHARS}</code>"

    @classmethod
    def validate(cls, v: object):
        if not isinstance(v, str):
            msg = "Not a string"
            raise TypeError(msg)

        if not cls.REGEX.match(v):
            raise ValueError(cls.INVALID_MSG)

        return v


Username = Annotated[
    str,
    AfterValidator(UsernameValidators.validate),
    WithJsonSchema({"type": "string", "pattern": UsernameValidators.PATTERN}),
]


class PasswordValidators:
    PATTERN = r"^[a-zA-Z0-9*.!@$%^&(){}\[\]:;<>,.?/~_\+\-\=|\\]{4,31}\Z"
    REGEX = re.compile(PATTERN)

    MIN_LENGTH = 4
    MAX_LENGTH = 31

    VALID_SPECIAL_CHARS = r"*.!@$%^&(){}[]:;<>,.?/~_+-=|\\"
    VALID_CHARS = ascii_letters + digits + VALID_SPECIAL_CHARS

    INVALID_MSG = f"The password must consist of {MIN_LENGTH}-{MAX_LENGTH} characters. Apart from letters and numbers, you may also use special characters from this list: <code>{VALID_SPECIAL_CHARS}</code>"

    @classmethod
    def validate(cls, v: object):
        if not isinstance(v, str):
            msg = "Not a string"
            raise TypeError(msg)

        if not cls.REGEX.match(v):
            raise ValueError(cls.INVALID_MSG)

        return v


Password = Annotated[
    str,
    AfterValidator(PasswordValidators.validate),
    WithJsonSchema({"type": "string", "pattern": PasswordValidators.PATTERN}),
]


class Role(str, Enum):
    ADMIN = "admin"
    """Grants full access to all users, including account creation, account deletion and role management."""

    DATA_MANAGER = "data-manager"
    """Grants full access to all data (source data and label data)."""

    PROJECT_MANAGER = "project-manager"
    """Grants full access to all projects (but not necessarily the data used in each project)."""

    SUPERVISOR = "supervisor"
    """Can supervise for a task in any project."""

    ANNOTATOR = "annotator"
    """Can annotate for a task in any project."""


class UserRole(SQLModel, table=True):
    __tablename__: ClassVar[Any] = "user_role"

    user_id: int = Field(
        foreign_key="user.id",
        ondelete="CASCADE",
        primary_key=True,
        nullable=False,
    )
    role: Role = Field(sa_type=sqlmodel_sa_type(String(31)), primary_key=True, nullable=False)


class _UserBase(OptimisticLockingSQLModel):
    username: Username = Field(sa_type=sqlmodel_sa_type(String(31)), nullable=False, unique=True)

    created_at: datetime = Field(
        sa_type=UTCDateTime,
        default_factory=lambda: datetime.now().astimezone(),
    )
    prev_login_at: datetime | None = Field(sa_type=UTCDateTime, default=None)
    current_login_at: datetime | None = Field(sa_type=UTCDateTime, default=None)


class User(_UserBase, table=True):
    __tablename__: ClassVar[Any] = "user"

    # Authentication material belongs only to the persistence model. Keeping
    # it off _UserBase prevents UserPublic (and every API response using it)
    # from serializing even a one-way password hash.
    password_hash: str = Field(sa_type=sqlmodel_sa_type(String(127)), nullable=False)

    id: int | None = Field(
        default=None,
        sa_type=sqlmodel_sa_type(SmallInteger().with_variant(Integer, "sqlite")),
        primary_key=True,
        sa_column_kwargs={"autoincrement": True},
        ge=-32768,
        le=32767,
    )

    role_links: list[UserRole] = Relationship()

    @classmethod
    def get_role_links_cls(cls):
        return UserRole

    @property
    def roles(self) -> Set[Role]:
        return {record.role for record in self.role_links}


class UserCreate(SQLModel):
    username: Username
    password: Password
    roles: Set[Role]


class UserPublic(_UserBase):
    id: int
    roles: Set[Role]

    def __hash__(self) -> int:
        return hash(self.id)

    def has_role(self, *roles: Role) -> bool:
        """Tests whether this user has any of the given roles."""
        return any(role in self.roles for role in roles)


class UserUpdate(OptimisticLockingUpdate):
    # `password` is not a column -- it is hashed into the NOT NULL `password_hash` -- but a
    # null arriving under that name reaches get_password_hash() and fails as a TypeError,
    # so it is forbidden alongside the derived column requirements. `current_password` is
    # deliberately absent: it is popped before any write, and omitting it is how a
    # non-self-service edit (which needs no proof of the old password) is expressed.
    _null_forbidden_fields: ClassVar[frozenset[str]] = non_nullable_field_names(_UserBase) | {
        "password"
    }

    username: Username | None = None
    password: Password | None = None
    current_password: str | None = None
    roles: Set[Role] | None = None


class UserBulkUpdate(SQLModel):
    roles: Set[Role] | None = None
