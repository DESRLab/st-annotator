from collections.abc import Sequence
from datetime import date
from enum import Enum
from typing import Any, ClassVar, Optional

from sqlalchemy.sql.sqltypes import Date, Integer, SmallInteger, String, Text
from sqlmodel import Field, Relationship, SQLModel

from sta.models.base import sqlmodel_sa_type

from .account import Account, AccountPublicSummary
from .base import (
    OptimisticLockingSQLModel,
    OptimisticLockingUpdate,
    RequiredFieldNullGuard,
    non_nullable_field_names,
)
from .project import Project, ProjectPublic
from .types import Name, QualityRank


class WorkType(str, Enum):
    """The type of work to conduct in the annotation editor."""

    ANNOTATE = "annotate"
    REVIEW = "review"


class TaskSupervisor(SQLModel, table=True):
    __tablename__: ClassVar[Any] = "task_supervisor"

    task_id: int = Field(
        foreign_key="task.id",
        ondelete="CASCADE",
        primary_key=True,
        nullable=False,
    )
    task: "Task" = Relationship(back_populates="supervisor_links")

    account_id: int = Field(
        foreign_key="account.id",
        ondelete="CASCADE",
        primary_key=True,
        nullable=False,
    )
    account: Account = Relationship()


class TaskAnnotator(SQLModel, table=True):
    __tablename__: ClassVar[Any] = "task_annotator"

    task_id: int = Field(
        foreign_key="task.id",
        ondelete="CASCADE",
        primary_key=True,
        nullable=False,
    )
    task: "Task" = Relationship(back_populates="annotator_links")

    account_id: int = Field(
        foreign_key="account.id",
        ondelete="CASCADE",
        primary_key=True,
        nullable=False,
    )
    account: Account = Relationship()

    quality_rank: QualityRank = Field(sa_type=SmallInteger, nullable=False)


class _TaskBase(OptimisticLockingSQLModel):
    name: Name = Field(sa_type=sqlmodel_sa_type(String(255)), nullable=False, unique=True)
    description: str = Field(sa_type=Text, nullable=False, default="")
    deadline: date | None = Field(sa_type=Date, default=None)

    project_id: int = Field(foreign_key="project.id", ondelete="CASCADE", nullable=False)
    parent_id: int | None = Field(foreign_key="task.id", ondelete="SET NULL", default=None)


class Task(_TaskBase, table=True):
    __tablename__: ClassVar[Any] = "task"

    id: int | None = Field(
        default=None,
        sa_type=Integer,
        primary_key=True,
        sa_column_kwargs={"autoincrement": True},
    )

    project: Project = Relationship(back_populates="tasks")

    parent: Optional["Task"] = Relationship(
        back_populates="children",
        sa_relationship_kwargs={"remote_side": "Task.id"},
    )
    children: list["Task"] = Relationship(
        back_populates="parent",
        cascade_delete=True,
    )

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


class _TaskPublicBase(_TaskBase):
    """Task fields shared by the recursive and non-recursive public shapes."""

    id: int

    # Task membership lists are read by everybody who may see the task, so both
    # use AccountPublicSummary rather than AccountPublic.
    supervisors: list[AccountPublicSummary]
    annotators: list[AccountPublicSummary]
    branch_permission_warnings: list[str] = Field(default_factory=list)

    def __hash__(self) -> int:
        return hash(self.id)


class TaskPublic(_TaskPublicBase):
    children: list["TaskPublic"]


class TaskPublicFlat(_TaskPublicBase):
    """
    Non-recursive projection of :class:`TaskPublic`, minus ``children``.

    ``FramePublicWithParents`` embeds a task in every frame row, and
    :attr:`TaskPublic.children` is unbounded by task-tree depth, so serializing
    a page of frames with the full model pulls -- and emits -- the whole
    descendant subtree of each task. Nothing reads that subtree from a frame
    payload, so frames carry this flat shape instead.

    Keep this in sync with :class:`TaskPublic` (and so with the frontend's
    ``TaskState.PLAIN_SCHEMA``) apart from ``children``: it is a drop-in
    replacement wherever a task is embedded rather than returned on its own.
    Task endpoints still return :class:`TaskPublicWithParents`, tree included.
    """


class TaskPublicWithParents(TaskPublic):
    project: ProjectPublic
    parent: TaskPublic | None


class TaskUpdate(OptimisticLockingUpdate):
    _null_forbidden_fields: ClassVar[frozenset[str]] = non_nullable_field_names(_TaskBase)

    name: Name | None = None
    description: str | None = None
    deadline: date | None = None

    parent_id: int | None = None

    supervisor_ids: list[int] | None = None
    annotator_ids: list[int] | None = None


class TaskBulkUpdate(RequiredFieldNullGuard):
    _null_forbidden_fields: ClassVar[frozenset[str]] = non_nullable_field_names(_TaskBase)

    description: str | None = None
    deadline: date | None = None

    parent_id: int | None = None

    supervisor_ids: list[int] | None = None
    annotator_ids: list[int] | None = None


# Avoid issues caused by circular import
ProjectPublic.model_rebuild()
