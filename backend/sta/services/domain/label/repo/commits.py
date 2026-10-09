from collections.abc import Set
from http import HTTPStatus

from fastapi import APIRouter, HTTPException
from sqlalchemy.orm import QueryableAttribute
from sqlmodel import Session, delete, func, insert, select

from ....models.label.repo import LabelsetCommit, LabelsetCommitCreate, LabelsetCommitUpdate
from ....models.user import Role, UserPublic
from ...auth import require_role
from ..groups import get_valid_group_ids

router = APIRouter(prefix='/commits', tags=['commits'])


def can_read_commit(
    user: UserPublic,
    session: Session,
    commit: LabelsetCommit,
):
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

    session.execute(insert(parents_cls), values)


def bulk_delete_parents(
    session: Session,
    group_id: int,
    commit_hashes: Set[str],
) -> None:
    parents_cls = LabelsetCommit.get_parent_links_cls()
    assert isinstance(parents_cls.child_hash, QueryableAttribute)

    q = delete(parents_cls) \
        .where(parents_cls.group_id == group_id) \
        .where(parents_cls.child_hash.in_(commit_hashes))
    session.execute(q)


def create_commit(
    *,
    current_user: UserPublic,
    session: Session,
    data: LabelsetCommitCreate,
):
    require_write_commit(current_user, session)

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
        q = q.where(LabelsetCommit.group_id.in_(get_valid_group_ids(current_user, session)))

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
    q = select(LabelsetCommit) \
        .where(LabelsetCommit.group_id == group_id) \
        .where(LabelsetCommit.hash == commit_hash)

    record = session.exec(q).one_or_none()
    if not record or not can_read_commit(current_user, session, record):
        raise HTTPException(status_code=HTTPStatus.NOT_FOUND)

    return record


def update_commit(
    *,
    current_user: UserPublic,
    session: Session,
    group_id: int,
    commit_hash: str,
    data: LabelsetCommitUpdate,
):
    record = session.get(LabelsetCommit, {"group_id": group_id, "hash": commit_hash})
    if not record:
        raise HTTPException(status_code=HTTPStatus.NOT_FOUND)

    require_write_commit(current_user, session, record)

    data_to_update = data.model_dump(exclude_unset=True)

    record.sqlmodel_update(data_to_update)
    session.add(record)
    session.flush([record])

    session.refresh(record)

    return record


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

    bulk_delete_parents(session, record.group_id, {record.hash})

    session.delete(record)
    session.flush([record])
