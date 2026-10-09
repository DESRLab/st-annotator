from datetime import datetime
from typing import Any

from sqlalchemy.orm import declared_attr
from sqlalchemy.sql.schema import Index
from sqlalchemy.sql.sqltypes import BigInteger, Boolean, Integer, String
from sqlmodel import Field, Relationship

from sta.common.database.types import UTCDateTime

from .account import Account, AccountPublic
from .base import OptimisticLockingSQLModel, PartialSTBoundsSQLMixin
from .label.repo import LabelsetBranch, LabelsetBranchPublic
from .source.group import SourceGroup, SourceGroupPublic
from .task import Task, TaskPublic, WorkType


class _FrameBase(PartialSTBoundsSQLMixin(), OptimisticLockingSQLModel):
    work_type: WorkType = Field(sa_type=String(32), nullable=False)
    last_viewed_at: datetime | None = Field(sa_type=UTCDateTime, default=None)
    is_complete: bool = Field(sa_type=Boolean, nullable=False, default=False)

    task_id: int = Field(foreign_key='task.id', ondelete='CASCADE', nullable=False)
    account_id: int = Field(foreign_key='account.id', ondelete='CASCADE', nullable=False)

    source_group_id: int | None = Field(
        foreign_key='source_group.id',
        ondelete='SET NULL',
    )
    label_branch_id: int | None = Field(
        foreign_key='labelset_branch.id',
        ondelete='SET NULL',
    )


class Frame(_FrameBase, table=True):
    id: int | None = Field(
        default=None,
        sa_type=BigInteger().with_variant(Integer, 'sqlite'),
        primary_key=True,
    )

    task: Task = Relationship()
    account: Account = Relationship()

    source_group: SourceGroup | None = Relationship()
    label_branch: LabelsetBranch | None = Relationship()

    @declared_attr.directive
    def __table_args__(cls) -> tuple[Any, ...]:
        return (
            Index(f'ix_{cls.__tablename__}_task_account', 'task_id', 'account_id'),
        )


class FrameCreate(_FrameBase):
    pass


class FramePublic(_FrameBase):
    id: int

    def __hash__(self) -> int:
        return hash(self.id)


class FramePublicWithParents(FramePublic):
    task: TaskPublic
    account: AccountPublic

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
