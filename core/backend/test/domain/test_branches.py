from http import HTTPStatus

from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, func, select

import pytest

from sta.domain.label.groups import create_group as create_label_group
from sta.domain.label.repo.branches import (
    _bulk_insert_perms,
    can_access_branch,
    can_access_branch_filters,
    count_branches,
    delete_branch,
    list_branches,
    read_branch,
    require_write_branch,
    update_branch,
)
from sta.domain.label.repo.graph import LabelsetBranchInit, init_branch
from sta.domain.label.repo.ops import OperationRegistry
from sta.domain.label.repo.ops.special import register_special_ops
from sta.domain.users import create_user
from sta.models.label.group import LabelGroupCreate
from sta.models.label.repo import (
    BranchPermission,
    BranchPermissionLevel,
    LabelsetBranch,
    LabelsetBranchUpdate,
)
from sta.models.user import Role, UserCreate, UserPublic

pytestmark = pytest.mark.in_memory_db


def _create_test_user(
    session: Session,
    root_user: UserPublic,
    *,
    username: str,
    roles: set[Role],
) -> UserPublic:
    record = create_user(
        current_user=root_user,
        session=session,
        data=UserCreate(
            username=username,
            password="password",
            roles=roles,
        ),
    )

    return UserPublic.model_validate(record)


def _create_op_registry() -> OperationRegistry:
    op_registry = OperationRegistry()
    register_special_ops(op_registry)

    return op_registry


def test_branch_names_are_unique_within_a_label_group(
    root_user: UserPublic,
    session: Session,
):
    first_group = create_label_group(
        current_user=root_user,
        session=session,
        data=LabelGroupCreate(name="unique-branch-group"),
    )
    second_group = create_label_group(
        current_user=root_user,
        session=session,
        data=LabelGroupCreate(name="other-unique-branch-group"),
    )
    op_registry = _create_op_registry()
    init_branch(
        current_user=root_user,
        session=session,
        op_registry=op_registry,
        data=LabelsetBranchInit(group_id=first_group.id, name="shared-name"),
    )
    session.commit()

    with pytest.raises(IntegrityError):
        init_branch(
            current_user=root_user,
            session=session,
            op_registry=op_registry,
            data=LabelsetBranchInit(group_id=first_group.id, name="shared-name"),
        )
    session.rollback()

    branch_in_other_group = init_branch(
        current_user=root_user,
        session=session,
        op_registry=op_registry,
        data=LabelsetBranchInit(group_id=second_group.id, name="shared-name"),
    )
    assert branch_in_other_group.name == "shared-name"


def test_branch_rename_cannot_duplicate_a_sibling_name(
    root_user: UserPublic,
    session: Session,
):
    label_group = create_label_group(
        current_user=root_user,
        session=session,
        data=LabelGroupCreate(name="rename-unique-branch-group"),
    )
    op_registry = _create_op_registry()
    init_branch(
        current_user=root_user,
        session=session,
        op_registry=op_registry,
        data=LabelsetBranchInit(group_id=label_group.id, name="existing-name"),
    )
    branch = init_branch(
        current_user=root_user,
        session=session,
        op_registry=op_registry,
        data=LabelsetBranchInit(group_id=label_group.id, name="rename-me"),
    )
    session.commit()

    with pytest.raises(IntegrityError):
        update_branch(
            current_user=root_user,
            session=session,
            id=branch.id,
            data=LabelsetBranchUpdate(name="existing-name"),
        )
    session.rollback()


