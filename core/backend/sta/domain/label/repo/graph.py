import uuid
from collections.abc import Callable, Iterable, Mapping
from contextlib import nullcontext
from hashlib import sha1
from http import HTTPStatus

from fastapi import HTTPException
from pydantic import BaseModel
from sqlmodel import Field, Session, insert, literal, select

from sta.common.database.execution import execute_statement, sql_column
from sta.common.perf import PerformanceCounter
from sta.common.utils.json import JSONType

from ....models.label.repo import (
    BranchPermissionLevel,
    GraphDistance,
    LabelsetBranch,
    LabelsetBranchCreate,
    LabelsetBranchPublic,
    LabelsetCommit,
    LabelsetCommitCreate,
    LabelsetCommitInstruction,
    LabelsetEdge,
    LabelsetOperationMetadata,
)
from ...users import UserPublic
from . import branches, commits
from .ops import InvalidOpName, InvalidOpParams, OperationRegistry
from .ops.special import ImportLabelDataParams, SpecialOperationType
from .placeholder import Placeholders, match_placeholder_key


def _iter_placeholder_references(value: object, keys: set[str]) -> Iterable[str]:
    if isinstance(value, (str, uuid.UUID)):
        # ``uuid.UUID`` is required here: request-body validation coerces a
        # braced placeholder key into a UUID and drops the braces, so a
        # string-only scan misses every id reference. See
        # :func:`match_placeholder_key` for why the braces are reconstructed.
        if (key := match_placeholder_key(value, keys)) is not None:
            yield key
        return
    if isinstance(value, BaseModel):
        for field_name in type(value).model_fields:
            yield from _iter_placeholder_references(getattr(value, field_name), keys)
        return
    if isinstance(value, Mapping):
        for item in value.values():
            yield from _iter_placeholder_references(item, keys)
        return
    if isinstance(value, (list, tuple)):
        for item in value:
            yield from _iter_placeholder_references(item, keys)


def _validate_commit_batch(
    op_registry: OperationRegistry,
    commit_instrs: list[LabelsetCommitInstruction],
    placeholder_keys: list[str],
) -> None:
    """Reject malformed batches before any operation can mutate state."""
    key_set = set(placeholder_keys)
    if len(key_set) != len(placeholder_keys):
        raise HTTPException(HTTPStatus.BAD_REQUEST, "Placeholder keys must be unique.")

    resolved_keys: set[str] = set()
    for instr in commit_instrs:
        references = set(_iter_placeholder_references(instr.op_params, key_set))
        premature = references - resolved_keys
        if premature:
            raise HTTPException(
                HTTPStatus.BAD_REQUEST,
                f"Placeholder keys referenced before resolution: {sorted(premature)}",
            )

        result_key = instr.result_placeholder_key
        if result_key is not None:
            if result_key not in key_set:
                raise HTTPException(
                    HTTPStatus.BAD_REQUEST,
                    f"Result placeholder key was not declared: {result_key}",
                )
            if result_key in resolved_keys:
                raise HTTPException(
                    HTTPStatus.BAD_REQUEST,
                    f"Result placeholder key is assigned more than once: {result_key}",
                )
            resolved_keys.add(result_key)

        if not references:
            try:
                op_registry.create_op(instr.op_name, instr.op_params)
            except (InvalidOpName, InvalidOpParams) as exc:
                raise HTTPException(HTTPStatus.BAD_REQUEST, str(exc)) from exc

    unresolved = key_set - resolved_keys
    if unresolved:
        raise HTTPException(
            HTTPStatus.BAD_REQUEST,
            f"Placeholder keys are never resolved: {sorted(unresolved)}",
        )


