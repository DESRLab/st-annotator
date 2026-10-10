from collections.abc import Set
from datetime import datetime
from http import HTTPStatus

from fastapi import HTTPException
from sqlmodel import Session, delete, func, insert, select

from sta.common.database.execution import execute_statement, sql_column

from ....models.label.repo import (
    BranchPermission,
    BranchPermissionLevel,
    LabelsetBranch,
    LabelsetBranchCreate,
    LabelsetBranchUpdate,
)
from ....models.user import Role, UserPublic
from ...auth import require_role
from ...querying import SortDirection, apply_sort, filter_contains, filter_range

_BRANCH_SORT_COLUMNS = {
    "id": LabelsetBranch.id,
    "name": LabelsetBranch.name,
    "head_hash": LabelsetBranch.head_hash,
    "checkpoint_hash": LabelsetBranch.checkpoint_hash,
    "last_edit_at": LabelsetBranch.last_edit_at,
}

ADMIN_NO_SELF_DEMOTION = HTTPException(
    status_code=HTTPStatus.BAD_REQUEST,
    detail=f"You cannot remove the {BranchPermissionLevel.ADMIN} permission from yourself!",
)


def can_access_branch(
    user: UserPublic,
    session: Session,
    *,
    id: int | None = None,
    perm_lv: BranchPermissionLevel = BranchPermissionLevel.ADMIN,
) -> bool:
    if user.has_role(Role.DATA_MANAGER):
        return True
    if user.has_role(Role.PROJECT_MANAGER) and perm_lv <= BranchPermissionLevel.READ:
        return True
    if id is None:
        return False

    record = session.get(
        BranchPermission,
        {"branch_id": id, "user_id": user.id},
    )
    return record is not None and record.permission_lv >= perm_lv


def can_access_branch_filters(
    user: UserPublic,
    *,
    perm_lv: BranchPermissionLevel = BranchPermissionLevel.ADMIN,
):
    if user.has_role(Role.DATA_MANAGER):
        return []
    if user.has_role(Role.PROJECT_MANAGER) and perm_lv <= BranchPermissionLevel.READ:
        return []

    perms_cls = LabelsetBranch.get_perm_links_cls()
    permitted_branch_ids = (
        select(perms_cls.branch_id)
        .where(perms_cls.user_id == user.id)
        .where(perms_cls.permission_lv >= perm_lv)
    )

    return [sql_column(LabelsetBranch.id).in_(permitted_branch_ids)]


def _build_list_branches_query(
    *,
    current_user: UserPublic,
    session: Session,
    offset: int | None = 0,
    limit: int | None = None,
    ids: Set[int] | None = None,
    group_id: int | None = None,
    id: int | None = None,
    id_ge: int | None = None,
    id_le: int | None = None,
    name: str | None = None,
    name_contains: str | None = None,
    head_hash_contains: str | None = None,
    checkpoint_hash_contains: str | None = None,
    last_edit_at_ge: datetime | None = None,
    last_edit_at_lt: datetime | None = None,
    sort_by: str | None = None,
    sort_dir: SortDirection = "asc",
):
    q = select(LabelsetBranch)
    for cond in can_access_branch_filters(current_user, perm_lv=BranchPermissionLevel.READ):
        q = q.where(cond)
    if offset is not None:
        q = q.offset(offset)
    if limit is not None:
        q = q.limit(limit)
    if ids is not None:
        q = q.where(sql_column(LabelsetBranch.id).in_(ids))
    if group_id is not None:
        q = q.where(LabelsetBranch.group_id == group_id)
    if id is not None:
        q = q.where(LabelsetBranch.id == id)
    q = filter_range(q, LabelsetBranch.id, ge=id_ge, le=id_le)
    if name is not None:
        q = q.where(LabelsetBranch.name == name)
    q = filter_contains(q, LabelsetBranch.name, name_contains)
    q = filter_contains(q, LabelsetBranch.head_hash, head_hash_contains)
    q = filter_contains(q, LabelsetBranch.checkpoint_hash, checkpoint_hash_contains)
    q = filter_range(q, LabelsetBranch.last_edit_at, ge=last_edit_at_ge, lt=last_edit_at_lt)
    q = apply_sort(q, _BRANCH_SORT_COLUMNS, sort_by, sort_dir)

    return q


def require_write_branch(
    user: UserPublic,
    session: Session,
    *,
    id: int | None = None,
    perm_lv: BranchPermissionLevel = BranchPermissionLevel.ADMIN,
):
    if id is None:
        return require_role(user, Role.DATA_MANAGER)

    if not can_access_branch(user, session, id=id, perm_lv=perm_lv):
        raise HTTPException(
            status_code=HTTPStatus.FORBIDDEN,
            detail=f"You need permission level {perm_lv} to perform this action.",
        )

    return True


def _bulk_insert_perms(
    session: Session,
    branch_ids: Set[int],
    perm_lv_by_user_id: dict[int, BranchPermissionLevel],
) -> None:
    perms_cls = LabelsetBranch.get_perm_links_cls()

    values = [
        dict(branch_id=branch_id, user_id=user_id, permission_lv=permission_lv)
        for branch_id in branch_ids
        for user_id, permission_lv in perm_lv_by_user_id.items()
    ]
    if not values:
        return

    execute_statement(session, insert(perms_cls), values)


