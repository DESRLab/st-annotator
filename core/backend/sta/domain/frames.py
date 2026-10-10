from collections.abc import Iterable, Sequence, Set
from datetime import datetime
from http import HTTPStatus
from typing import Any, cast

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy.orm import selectinload
from sqlmodel import Session, delete, insert, select, update

from sta.common.database.execution import execute_statement, sql_column, stamp_bulk_edit

from ..models.frame import Frame, FrameBulkUpdate, FrameCreate, FrameUpdate
from ..models.label.repo import BranchPermissionLevel
from ..models.task import Task, TaskAnnotator, TaskSupervisor, WorkType
from ..models.user import Role, User, UserPublic
from .auth import require_role
from .label.repo.branches import can_access_branch
from .ops import reserve_bulk_insert_ids
from .querying import (
    Pagination,
    SortDirection,
    apply_sort,
    count_query,
    filter_in,
    filter_range,
    id_query,
    paginate,
)
from .tasks import get_inherited_assignment_pairs

#: The columns a frame's owner may write, whoever the caller is. ``issued_at`` is
#: concurrency metadata for a single-record edit rather than a frame column, so
#: it is accepted but never applied.
FRAME_OWNER_EDITABLE_FIELDS = frozenset({"is_complete", "last_viewed_at", "issued_at"})

_FRAME_SORT_COLUMNS = {
    "id": sql_column(Frame.id),
    "account_id": sql_column(Frame.account_id),
    "source_group_id": sql_column(Frame.source_group_id),
    "label_branch_id": sql_column(Frame.label_branch_id),
    "min_timestamp": sql_column(Frame.min_timestamp),
    "max_timestamp": sql_column(Frame.max_timestamp),
    "last_viewed_at": sql_column(Frame.last_viewed_at),
    "is_complete": sql_column(Frame.is_complete),
}


def can_read_frame_filters(user: UserPublic):
    if user.has_role(Role.PROJECT_MANAGER):
        return []

    return [sql_column(Frame.account_id) == user.id]


def can_read_frame(
    user: UserPublic,
    session: Session,
    frame: Frame,
) -> bool:
    if user.has_role(Role.PROJECT_MANAGER):
        return True

    return user.id == frame.account_id


def require_frame_writer(
    user: UserPublic,
):
    return require_role(user, Role.PROJECT_MANAGER)


def require_frame_update(
    user: UserPublic,
    frame: Frame,
    data: FrameUpdate,
):
    if user.has_role(Role.PROJECT_MANAGER):
        return True

    data_to_update = data.model_dump(exclude_unset=True)
    if user.id == frame.account_id and set(data_to_update) <= FRAME_OWNER_EDITABLE_FIELDS:
        return True

    raise HTTPException(status_code=HTTPStatus.FORBIDDEN)


def require_frame_bulk_update(
    user: UserPublic,
    session: Session,
    ids: Set[int],
    data_to_update: dict[str, Any],
) -> None:
    """
    Gate a bulk write before it touches any row.

    A project manager may write anything to any frame. Anyone else is held to the
    same narrow grant :func:`require_frame_update` gives an owner of a single
    frame, applied to the whole selection at once: the payload must stay inside
    :data:`FRAME_OWNER_EDITABLE_FIELDS` *and* every selected frame must belong to
    the caller. Both halves are needed -- either one on its own would let an
    annotator reach another account's rows or move them elsewhere.

    Ownership is read as a column query rather than by loading the records: the
    caller has not written yet, and instances pulled into the identity map here
    would be served stale by the re-read that validates the written rows.
    """
    if user.has_role(Role.PROJECT_MANAGER):
        return

    if set(data_to_update) - FRAME_OWNER_EDITABLE_FIELDS:
        raise HTTPException(status_code=HTTPStatus.FORBIDDEN)

    owner_ids = session.exec(
        select(sql_column(Frame.account_id)).where(sql_column(Frame.id).in_(ids))
    ).all()
    if any(owner_id != user.id for owner_id in owner_ids):
        raise HTTPException(status_code=HTTPStatus.FORBIDDEN)


