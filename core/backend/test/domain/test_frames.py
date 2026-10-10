"""Tests for the frame domain's read path (``sta/domain/frames.py``).

The list and read endpoints hand back ``FramePublicWithParents``, which embeds
each frame's account, source group, label branch and task, plus that task's
supervisor/annotator accounts. Because ``Task.supervisors``/``annotators`` are
properties over the ``supervisor_links``/``annotator_links`` association rows,
serializing a page costs a fan-out of lazy loads per row unless
``_get_frame_load_options`` batches them. These tests pin that cost to a
constant in the page size, so removing the loader options -- or letting the
recursive ``TaskPublic.children`` back into the frame payload -- fails here.
"""

from collections.abc import Callable
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import event
from sqlmodel import Session

import pytest

from sta.domain.frames import (
    count_frames,
    count_recent_frames,
    create_frame,
    list_frame_ids,
    list_frames,
    list_recent_frames,
    read_frame,
)
from sta.domain.label.groups import create_group as create_label_group
from sta.domain.label.repo.graph import LabelsetBranchInit, init_branch
from sta.domain.label.repo.ops import OperationRegistry
from sta.domain.label.repo.ops.special import register_special_ops
from sta.domain.projects import create_project
from sta.domain.source.groups import create_group as create_source_group
from sta.domain.tasks import create_task
from sta.domain.users import create_user
from sta.models.account import Account
from sta.models.frame import FrameCreate, FramePublicWithParents, WorkType
from sta.models.label.group import LabelGroupCreate
from sta.models.label.repo import BranchPermissionLevel, LabelsetBranch
from sta.models.project import ProjectCreate
from sta.models.source.group import SourceGroupCreate
from sta.models.task import TaskCreate
from sta.models.user import Role, UserCreate, UserPublic

pytestmark = pytest.mark.in_memory_db

_BASE_TIME = datetime(2026, 8, 1, tzinfo=timezone.utc)

# Reading and serializing a page costs twelve statements whatever its size: one
# for the frames, one SELECT IN per eager-loaded relationship (frame account,
# source group, label branch, task, supervisor links, annotator links, and the
# accounts behind both link tables), and three for the single shared branch's own
# ``group``/``head``/``perm_lv_by_user_id`` projection -- which
# :class:`LabelsetBranchPublic` serializes on top of the branch row itself, so
# it is batched per distinct branch rather than per frame.
_LIST_STATEMENTS = 9 + 3


def _create_branch(
    session: Session,
    root_user: UserPublic,
    *,
    name: str,
    permissions: dict[int, BranchPermissionLevel] | None = None,
) -> LabelsetBranch:
    """The label branch every seeded frame points at, created once per test."""
    registry = OperationRegistry()
    register_special_ops(registry)
    group = create_label_group(
        current_user=root_user,
        session=session,
        data=LabelGroupCreate(name=f"{name}-group"),
    )

    return init_branch(
        current_user=root_user,
        session=session,
        op_registry=registry,
        data=LabelsetBranchInit(
            group_id=group.id,
            name=name,
            perm_lv_by_user_id=permissions or {},
        ),
    )


def test_frame_owner_requires_label_branch_write_access(
    root_user: UserPublic,
    session: Session,
):
    worker = UserPublic.model_validate(
        create_user(
            current_user=root_user,
            session=session,
            data=UserCreate(
                username="frame-branch-reader",
                password="password",
                roles={Role.ANNOTATOR},
            ),
        )
    )
    project = create_project(
        current_user=root_user,
        session=session,
        data=ProjectCreate(name="frame-permission-project", member_ids=[root_user.id, worker.id]),
    )
    task = create_task(
        current_user=root_user,
        session=session,
        data=TaskCreate(
            name="frame-permission-task",
            project_id=project.id,
            annotator_ids=[worker.id],
        ),
    )
    branch = _create_branch(
        session,
        root_user,
        name="frame-permission-branch",
        permissions={worker.id: BranchPermissionLevel.READ},
    )

    with pytest.raises(HTTPException) as exc_info:
        create_frame(
            current_user=root_user,
            session=session,
            data=FrameCreate(
                task_id=task.id,
                account_id=worker.id,
                work_type=WorkType.ANNOTATE,
                source_group_id=None,
                label_branch_id=branch.id,
            ),
        )
    assert exc_info.value.status_code == 400
    assert "lacks WRITE access" in exc_info.value.detail


