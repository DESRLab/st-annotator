import uuid
from collections.abc import Callable
from contextlib import nullcontext
from hashlib import sha1
from http import HTTPStatus

from fastapi import HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import QueryableAttribute
from sqlmodel import Field, Session, insert, literal, select

from sta.common.testing import PerformanceCounter
from sta.common.utils.json import JSONType

from ....models.label.repo import (
    BranchPermissionLevel,
    GraphDistance,
    LabelsetBranch,
    LabelsetBranchCreate,
    LabelsetCommit,
    LabelsetCommitCreate,
    LabelsetCommitInstruction,
    LabelsetEdge,
    LabelsetOperationMetadata,
)
from ...users import UserPublic
from . import branches, commits
from .ops import OperationRegistry
from .ops.special import ImportLabelDataParams, SpecialOperationType
from .placeholder import Placeholders


# Based on: https://stackoverflow.com/questions/35430584/how-is-the-git-hash-calculated
def _compute_hash(
    operations: list[LabelsetOperationMetadata],
    parents: list[LabelsetCommit],
):
    hasher = sha1(usedforsecurity=False)

    for op in operations:
        hasher.update(op.model_dump_json().encode())
    for parent in parents:
        hasher.update(parent.hash.encode())

    return hasher.hexdigest()


def _copy_graph_distance(
    group_id: int,
    dst1_hash: str,
    dst2_hash: str,
    *,
    add_value: int = 0,
):
    """
    Copies a column in the distance matrix (the distance from each commit to `(group_id, dst1_hash)`)
    to another column in the distance matrix (the distance from each commit to `(group_id, dst2_hash)`),
    adding `add_value` to each entry.

    Parameters
    ----------
    group_id : int
        The unique identifier of the label group of the distance matrix.
    dst1_hash : str
        The hash of the commit which column to copy from.
    dst2_hash : str
        The hash of the commit which column to copy to.
    """
    table_cls = GraphDistance
    assert isinstance(table_cls.group_id, QueryableAttribute)
    assert isinstance(table_cls.src_hash, QueryableAttribute)
    assert isinstance(table_cls.dst_hash, QueryableAttribute)
    assert isinstance(table_cls.distance, QueryableAttribute)

    q = select(
        table_cls.group_id,
        table_cls.src_hash,
        literal(dst2_hash, type_=table_cls.dst_hash.type).label(table_cls.dst_hash.key),
        (table_cls.distance + add_value).label(table_cls.distance.key),
    ) \
        .where(table_cls.group_id == group_id) \
        .where(table_cls.dst_hash == dst1_hash)

    return insert(table_cls).from_select([table_cls.group_id.key, table_cls.src_hash.key, table_cls.dst_hash.key, table_cls.distance.key], q)


def _update_graph_distance(
    session: Session,
    group_id: int,
    prev_hash: str | None,
    next_hash: str,
):
    item = GraphDistance(
        group_id=group_id,
        src_hash=next_hash,
        dst_hash=next_hash,
        distance=0,
    )
    session.add(item)
    session.flush([item])

    if prev_hash is not None:
        insert_q = _copy_graph_distance(group_id, prev_hash, next_hash, add_value=1)
        session.execute(insert_q)


class LabelsetBranchInit(BaseModel):
    group_id: int
    commit_hash: str | None = None

    name: str
    perm_lv_by_user_id: dict[int, BranchPermissionLevel] = Field(default_factory=dict)


def init_branch(
    *,
    current_user: UserPublic,
    session: Session,
    op_registry: OperationRegistry,
    data: LabelsetBranchInit,
) -> LabelsetBranch:
    if data.commit_hash is not None:
        return branches.create_branch(
            current_user=current_user,
            session=session,
            data=LabelsetBranchCreate(
                group_id=data.group_id,
                head_hash=data.commit_hash,
                checkpoint_hash=None,
                name=data.name,
                perm_lv_by_user_id=data.perm_lv_by_user_id,
            ),
        )

    op = op_registry.create_op(SpecialOperationType.INIT, {})
    op_metadata = LabelsetOperationMetadata(
        op_name=op.name,
        op_params=op.params,
        author_id=current_user.id,
    )

    head_commit = commits.create_commit(
        current_user=current_user,
        session=session,
        data=LabelsetCommitCreate(
            group_id=data.group_id,
            hash=_compute_hash([op_metadata], parents=[]),
            operations=[op_metadata],
            parent_hashes=[],
        ),
    )

    _update_graph_distance(
        session,
        group_id=data.group_id,
        prev_hash=None,
        next_hash=head_commit.hash,
    )

    op.apply(current_user, session, head_commit)

    return branches.create_branch(
        current_user=current_user,
        session=session,
        data=LabelsetBranchCreate(
            group_id=head_commit.group_id,
            head_hash=head_commit.hash,
            checkpoint_hash=head_commit.hash,
            name=data.name,
            perm_lv_by_user_id=data.perm_lv_by_user_id,
        ),
    )