def test_can_access_branch_filters_matches_can_access_branch(
    root_user: UserPublic,
    session: Session,
):
    data_manager_user = _create_test_user(
        session,
        root_user,
        username="data_manager_user",
        roles={Role.DATA_MANAGER},
    )
    read_user = _create_test_user(
        session,
        root_user,
        username="read_branch_user",
        roles=set(),
    )
    write_user = _create_test_user(
        session,
        root_user,
        username="write_branch_user",
        roles=set(),
    )
    admin_user = _create_test_user(
        session,
        root_user,
        username="admin_branch_user",
        roles=set(),
    )
    unrelated_user = _create_test_user(
        session,
        root_user,
        username="unrelated_branch_user",
        roles=set(),
    )

    label_group = create_label_group(
        current_user=root_user,
        session=session,
        data=LabelGroupCreate(name="branch-access-label-group"),
    )
    op_registry = _create_op_registry()

    init_branch(
        current_user=root_user,
        session=session,
        op_registry=op_registry,
        data=LabelsetBranchInit(
            group_id=label_group.id,
            name="read-branch",
            perm_lv_by_user_id={
                data_manager_user.id: BranchPermissionLevel.READ,
                read_user.id: BranchPermissionLevel.READ,
            },
        ),
    )
    init_branch(
        current_user=root_user,
        session=session,
        op_registry=op_registry,
        data=LabelsetBranchInit(
            group_id=label_group.id,
            name="write-branch",
            perm_lv_by_user_id={
                data_manager_user.id: BranchPermissionLevel.WRITE,
                write_user.id: BranchPermissionLevel.WRITE,
            },
        ),
    )
    init_branch(
        current_user=root_user,
        session=session,
        op_registry=op_registry,
        data=LabelsetBranchInit(
            group_id=label_group.id,
            name="admin-branch",
            perm_lv_by_user_id={
                data_manager_user.id: BranchPermissionLevel.ADMIN,
                admin_user.id: BranchPermissionLevel.ADMIN,
            },
        ),
    )
    init_branch(
        current_user=root_user,
        session=session,
        op_registry=op_registry,
        data=LabelsetBranchInit(
            group_id=label_group.id,
            name="mixed-branch",
            perm_lv_by_user_id={
                data_manager_user.id: BranchPermissionLevel.ADMIN,
                read_user.id: BranchPermissionLevel.READ,
                write_user.id: BranchPermissionLevel.WRITE_ELEVATED,
                admin_user.id: BranchPermissionLevel.ADMIN,
            },
        ),
    )

    branches = session.exec(select(LabelsetBranch).order_by(LabelsetBranch.id)).all()

    for user in [root_user, data_manager_user, read_user, write_user, admin_user, unrelated_user]:
        for perm_lv in [
            BranchPermissionLevel.READ,
            BranchPermissionLevel.WRITE,
            BranchPermissionLevel.WRITE_ELEVATED,
            BranchPermissionLevel.ADMIN,
        ]:
            expected_ids = {
                branch.id
                for branch in branches
                if can_access_branch(user, session, id=branch.id, perm_lv=perm_lv)
            }
            filtered_ids = {
                branch.id
                for branch in session.exec(
                    select(LabelsetBranch)
                    .where(*can_access_branch_filters(user, perm_lv=perm_lv))
                    .order_by(LabelsetBranch.id),
                ).all()
            }

            assert filtered_ids == expected_ids


def test_require_write_branch_permission_levels(
    root_user: UserPublic,
    session: Session,
):
    read_user = _create_test_user(
        session,
        root_user,
        username="rwb_read_user",
        roles=set(),
    )
    write_user = _create_test_user(
        session,
        root_user,
        username="rwb_write_user",
        roles=set(),
    )
    admin_user = _create_test_user(
        session,
        root_user,
        username="rwb_admin_user",
        roles=set(),
    )
    plain_user = _create_test_user(
        session,
        root_user,
        username="rwb_plain_user",
        roles=set(),
    )
    data_manager_user = _create_test_user(
        session,
        root_user,
        username="rwb_manager_user",
        roles={Role.DATA_MANAGER},
    )

    label_group = create_label_group(
        current_user=root_user,
        session=session,
        data=LabelGroupCreate(name="rwb-group"),
    )
    op_registry = _create_op_registry()

    branch = init_branch(
        current_user=root_user,
        session=session,
        op_registry=op_registry,
        data=LabelsetBranchInit(
            group_id=label_group.id,
            name="rwb-branch",
            perm_lv_by_user_id={
                read_user.id: BranchPermissionLevel.READ,
                write_user.id: BranchPermissionLevel.WRITE,
                admin_user.id: BranchPermissionLevel.ADMIN,
            },
        ),
    )
    session.commit()

    # Without a branch id, non-managers are always denied.
    assert can_access_branch(read_user, session) is False

    with pytest.raises(HTTPException) as exc_info:
        require_write_branch(read_user, session)
    assert exc_info.value.status_code == HTTPStatus.FORBIDDEN

    # READ is not enough for the default ADMIN requirement.
    with pytest.raises(HTTPException) as exc_info:
        require_write_branch(read_user, session, id=branch.id)
    assert exc_info.value.status_code == HTTPStatus.FORBIDDEN

    # WRITE satisfies a WRITE requirement, but not WRITE_ELEVATED.
    assert (
        require_write_branch(
            write_user,
            session,
            id=branch.id,
            perm_lv=BranchPermissionLevel.WRITE,
        )
        is True
    )
    with pytest.raises(HTTPException) as exc_info:
        require_write_branch(
            write_user,
            session,
            id=branch.id,
            perm_lv=BranchPermissionLevel.WRITE_ELEVATED,
        )
    assert exc_info.value.status_code == HTTPStatus.FORBIDDEN

    assert require_write_branch(admin_user, session, id=branch.id) is True

    # A user without any permission row is denied.
    with pytest.raises(HTTPException) as exc_info:
        require_write_branch(plain_user, session, id=branch.id)
    assert exc_info.value.status_code == HTTPStatus.FORBIDDEN

    # DATA_MANAGER bypasses branch permissions entirely.
    assert require_write_branch(data_manager_user, session, id=branch.id) is True
    session.commit()


