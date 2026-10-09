from sqlmodel import Session, select

from sta.services.domain.label.groups import create_group as create_label_group
from sta.services.domain.label.repo.branches import can_access_branch, can_access_branch_filters
from sta.services.domain.label.repo.graph import LabelsetBranchInit, init_branch
from sta.services.domain.label.repo.ops import OperationRegistry
from sta.services.domain.label.repo.ops.special import register_special_ops
from sta.services.domain.users import create_user
from sta.services.models.label.group import LabelGroupCreate
from sta.services.models.label.repo import BranchPermissionLevel, LabelsetBranch
from sta.services.models.user import Role, UserCreate, UserPublic


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