def _validate_task_id(
    current_user: UserPublic,
    session: Session,
    frames: FrameCreate | Frame | Iterable[FrameCreate | Frame],
):
    frames = [frames] if isinstance(frames, (FrameCreate, Frame)) else list(frames)

    task_ids = {frame.task_id for frame in frames}
    if not task_ids:
        return

    task_id_column = sql_column(Task.id)
    existing_task_ids = set(
        session.exec(select(task_id_column).where(task_id_column.in_(task_ids))).all(),
    )
    if task_ids - existing_task_ids:
        raise HTTPException(
            status_code=HTTPStatus.NOT_FOUND,
            detail="Cannot find parent task",
        )

    annotate_pairs = {
        (frame.task_id, frame.account_id)
        for frame in frames
        if frame.work_type == WorkType.ANNOTATE
    }
    review_pairs = {
        (frame.task_id, frame.account_id) for frame in frames if frame.work_type == WorkType.REVIEW
    }

    if annotate_pairs:
        valid_pairs = get_inherited_assignment_pairs(
            session,
            {task_id for task_id, _account_id in annotate_pairs},
            WorkType.ANNOTATE,
        )
        if annotate_pairs - valid_pairs:
            raise HTTPException(
                status_code=HTTPStatus.BAD_REQUEST,
                detail="Annotator frames can only be assigned to task annotators",
            )

    if review_pairs:
        valid_pairs = get_inherited_assignment_pairs(
            session,
            {task_id for task_id, _account_id in review_pairs},
            WorkType.REVIEW,
        )
        if review_pairs - valid_pairs:
            raise HTTPException(
                status_code=HTTPStatus.BAD_REQUEST,
                detail="Reviewer frames can only be assigned to task supervisors",
            )


def _validate_label_branch_write_access(
    session: Session,
    frames: Iterable[FrameCreate | Frame],
) -> None:
    """Require every frame owner to be able to write its label branch.

    Annotator frames need `WRITE`; reviewer frames need `WRITE_ELEVATED`, so a
    reviewer cannot be bound to a branch they may only append to.
    """
    failures: list[str] = []
    checks = {
        (
            frame.account_id,
            frame.label_branch_id,
            BranchPermissionLevel.WRITE_ELEVATED
            if frame.work_type == WorkType.REVIEW
            else BranchPermissionLevel.WRITE,
        )
        for frame in frames
        if frame.label_branch_id is not None
    }
    for account_id, label_branch_id, required in checks:
        account = session.get(User, account_id)
        if account is None:
            raise HTTPException(HTTPStatus.NOT_FOUND, "Cannot find frame account")
        user = UserPublic.model_validate(account)
        if not can_access_branch(
            user,
            session,
            id=label_branch_id,
            perm_lv=required,
        ):
            failures.append(
                f"{account.username!r} lacks {required.name} access to label branch "
                f"{label_branch_id}"
            )
    if failures:
        raise HTTPException(status_code=HTTPStatus.BAD_REQUEST, detail="; ".join(failures))


def _validate_st_bounds(records: Iterable[Frame | FrameCreate]):
    """
    Reject writes whose resulting spatiotemporal bounds are inverted.

    The min/max columns are only cross-checked by :class:`PartialSTBounds`, and
    ``st_bounds`` is a property rather than a field, so nothing validates it while
    a row is written. A partial update that pushes a minimum past the retained
    maximum would therefore persist and only fail later, when the editor loaders
    read ``st_bounds`` -- raising :class:`pydantic.ValidationError` as an
    unhandled 500 for every frame in the batch. Evaluating the resulting
    ``st_bounds`` reuses the authoritative validators instead of duplicating the
    min/max comparison, and runs before the caller commits.
    """
    for record in records:
        try:
            _ = record.st_bounds
        except ValidationError as e:
            reasons = "; ".join(str(error["msg"]) for error in e.errors())
            raise HTTPException(
                status_code=HTTPStatus.UNPROCESSABLE_ENTITY,
                detail=f"Invalid frame bounds: {reasons}",
            ) from e


def create_frame(
    *,
    current_user: UserPublic,
    session: Session,
    data: FrameCreate,
):
    require_frame_writer(current_user)

    _validate_task_id(current_user, session, data)
    _validate_label_branch_write_access(session, [data])

    record = Frame.model_validate(data)
    _validate_st_bounds([record])

    session.add(record)
    session.flush([record])

    return record


