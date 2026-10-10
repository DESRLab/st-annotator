from datetime import datetime
from typing import Any

from pydantic import field_serializer, field_validator
from sqlalchemy.orm import declared_attr
from sqlalchemy.sql.schema import Index
from sqlalchemy.sql.sqltypes import BigInteger, Boolean, Integer, String
from sqlmodel import Field, Relationship

from sta.common.database.types import UTCDateTime
from sta.models.base import sqlmodel_sa_type

from .account import Account, AccountPublicSummary
from .base import OptimisticLockingSQLModel, PartialSTBoundsSQLMixin
from .label.repo import LabelsetBranch, LabelsetBranchPublic
from .source.group import SourceGroup, SourceGroupPublic
from .task import Task, TaskPublicFlat, WorkType


class _FrameBase(PartialSTBoundsSQLMixin(), OptimisticLockingSQLModel):
    work_type: WorkType = Field(sa_type=sqlmodel_sa_type(String(32)), nullable=False)
    last_viewed_at: datetime | None = Field(sa_type=UTCDateTime, default=None)

    @field_validator("work_type", mode="before")
    @classmethod
    def _validate_work_type(cls, value: WorkType | str) -> WorkType:
        return value if isinstance(value, WorkType) else WorkType(value)

    @field_serializer("work_type")
    def _serialize_work_type(self, value: WorkType | str) -> str:
        return value.value if isinstance(value, WorkType) else WorkType(value).value

    is_complete: bool = Field(sa_type=Boolean, nullable=False, default=False)

    task_id: int = Field(foreign_key="task.id", ondelete="CASCADE", nullable=False)
    account_id: int = Field(foreign_key="account.id", ondelete="CASCADE", nullable=False)

    source_group_id: int | None = Field(
        foreign_key="source_group.id",
        ondelete="SET NULL",
    )
    label_branch_id: int | None = Field(
        foreign_key="labelset_branch.id",
        ondelete="SET NULL",
    )


class Frame(_FrameBase, table=True):
    id: int | None = Field(
        default=None,
        sa_type=sqlmodel_sa_type(BigInteger().with_variant(Integer, "sqlite")),
        primary_key=True,
    )

    task: Task = Relationship()
    account: Account = Relationship()

    source_group: SourceGroup | None = Relationship()
    label_branch: LabelsetBranch | None = Relationship()

    @declared_attr.directive
    def __table_args__(cls) -> tuple[Any, ...]:
        return (Index(f"ix_{cls.__tablename__}_task_account", "task_id", "account_id"),)


class FrameCreate(_FrameBase):
    pass


class FramePublic(_FrameBase):
    id: int

    def __hash__(self) -> int:
        return hash(self.id)


class FramePublicWithParents(FramePublic):
    # ``TaskPublicFlat`` rather than ``TaskPublic``: the task subtree is
    # recursive and unbounded by depth, and no frame consumer reads it. See
    # sta.models.task.TaskPublicFlat for the invariant this keeps.
    task: TaskPublicFlat
    # A frame is read by everybody who may see its task, so its owner is
    # projected with AccountPublicSummary rather than AccountPublic.
    account: AccountPublicSummary

    source_group: SourceGroupPublic | None
    label_branch: LabelsetBranchPublic | None


class FrameUpdate(_FrameBase.get_update_cls()):
    source_group_id: int | None = None
    label_branch_id: int | None = None

    last_viewed_at: datetime | None = None
    is_complete: bool | None = None


class FrameBulkUpdate(_FrameBase.get_update_cls()):
    source_group_id: int | None = None
    label_branch_id: int | None = None

    last_viewed_at: datetime | None = None
    is_complete: bool | None = None