def test_review_frame_owner_requires_write_elevated_access(
    root_user: UserPublic,
    session: Session,
):
    """Reviewer frames need the elevated level; annotator frames still need WRITE."""
    supervisor = UserPublic.model_validate(
        create_user(
            current_user=root_user,
            session=session,
            data=UserCreate(
                username="frame-branch-reviewer",
                password="password",
                roles={Role.SUPERVISOR, Role.ANNOTATOR},
            ),
        )
    )
    project = create_project(
        current_user=root_user,
        session=session,
        data=ProjectCreate(
            name="review-permission-project",
            member_ids=[root_user.id, supervisor.id],
        ),
    )
    task = create_task(
        current_user=root_user,
        session=session,
        data=TaskCreate(
            name="review-permission-task",
            project_id=project.id,
            supervisor_ids=[supervisor.id],
        ),
    )
    write_branch = _create_branch(
        session,
        root_user,
        name="review-write-branch",
        permissions={supervisor.id: BranchPermissionLevel.WRITE},
    )
    elevated_branch = _create_branch(
        session,
        root_user,
        name="review-elevated-branch",
        permissions={supervisor.id: BranchPermissionLevel.WRITE_ELEVATED},
    )

    def create_review_frame(label_branch_id: int) -> None:
        create_frame(
            current_user=root_user,
            session=session,
            data=FrameCreate(
                task_id=task.id,
                account_id=supervisor.id,
                work_type=WorkType.REVIEW,
                source_group_id=None,
                label_branch_id=label_branch_id,
            ),
        )

    with pytest.raises(HTTPException) as exc_info:
        create_review_frame(write_branch.id)

    assert exc_info.value.status_code == 400
    assert "lacks WRITE_ELEVATED access" in exc_info.value.detail

    create_review_frame(elevated_branch.id)

    # The same account keeps working as an annotator at plain WRITE: the level is
    # chosen by the frame's work type, not by its owner's other assignments.
    create_frame(
        current_user=root_user,
        session=session,
        data=FrameCreate(
            task_id=create_task(
                current_user=root_user,
                session=session,
                data=TaskCreate(
                    name="annotate-permission-task",
                    project_id=project.id,
                    annotator_ids=[supervisor.id],
                ),
            ).id,
            account_id=supervisor.id,
            work_type=WorkType.ANNOTATE,
            source_group_id=None,
            label_branch_id=write_branch.id,
        ),
    )


def _seed_frames(
    session: Session,
    root_user: UserPublic,
    *,
    branch_id: int,
    count: int,
    start: int = 0,
) -> list[tuple[int, int]]:
    """
    Create ``count`` frames starting at index ``start`` and return their
    ``(frame id, worker id)`` pairs.

    Every frame owns its own task, project, source group and worker, so no row
    can be served from another row's already-loaded relationships, while all of
    them share ``branch_id`` so the branch's own projection stays a per-page
    constant. The frames themselves belong to ``root_user``, which is what lets
    the default and the last-viewed listings both read the whole page.
    """
    records = []
    for index in range(start, start + count):
        worker = UserPublic.model_validate(
            create_user(
                current_user=root_user,
                session=session,
                data=UserCreate(
                    username=f"frames-worker-{index}",
                    password="password",
                    roles={Role.ANNOTATOR, Role.SUPERVISOR},
                ),
            ),
        )
        project = create_project(
            current_user=root_user,
            session=session,
            data=ProjectCreate(
                name=f"frames-project-{index}",
                member_ids=[root_user.id, worker.id],
            ),
        )
        task = create_task(
            current_user=root_user,
            session=session,
            data=TaskCreate(
                name=f"frames-task-{index}",
                project_id=project.id,
                supervisor_ids=[root_user.id, worker.id],
                annotator_ids=[root_user.id, worker.id],
            ),
        )
        # A descendant per task, so a payload that re-adopted the recursive
        # `TaskPublic.children` has to pay for it here.
        create_task(
            current_user=root_user,
            session=session,
            data=TaskCreate(
                name=f"frames-task-{index}-child",
                project_id=project.id,
                parent_id=task.id,
            ),
        )
        source_group = create_source_group(
            current_user=root_user,
            session=session,
            data=SourceGroupCreate(name=f"frames-source-{index}"),
        )
        frame = create_frame(
            current_user=root_user,
            session=session,
            data=FrameCreate(
                task_id=task.id,
                account_id=root_user.id,
                work_type=WorkType.ANNOTATE,
                source_group_id=source_group.id,
                label_branch_id=branch_id,
                # Viewed, so the last-viewed listing reads the same rows as the
                # default one instead of an empty page.
                last_viewed_at=_BASE_TIME + timedelta(minutes=index),
            ),
        )
        records.append((frame.id, worker.id))

    return records


def _measure_statements(session: Session, action: Callable[[], object]) -> int:
    """Count the statements ``action`` runs, excluding any it leaves unflushed."""
    statements = 0

    def count_statement(*_args):
        nonlocal statements
        statements += 1

    engine = session.get_bind()
    event.listen(engine, "before_cursor_execute", count_statement)
    try:
        action()
    finally:
        event.remove(engine, "before_cursor_execute", count_statement)

    return statements


def _serialize_page(root_user: UserPublic, session: Session, *, recent: bool) -> None:
    """Re-read the frame rows from the database and serialize every one."""
    session.expunge_all()
    records = (
        list_recent_frames(current_user=root_user, session=session)
        if recent
        else list_frames(current_user=root_user, session=session)
    )
    for record in records:
        FramePublicWithParents.model_validate(record)


