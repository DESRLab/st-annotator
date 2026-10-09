from collections.abc import Mapping, Sequence
from datetime import datetime
from enum import IntEnum
from typing import ClassVar, TypeAlias

from pydantic import AwareDatetime, BaseModel
from sqlalchemy.orm import declared_attr
from sqlalchemy.sql.schema import ForeignKeyConstraint, Index
from sqlalchemy.sql.sqltypes import Integer, SmallInteger, String
from sqlmodel import Field, Relationship, SQLModel

from sta.common.database.types import JSONB
from sta.common.utils.json import JSONType

from ..base import OptimisticLockingSQLModel
from ..types import Name
from ..user import User
from .group import LabelGroup, LabelGroupPublic

OperationParamsType: TypeAlias = JSONType | Mapping[str, BaseModel] | Sequence[BaseModel] | BaseModel


class LabelsetCommitInstruction(BaseModel):
    op_name: Name
    op_params: OperationParamsType = None

    timestamp: AwareDatetime = Field(default_factory=lambda: datetime.now().astimezone())

    result_placeholder_key: str | None = None
    """
    This is used to pass the output of this operation
    to the input of subsequent operations via :class:`Placeholders`.
    """

    overwrites: list["LabelsetCommitInstruction"] = Field(default_factory=list)
    """The commits that are overwritten by the operation."""


class LabelsetOperationMetadata(BaseModel):
    """
    A JSON representation of an :class:`Operation` that can be stored in the database.

    You should instantiate this through :class:`OperationRegistry` in order to apply validation.
    """

    op_name: Name
    op_params: OperationParamsType

    author_id: int
    timestamp: AwareDatetime = Field(default_factory=lambda: datetime.now().astimezone())

    overwrites: list[LabelsetCommitInstruction] = Field(default_factory=list)


class _LabelsetCommitBase(OptimisticLockingSQLModel):
    group_id: int = Field(
        foreign_key='label_group.id',
        ondelete='CASCADE',
        primary_key=True,
        nullable=False,
    )
    hash: str = Field(
        sa_type=String(40),
        min_length=40,
        max_length=40,
        primary_key=True,
        nullable=False,
    )

    operations: list[LabelsetOperationMetadata] = Field(sa_type=JSONB)


class LabelsetCommit(_LabelsetCommitBase, table=True):
    __tablename__: ClassVar[str] = 'labelset_commit'

    group: LabelGroup = Relationship()

    _parents_labelset_edge: list["LabelsetEdge"] = Relationship(
        back_populates='child',
        cascade_delete=True,
        sa_relationship_kwargs={
            "foreign_keys": 'LabelsetEdge.group_id,LabelsetEdge.child_hash',
            "overlaps": 'group,_children_labelset_edge',
            "viewonly": True,
        },
    )
    _children_labelset_edge: list["LabelsetEdge"] = Relationship(
        back_populates='parent',
        cascade_delete=True,
        sa_relationship_kwargs={
            "foreign_keys": 'LabelsetEdge.group_id,LabelsetEdge.parent_hash',
            "overlaps": 'group,_parents_labelset_edge',
            "viewonly": True,
        },
    )

    @classmethod
    def get_parent_links_cls(cls):
        return LabelsetEdge

    @classmethod
    def get_child_links_cls(cls):
        return LabelsetEdge

    @property
    def parents(self) -> Sequence["LabelsetCommit"]:
        return [link.parent for link in self._parents_labelset_edge]

    @property
    def children(self) -> Sequence["LabelsetCommit"]:
        return [link.child for link in self._children_labelset_edge]


class LabelsetCommitCreate(_LabelsetCommitBase):
    parent_hashes: list[str]


class LabelsetCommitPublic(_LabelsetCommitBase):
    group: LabelGroupPublic

    def __hash__(self) -> int:
        return hash((self.group_id, self.hash))


class LabelsetCommitPublicWithParents(LabelsetCommitPublic):
    parents: list[LabelsetCommitPublic]


class LabelsetCommitPublicWithChildren(LabelsetCommitPublic):
    children: list[LabelsetCommitPublic]


class LabelsetCommitUpdate(SQLModel):
    operations: list[LabelsetOperationMetadata] | None = None


class _LabelsetEdgeBase(SQLModel):
    group_id: int = Field(
        foreign_key='label_group.id',
        ondelete='CASCADE',
        primary_key=True,
        nullable=False,
    )
    parent_hash: str = Field(primary_key=True, nullable=False)
    child_hash: str = Field(primary_key=True, nullable=False)


class LabelsetEdge(_LabelsetEdgeBase, table=True):
    """Represents a directed edge in the repository graph, where a child commit points to its parent."""

    __tablename__: ClassVar[str] = 'labelset_edge'

    @declared_attr.directive
    def __table_args__(cls):
        return (
            ForeignKeyConstraint(
                ['group_id', 'parent_hash'],
                ['labelset_commit.group_id', 'labelset_commit.hash'],
                ondelete='CASCADE',
                onupdate='CASCADE',
            ),
            ForeignKeyConstraint(
                ['group_id', 'child_hash'],
                ['labelset_commit.group_id', 'labelset_commit.hash'],
                ondelete='CASCADE',
                onupdate='CASCADE',
            ),
            # It is redundant to create index for (group_id, parent_hash) as there is already one for the primary key
            Index(f'ix_{cls.__tablename__}_group_child', 'group_id', 'child_hash'),
        )

    group: LabelGroup = Relationship()

    parent: LabelsetCommit = Relationship(
        back_populates='_children_labelset_edge',
        sa_relationship_kwargs={
            "foreign_keys": 'LabelsetEdge.group_id,LabelsetEdge.parent_hash',
            "overlaps": 'group,child',
        },
    )
    child: LabelsetCommit = Relationship(
        back_populates='_parents_labelset_edge',
        sa_relationship_kwargs={
            "foreign_keys": 'LabelsetEdge.group_id,LabelsetEdge.child_hash',
            "overlaps": 'group,parent',
        },
    )


