from collections.abc import Set
from http import HTTPStatus

from fastapi import HTTPException
from sqlalchemy.orm import QueryableAttribute
from sqlmodel import Session, delete, func, insert, select

from ....models.label.repo import (
    BranchPermission,
    BranchPermissionLevel,
    LabelsetBranch,
    LabelsetBranchCreate,
    LabelsetBranchUpdate,
)
from ....models.user import Role, UserPublic
from ...auth import require_role

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
):
    if user.has_role(Role.DATA_MANAGER):
        return True
    if id is None:
        return False

    record = session.get(
        BranchPermission,
        {"branch_id": id, "user_id": user.id},
    )
    return record and record.permission_lv >= perm_lv


def can_access_branch_filters(
    user: UserPublic,
    *,
    perm_lv: BranchPermissionLevel = BranchPermissionLevel.ADMIN,
):
    if user.has_role(Role.DATA_MANAGER):
        return []

    perms_cls = LabelsetBranch.get_perm_links_cls()
    assert isinstance(LabelsetBranch.id, QueryableAttribute)

    permitted_branch_ids = select(perms_cls.branch_id) \
        .where(perms_cls.user_id == user.id) \
        .where(perms_cls.permission_lv >= perm_lv)

    return [LabelsetBranch.id.in_(permitted_branch_ids)]


def _build_list_branches_query(
    *,
    current_user: UserPublic,
    session: Session,
    offset: int | None = 0,
    limit: int | None = None,
    ids: Set[int] | None = None,
    group_id: int | None = None,
):
    q = select(LabelsetBranch)
    for cond in can_access_branch_filters(current_user, perm_lv=BranchPermissionLevel.READ):
        q = q.where(cond)
    if offset is not None:
        q = q.offset(offset)
    if limit is not None:
        q = q.limit(limit)
    if ids is not None:
        q = q.where(LabelsetBranch.id.in_(ids))
    if group_id is not None:
        q = q.where(LabelsetBranch.group_id == group_id)

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

    session.execute(insert(perms_cls), values)


def _bulk_delete_perms(
    session: Session,
    branch_ids: Set[int],
) -> None:
    perms_cls = LabelsetBranch.get_perm_links_cls()
    assert isinstance(perms_cls.branch_id, QueryableAttribute)

    q = delete(perms_cls).where(perms_cls.branch_id.in_(branch_ids))
    session.execute(q)


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
):
    q = _build_list_branches_query(
        current_user=current_user,
        session=session,
        offset=offset,
        limit=limit,
        ids=ids,
        group_id=group_id,
    )

    return session.exec(q).all()


def count_branches(
    *,
    current_user: UserPublic,
    session: Session,
    ids: Set[int] | None = None,
    group_id: int | None = None,
) -> int:
    q = _build_list_branches_query(
        current_user=current_user,
        session=session,
        offset=None,
        limit=None,
        ids=ids,
        group_id=group_id,
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

    if "perm_lv_by_user_id" in data_to_update:
        perm_lv_by_user_id = data_to_update.pop("perm_lv_by_user_id")

        if perm_lv_by_user_id.get(current_user.id) != BranchPermissionLevel.ADMIN:
            raise ADMIN_NO_SELF_DEMOTION

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

    _bulk_delete_perms(session, {record.id})

    session.delete(record)
    session.flush([record])