def test_read_list_count_branches_as_non_manager(
    root_user: UserPublic,
    session: Session,
):
    read_user = _create_test_user(
        session,
        root_user,
        username="rlc_read_user",
        roles=set(),
    )
    write_user = _create_test_user(
        session,
        root_user,
        username="rlc_write_user",
        roles=set(),
    )

    label_group = create_label_group(
        current_user=root_user,
        session=session,
        data=LabelGroupCreate(name="rlc-group"),
    )
    op_registry = _create_op_registry()

    visible_branch = init_branch(
        current_user=root_user,
        session=session,
        op_registry=op_registry,
        data=LabelsetBranchInit(
            group_id=label_group.id,
            name="visible",
            perm_lv_by_user_id={
                read_user.id: BranchPermissionLevel.READ,
                write_user.id: BranchPermissionLevel.WRITE,
            },
        ),
    )
    hidden_branch = init_branch(
        current_user=root_user,
        session=session,
        op_registry=op_registry,
        data=LabelsetBranchInit(
            group_id=label_group.id,
            name="hidden",
            perm_lv_by_user_id={
                write_user.id: BranchPermissionLevel.READ,
            },
        ),
    )
    session.commit()

    # read_branch applies the non-manager permission filter.
    record = read_branch(
        current_user=read_user,
        session=session,
        id=visible_branch.id,
    )
    assert record.id == visible_branch.id

    # Inaccessible branches and unknown ids both 404.
    with pytest.raises(HTTPException) as exc_info:
        read_branch(
            current_user=read_user,
            session=session,
            id=hidden_branch.id,
        )
    assert exc_info.value.status_code == HTTPStatus.NOT_FOUND

    with pytest.raises(HTTPException) as exc_info:
        read_branch(
            current_user=root_user,
            session=session,
            id=hidden_branch.id + 9999,
        )
    assert exc_info.value.status_code == HTTPStatus.NOT_FOUND

    # Listing and counting respect the same filter.
    assert {branch.id for branch in list_branches(current_user=read_user, session=session)} == {
        visible_branch.id
    }
    assert count_branches(current_user=read_user, session=session) == 1
    assert count_branches(current_user=root_user, session=session) == 2

    # ids/id/limit filters.
    assert {
        branch.id
        for branch in list_branches(
            current_user=root_user,
            session=session,
            ids={visible_branch.id, hidden_branch.id},
        )
    } == {visible_branch.id, hidden_branch.id}
    assert [
        branch.id
        for branch in list_branches(
            current_user=root_user,
            session=session,
            id=hidden_branch.id,
        )
    ] == [hidden_branch.id]
    assert (
        len(
            list_branches(
                current_user=root_user,
                session=session,
                offset=None,
                limit=1,
            )
        )
        == 1
    )
    assert (
        count_branches(
            current_user=root_user,
            session=session,
            ids={visible_branch.id},
        )
        == 1
    )
    assert (
        count_branches(
            current_user=read_user,
            session=session,
            id=hidden_branch.id,
        )
        == 0
    )
    session.commit()