def _get_frame_load_options() -> tuple[Any, ...]:
    """
    Eager-load the relationships that ``FramePublicWithParents`` serializes.

    The read endpoints return that model, whose ``account``, ``source_group``,
    ``label_branch`` and ``task`` attributes are plain ORM relationships, and
    whose embedded task reaches its accounts through the ``supervisor_links`` /
    ``annotator_links`` association objects (``Task.supervisors`` and
    ``Task.annotators`` are properties over those links, and each link owns an
    ``account``). Without these options every row in a page lazy-loads that whole
    fan-out, so a page of N frames costs O(N) SELECTs instead of a constant.

    The options are attached by the row-reading functions only: the count and
    id-only paths reuse the same filtered queries and wrap them in a subquery or
    ``with_only_columns``, where loader options would be dead weight.
    """
    return (
        selectinload(cast(Any, Frame).account),
        selectinload(cast(Any, Frame).source_group),
        selectinload(cast(Any, Frame).label_branch),
        selectinload(cast(Any, Frame).task)
        .selectinload(cast(Any, Task).supervisor_links)
        .selectinload(cast(Any, TaskSupervisor).account),
        selectinload(cast(Any, Frame).task)
        .selectinload(cast(Any, Task).annotator_links)
        .selectinload(cast(Any, TaskAnnotator).account),
    )


def _build_filtered_query(
    *,
    current_user: UserPublic,
    session: Session,
    task_id: int | None = None,
    work_type: WorkType | None = None,
    source_group_ids: Sequence[int] | None = None,
    label_branch_ids: Sequence[int] | None = None,
    account_ids: Sequence[int] | None = None,
    id: int | None = None,
    id_ge: int | None = None,
    id_le: int | None = None,
    is_complete: Sequence[bool] | None = None,
    min_timestamp_ge: datetime | None = None,
    min_timestamp_lt: datetime | None = None,
    max_timestamp_ge: datetime | None = None,
    max_timestamp_lt: datetime | None = None,
    last_viewed_at_ge: datetime | None = None,
    last_viewed_at_lt: datetime | None = None,
    sort_by: str | None = None,
    sort_dir: SortDirection = "asc",
):
    q = select(Frame)
    for cond in can_read_frame_filters(current_user):
        q = q.where(cond)
    if task_id is not None:
        q = q.where(Frame.task_id == task_id)
    if work_type is not None:
        q = q.where(Frame.work_type == work_type)
    q = filter_in(q, sql_column(Frame.source_group_id), source_group_ids)
    q = filter_in(q, sql_column(Frame.label_branch_id), label_branch_ids)
    q = filter_in(q, sql_column(Frame.account_id), account_ids)
    if id is not None:
        q = q.where(Frame.id == id)
    q = filter_range(q, sql_column(Frame.id), ge=id_ge, le=id_le)
    q = filter_in(q, sql_column(Frame.is_complete), is_complete)
    q = filter_range(q, sql_column(Frame.min_timestamp), ge=min_timestamp_ge, lt=min_timestamp_lt)
    q = filter_range(q, sql_column(Frame.max_timestamp), ge=max_timestamp_ge, lt=max_timestamp_lt)
    q = filter_range(
        q,
        sql_column(Frame.last_viewed_at),
        ge=last_viewed_at_ge,
        lt=last_viewed_at_lt,
    )
    if sort_by is not None:
        q = apply_sort(q, _FRAME_SORT_COLUMNS, sort_by, sort_dir)
    else:
        # Default to a stable spatiotemporal order (mirroring the editor's
        # canonical TXY frame-path sort): temporal bounds first, then spatial
        # bounds, then id. Unlike a last-viewed order this never mutates as
        # frames are viewed, so positional reads of the listing stay stable.
        q = q.order_by(
            sql_column(Frame.min_timestamp),
            sql_column(Frame.max_timestamp),
            sql_column(Frame.min_x),
            sql_column(Frame.min_y),
            sql_column(Frame.min_z),
            sql_column(Frame.max_x),
            sql_column(Frame.max_y),
            sql_column(Frame.max_z),
            sql_column(Frame.id),
        )

    return q


