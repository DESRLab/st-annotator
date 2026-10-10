from datetime import datetime, timedelta, timezone
from decimal import Decimal

from fastapi import HTTPException
from sqlmodel import Session

import pytest

from sta.domain import projects as projects_domain, users as users_domain
from sta.domain.frames import (
    create_frame,
    list_frame_ids,
    list_frames,
    list_recent_frames,
    update_frame,
)
from sta.domain.label.groups import (
    create_group as create_label_group,
    list_groups as list_label_groups,
)
from sta.domain.label.repo.branches import list_branches
from sta.domain.label.repo.graph import LabelsetBranchInit, init_branch
from sta.domain.label.repo.ops import OperationRegistry
from sta.domain.label.repo.ops.special import register_special_ops
from sta.domain.label.spec.objclass import selections as selections_domain
from sta.domain.label.spec.objclass.definitions import create_objclass, list_objclasses
from sta.domain.projects import create_project
from sta.domain.source.groups import (
    create_group as create_source_group,
    list_groups as list_source_groups,
)
from sta.domain.tasks import create_task
from sta.domain.users import create_user
from sta.models.frame import FrameCreate, FrameUpdate, WorkType
from sta.models.label.group import LabelGroupCreate
from sta.models.label.spec import ObjectClassCreate
from sta.models.project import ProjectCreate
from sta.models.source.group import SourceGroupCreate
from sta.models.task import TaskCreate
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


def test_list_projects_filters_and_sorts(root_user: UserPublic, session: Session):
    member_user = _create_test_user(
        session,
        root_user,
        username="grid_querying_member",
        roles={Role.ANNOTATOR},
    )
    alpha = create_project(
        current_user=root_user,
        session=session,
        data=ProjectCreate(
            name="grid-alpha-project", description="first description", member_ids=[root_user.id]
        ),
    )
    beta = create_project(
        current_user=root_user,
        session=session,
        data=ProjectCreate(
            name="grid-beta-project", description="second description", member_ids=[member_user.id]
        ),
    )

    assert {
        p.id
        for p in projects_domain.list_projects(
            current_user=root_user,
            session=session,
            name_contains="grid-",
        )
    } == {alpha.id, beta.id}
    assert {
        p.id
        for p in projects_domain.list_projects(
            current_user=root_user,
            session=session,
            name_contains="alpha",
        )
    } == {alpha.id}
    assert {
        p.id
        for p in projects_domain.list_projects(
            current_user=root_user,
            session=session,
            description_contains="second",
        )
    } == {beta.id}
    assert {
        p.id
        for p in projects_domain.list_projects(
            current_user=root_user,
            session=session,
            member_ids=[member_user.id],
        )
    } == {beta.id}
    assert [
        p.id
        for p in projects_domain.list_projects(
            current_user=root_user,
            session=session,
            name_contains="grid-",
            sort_by="name",
            sort_dir="desc",
        )
    ] == [beta.id, alpha.id]
    assert (
        projects_domain.count_projects(
            current_user=root_user,
            session=session,
            member_ids=[member_user.id],
        )
        == 1
    )

    with pytest.raises(HTTPException) as exc_info:
        projects_domain.list_projects(
            current_user=root_user, session=session, sort_by="not-a-column"
        )
    assert exc_info.value.status_code == 422


def test_list_users_filters_and_sorts(root_user: UserPublic, session: Session):
    annotator_user = _create_test_user(
        session,
        root_user,
        username="grid_querying_annotator",
        roles={Role.ANNOTATOR},
    )
    supervisor_user = _create_test_user(
        session,
        root_user,
        username="grid_querying_supervisor",
        roles={Role.SUPERVISOR},
    )

    assert {
        u.id
        for u in users_domain.list_users(
            current_user=root_user,
            session=session,
            username_contains="grid_querying",
        )
    } == {annotator_user.id, supervisor_user.id}
    assert {
        u.id
        for u in users_domain.list_users(
            current_user=root_user,
            session=session,
            roles=[Role.ANNOTATOR],
            username_contains="grid_querying",
        )
    } == {annotator_user.id}
    assert {
        u.id
        for u in users_domain.list_users(
            current_user=root_user,
            session=session,
            roles=[Role.ANNOTATOR, Role.SUPERVISOR],
            username_contains="grid_querying",
        )
    } == {annotator_user.id, supervisor_user.id}
    assert [
        u.id
        for u in users_domain.list_users(
            current_user=root_user,
            session=session,
            username_contains="grid_querying",
            sort_by="username",
            sort_dir="desc",
        )
    ] == [supervisor_user.id, annotator_user.id]
    assert set(
        users_domain.list_user_ids(
            current_user=root_user,
            session=session,
            roles=[Role.ANNOTATOR, Role.SUPERVISOR],
            username_contains="grid_querying",
        )
    ) == {annotator_user.id, supervisor_user.id}

    epoch = datetime(1970, 1, 1, tzinfo=timezone.utc)
    assert (
        users_domain.count_users(
            current_user=root_user,
            session=session,
            username_contains="grid_querying",
            created_at_ge=epoch,
        )
        == 2
    )
    assert (
        users_domain.count_users(
            current_user=root_user,
            session=session,
            username_contains="grid_querying",
            created_at_lt=epoch,
        )
        == 0
    )


