from collections.abc import Sequence
from datetime import date
from enum import Enum
from typing import ClassVar, Optional

from sqlalchemy.sql.sqltypes import Date, Integer, SmallInteger, String, Text
from sqlmodel import Field, Relationship, SQLModel

from .account import Account, AccountPublic
from .base import OptimisticLockingSQLModel
from .label.group import LabelGroup, LabelGroupPublic
from .project import Project, ProjectPublic
from .source.group import SourceGroup, SourceGroupPublic
from .types import Name, QualityRank


class WorkType(str, Enum):
    """The type of work to conduct in the annotation editor."""

    ANNOTATE = 'annotate'
    REVIEW = 'review'


class TaskSupervisor(SQLModel, table=True):
    __tablename__: ClassVar[str] = 'task_supervisor'

    task_id: int = Field(
        foreign_key='task.id',
        ondelete='CASCADE',
        primary_key=True,
        nullable=False,
    )
    task: "Task" = Relationship(back_populates="supervisor_links")

    account_id: int = Field(
        foreign_key='account.id',
        ondelete='CASCADE',
        primary_key=True,
        nullable=False,
    )
    account: Account = Relationship()


class TaskAnnotator(SQLModel, table=True):
    __tablename__: ClassVar[str] = 'task_annotator'

    task_id: int = Field(
        foreign_key='task.id',
        ondelete='CASCADE',
        primary_key=True,
        nullable=False,
    )
    task: "Task" = Relationship(back_populates="annotator_links")

    account_id: int = Field(
        foreign_key='account.id',
        ondelete='CASCADE',
        primary_key=True,
        nullable=False,
    )
    account: Account = Relationship()

    quality_rank: QualityRank = Field(sa_type=SmallInteger, nullable=False)


class _TaskBase(OptimisticLockingSQLModel):
    name: Name = Field(sa_type=String(255), nullable=False, unique=True)
    description: str = Field(sa_type=Text, nullable=False, default='')
    deadline: date | None = Field(sa_type=Date, default=None)

    project_id: int = Field(foreign_key='project.id', ondelete='CASCADE', nullable=False)
    parent_id: int | None = Field(foreign_key='task.id', ondelete='SET NULL', default=None)

    source_group_id: int | None = Field(
        foreign_key='source_group.id',
        ondelete='SET NULL',
    )
    label_group_id: int | None = Field(
        foreign_key='label_group.id',
        ondelete='SET NULL',
    )


class Task(_TaskBase, table=True):
    __tablename__: ClassVar[str] = 'task'

    id: int | None = Field(
        default=None,
        sa_type=Integer,
        primary_key=True,
        sa_column_kwargs={"autoincrement": True},
    )

    project: Project = Relationship(back_populates='tasks')

    parent: Optional["Task"] = Relationship(
        back_populates='children',
        sa_relationship_kwargs={"remote_side": "Task.id"},
    )
    children: list["Task"] = Relationship(
        back_populates='parent',
        cascade_delete=True,
    )

    source_group: SourceGroup | None = Relationship()
    label_group: LabelGroup | None = Relationship()

    supervisor_links: list[TaskSupervisor] = Relationship(back_populates="task")
    annotator_links: list[TaskAnnotator] = Relationship(back_populates="task")

    @classmethod
    def get_supervisor_links_cls(cls) -> type[TaskSupervisor]:
        return TaskSupervisor

    @classmethod
    def get_annotator_links_cls(cls) -> type[TaskAnnotator]:
        return TaskAnnotator

    @property
    def supervisors(self) -> Sequence[Account]:
        return [link.account for link in self.supervisor_links]

    @property
    def supervisor_ids(self) -> Sequence[int]:
        return [link.account_id for link in self.supervisor_links]

    @property
    def annotators(self) -> Sequence[Account]:
        annotator_links = sorted(self.annotator_links, key=lambda x: x.quality_rank)
        return [link.account for link in annotator_links]

    @property
    def annotator_ids(self) -> Sequence[int]:
        return [link.account_id for link in self.annotator_links]


class TaskCreate(_TaskBase):
    supervisor_ids: list[int] = Field(default_factory=list)
    annotator_ids: list[int] = Field(default_factory=list)


class TaskPublic(_TaskBase):
    id: int

    children: list["TaskPublic"]

    supervisors: list[AccountPublic]
    annotators: list[AccountPublic]

    def __hash__(self) -> int:
        return hash(self.id)


class TaskPublicWithParents(TaskPublic):
    project: ProjectPublic
    parent: TaskPublic | None

    source_group: SourceGroupPublic | None
    label_group: LabelGroupPublic | None


class TaskUpdate(SQLModel):
    name: Name | None = None
    description: str | None = None
    deadline: date | None = None

    parent_id: int | None = None

    supervisor_ids: list[int] | None = None
    annotator_ids: list[int] | None = None


class TaskBulkUpdate(SQLModel):
    description: str | None = None
    deadline: date | None = None

    parent_id: int | None = None

    supervisor_ids: list[int] | None = None
    annotator_ids: list[int] | None = None


# Avoid issues caused by circular import
ProjectPublic.model_rebuild()