def list_frames(
    *,
    current_user: UserPublic,
    session: Session,
    offset: int = 0,
    limit: int | None = None,
    task_id: int | None = None,
    work_type: WorkType | None = None,
    source_group_ids: Sequence[int] | None = None,
    label_branch_ids: Sequence[int] | None = None,
    account_ids: Sequence[int] | None = None,
    id: int | None = None,
    id_ge: int | None = None,
    id_le: int | None = None,
    is_complete: Sequence[bool] | None = None,
    min_timestamp_ge: datetime | None = None,
    min_timestamp_lt: datetime | None = None,
    max_timestamp_ge: datetime | None = None,
    max_timestamp_lt: datetime | None = None,
    last_viewed_at_ge: datetime | None = None,
    last_viewed_at_lt: datetime | None = None,
    sort_by: str | None = None,
    sort_dir: SortDirection = "asc",
):
    q = _build_filtered_query(
        current_user=current_user,
        session=session,
        task_id=task_id,
        work_type=work_type,
        source_group_ids=source_group_ids,
        label_branch_ids=label_branch_ids,
        account_ids=account_ids,
        id=id,
        id_ge=id_ge,
        id_le=id_le,
        is_complete=is_complete,
        min_timestamp_ge=min_timestamp_ge,
        min_timestamp_lt=min_timestamp_lt,
        max_timestamp_ge=max_timestamp_ge,
        max_timestamp_lt=max_timestamp_lt,
        last_viewed_at_ge=last_viewed_at_ge,
        last_viewed_at_lt=last_viewed_at_lt,
        sort_by=sort_by,
        sort_dir=sort_dir,
    )
    q = q.options(*_get_frame_load_options())
    q = paginate(q, Pagination(offset=offset, limit=limit))

    return session.exec(q).all()


def list_frame_ids(
    *,
    current_user: UserPublic,
    session: Session,
    task_id: int | None = None,
    work_type: WorkType | None = None,
    source_group_ids: Sequence[int] | None = None,
    label_branch_ids: Sequence[int] | None = None,
    account_ids: Sequence[int] | None = None,
    id: int | None = None,
    id_ge: int | None = None,
    id_le: int | None = None,
    is_complete: Sequence[bool] | None = None,
    min_timestamp_ge: datetime | None = None,
    min_timestamp_lt: datetime | None = None,
    max_timestamp_ge: datetime | None = None,
    max_timestamp_lt: datetime | None = None,
    last_viewed_at_ge: datetime | None = None,
    last_viewed_at_lt: datetime | None = None,
) -> list[int]:
    q = _build_filtered_query(
        current_user=current_user,
        session=session,
        task_id=task_id,
        work_type=work_type,
        source_group_ids=source_group_ids,
        label_branch_ids=label_branch_ids,
        account_ids=account_ids,
        id=id,
        id_ge=id_ge,
        id_le=id_le,
        is_complete=is_complete,
        min_timestamp_ge=min_timestamp_ge,
        min_timestamp_lt=min_timestamp_lt,
        max_timestamp_ge=max_timestamp_ge,
        max_timestamp_lt=max_timestamp_lt,
        last_viewed_at_ge=last_viewed_at_ge,
        last_viewed_at_lt=last_viewed_at_lt,
    )

    ids = id_query(q, sql_column(Frame.id))
    return list(execute_statement(session, ids).scalars().all())


def count_frames(
    *,
    current_user: UserPublic,
    session: Session,
    task_id: int | None = None,
    work_type: WorkType | None = None,
    source_group_ids: Sequence[int] | None = None,
    label_branch_ids: Sequence[int] | None = None,
    account_ids: Sequence[int] | None = None,
    id: int | None = None,
    id_ge: int | None = None,
    id_le: int | None = None,
    is_complete: Sequence[bool] | None = None,
    min_timestamp_ge: datetime | None = None,
    min_timestamp_lt: datetime | None = None,
    max_timestamp_ge: datetime | None = None,
    max_timestamp_lt: datetime | None = None,
    last_viewed_at_ge: datetime | None = None,
    last_viewed_at_lt: datetime | None = None,
) -> int:
    q = _build_filtered_query(
        current_user=current_user,
        session=session,
        task_id=task_id,
        work_type=work_type,
        source_group_ids=source_group_ids,
        label_branch_ids=label_branch_ids,
        account_ids=account_ids,
        id=id,
        id_ge=id_ge,
        id_le=id_le,
        is_complete=is_complete,
        min_timestamp_ge=min_timestamp_ge,
        min_timestamp_lt=min_timestamp_lt,
        max_timestamp_ge=max_timestamp_ge,
        max_timestamp_lt=max_timestamp_lt,
        last_viewed_at_ge=last_viewed_at_ge,
        last_viewed_at_lt=last_viewed_at_lt,
    )

    return session.exec(count_query(q)).one()