def test_list_source_groups_filters_and_sorts(root_user: UserPublic, session: Session):
    alpha = create_source_group(
        current_user=root_user,
        session=session,
        data=SourceGroupCreate(name="grid-alpha-source", description="first source"),
    )
    beta = create_source_group(
        current_user=root_user,
        session=session,
        data=SourceGroupCreate(name="grid-beta-source", description="second source"),
    )

    assert {
        g.id
        for g in list_source_groups(
            current_user=root_user,
            session=session,
            name_contains="grid-",
        )
    } == {alpha.id, beta.id}
    assert {
        g.id
        for g in list_source_groups(
            current_user=root_user,
            session=session,
            description_contains="second",
        )
    } == {beta.id}
    assert [
        g.id
        for g in list_source_groups(
            current_user=root_user,
            session=session,
            name_contains="grid-",
            sort_by="name",
            sort_dir="desc",
        )
    ] == [beta.id, alpha.id]


def test_list_label_groups_filters_and_sorts(root_user: UserPublic, session: Session):
    alpha = create_label_group(
        current_user=root_user,
        session=session,
        data=LabelGroupCreate(name="grid-alpha-label", description="first label"),
    )
    beta = create_label_group(
        current_user=root_user,
        session=session,
        data=LabelGroupCreate(name="grid-beta-label", description="second label"),
    )

    assert {
        g.id
        for g in list_label_groups(
            current_user=root_user,
            session=session,
            name_contains="grid-",
        )
    } == {alpha.id, beta.id}
    assert [
        g.id
        for g in list_label_groups(
            current_user=root_user,
            session=session,
            name_contains="grid-",
            sort_by="name",
            sort_dir="desc",
        )
    ] == [beta.id, alpha.id]


def test_list_branches_filters_and_sorts(root_user: UserPublic, session: Session):
    label_group = create_label_group(
        current_user=root_user,
        session=session,
        data=LabelGroupCreate(name="grid-branch-label-group"),
    )
    op_registry = OperationRegistry()
    register_special_ops(op_registry)

    alpha = init_branch(
        current_user=root_user,
        session=session,
        op_registry=op_registry,
        data=LabelsetBranchInit(group_id=label_group.id, name="grid-alpha-branch"),
    )
    beta = init_branch(
        current_user=root_user,
        session=session,
        op_registry=op_registry,
        data=LabelsetBranchInit(group_id=label_group.id, name="grid-beta-branch"),
    )

    assert {
        b.id
        for b in list_branches(
            current_user=root_user,
            session=session,
            group_id=label_group.id,
            name_contains="grid-",
        )
    } == {alpha.id, beta.id}
    assert {
        b.id
        for b in list_branches(
            current_user=root_user,
            session=session,
            group_id=label_group.id,
            name="grid-alpha-branch",
        )
    } == {alpha.id}
    assert [
        b.id
        for b in list_branches(
            current_user=root_user,
            session=session,
            group_id=label_group.id,
            name_contains="grid-",
            sort_by="name",
            sort_dir="desc",
        )
    ] == [beta.id, alpha.id]
    assert {
        b.id
        for b in list_branches(
            current_user=root_user,
            session=session,
            group_id=label_group.id,
            head_hash_contains=alpha.head_hash[:8],
        )
    } == {alpha.id}