def _apply_commits(
    current_user: UserPublic,
    session: Session,
    op_registry: OperationRegistry,
    branch: LabelsetBranch,
    commit: LabelsetCommit,
    commit_instrs: list[LabelsetCommitInstruction],
    placeholder_keys: list[str],
    *,
    allow_special: bool = False,
):
    placeholders = Placeholders(placeholder_keys)

    op_metadatas = list[LabelsetOperationMetadata]()
    op_results = list[uuid.UUID | JSONType]()

    for instr in commit_instrs:
        if not allow_special:
            try:
                SpecialOperationType(instr.op_name)
            except ValueError:
                pass
            else:
                raise HTTPException(
                    status_code=HTTPStatus.UNAUTHORIZED,
                    detail="You are not allowed to apply special labelset operations.",
                )

        op = op_registry.create_op(
            instr.op_name,
            placeholders.get_resolved_params(instr.op_params),
        )
        op_metadata = LabelsetOperationMetadata(
            op_name=op.name,
            op_params=op.params,
            author_id=current_user.id,
            timestamp=instr.timestamp,
            overwrites=instr.overwrites,
        )
        op_result = op.apply(current_user, session, commit)

        if op.name == SpecialOperationType.CHECKPOINT:
            branch.checkpoint_hash = commit.hash
            session.add(branch)
            session.flush([branch])
            session.refresh(branch)

        result_placeholder_key = instr.result_placeholder_key
        if result_placeholder_key is not None:
            placeholders.resolve_item(result_placeholder_key, op_result)

        op_metadatas.append(op_metadata)
        op_results.append(op_result)

    if placeholders.unresolved_keys:
        raise HTTPException(
            status_code=HTTPStatus.BAD_REQUEST,
            detail="Failed to resolve all placeholder keys.",
        )

    commit.operations = op_metadatas
    session.add(commit)
    session.flush([commit])
    session.refresh(commit)

    return op_results


def _push_commits(
    *,
    current_user: UserPublic,
    session: Session,
    op_registry: OperationRegistry,
    branch_id: int,
    commit_instrs: list[LabelsetCommitInstruction],
    placeholder_keys: list[str],
    allow_special: bool = False,
    insert_hash_to_distance_perf: PerformanceCounter | None = None,
):
    """
    Apply a sequence of commits to an existing branch and returns its updated state.

    Parameters
    ----------
    branch_id : int
        The unique identifier of the branch to update.
    commit_instrs : list of LabelsetCommitInstruction
        The information of each commit to apply.
    placeholder_keys : list of str, optional
        Before applying a commit, any string in :attr:`LabelsetCommitInstruction.op_params`
        that is found in `placeholder_keys` is parsed as a placeholder object.

        After applying a commit, if :attr:`LabelsetCommitInstruction.result_placeholder_key`
        is not null, the placeholder object with the corresponding key is replaced with the
        result of the commit.

        These placeholder objects enable operations to refer to the results of earlier
        operations before they have been applied.
    allow_special : bool, default False
        `True` if special operations can be applied; otherwise, `False`.
    """
    branch = branches.read_branch(
        current_user=current_user,
        session=session,
        id=branch_id,
        for_update=True,
    )

    # Used for hashing only. The actual metadata is dependant on
    # previous operations and handled in `_apply_commits`.
    dummy_metadatas = [
        LabelsetOperationMetadata(
            op_name=instr.op_name,
            op_params=instr.op_params,
            author_id=current_user.id,
            timestamp=instr.timestamp,
            overwrites=instr.overwrites,
        )
        for instr in commit_instrs
    ]

    prev_commit = branch.head
    next_commit = commits.create_commit(
        current_user=current_user,
        session=session,
        data=LabelsetCommitCreate(
            group_id=branch.group_id,
            hash=_compute_hash(dummy_metadatas, parents=[prev_commit]),
            operations=[],
            parent_hashes=[prev_commit.hash],
        ),
    )

    branch.head_hash = next_commit.hash
    session.add(branch)
    session.flush([branch])
    session.refresh(branch)

    with insert_hash_to_distance_perf or nullcontext():
        _update_graph_distance(
            session,
            group_id=prev_commit.group_id,
            prev_hash=prev_commit.hash,
            next_hash=next_commit.hash,
        )

    return _apply_commits(
        current_user=current_user,
        session=session,
        op_registry=op_registry,
        branch=branch,
        commit=next_commit,
        commit_instrs=commit_instrs,
        placeholder_keys=placeholder_keys,
        allow_special=allow_special,
    )