def _bulk_delete_perms(
    session: Session,
    branch_ids: Set[int],
) -> None:
    perms_cls = LabelsetBranch.get_perm_links_cls()
    q = delete(perms_cls).where(sql_column(perms_cls.branch_id).in_(branch_ids))
    # synchronize_session=False: if a branch's perm_links collection was
    # loaded earlier in this session, the default synchronization would mark
    # those BranchPermission objects deleted and break the later ORM
    # add/flush. No caller relies on synchronized state after this delete:
    # update_branch refreshes the record (expiring its relationships), and
    # delete_branch expires the collection before deleting the record.
    execute_statement(session, q.execution_options(synchronize_session=False))


def create_branch(
    *,
    current_user: UserPublic,
    session: Session,
    data: LabelsetBranchCreate,
):
    require_write_branch(current_user, session)

    record = LabelsetBranch.model_validate(data)

    session.add(record)
    session.flush([record])

    session.refresh(record)  # Get the new ID
    assert record.id is not None

    data.perm_lv_by_user_id.setdefault(current_user.id, BranchPermissionLevel.ADMIN)

    _bulk_insert_perms(session, {record.id}, data.perm_lv_by_user_id)

    session.refresh(record)

    return record


def list_branches(
    *,
    current_user: UserPublic,
    session: Session,
    offset: int | None = 0,
    limit: int | None = None,
    ids: Set[int] | None = None,
    group_id: int | None = None,
    id: int | None = None,
    id_ge: int | None = None,
    id_le: int | None = None,
    name: str | None = None,
    name_contains: str | None = None,
    head_hash_contains: str | None = None,
    checkpoint_hash_contains: str | None = None,
    last_edit_at_ge: datetime | None = None,
    last_edit_at_lt: datetime | None = None,
    sort_by: str | None = None,
    sort_dir: SortDirection = "asc",
):
    q = _build_list_branches_query(
        current_user=current_user,
        session=session,
        offset=offset,
        limit=limit,
        ids=ids,
        group_id=group_id,
        id=id,
        id_ge=id_ge,
        id_le=id_le,
        name=name,
        name_contains=name_contains,
        head_hash_contains=head_hash_contains,
        checkpoint_hash_contains=checkpoint_hash_contains,
        last_edit_at_ge=last_edit_at_ge,
        last_edit_at_lt=last_edit_at_lt,
        sort_by=sort_by,
        sort_dir=sort_dir,
    )

    return session.exec(q).all()


def count_branches(
    *,
    current_user: UserPublic,
    session: Session,
    ids: Set[int] | None = None,
    group_id: int | None = None,
    id: int | None = None,
    id_ge: int | None = None,
    id_le: int | None = None,
    name: str | None = None,
    name_contains: str | None = None,
    head_hash_contains: str | None = None,
    checkpoint_hash_contains: str | None = None,
    last_edit_at_ge: datetime | None = None,
    last_edit_at_lt: datetime | None = None,
) -> int:
    q = _build_list_branches_query(
        current_user=current_user,
        session=session,
        offset=None,
        limit=None,
        ids=ids,
        group_id=group_id,
        id=id,
        id_ge=id_ge,
        id_le=id_le,
        name=name,
        name_contains=name_contains,
        head_hash_contains=head_hash_contains,
        checkpoint_hash_contains=checkpoint_hash_contains,
        last_edit_at_ge=last_edit_at_ge,
        last_edit_at_lt=last_edit_at_lt,
    )

    return session.exec(select(func.count()).select_from(q.subquery())).one()


def read_branch(
    *,
    current_user: UserPublic,
    session: Session,
    id: int,
    for_update: bool = False,
):
    q = select(LabelsetBranch).where(LabelsetBranch.id == id)
    for cond in can_access_branch_filters(current_user, perm_lv=BranchPermissionLevel.READ):
        q = q.where(cond)
    if for_update:
        q = q.with_for_update()

    record = session.exec(q).one_or_none()
    if not record:
        raise HTTPException(status_code=HTTPStatus.NOT_FOUND)

    return record


def update_branch(
    *,
    current_user: UserPublic,
    session: Session,
    id: int,
    data: LabelsetBranchUpdate,
):
    require_write_branch(current_user, session, id=id)

    record = session.get(LabelsetBranch, id)
    if not record:
        raise HTTPException(status_code=HTTPStatus.NOT_FOUND)

    data_to_update = data.model_dump(exclude_unset=True)
    record.check_edit_conflict(data_to_update)

    if "perm_lv_by_user_id" in data_to_update:
        perm_lv_by_user_id = data_to_update.pop("perm_lv_by_user_id")
        if perm_lv_by_user_id is None:
            raise HTTPException(
                HTTPStatus.UNPROCESSABLE_ENTITY,
                "perm_lv_by_user_id cannot be null",
            )

        if perm_lv_by_user_id.get(current_user.id) != BranchPermissionLevel.ADMIN:
            raise ADMIN_NO_SELF_DEMOTION

        assert record.id is not None
        _bulk_delete_perms(session, {record.id})
        _bulk_insert_perms(session, {record.id}, perm_lv_by_user_id)

    record.sqlmodel_update(data_to_update)
    session.add(record)
    session.flush([record])

    session.refresh(record)

    return record


def delete_branch(
    *,
    current_user: UserPublic,
    session: Session,
    id: int,
):
    require_write_branch(current_user, session, id=id)

    record = session.get(LabelsetBranch, id)
    if not record:
        raise HTTPException(status_code=HTTPStatus.NOT_FOUND)

    assert record.id is not None
    _bulk_delete_perms(session, {record.id})
    # The bulk delete removed the permission rows without touching any loaded
    # perm_links collection. Expire it so the ORM delete-cascade below does
    # not try to re-delete (now stale) permission objects that no longer
    # exist in the database.
    session.expire(record, ["perm_links"])

    session.delete(record)
    session.flush([record])
