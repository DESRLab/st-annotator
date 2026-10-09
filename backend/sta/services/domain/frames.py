from collections.abc import Set
from http import HTTPStatus

from fastapi import HTTPException
from sqlalchemy.orm import QueryableAttribute
from sqlmodel import Session, func, insert, select, update

from ..models.frame import Frame, FrameBulkUpdate, FrameCreate, FrameUpdate
from ..models.task import Task, WorkType
from ..models.user import Role, UserPublic
from .auth import require_role
from .label.repo.branches import list_branches
from .ops import reserve_bulk_insert_ids


def can_read_frame_filters(user: UserPublic):
    if user.has_role(Role.PROJECT_MANAGER):
        return []

    return [Frame.account_id == user.id]


def can_read_frame(
    user: UserPublic,
    session: Session,
    frame: Frame,
):
    if user.has_role(Role.PROJECT_MANAGER):
        return True

    return user.id == frame.account_id


def require_frame_writer(
    user: UserPublic,
    session: Session,
    frame: Frame | None = None,
):
    frame = None if id is None else session.get(Frame, id)

    if frame is not None and can_read_frame(user, session, frame):
        return True

    return require_role(user, Role.PROJECT_MANAGER)


def _validate_source_group_id(
    current_user: UserPublic,
    session: Session,
    frame: FrameCreate | Frame,
):
    task = session.get(Task, frame.task_id)
    if not task:
        raise HTTPException(
            status_code=HTTPStatus.NOT_FOUND,
            detail="Cannot find parent task",
        )

    if frame.source_group_id != task.source_group_id:
        raise HTTPException(
            status_code=HTTPStatus.NOT_FOUND,
            detail="The source group is not assigned to the parent task!",
        )


def _validate_label_branch_id(
    current_user: UserPublic,
    session: Session,
    frame: FrameCreate | Frame,
):
    task = session.get(Task, frame.task_id)
    if not task:
        raise HTTPException(
            status_code=HTTPStatus.NOT_FOUND,
            detail="Cannot find parent task",
        )

    valid_branches = list_branches(
        current_user=current_user,
        session=session,
        group_id=task.label_group_id,
    )
    valid_branch_ids = {branch.id for branch in valid_branches}

    if frame.label_branch_id not in valid_branch_ids:
        raise HTTPException(
            status_code=HTTPStatus.NOT_FOUND,
            detail="The label branch is not assigned to the parent task!",
        )


def create_frame(
    *,
    current_user: UserPublic,
    session: Session,
    data: FrameCreate,
):
    require_frame_writer(current_user, session)

    _validate_source_group_id(current_user, session, data)
    _validate_label_branch_id(current_user, session, data)

    record = Frame.model_validate(data)

    session.add(record)
    session.flush([record])

    return record


def _build_list_query(
    *,
    current_user: UserPublic,
    session: Session,
    offset: int = 0,
    limit: int | None = None,
    task_id: int | None = None,
    work_type: WorkType | None = None,
    source_group_id: int | None = None,
    label_branch_id: int | None = None,
):
    q = select(Frame).offset(offset)
    for cond in can_read_frame_filters(current_user):
        q = q.where(cond)
    if limit is not None:
        q = q.limit(limit)
    if task_id is not None:
        q = q.where(Frame.task_id == task_id)
    if work_type is not None:
        q = q.where(Frame.work_type == work_type)
    if source_group_id is not None:
        q = q.where(Frame.source_group_id == source_group_id)
    if label_branch_id is not None:
        q = q.where(Frame.label_branch_id == label_branch_id)

    return q


def list_frames(
    *,
    current_user: UserPublic,
    session: Session,
    offset: int = 0,
    limit: int | None = None,
    task_id: int | None = None,
    work_type: WorkType | None = None,
    source_group_id: int | None = None,
    label_branch_id: int | None = None,
):
    q = _build_list_query(
        current_user=current_user,
        session=session,
        offset=offset,
        limit=limit,
        task_id=task_id,
        work_type=work_type,
        source_group_id=source_group_id,
        label_branch_id=label_branch_id,
    )

    return session.exec(q).all()


def count_frames(
    *,
    current_user: UserPublic,
    session: Session,
    task_id: int | None = None,
    work_type: WorkType | None = None,
    source_group_id: int | None = None,
    label_branch_id: int | None = None,
) -> int:
    q = _build_list_query(
        current_user=current_user,
        session=session,
        task_id=task_id,
        work_type=work_type,
        source_group_id=source_group_id,
        label_branch_id=label_branch_id,
    )

    return session.exec(select(func.count()).select_from(q.subquery())).one()


def read_frame(
    *,
    current_user: UserPublic,
    session: Session,
    id: int,
):
    q = select(Frame).where(Frame.id == id)
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

    require_frame_writer(current_user, session, record)

    data_to_update = data.model_dump(exclude_unset=True)

    record.sqlmodel_update(data_to_update)
    session.add(record)
    session.flush([record])

    session.refresh(record)

    _validate_source_group_id(current_user, session, record)
    _validate_label_branch_id(current_user, session, record)

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

    require_frame_writer(current_user, session, record)

    session.delete(record)
    session.flush([record])


def bulk_create_frames(
    *,
    current_user: UserPublic,
    session: Session,
    data: list[FrameCreate],
) -> list[int]:
    require_frame_writer(current_user, session)

    for elem in data:
        _validate_source_group_id(current_user, session, elem)
        _validate_label_branch_id(current_user, session, elem)

    ids = reserve_bulk_insert_ids(
        session=session,
        table_cls=Frame,
        count=len(data),
    )

    session.execute(
        insert(Frame),
        [
            {'id': record_id, **item.model_dump()}
            for record_id, item in zip(ids, data, strict=True)
        ],
    )

    return ids


def bulk_update_frames(
    *,
    current_user: UserPublic,
    session: Session,
    ids: Set[int],
    data: FrameBulkUpdate,
):
    require_frame_writer(current_user, session)

    data_to_update = data.model_dump(exclude_unset=True)

    assert isinstance(Frame.id, QueryableAttribute)

    if data_to_update:
        q = update(Frame).where(Frame.id.in_(ids)).values(**data_to_update)
        session.execute(q)

    q = select(Frame).filter(Frame.id.in_(ids))
    records = session.exec(q)

    for record in records:
        _validate_source_group_id(current_user, session, record)
        _validate_label_branch_id(current_user, session, record)