# Based on: https://stackoverflow.com/questions/35430584/how-is-the-git-hash-calculated
def _compute_hash(
    operations: list[LabelsetOperationMetadata] | list[dict[str, object]],
    parents: list[LabelsetCommit],
):
    hasher = sha1(usedforsecurity=False)

    for op in operations:
        metadata = (
            op
            if isinstance(op, LabelsetOperationMetadata)
            else LabelsetOperationMetadata.model_validate(op)
        )
        hasher.update(metadata.model_dump_json().encode())
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
    group_id_column = sql_column(table_cls.group_id)
    src_hash_column = sql_column(table_cls.src_hash)
    dst_hash_column = sql_column(table_cls.dst_hash)
    distance_column = sql_column(table_cls.distance)

    q = (
        select(
            group_id_column,
            src_hash_column,
            literal(dst2_hash, type_=dst_hash_column.type).label(dst_hash_column.key),
            (distance_column + add_value).label(distance_column.key),
        )
        .where(group_id_column == group_id)
        .where(dst_hash_column == dst1_hash)
    )

    return insert(table_cls).from_select(
        [group_id_column.key, src_hash_column.key, dst_hash_column.key, distance_column.key],
        q,
    )


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
        execute_statement(session, insert_q)


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
        # Mirror the from-scratch path below: a branch's checkpoint always starts
        # at its head and only an explicit checkpoint op moves it. Pointing at a
        # shared commit also pins it against deletion, like the head FK already
        # does, so this adds no new lifetime guarantee.
        return branches.create_branch(
            current_user=current_user,
            session=session,
            data=LabelsetBranchCreate(
                group_id=data.group_id,
                head_hash=data.commit_hash,
                checkpoint_hash=data.commit_hash,
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

    # Make the in-progress commit the locked branch's transactional head so
    # label-domain writes can authorize solely from branch permissions. A
    # failed operation rolls this change back with the rest of the push.
    branch.head_hash = commit.hash
    session.add(branch)
    session.flush([branch])

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

        try:
            resolved_params = placeholders.get_resolved_params(instr.op_params)
            op = op_registry.create_op(instr.op_name, resolved_params)
        except (InvalidOpName, InvalidOpParams, KeyError, ValueError, RuntimeError) as exc:
            raise HTTPException(HTTPStatus.BAD_REQUEST, str(exc)) from exc

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
    last_fetched_head_hash: str | None = None,
    allow_special: bool = False,
    insert_hash_to_distance_perf: PerformanceCounter | None = None,
) -> tuple[LabelsetBranchPublic, list[JSONType | uuid.UUID]]:
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

    Returns
    -------
    branch_public : LabelsetBranchPublic
        The branch as committed by this push. It is snapshotted from the branch
        row this transaction already locked and refreshed, so callers never need
        to re-read it (a re-read could adopt a head written by an interleaving
        client without adopting its changes).
    op_results : list of JSONType or uuid.UUID
        The result of each applied operation, in the order they were applied.
    """
    branch = branches.read_branch(
        current_user=current_user,
        session=session,
        id=branch_id,
        for_update=True,
    )
    if last_fetched_head_hash is not None and branch.head_hash != last_fetched_head_hash:
        raise HTTPException(
            HTTPStatus.CONFLICT,
            "The branch changed after it was fetched. Refresh and retry the push.",
        )

    # Reading a branch only proves visibility. Mutating its history requires
    # WRITE; assigned annotators/reviewers retain access through branch perms.
    branches.require_write_branch(
        current_user,
        session,
        id=branch_id,
        perm_lv=BranchPermissionLevel.WRITE,
    )
    _validate_commit_batch(op_registry, commit_instrs, placeholder_keys)

    prev_commit = branch.head
    next_commit = commits.create_commit(
        current_user=current_user,
        session=session,
        data=LabelsetCommitCreate(
            group_id=branch.group_id,
            # Operations may produce IDs used by later placeholder params. Use
            # a temporary identity, apply them, then replace it with content's
            # resolved hash. Composite FKs use ON UPDATE CASCADE.
            hash=uuid.uuid4().hex + uuid.uuid4().hex[:8],
            operations=[],
            parent_hashes=[prev_commit.hash],
        ),
    )

    # Operations run against temporary commit identity and may query its
    # ancestry (checkpoint state materialization does). Establish graph
    # distances before applying them; changing commit to resolved hash below
    # cascades these temporary references atomically.
    with insert_hash_to_distance_perf or nullcontext():
        _update_graph_distance(
            session,
            group_id=prev_commit.group_id,
            prev_hash=prev_commit.hash,
            next_hash=next_commit.hash,
        )

    results = _apply_commits(
        current_user=current_user,
        session=session,
        op_registry=op_registry,
        branch=branch,
        commit=next_commit,
        commit_instrs=commit_instrs,
        placeholder_keys=placeholder_keys,
        allow_special=allow_special,
    )

    resolved_hash = _compute_hash(next_commit.operations, parents=[prev_commit])
    next_commit.hash = resolved_hash
    session.add(next_commit)
    session.flush([next_commit])

    branch.head_hash = resolved_hash
    session.add(branch)
    session.flush([branch])

    session.refresh(branch)

    # Snapshot the committed state here: `branch` is the row this transaction
    # locked at the start of the push, so this is the head this push produced,
    # not whatever a concurrent writer may have moved afterwards.
    return LabelsetBranchPublic.model_validate(branch), results


def import_data(
    *,
    current_user: UserPublic,
    session: Session,
    op_registry: OperationRegistry,
    branch_id: int,
    import_func: Callable[[UserPublic, Session, LabelsetCommit], None],
    metadata: JSONType = None,
) -> list[JSONType | uuid.UUID]:
    _, results = _push_commits(
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
    return results


def checkpoint(
    *,
    current_user: UserPublic,
    session: Session,
    op_registry: OperationRegistry,
    branch_id: int,
) -> list[JSONType | uuid.UUID]:
    _, results = _push_commits(
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
    return results


def push_commits_with_branch(
    *,
    current_user: UserPublic,
    session: Session,
    op_registry: OperationRegistry,
    branch_id: int,
    commit_instrs: list[LabelsetCommitInstruction],
    placeholder_keys: list[str] | None = None,
    last_fetched_head_hash: str | None = None,
    insert_hash_to_distance_perf: PerformanceCounter | None = None,
) -> tuple[LabelsetBranchPublic, list[JSONType | uuid.UUID]]:
    """
    Push a batch of commits and return the committed branch alongside the
    results of the pushed operations.

    Use this on any path that has to hand the new head back to the client (e.g.
    the push endpoints). Returning the branch from the same transaction that
    committed it is what makes the client's next save compare against the head
    it actually saw, instead of a head re-read later that an interleaving writer
    may have replaced.
    """
    return _push_commits(
        current_user=current_user,
        session=session,
        op_registry=op_registry,
        branch_id=branch_id,
        commit_instrs=commit_instrs,
        placeholder_keys=placeholder_keys or [],
        last_fetched_head_hash=last_fetched_head_hash,
        insert_hash_to_distance_perf=insert_hash_to_distance_perf,
    )


def push_commits(
    *,
    current_user: UserPublic,
    session: Session,
    op_registry: OperationRegistry,
    branch_id: int,
    commit_instrs: list[LabelsetCommitInstruction],
    placeholder_keys: list[str] | None = None,
    last_fetched_head_hash: str | None = None,
    insert_hash_to_distance_perf: PerformanceCounter | None = None,
) -> list[JSONType | uuid.UUID]:
    """
    Push a batch of commits and return the results of the pushed operations.

    Convenience wrapper over :func:`push_commits_with_branch` for callers that
    only need the operation results; prefer that function when the caller also
    needs the resulting branch state.
    """
    _, results = push_commits_with_branch(
        current_user=current_user,
        session=session,
        op_registry=op_registry,
        branch_id=branch_id,
        commit_instrs=commit_instrs,
        placeholder_keys=placeholder_keys,
        last_fetched_head_hash=last_fetched_head_hash,
        insert_hash_to_distance_perf=insert_hash_to_distance_perf,
    )
    return results


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

    commit_hashes_q = (
        select(GraphDistance.src_hash)
        .where(GraphDistance.group_id == branch.group_id)
        .where(sql_column(GraphDistance.dst_hash) == branch.head.hash)
    )
    commit_hashes = session.exec(commit_hashes_q).all()

    edges_q = (
        select(LabelsetEdge)
        .where(LabelsetEdge.group_id == branch.group_id)
        .where(sql_column(LabelsetEdge.parent_hash).in_(commit_hashes))
        .where(sql_column(LabelsetEdge.child_hash).in_(commit_hashes))
    )
    edges = session.exec(edges_q).all()

    return CommitGraphPublic(
        nodes=[
            CommitGraphNodePublic(group_id=branch.group_id, hash=hash) for hash in commit_hashes
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