def test_list_objclasses_filters_and_sorts(root_user: UserPublic, session: Session):
    alpha = create_objclass(
        current_user=root_user,
        session=session,
        data=ObjectClassCreate(name="grid-alpha-objclass", description="first objclass"),
    )
    beta = create_objclass(
        current_user=root_user,
        session=session,
        data=ObjectClassCreate(name="grid-beta-objclass", description="second objclass"),
    )

    assert {
        o.id
        for o in list_objclasses(
            current_user=root_user,
            session=session,
            name_contains="grid-",
        )
    } == {alpha.id, beta.id}
    assert [
        o.id
        for o in list_objclasses(
            current_user=root_user,
            session=session,
            name_contains="grid-",
            sort_by="name",
            sort_dir="desc",
        )
    ] == [beta.id, alpha.id]


def test_list_selections_filters_and_sorts(root_user: UserPublic, session: Session):
    alpha_label_group = create_label_group(
        current_user=root_user,
        session=session,
        data=LabelGroupCreate(name="grid-alpha-selection-label-group"),
    )
    beta_label_group = create_label_group(
        current_user=root_user,
        session=session,
        data=LabelGroupCreate(name="grid-beta-selection-label-group"),
    )
    objclass = create_objclass(
        current_user=root_user,
        session=session,
        data=ObjectClassCreate(name="grid-selection-objclass"),
    )

    alpha = selections_domain.create_spec(
        current_user=root_user,
        session=session,
        data=selections_domain.create_cls(
            name="grid-alpha-selection",
            description="first selection",
            group_ids=[alpha_label_group.id],
            objclass_ids=[objclass.id],
        ),
    )
    beta = selections_domain.create_spec(
        current_user=root_user,
        session=session,
        data=selections_domain.create_cls(
            name="grid-beta-selection",
            description="second selection",
            group_ids=[beta_label_group.id],
            objclass_ids=[objclass.id],
        ),
    )

    assert {
        s.id
        for s in selections_domain.list_specs(
            current_user=root_user,
            session=session,
            name_contains="grid-",
        )
    } == {alpha.id, beta.id}
    assert {
        s.id
        for s in selections_domain.list_specs(
            current_user=root_user,
            session=session,
            description_contains="second",
        )
    } == {beta.id}
    assert [
        s.id
        for s in selections_domain.list_specs(
            current_user=root_user,
            session=session,
            name_contains="grid-",
            sort_by="name",
            sort_dir="desc",
        )
    ] == [beta.id, alpha.id]


def test_list_frames_filters_and_sorts(root_user: UserPublic, session: Session):
    project = create_project(
        current_user=root_user,
        session=session,
        data=ProjectCreate(name="grid-frames-project", member_ids=[root_user.id]),
    )
    task = create_task(
        current_user=root_user,
        session=session,
        data=TaskCreate(
            name="grid-frames-task",
            project_id=project.id,
            annotator_ids=[root_user.id],
        ),
    )

    base_time = datetime(2026, 8, 1, tzinfo=timezone.utc)
    older = create_frame(
        current_user=root_user,
        session=session,
        data=FrameCreate(
            task_id=task.id,
            account_id=root_user.id,
            source_group_id=None,
            label_branch_id=None,
            work_type=WorkType.ANNOTATE,
            min_timestamp=base_time,
        ),
    )
    newer = create_frame(
        current_user=root_user,
        session=session,
        data=FrameCreate(
            task_id=task.id,
            account_id=root_user.id,
            source_group_id=None,
            label_branch_id=None,
            work_type=WorkType.ANNOTATE,
            min_timestamp=base_time + timedelta(hours=2),
        ),
    )
    update_frame(
        current_user=root_user,
        session=session,
        id=newer.id,
        data=FrameUpdate(is_complete=True),
    )

    assert {
        f.id
        for f in list_frames(
            current_user=root_user,
            session=session,
            task_id=task.id,
            is_complete=[True],
        )
    } == {newer.id}
    assert {
        f.id
        for f in list_frames(
            current_user=root_user,
            session=session,
            task_id=task.id,
            min_timestamp_ge=base_time + timedelta(hours=1),
        )
    } == {newer.id}
    assert {
        f.id
        for f in list_frames(
            current_user=root_user,
            session=session,
            task_id=task.id,
            min_timestamp_lt=base_time + timedelta(hours=1),
        )
    } == {older.id}
    assert [
        f.id
        for f in list_frames(
            current_user=root_user,
            session=session,
            task_id=task.id,
            sort_by="min_timestamp",
            sort_dir="desc",
        )
    ] == [newer.id, older.id]
    assert {
        f.id
        for f in list_frames(
            current_user=root_user,
            session=session,
            task_id=task.id,
            account_ids=[root_user.id],
        )
    } == {older.id, newer.id}
    assert set(
        list_frame_ids(
            current_user=root_user,
            session=session,
            task_id=task.id,
            account_ids=[root_user.id],
            is_complete=[True],
        )
    ) == {newer.id}


