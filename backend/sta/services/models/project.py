from typing import TYPE_CHECKING, ClassVar

from sqlalchemy.sql.sqltypes import Integer, SmallInteger, String, Text
from sqlmodel import Field, Relationship, SQLModel

from sta.common.database.types import JSONB

from .account import Account, AccountPublic
from .base import OptimisticLockingSQLModel
from .configs import ProjectConfig
from .types import Name

if TYPE_CHECKING:
    from .task import Task, TaskPublic


class ProjectMember(SQLModel, table=True):
    __tablename__: ClassVar[str] = 'project_member'

    project_id: int = Field(
        foreign_key='project.id',
        ondelete='CASCADE',
        primary_key=True,
        nullable=False,
    )
    member_id: int = Field(
        foreign_key='account.id',
        ondelete='CASCADE',
        primary_key=True,
        nullable=False,
    )


class _ProjectBase(OptimisticLockingSQLModel):
    name: Name = Field(sa_type=String(255), nullable=False, unique=True)
    description: str = Field(sa_type=Text, nullable=False, default='')
    config: ProjectConfig = Field(sa_type=JSONB, nullable=False, default_factory=ProjectConfig.default)


class Project(_ProjectBase, table=True):
    __tablename__: ClassVar[str] = 'project'

    id: int | None = Field(
        default=None,
        sa_type=SmallInteger().with_variant(Integer, 'sqlite'),
        primary_key=True,
        sa_column_kwargs={"autoincrement": True},
    )

    members: list[Account] = Relationship(cascade_delete=False, link_model=ProjectMember)
    tasks: list["Task"] = Relationship(back_populates='project', cascade_delete=True)

    @classmethod
    def get_member_links_cls(cls) -> type[ProjectMember]:
        return ProjectMember


class ProjectCreate(_ProjectBase):
    member_ids: list[int] = Field(default_factory=list)


class ProjectPublic(_ProjectBase):
    id: int

    members: list[AccountPublic]
    tasks: list["TaskPublic"]

    def __hash__(self) -> int:
        return hash(self.id)


class ProjectUpdate(SQLModel):
    name: Name | None = None
    description: str | None = None
    config: ProjectConfig | None = None

    member_ids: list[int] | None = None


class ProjectBulkUpdate(SQLModel):
    description: str | None = None
    config: ProjectConfig | None = None

    member_ids: list[int] | None = None