def test_project_manager_reads_every_branch_but_writes_none(
    root_user: UserPublic,
    session: Session,
):
    project_manager_user = _create_test_user(
        session,
        root_user,
        username="pmb_project_manager_user",
        roles={Role.PROJECT_MANAGER},
    )
    granted_user = _create_test_user(
        session,
        root_user,
        username="pmb_granted_user",
        roles={Role.PROJECT_MANAGER},
    )

    label_group = create_label_group(
        current_user=root_user,
        session=session,
        data=LabelGroupCreate(name="pmb-group"),
    )
    op_registry = _create_op_registry()
    granted_branch = init_branch(
        current_user=root_user,
        session=session,
        op_registry=op_registry,
        data=LabelsetBranchInit(
            group_id=label_group.id,
            name="granted",
            perm_lv_by_user_id={granted_user.id: BranchPermissionLevel.READ},
        ),
    )
    ungranted_branch = init_branch(
        current_user=root_user,
        session=session,
        op_registry=op_registry,
        data=LabelsetBranchInit(
            group_id=label_group.id,
            name="ungranted",
            perm_lv_by_user_id={granted_user.id: BranchPermissionLevel.READ},
        ),
    )
    session.commit()

    # The role grants READ on every branch, so one carrying no grant at all for
    # this user is still listed, counted and read, as `Your Access: None`.
    assert {
        branch.id
        for branch in list_branches(
            current_user=project_manager_user,
            session=session,
            group_id=label_group.id,
        )
    } == {granted_branch.id, ungranted_branch.id}
    assert (
        count_branches(
            current_user=project_manager_user,
            session=session,
            group_id=label_group.id,
        )
        == 2
    )
    assert (
        read_branch(
            current_user=project_manager_user,
            session=session,
            id=ungranted_branch.id,
        ).id
        == ungranted_branch.id
    )
    assert (
        can_access_branch(
            project_manager_user,
            session,
            id=ungranted_branch.id,
            perm_lv=BranchPermissionLevel.READ,
        )
        is True
    )

    # The override stops at READ: every level above it still needs a grant.
    for perm_lv in (
        BranchPermissionLevel.WRITE,
        BranchPermissionLevel.WRITE_ELEVATED,
        BranchPermissionLevel.ADMIN,
    ):
        assert (
            can_access_branch(
                project_manager_user,
                session,
                id=ungranted_branch.id,
                perm_lv=perm_lv,
            )
            is False
        )

    with pytest.raises(HTTPException) as exc_info:
        update_branch(
            current_user=project_manager_user,
            session=session,
            id=ungranted_branch.id,
            data=LabelsetBranchUpdate(name="pmb-renamed"),
        )
    assert exc_info.value.status_code == HTTPStatus.FORBIDDEN

    with pytest.raises(HTTPException) as exc_info:
        delete_branch(
            current_user=project_manager_user,
            session=session,
            id=ungranted_branch.id,
        )
    assert exc_info.value.status_code == HTTPStatus.FORBIDDEN


def test_update_branch_fields_and_permissions(
    root_user: UserPublic,
    session: Session,
):
    read_user = _create_test_user(
        session,
        root_user,
        username="ub_read_user",
        roles=set(),
    )
    write_user = _create_test_user(
        session,
        root_user,
        username="ub_write_user",
        roles=set(),
    )
    admin_user = _create_test_user(
        session,
        root_user,
        username="ub_admin_user",
        roles=set(),
    )

    label_group = create_label_group(
        current_user=root_user,
        session=session,
        data=LabelGroupCreate(name="update-branch-group"),
    )
    op_registry = _create_op_registry()

    branch = init_branch(
        current_user=root_user,
        session=session,
        op_registry=op_registry,
        data=LabelsetBranchInit(
            group_id=label_group.id,
            name="before",
            perm_lv_by_user_id={
                read_user.id: BranchPermissionLevel.READ,
                write_user.id: BranchPermissionLevel.WRITE,
                admin_user.id: BranchPermissionLevel.ADMIN,
            },
        ),
    )
    session.commit()

    # Updating requires the ADMIN permission level on the branch.
    with pytest.raises(HTTPException) as exc_info:
        update_branch(
            current_user=write_user,
            session=session,
            id=branch.id,
            data=LabelsetBranchUpdate(name="denied"),
        )
    assert exc_info.value.status_code == HTTPStatus.FORBIDDEN

    with pytest.raises(HTTPException) as exc_info:
        update_branch(
            current_user=root_user,
            session=session,
            id=branch.id + 9999,
            data=LabelsetBranchUpdate(name="denied"),
        )
    assert exc_info.value.status_code == HTTPStatus.NOT_FOUND

    # A rename that leaves the permissions untouched.
    updated = update_branch(
        current_user=root_user,
        session=session,
        id=branch.id,
        data=LabelsetBranchUpdate(name="renamed"),
    )
    session.commit()
    assert updated.name == "renamed"
    assert dict(updated.perm_lv_by_user_id) == {
        root_user.id: BranchPermissionLevel.ADMIN,
        read_user.id: BranchPermissionLevel.READ,
        write_user.id: BranchPermissionLevel.WRITE,
        admin_user.id: BranchPermissionLevel.ADMIN,
    }

    # An admin may not remove or demote their own ADMIN permission.
    with pytest.raises(HTTPException) as exc_info:
        update_branch(
            current_user=root_user,
            session=session,
            id=branch.id,
            data=LabelsetBranchUpdate(
                perm_lv_by_user_id={
                    admin_user.id: BranchPermissionLevel.ADMIN,
                },
            ),
        )
    assert exc_info.value.status_code == HTTPStatus.BAD_REQUEST

    with pytest.raises(HTTPException) as exc_info:
        update_branch(
            current_user=root_user,
            session=session,
            id=branch.id,
            data=LabelsetBranchUpdate(
                perm_lv_by_user_id={
                    root_user.id: BranchPermissionLevel.WRITE,
                    admin_user.id: BranchPermissionLevel.ADMIN,
                },
            ),
        )
    assert exc_info.value.status_code == HTTPStatus.BAD_REQUEST

    # A branch admin replaces the permissions while keeping their own ADMIN.
    # The permission reads above intentionally loaded the branch's perm_links
    # collection into the same session; update_branch must still work with it
    # present (regression: the bulk permission delete used to mark the loaded
    # permission rows deleted, breaking the subsequent session.add()).
    new_perms = {
        root_user.id: BranchPermissionLevel.ADMIN,
        admin_user.id: BranchPermissionLevel.ADMIN,
        read_user.id: BranchPermissionLevel.WRITE,
    }
    updated = update_branch(
        current_user=admin_user,
        session=session,
        id=branch.id,
        data=LabelsetBranchUpdate(
            name="renamed-again",
            perm_lv_by_user_id=new_perms,
        ),
    )
    session.commit()

    assert updated.name == "renamed-again"
    rows = session.exec(
        select(BranchPermission).where(BranchPermission.branch_id == branch.id),
    ).all()
    assert {row.user_id: row.permission_lv for row in rows} == new_perms

    # _bulk_insert_perms returns early when there is nothing to insert.
    _bulk_insert_perms(session, set(), {})
    _bulk_insert_perms(session, {branch.id}, {})
    session.commit()