def test_list_frames_defaults_to_spatiotemporal_order(root_user: UserPublic, session: Session):
    project = create_project(
        current_user=root_user,
        session=session,
        data=ProjectCreate(name="grid-frames-order-project", member_ids=[root_user.id]),
    )
    task = create_task(
        current_user=root_user,
        session=session,
        data=TaskCreate(
            name="grid-frames-order-task",
            project_id=project.id,
            annotator_ids=[root_user.id],
        ),
    )

    base_time = datetime(2026, 8, 1, tzinfo=timezone.utc)

    def create_bounded_frame(*, hours: int, min_x: int):
        return create_frame(
            current_user=root_user,
            session=session,
            data=FrameCreate(
                task_id=task.id,
                account_id=root_user.id,
                source_group_id=None,
                label_branch_id=None,
                work_type=WorkType.ANNOTATE,
                min_x=Decimal(min_x),
                max_x=Decimal(min_x + 1),
                min_timestamp=base_time + timedelta(hours=hours),
                max_timestamp=base_time + timedelta(hours=hours),
            ),
        )

    # Created in an order that contrasts with the spatiotemporal bounds, so
    # the listing's default order is observable: temporal bounds first, then
    # spatial bounds, then id.
    latest = create_bounded_frame(hours=2, min_x=0)
    same_time_far = create_bounded_frame(hours=0, min_x=10)
    same_time_near = create_bounded_frame(hours=0, min_x=-10)

    assert [
        f.id
        for f in list_frames(
            current_user=root_user,
            session=session,
            task_id=task.id,
        )
    ] == [same_time_near.id, same_time_far.id, latest.id]


def test_list_recent_frames_filters_and_sorts(root_user: UserPublic, session: Session):
    project = create_project(
        current_user=root_user,
        session=session,
        data=ProjectCreate(name="grid-recent-frames-project", member_ids=[root_user.id]),
    )
    task = create_task(
        current_user=root_user,
        session=session,
        data=TaskCreate(
            name="grid-recent-frames-task",
            project_id=project.id,
            annotator_ids=[root_user.id],
        ),
    )

    base_time = datetime(2026, 8, 1, tzinfo=timezone.utc)
    seen_first = create_frame(
        current_user=root_user,
        session=session,
        data=FrameCreate(
            task_id=task.id,
            account_id=root_user.id,
            source_group_id=None,
            label_branch_id=None,
            work_type=WorkType.ANNOTATE,
        ),
    )
    seen_last = create_frame(
        current_user=root_user,
        session=session,
        data=FrameCreate(
            task_id=task.id,
            account_id=root_user.id,
            source_group_id=None,
            label_branch_id=None,
            work_type=WorkType.ANNOTATE,
        ),
    )
    create_frame(
        current_user=root_user,
        session=session,
        data=FrameCreate(
            task_id=task.id,
            account_id=root_user.id,
            source_group_id=None,
            label_branch_id=None,
            work_type=WorkType.ANNOTATE,
        ),
    )

    update_frame(
        current_user=root_user,
        session=session,
        id=seen_first.id,
        data=FrameUpdate(last_viewed_at=base_time),
    )
    update_frame(
        current_user=root_user,
        session=session,
        id=seen_last.id,
        data=FrameUpdate(last_viewed_at=base_time + timedelta(hours=2), is_complete=True),
    )

    assert [
        f.id
        for f in list_recent_frames(
            current_user=root_user,
            session=session,
            task_id=task.id,
        )
    ] == [seen_last.id, seen_first.id]
    assert {
        f.id
        for f in list_recent_frames(
            current_user=root_user,
            session=session,
            task_id=task.id,
            is_complete=[True],
        )
    } == {seen_last.id}
    assert [
        f.id
        for f in list_recent_frames(
            current_user=root_user,
            session=session,
            task_id=task.id,
            sort_by="id",
            sort_dir="asc",
        )
    ] == [seen_first.id, seen_last.id]