@pytest.mark.parametrize("recent", [False, True])
def test_frame_list_serialization_has_bounded_query_count(
    root_user: UserPublic,
    session: Session,
    *,
    recent: bool,
):
    """
    Reading and serializing a page costs the same number of queries however many
    rows the page holds. The second page has three times as many frames as the
    first, so per-row lazy loading cannot hide behind a fixed page.
    """
    branch_id = _create_branch(session, root_user, name="frames-listed-branch").id
    _seed_frames(session, root_user, branch_id=branch_id, count=2)
    session.commit()
    small_page = _measure_statements(
        session,
        lambda: _serialize_page(root_user, session, recent=recent),
    )

    _seed_frames(session, root_user, branch_id=branch_id, count=6, start=2)
    session.commit()
    large_page = _measure_statements(
        session,
        lambda: _serialize_page(root_user, session, recent=recent),
    )

    assert small_page == large_page == _LIST_STATEMENTS


def test_frame_payload_keeps_assigned_accounts_but_not_the_task_tree(
    root_user: UserPublic,
    session: Session,
):
    """
    The flat task projection still carries what the grids and the editor read --
    the assigned accounts, the frame's own account and both groups -- and no
    longer carries the recursive subtree.
    """
    (frame_id, worker_id) = _seed_frames(
        session,
        root_user,
        branch_id=_create_branch(session, root_user, name="frames-flat-branch").id,
        count=1,
    )[0]
    session.commit()

    record = read_frame(current_user=root_user, session=session, id=frame_id)
    payload = FramePublicWithParents.model_validate(record)

    assert not hasattr(payload.task, "children")
    assert {account.id for account in payload.task.supervisors} == {root_user.id, worker_id}
    assert {account.id for account in payload.task.annotators} == {root_user.id, worker_id}
    assert payload.account.id == root_user.id
    assert payload.source_group is not None
    assert payload.label_branch is not None


def _serialized_keys(value: object) -> set[str]:
    """Every mapping key at any depth of a ``model_dump()`` result."""
    if isinstance(value, dict):
        return set(value) | {key for nested in value.values() for key in _serialized_keys(nested)}
    if isinstance(value, (list, tuple)):
        return {key for nested in value for key in _serialized_keys(nested)}

    return set()


def test_frame_payload_never_serializes_another_users_preferences(
    root_user: UserPublic,
    session: Session,
):
    """
    A frame belongs to one account and is read by everybody who may see its
    task, and the task it embeds lists that task's supervisors and annotators.
    Each of those positions is an AccountPublicSummary, whose fields are `id`
    and `username`, so a stored ``preferences`` value is absent from the
    serialized payload at every depth.
    """
    (frame_id, worker_id) = _seed_frames(
        session,
        root_user,
        branch_id=_create_branch(session, root_user, name="frames-private-branch").id,
        count=1,
    )[0]
    for account_id in (root_user.id, worker_id):
        account = session.get(Account, account_id)
        account.preferences = {"home": "Some Street 12"}
        session.add(account)
    session.commit()

    record = read_frame(current_user=root_user, session=session, id=frame_id)
    payload = FramePublicWithParents.model_validate(record)

    assert session.get(Account, worker_id).preferences == {"home": "Some Street 12"}
    assert "preferences" not in _serialized_keys(payload.model_dump())


def test_count_and_id_reads_do_not_load_rows(root_user: UserPublic, session: Session):
    """
    The count and id-only paths cost one statement at any table size. They share
    the filtered query with the listing, so this fails if the row-reading loader
    options ever leak into them.
    """
    reads: tuple[Callable[[Session], object], ...] = (
        lambda session: count_frames(current_user=root_user, session=session),
        lambda session: set(list_frame_ids(current_user=root_user, session=session)),
        lambda session: count_recent_frames(current_user=root_user, session=session),
    )

    def read_once(read: Callable[[Session], object]) -> tuple[int, object]:
        results: list[object] = []

        def action() -> None:
            session.expunge_all()
            results.append(read(session))

        return _measure_statements(session, action), results[0]

    branch_id = _create_branch(session, root_user, name="frames-aggregate-branch").id
    _seed_frames(session, root_user, branch_id=branch_id, count=2)
    session.commit()
    small = [read_once(read) for read in reads]

    _seed_frames(session, root_user, branch_id=branch_id, count=6, start=2)
    session.commit()
    large = [read_once(read) for read in reads]

    assert [statements for statements, _ in small] == [1, 1, 1]
    assert [statements for statements, _ in large] == [1, 1, 1]
    # The reads track the table rather than serving something stale: the single
    # statement is the whole job.
    assert small[0][1] == 2
    assert len(small[1][1]) == 2
    assert small[2][1] == 2
    assert large[0][1] == 8
    assert len(large[1][1]) == 8
    assert large[2][1] == 8
