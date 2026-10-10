from collections.abc import Set
from http import HTTPStatus

from fastapi import APIRouter, HTTPException
from sqlmodel import Session, delete, func, insert, select

from sta.common.database.execution import execute_statement, sql_column

from ....models.label.repo import (
    LabelsetBranch,
    LabelsetCommit,
    LabelsetCommitCreate,
)
from ....models.user import Role, UserPublic
from ...auth import require_role
from ..groups import get_valid_group_ids

router = APIRouter(prefix="/commits", tags=["commits"])


def can_read_commit(
    user: UserPublic,
    session: Session,
    commit: LabelsetCommit,
) -> bool:
    if user.has_role(Role.DATA_MANAGER, Role.PROJECT_MANAGER):
        return True

    return commit.group_id in get_valid_group_ids(user, session)


def require_write_commit(
    user: UserPublic,
    session: Session,
    commit: LabelsetCommit | None = None,
):
    if commit is None or not can_read_commit(user, session, commit):
        return require_role(user, Role.DATA_MANAGER)

    return True


def bulk_insert_parents(
    session: Session,
    group_id: int,
    commit_hashes: Set[str],
    parent_hashes: list[str],
) -> None:
    parents_cls = LabelsetCommit.get_parent_links_cls()

    values = [
        dict(group_id=group_id, child_hash=commit_hash, parent_hash=parent_hash)
        for commit_hash in commit_hashes
        for parent_hash in parent_hashes
    ]
    if not values:
        return

    execute_statement(session, insert(parents_cls), values)


def bulk_delete_parents(
    session: Session,
    group_id: int,
    commit_hashes: Set[str],
) -> None:
    parents_cls = LabelsetCommit.get_parent_links_cls()
    q = (
        delete(parents_cls)
        .where(sql_column(parents_cls.group_id) == group_id)
        .where(sql_column(parents_cls.child_hash).in_(commit_hashes))
    )
    # synchronize_session=False: if a commit's parent-edge collection was
    # loaded earlier in this session, the default synchronization would mark
    # those edge objects deleted and break the later ORM add/flush. No caller
    # relies on synchronized state after this delete: delete_commit deletes
    # the record, and the edge relationships are viewonly, so the ORM delete
    # never walks the (possibly stale) loaded collections.
    execute_statement(session, q.execution_options(synchronize_session=False))


def create_commit(
    *,
    current_user: UserPublic,
    session: Session,
    data: LabelsetCommitCreate,
):
    record = LabelsetCommit.model_validate(data)

    session.add(record)
    session.flush([record])

    bulk_insert_parents(session, record.group_id, {record.hash}, data.parent_hashes)

    session.refresh(record)

    return record


def list_commits(
    *,
    current_user: UserPublic,
    session: Session,
    offset: int = 0,
    limit: int | None = None,
    group_id: int | None = None,
):
    q = _build_list_commits_query(
        current_user=current_user,
        session=session,
        offset=offset,
        limit=limit,
        group_id=group_id,
    )

    return session.exec(q).all()


def _build_list_commits_query(
    *,
    current_user: UserPublic,
    session: Session,
    offset: int | None = 0,
    limit: int | None = None,
    group_id: int | None = None,
):
    q = select(LabelsetCommit)

    if group_id is not None:
        q = q.where(LabelsetCommit.group_id == group_id)

    if not current_user.has_role(Role.DATA_MANAGER, Role.PROJECT_MANAGER):
        q = q.where(
            sql_column(LabelsetCommit.group_id).in_(get_valid_group_ids(current_user, session))
        )

    q = q.order_by(
        sql_column(LabelsetCommit.group_id),
        sql_column(LabelsetCommit.hash),
    )

    if offset is not None:
        q = q.offset(offset)
    if limit is not None:
        q = q.limit(limit)

    return q


def count_commits(
    *,
    current_user: UserPublic,
    session: Session,
    group_id: int | None = None,
) -> int:
    q = _build_list_commits_query(
        current_user=current_user,
        session=session,
        offset=None,
        limit=None,
        group_id=group_id,
    )

    return session.exec(select(func.count()).select_from(q.subquery())).one()


def read_commit(
    *,
    current_user: UserPublic,
    session: Session,
    group_id: int,
    commit_hash: str,
):
    q = (
        select(LabelsetCommit)
        .where(LabelsetCommit.group_id == group_id)
        .where(LabelsetCommit.hash == commit_hash)
    )

    record = session.exec(q).one_or_none()
    if not record or not can_read_commit(current_user, session, record):
        raise HTTPException(status_code=HTTPStatus.NOT_FOUND)

    return record


# Commits are content-addressed and therefore immutable: a commit's hash is a
# digest of its operations and its parents' hashes, and every descendant hash
# embeds its ancestors transitively, so a commit cannot be edited in place
# without invalidating its own hash and that of every descendant. There is
# deliberately no update path. To rewrite a branch the way Git does, create a
# replacement commit and delete the one it supersedes: repoint the branch to
# the superseded commit's parent, push the replacement (it lands as the new
# head), then delete the superseded commit, which delete_commit allows once it
# is no longer referenced as a branch head or checkpoint.


def delete_commit(
    *,
    current_user: UserPublic,
    session: Session,
    group_id: int,
    commit_hash: str,
):
    record = session.get(LabelsetCommit, {"group_id": group_id, "hash": commit_hash})
    if not record:
        raise HTTPException(status_code=HTTPStatus.NOT_FOUND)

    require_write_commit(current_user, session, record)

    # Friendly precheck gives callers a useful error. RESTRICT FKs remain the
    # authoritative invariant if another transaction repoints a branch here.
    referring_branch_id = session.exec(
        select(LabelsetBranch.id)
        .where(LabelsetBranch.group_id == record.group_id)
        .where(
            (LabelsetBranch.head_hash == record.hash)
            | (LabelsetBranch.checkpoint_hash == record.hash),
        )
        .limit(1),
    ).first()
    if referring_branch_id is not None:
        raise HTTPException(
            status_code=HTTPStatus.BAD_REQUEST,
            detail="You cannot delete a commit that is a branch head or checkpoint.",
        )

    bulk_delete_parents(session, record.group_id, {record.hash})

    session.delete(record)
    session.flush([record])