def test_delete_branch(
    root_user: UserPublic,
    session: Session,
):
    read_user = _create_test_user(
        session,
        root_user,
        username="db_read_user",
        roles=set(),
    )

    label_group = create_label_group(
        current_user=root_user,
        session=session,
        data=LabelGroupCreate(name="delete-branch-group"),
    )
    op_registry = _create_op_registry()

    init_branch(
        current_user=root_user,
        session=session,
        op_registry=op_registry,
        data=LabelsetBranchInit(
            group_id=label_group.id,
            name="kept",
            perm_lv_by_user_id={
                read_user.id: BranchPermissionLevel.READ,
            },
        ),
    )
    deleted_branch = init_branch(
        current_user=root_user,
        session=session,
        op_registry=op_registry,
        data=LabelsetBranchInit(
            group_id=label_group.id,
            name="deleted",
            perm_lv_by_user_id={
                read_user.id: BranchPermissionLevel.READ,
            },
        ),
    )
    session.commit()

    # Deleting requires the ADMIN permission level on the branch.
    with pytest.raises(HTTPException) as exc_info:
        delete_branch(
            current_user=read_user,
            session=session,
            id=deleted_branch.id,
        )
    assert exc_info.value.status_code == HTTPStatus.FORBIDDEN

    with pytest.raises(HTTPException) as exc_info:
        delete_branch(
            current_user=root_user,
            session=session,
            id=deleted_branch.id + 9999,
        )
    assert exc_info.value.status_code == HTTPStatus.NOT_FOUND

    # The branch carries a permission row for root (ADMIN, seeded by
    # create_branch) and one for read_user. Reading perm_lv_by_user_id loads
    # the branch's perm_links collection into the session; delete_branch must
    # still succeed in that same session (regression: the bulk permission
    # delete used to corrupt the loaded collection).
    assert dict(deleted_branch.perm_lv_by_user_id) == {
        root_user.id: BranchPermissionLevel.ADMIN,
        read_user.id: BranchPermissionLevel.READ,
    }
    assert (
        session.exec(
            select(func.count())
            .select_from(BranchPermission)
            .where(BranchPermission.branch_id == deleted_branch.id),
        ).one()
        == 2
    )

    delete_branch(
        current_user=root_user,
        session=session,
        id=deleted_branch.id,
    )
    session.commit()

    with pytest.raises(HTTPException) as exc_info:
        read_branch(
            current_user=root_user,
            session=session,
            id=deleted_branch.id,
        )
    assert exc_info.value.status_code == HTTPStatus.NOT_FOUND

    # The permission rows are removed together with the branch.
    assert (
        session.exec(
            select(func.count())
            .select_from(BranchPermission)
            .where(BranchPermission.branch_id == deleted_branch.id),
        ).one()
        == 0
    )

    assert count_branches(current_user=root_user, session=session) == 1
    assert count_branches(current_user=read_user, session=session) == 1
    session.commit()