def _build_recent_query(
    *,
    current_user: UserPublic,
    task_id: int | None = None,
    work_type: WorkType | None = None,
    source_group_ids: Sequence[int] | None = None,
    label_branch_ids: Sequence[int] | None = None,
    id: int | None = None,
    id_ge: int | None = None,
    id_le: int | None = None,
    is_complete: Sequence[bool] | None = None,
    min_timestamp_ge: datetime | None = None,
    min_timestamp_lt: datetime | None = None,
    max_timestamp_ge: datetime | None = None,
    max_timestamp_lt: datetime | None = None,
    last_viewed_at_ge: datetime | None = None,
    last_viewed_at_lt: datetime | None = None,
    sort_by: str | None = None,
    sort_dir: SortDirection = "asc",
):
    q = (
        select(Frame)
        .where(Frame.account_id == current_user.id)
        .where(sql_column(Frame.last_viewed_at).is_not(None))
    )
    if task_id is not None:
        q = q.where(Frame.task_id == task_id)
    if work_type is not None:
        q = q.where(Frame.work_type == work_type)
    q = filter_in(q, sql_column(Frame.source_group_id), source_group_ids)
    q = filter_in(q, sql_column(Frame.label_branch_id), label_branch_ids)
    if id is not None:
        q = q.where(Frame.id == id)
    q = filter_range(q, sql_column(Frame.id), ge=id_ge, le=id_le)
    q = filter_in(q, sql_column(Frame.is_complete), is_complete)
    q = filter_range(q, sql_column(Frame.min_timestamp), ge=min_timestamp_ge, lt=min_timestamp_lt)
    q = filter_range(q, sql_column(Frame.max_timestamp), ge=max_timestamp_ge, lt=max_timestamp_lt)
    q = filter_range(
        q,
        sql_column(Frame.last_viewed_at),
        ge=last_viewed_at_ge,
        lt=last_viewed_at_lt,
    )
    if sort_by is not None:
        q = apply_sort(q, _FRAME_SORT_COLUMNS, sort_by, sort_dir)
    else:
        q = q.order_by(sql_column(Frame.last_viewed_at).desc(), sql_column(Frame.id).desc())

    return q


def list_recent_frames(
    *,
    current_user: UserPublic,
    session: Session,
    offset: int = 0,
    limit: int | None = None,
    task_id: int | None = None,
    work_type: WorkType | None = None,
    source_group_ids: Sequence[int] | None = None,
    label_branch_ids: Sequence[int] | None = None,
    id: int | None = None,
    id_ge: int | None = None,
    id_le: int | None = None,
    is_complete: Sequence[bool] | None = None,
    min_timestamp_ge: datetime | None = None,
    min_timestamp_lt: datetime | None = None,
    max_timestamp_ge: datetime | None = None,
    max_timestamp_lt: datetime | None = None,
    last_viewed_at_ge: datetime | None = None,
    last_viewed_at_lt: datetime | None = None,
    sort_by: str | None = None,
    sort_dir: SortDirection = "asc",
):
    q = _build_recent_query(
        current_user=current_user,
        task_id=task_id,
        work_type=work_type,
        source_group_ids=source_group_ids,
        label_branch_ids=label_branch_ids,
        id=id,
        id_ge=id_ge,
        id_le=id_le,
        is_complete=is_complete,
        min_timestamp_ge=min_timestamp_ge,
        min_timestamp_lt=min_timestamp_lt,
        max_timestamp_ge=max_timestamp_ge,
        max_timestamp_lt=max_timestamp_lt,
        last_viewed_at_ge=last_viewed_at_ge,
        last_viewed_at_lt=last_viewed_at_lt,
        sort_by=sort_by,
        sort_dir=sort_dir,
    )
    q = q.options(*_get_frame_load_options())
    q = paginate(q, Pagination(offset=offset, limit=limit))

    return session.exec(q).all()