def import_data(
    *,
    current_user: UserPublic,
    session: Session,
    op_registry: OperationRegistry,
    branch_id: int,
    import_func: Callable[[UserPublic, Session, LabelsetCommit], None],
    metadata: JSONType = None,
):
    return _push_commits(
        current_user=current_user,
        session=session,
        op_registry=op_registry,
        branch_id=branch_id,
        commit_instrs=[
            LabelsetCommitInstruction(
                op_name=SpecialOperationType.IMPORT,
                op_params=ImportLabelDataParams(func=import_func, metadata=metadata),
            ),
        ],
        placeholder_keys=[],
        allow_special=True,
    )


def checkpoint(
    *,
    current_user: UserPublic,
    session: Session,
    op_registry: OperationRegistry,
    branch_id: int,
) -> list[JSONType | uuid.UUID]:
    return _push_commits(
        current_user=current_user,
        session=session,
        op_registry=op_registry,
        branch_id=branch_id,
        commit_instrs=[
            LabelsetCommitInstruction(
                op_name=SpecialOperationType.CHECKPOINT,
                op_params={},
            ),
        ],
        placeholder_keys=[],
        allow_special=True,
    )


def push_commits(
    *,
    current_user: UserPublic,
    session: Session,
    op_registry: OperationRegistry,
    branch_id: int,
    commit_instrs: list[LabelsetCommitInstruction],
    placeholder_keys: list[str] | None = None,
    insert_hash_to_distance_perf: PerformanceCounter | None = None,
) -> list[JSONType | uuid.UUID]:
    return _push_commits(
        current_user=current_user,
        session=session,
        op_registry=op_registry,
        branch_id=branch_id,
        commit_instrs=commit_instrs,
        placeholder_keys=placeholder_keys or [],
        insert_hash_to_distance_perf=insert_hash_to_distance_perf,
    )


class CommitGraphNodePublic(BaseModel):
    group_id: int
    hash: str


class CommitGraphEdgePublic(BaseModel):
    group_id: int
    parent_hash: str
    child_hash: str


class CommitGraphPublic(BaseModel):
    nodes: list[CommitGraphNodePublic]
    edges: list[CommitGraphEdgePublic]


def read_graph(
    *,
    current_user: UserPublic,
    session: Session,
    branch_id: int,
) -> CommitGraphPublic:
    branch = branches.read_branch(
        current_user=current_user,
        session=session,
        id=branch_id,
    )

    assert isinstance(GraphDistance.dst_hash, QueryableAttribute)

    commit_hashes_q = select(GraphDistance.src_hash) \
        .where(GraphDistance.group_id == branch.group_id) \
        .where(GraphDistance.dst_hash == branch.head.hash)
    commit_hashes = session.exec(commit_hashes_q).all()

    assert isinstance(LabelsetEdge.parent_hash, QueryableAttribute)
    assert isinstance(LabelsetEdge.child_hash, QueryableAttribute)

    edges_q = select(LabelsetEdge) \
        .where(LabelsetEdge.parent_hash.in_(commit_hashes)) \
        .where(LabelsetEdge.child_hash.in_(commit_hashes))
    edges = session.exec(edges_q).all()

    return CommitGraphPublic(
        nodes=[
            CommitGraphNodePublic(group_id=branch.group_id, hash=hash)
            for hash in commit_hashes
        ],
        edges=[
            CommitGraphEdgePublic(
                group_id=branch.group_id,
                parent_hash=edge.parent_hash,
                child_hash=edge.child_hash,
            )
            for edge in edges
        ],
    )