class BranchPermissionLevel(IntEnum):
    NONE = 0
    """No permissions are granted."""

    READ = 1
    """Can view the details of the branch as well as any data committed to it."""

    WRITE = 2
    """Can push new commits to the branch."""

    WRITE_ELEVATED = 3
    """Can rewrite the history of the branch."""

    ADMIN = 4
    """Grants full access to the branch, including branch renaming, branch deletion and permission management."""


class _LabelsetBranchBase(OptimisticLockingSQLModel):
    group_id: int = Field(
        foreign_key='label_group.id',
        ondelete='CASCADE',
        nullable=False,
    )

    head_hash: str = Field(nullable=False)
    checkpoint_hash: str | None = Field(default=None)

    name: str = Field(sa_type=String(255), nullable=False)


class LabelsetBranch(_LabelsetBranchBase, table=True):
    __tablename__: ClassVar[str] = 'labelset_branch'

    id: int | None = Field(
        default=None,
        sa_type=Integer,
        primary_key=True,
        sa_column_kwargs={"autoincrement": True},
    )

    group: LabelGroup = Relationship()

    __table_args__ = (
        ForeignKeyConstraint(
            ['group_id', 'head_hash'],
            ['labelset_commit.group_id', 'labelset_commit.hash'],
            ondelete='CASCADE',
            onupdate='CASCADE',
        ),
        ForeignKeyConstraint(
            ['group_id', 'checkpoint_hash'],
            ['labelset_commit.group_id', 'labelset_commit.hash'],
            ondelete='CASCADE',
            onupdate='CASCADE',
        ),
    )

    head: LabelsetCommit = Relationship(
        sa_relationship_kwargs={
            "foreign_keys": 'LabelsetBranch.group_id,LabelsetBranch.head_hash',
            "overlaps": 'group,checkpoint',
        },
    )
    checkpoint: LabelsetCommit | None = Relationship(
        sa_relationship_kwargs={
            "foreign_keys": 'LabelsetBranch.group_id,LabelsetBranch.checkpoint_hash',
            "overlaps": 'group,head',
        },
    )

    perm_links: list["BranchPermission"] = Relationship(
        back_populates="branch",
        cascade_delete=True,
    )

    @classmethod
    def get_perm_links_cls(cls) -> type["BranchPermission"]:
        return BranchPermission

    @property
    def perm_lv_by_user_id(self) -> Mapping[int, BranchPermissionLevel]:
        return {link.user_id: link.permission_lv for link in self.perm_links}


class LabelsetBranchCreate(_LabelsetBranchBase):
    perm_lv_by_user_id: dict[int, BranchPermissionLevel]


class LabelsetBranchPublic(_LabelsetBranchBase):
    id: int

    group: LabelGroupPublic
    head: LabelsetCommitPublic
    checkpoint: LabelsetCommitPublic | None

    perm_lv_by_user_id: dict[int, BranchPermissionLevel]

    def __hash__(self) -> int:
        return hash(self.id)


class LabelsetBranchUpdate(SQLModel):
    name: str | None = None

    head_hash: str | None = None
    checkpoint_hash: str | None = None

    perm_lv_by_user_id: dict[int, BranchPermissionLevel] | None = None


class BranchPermission(SQLModel, table=True):
    __tablename__: ClassVar[str] = 'branch_permission'

    branch_id: int = Field(
        foreign_key='labelset_branch.id',
        ondelete='CASCADE',
        primary_key=True,
        nullable=False,
    )
    branch: LabelsetBranch = Relationship(back_populates="perm_links")

    user_id: int = Field(
        foreign_key='user.id',
        ondelete='CASCADE',
        primary_key=True,
        nullable=False,
    )
    user: User = Relationship()

    permission_lv: BranchPermissionLevel = Field(sa_type=SmallInteger, nullable=False)


class GraphDistance(SQLModel, table=True):
    """Stores the distance matrix for the commit graph."""

    __tablename__: ClassVar[str] = 'distance_matrix'

    group_id: int = Field(
        foreign_key='label_group.id',
        ondelete='CASCADE',
        primary_key=True,
        nullable=False,
    )
    src_hash: str = Field(primary_key=True, nullable=False)  # Ancestor
    dst_hash: str = Field(primary_key=True, nullable=False)  # Descendant

    distance: int = Field(sa_type=Integer, nullable=False)

    @declared_attr.directive
    def __table_args__(cls):
        return (
            ForeignKeyConstraint(
                ['group_id', 'src_hash'],
                ['labelset_commit.group_id', 'labelset_commit.hash'],
                ondelete='CASCADE',
                onupdate='CASCADE',
            ),
            ForeignKeyConstraint(
                ['group_id', 'dst_hash'],
                ['labelset_commit.group_id', 'labelset_commit.hash'],
                ondelete='CASCADE',
                onupdate='CASCADE',
            ),
            # It is redundant to create index for (group_id, src_hash) as there is already one for the primary key
            Index(f'ix_{cls.__tablename__}_group_dst', 'group_id', 'dst_hash'),
        )

    group: LabelGroup = Relationship()

    src_commit: LabelsetCommit = Relationship(
        sa_relationship_kwargs={
            "foreign_keys": 'GraphDistance.group_id,GraphDistance.src_hash',
            "overlaps": 'group,dst_commit',
        },
    )
    dst_commit: LabelsetCommit = Relationship(
        sa_relationship_kwargs={
            "foreign_keys": 'GraphDistance.group_id,GraphDistance.dst_hash',
            "overlaps": 'group,src_commit',
        },
    )