def count_recent_frames(
    *,
    current_user: UserPublic,
    session: Session,
    task_id: int | None = None,
    work_type: WorkType | None = None,
    source_group_ids: Sequence[int] | None = None,
    label_branch_ids: Sequence[int] | None = None,
    id: int | None = None,
    id_ge: int | None = None,
    id_le: int | None = None,
    is_complete: Sequence[bool] | None = None,
    min_timestamp_ge: datetime | None = None,
    min_timestamp_lt: datetime | None = None,
    max_timestamp_ge: datetime | None = None,
    max_timestamp_lt: datetime | None = None,
    last_viewed_at_ge: datetime | None = None,
    last_viewed_at_lt: datetime | None = None,
) -> int:
    q = _build_recent_query(
        current_user=current_user,
        task_id=task_id,
        work_type=work_type,
        source_group_ids=source_group_ids,
        label_branch_ids=label_branch_ids,
        id=id,
        id_ge=id_ge,
        id_le=id_le,
        is_complete=is_complete,
        min_timestamp_ge=min_timestamp_ge,
        min_timestamp_lt=min_timestamp_lt,
        max_timestamp_ge=max_timestamp_ge,
        max_timestamp_lt=max_timestamp_lt,
        last_viewed_at_ge=last_viewed_at_ge,
        last_viewed_at_lt=last_viewed_at_lt,
    )

    return session.exec(count_query(q)).one()


def read_frame(
    *,
    current_user: UserPublic,
    session: Session,
    id: int,
):
    q = select(Frame).options(*_get_frame_load_options()).where(Frame.id == id)
    for cond in can_read_frame_filters(current_user):
        q = q.where(cond)

    record = session.exec(q).one_or_none()
    if not record:
        raise HTTPException(status_code=HTTPStatus.NOT_FOUND)

    return record


def update_frame(
    *,
    current_user: UserPublic,
    session: Session,
    id: int,
    data: FrameUpdate,
):
    record = session.get(Frame, id)
    if not record:
        raise HTTPException(status_code=HTTPStatus.NOT_FOUND)

    require_frame_update(current_user, record, data)

    data_to_update = data.model_dump(exclude_unset=True)

    record.sqlmodel_update(data_to_update)
    # Validate after the update so the retained columns participate, and before
    # the flush so an inverted box never reaches the database.
    _validate_st_bounds([record])
    session.add(record)
    session.flush([record])

    session.refresh(record)

    _validate_task_id(current_user, session, record)
    if {"task_id", "account_id", "label_branch_id", "work_type"} & data_to_update.keys():
        _validate_label_branch_write_access(session, [record])

    return record


def delete_frame(
    *,
    current_user: UserPublic,
    session: Session,
    id: int,
):
    record = session.get(Frame, id)
    if not record:
        raise HTTPException(status_code=HTTPStatus.NOT_FOUND)

    require_frame_writer(current_user)

    session.delete(record)
    session.flush([record])


def bulk_create_frames(
    *,
    current_user: UserPublic,
    session: Session,
    data: list[FrameCreate],
) -> list[int]:
    require_frame_writer(current_user)

    _validate_task_id(current_user, session, data)
    _validate_label_branch_write_access(session, data)
    _validate_st_bounds(data)

    ids = reserve_bulk_insert_ids(
        session=session,
        table_cls=Frame,
        count=len(data),
    )

    execute_statement(
        session,
        insert(Frame),
        [{"id": record_id, **item.model_dump()} for record_id, item in zip(ids, data, strict=True)],
    )

    return ids


def bulk_update_frames(
    *,
    current_user: UserPublic,
    session: Session,
    ids: Set[int],
    data: FrameBulkUpdate,
):
    data_to_update = data.model_dump(exclude_unset=True)
    require_frame_bulk_update(current_user, session, ids, data_to_update)

    has_updates = stamp_bulk_edit(data_to_update)

    id_column = sql_column(Frame.id)

    if has_updates:
        q = update(Frame).where(id_column.in_(ids)).values(**data_to_update)
        execute_statement(session, q)

    q = select(Frame).filter(id_column.in_(ids))
    records = session.exec(q).all()

    _validate_task_id(current_user, session, records)
    if {"task_id", "account_id", "label_branch_id", "work_type"} & data_to_update.keys():
        _validate_label_branch_write_access(session, records)
    # Validate the rows as re-read after the UPDATE so that a partial payload is
    # checked against the values it retains. Raising here aborts the commit, so
    # the bulk statement is rolled back rather than leaving inverted bounds.
    _validate_st_bounds(records)


def bulk_delete_frames(
    *,
    current_user: UserPublic,
    session: Session,
    ids: Set[int],
):
    require_frame_writer(current_user)

    # No table references frame.id, so a set-oriented DELETE needs no cascade
    # bookkeeping; it is equivalent to deleting each frame through the ORM.
    q = delete(Frame).where(sql_column(Frame.id).in_(ids))
    execute_statement(session, q)
