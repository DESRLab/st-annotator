from collections.abc import Collection, Generator, Set
from http import HTTPStatus
from typing import Literal

from fastapi import HTTPException
from sqlalchemy.orm import QueryableAttribute
from sqlmodel import Session, delete, func, insert, select, update

from ..models.project import Project
from ..models.task import Task, TaskBulkUpdate, TaskCreate, TaskUpdate, WorkType
from ..models.user import Role, User, UserPublic
from .auth import require_role


def can_read_task(
    user: UserPublic,
    session: Session,
    task: Task,
    *,
    work_types: Collection[WorkType] = WorkType,
):
    if user.has_role(Role.PROJECT_MANAGER):
        return True

    if (
        WorkType.ANNOTATE in work_types
        and user.id in get_inherited_annotator_ids(session, task)
        and user.has_role(Role.ANNOTATOR)
    ):
        return True

    if (  # noqa: SIM103
        WorkType.REVIEW in work_types
        and user.id in get_inherited_supervisor_ids(session, task)
        and user.has_role(Role.SUPERVISOR)
    ):
        return True

    return False


def require_task_writer(
    user: UserPublic,
    session: Session,
    task: Task | None = None,
    *,
    work_types: Collection[WorkType] = WorkType,
):
    return require_role(user, Role.PROJECT_MANAGER)


def _get_accessible_task_ids_query(user: UserPublic):
    if user.has_role(Role.PROJECT_MANAGER):
        return select(Task.id)

    seed_queries = []

    if user.has_role(Role.SUPERVISOR):
        supervisors_cls = Task.get_supervisor_links_cls()
        seed_queries.append(
            select(supervisors_cls.task_id.label("id"))
            .where(supervisors_cls.account_id == user.id),
        )

    if user.has_role(Role.ANNOTATOR):
        annotators_cls = Task.get_annotator_links_cls()
        seed_queries.append(
            select(annotators_cls.task_id.label("id"))
            .where(annotators_cls.account_id == user.id),
        )

    if not seed_queries:
        return select(Task.id).where(False)  # noqa: FBT003

    accessible_task_ids = seed_queries[0]
    for seed_query in seed_queries[1:]:
        accessible_task_ids = accessible_task_ids.union(seed_query)

    accessible_task_ids = accessible_task_ids.cte(name="accessible_task_ids", recursive=True)
    descendant_task_ids = select(Task.id.label("id")).where(Task.parent_id == accessible_task_ids.c.id)
    accessible_task_ids = accessible_task_ids.union_all(descendant_task_ids)

    return select(accessible_task_ids.c.id).distinct()


def can_read_task_filters(user: UserPublic):
    if user.has_role(Role.PROJECT_MANAGER):
        return []

    assert isinstance(Task.id, QueryableAttribute)

    return [Task.id.in_(_get_accessible_task_ids_query(user))]


def _build_list_tasks_query(
    *,
    current_user: UserPublic,
    session: Session,
    offset: int | None = 0,
    limit: int | None = None,
    project_id: int | None = None,
    name: str | None = None,
):
    q = select(Task)
    for cond in can_read_task_filters(current_user):
        q = q.where(cond)
    if offset is not None:
        q = q.offset(offset)
    if limit is not None:
        q = q.limit(limit)
    if project_id is not None:
        q = q.where(Task.project_id == project_id)
    if name is not None:
        q = q.where(Task.name == name)

    return q


def _traverse_ancestors(
    session: Session,
    task: Task,
) -> Generator[Task]:
    yield task

    if task.parent is not None:
        yield from _traverse_ancestors(session, task.parent)


def _traverse_descendants(
    session: Session,
    task: Task,
    *,
    mode: Literal['preorder', 'postorder'] = 'preorder',
) -> Generator[Task]:
    if mode == 'preorder':
        yield task

    for child in task.children:
        yield from _traverse_descendants(session, child, mode=mode)

    if mode == 'postorder':
        yield task


def _validate_parent_deadline(
    session: Session,
    task: TaskCreate | Task,
):
    parent_id = task.parent_id
    deadline = task.deadline

    if parent_id is not None:
        parent_record = session.get(Task, parent_id)
        if not parent_record:
            raise HTTPException(
                status_code=HTTPStatus.NOT_FOUND,
                detail="Cannot find parent task",
            )

        # These checks are not applicable to new tasks
        if isinstance(task, Task):
            if parent_id == task.id:
                raise HTTPException(
                    status_code=HTTPStatus.BAD_REQUEST,
                    detail="Cannot assign self as parent",
                )

            # Technically this can also catch self as parent but
            # we want the error to be more specific
            for descendant in _traverse_descendants(session, task):
                if parent_id == descendant.id:
                    raise HTTPException(
                        status_code=HTTPStatus.BAD_REQUEST,
                        detail="Cannot assign descendant as parent",
                    )

        if (
            deadline is not None
            and parent_record.deadline is not None
            and deadline > parent_record.deadline
        ):
            raise HTTPException(
                status_code=HTTPStatus.BAD_REQUEST,
                detail=f"The deadline cannot be later than that of the parent task ({parent_record.deadline.isoformat()}).",
            )


def _validate_supervisors(
    session: Session,
    task: TaskCreate | Task,
):
    assert isinstance(User.id, QueryableAttribute)

    q = select(User).filter(User.id.in_(task.supervisor_ids))
    supervisors = session.exec(q)

    bad_supervisors = [
        supervisor
        for supervisor in supervisors
        if Role.SUPERVISOR not in supervisor.roles
    ]
    if bad_supervisors:
        bad_usernames = [supervisor.username for supervisor in bad_supervisors]
        raise HTTPException(
            status_code=HTTPStatus.BAD_REQUEST,
            detail=f"The supervisors {bad_usernames} do not have the {Role.SUPERVISOR.name!r} role!",
        )

    project = session.get(Project, task.project_id)
    if not project:
        raise HTTPException(
            status_code=HTTPStatus.NOT_FOUND,
            detail="Cannot find parent project",
        )

    member_ids = {member.id for member in project.members}
    missing_supervisor_ids = set(task.supervisor_ids) - member_ids
    if missing_supervisor_ids:
        missing_usernames = [
            supervisor.username for supervisor in supervisors
            if supervisor.id in missing_supervisor_ids
        ]
        raise HTTPException(
            status_code=HTTPStatus.BAD_REQUEST,
            detail=f"The supervisors {missing_usernames} are not in the parent project!",
        )


def _validate_annotators(
    session: Session,
    task: TaskCreate | Task,
):
    assert isinstance(User.id, QueryableAttribute)

    q = select(User).filter(User.id.in_(task.annotator_ids))
    annotators = session.exec(q)

    bad_annotators = [
        annotator
        for annotator in annotators
        if Role.ANNOTATOR not in annotator.roles
    ]
    if bad_annotators:
        bad_usernames = [annotator.username for annotator in bad_annotators]
        raise HTTPException(
            status_code=HTTPStatus.BAD_REQUEST,
            detail=f"The annotators {bad_usernames} do not have the {Role.ANNOTATOR.name!r} role!",
        )

    project = session.get(Project, task.project_id)
    if not project:
        raise HTTPException(
            status_code=HTTPStatus.NOT_FOUND,
            detail="Cannot find parent project",
        )

    member_ids = {member.id for member in project.members}
    missing_annotator_ids = set(task.annotator_ids) - member_ids
    if missing_annotator_ids:
        missing_usernames = [
            annotator.username for annotator in annotators
            if annotator.id in missing_annotator_ids
        ]
        raise HTTPException(
            status_code=HTTPStatus.BAD_REQUEST,
            detail=f"The annotators {missing_usernames} are not in the parent project!",
        )


def get_inherited_supervisor_ids(
    session: Session,
    task: Task,
):
    return set.union(*(
        {supervisor.id for supervisor in ancestor.supervisors}
        for ancestor in _traverse_ancestors(session, task)
    ))


def get_inherited_annotator_ids(
    session: Session,
    task: Task,
):
    return set.union(*(
        {annotator.id for annotator in ancestor.annotators}
        for ancestor in _traverse_ancestors(session, task)
    ))


def _bulk_insert_supervisors(
    session: Session,
    task_ids: Set[int],
    supervisor_ids: list[int],
) -> None:
    supervisors_cls = Task.get_supervisor_links_cls()

    values = [
        dict(task_id=task_id, account_id=supervisor_id)
        for task_id in task_ids
        for supervisor_id in set(supervisor_ids)
    ]
    if not values:
        return

    session.execute(insert(supervisors_cls), values)


def _bulk_delete_supervisors(
    session: Session,
    task_ids: Set[int],
) -> None:
    supervisors_cls = Task.get_supervisor_links_cls()
    assert isinstance(supervisors_cls.task_id, QueryableAttribute)

    q = delete(supervisors_cls).where(supervisors_cls.task_id.in_(task_ids))
    session.execute(q)


def _bulk_insert_annotators(
    session: Session,
    task_ids: Set[int],
    annotator_ids: list[int],
) -> None:
    annotators_cls = Task.get_annotator_links_cls()

    values = [
        dict(task_id=task_id, account_id=annotator_id, quality_rank=rank)
        for task_id in task_ids
        for rank, annotator_id in enumerate(annotator_ids)
    ]
    if not values:
        return

    session.execute(insert(annotators_cls), values)


def _bulk_delete_annotators(
    session: Session,
    task_ids: Set[int],
) -> None:
    annotators_cls = Task.get_annotator_links_cls()
    assert isinstance(annotators_cls.task_id, QueryableAttribute)

    q = delete(annotators_cls).where(annotators_cls.task_id.in_(task_ids))
    session.execute(q)


def create_task(
    *,
    current_user: UserPublic,
    session: Session,
    data: TaskCreate,
):
    require_task_writer(current_user, session)

    _validate_parent_deadline(session, data)
    _validate_supervisors(session, data)
    _validate_annotators(session, data)

    record = Task.model_validate(data)

    session.add(record)
    session.flush([record])

    session.refresh(record)  # Get the new ID
    assert record.id is not None

    _bulk_insert_supervisors(session, {record.id}, data.supervisor_ids)
    _bulk_insert_annotators(session, {record.id}, data.annotator_ids)

    session.refresh(record)

    return record


def list_tasks(
    *,
    current_user: UserPublic,
    session: Session,
    offset: int | None = 0,
    limit: int | None = None,
    project_id: int | None = None,
    name: str | None = None,
):
    q = _build_list_tasks_query(
        current_user=current_user,
        session=session,
        offset=offset,
        limit=limit,
        project_id=project_id,
        name=name,
    )

    return session.exec(q).all()


def count_tasks(
    *,
    current_user: UserPublic,
    session: Session,
    project_id: int | None = None,
    name: str | None = None,
) -> int:
    q = _build_list_tasks_query(
        current_user=current_user,
        session=session,
        offset=None,
        limit=None,
        project_id=project_id,
        name=name,
    )

    return session.exec(select(func.count()).select_from(q.subquery())).one()


def read_task(
    *,
    current_user: UserPublic,
    session: Session,
    id: int,
):
    q = select(Task).where(Task.id == id)
    for cond in can_read_task_filters(current_user):
        q = q.where(cond)

    record = session.exec(q).one_or_none()
    if not record:
        raise HTTPException(status_code=HTTPStatus.NOT_FOUND)

    return record


def update_task(
    *,
    current_user: UserPublic,
    session: Session,
    id: int,
    data: TaskUpdate,
):
    record = session.get(Task, id)
    if not record:
        raise HTTPException(status_code=HTTPStatus.NOT_FOUND)

    require_task_writer(current_user, session, record)

    data_to_update = data.model_dump(exclude_unset=True)

    if "supervisor_ids" in data_to_update:
        supervisor_ids = data_to_update.pop("supervisor_ids")

        _bulk_delete_supervisors(session, {id})
        _bulk_insert_supervisors(session, {id}, supervisor_ids)

    if "annotator_ids" in data_to_update:
        annotator_ids = data_to_update.pop("annotator_ids")

        _bulk_delete_annotators(session, {id})
        _bulk_insert_annotators(session, {id}, annotator_ids)

    record.sqlmodel_update(data_to_update)
    session.add(record)
    session.flush([record])

    session.refresh(record)

    _validate_parent_deadline(session, record)
    _validate_supervisors(session, record)
    _validate_annotators(session, record)

    return record


def delete_task(
    *,
    current_user: UserPublic,
    session: Session,
    id: int,
):
    record = session.get(Task, id)
    if not record:
        raise HTTPException(status_code=HTTPStatus.NOT_FOUND)

    require_task_writer(current_user, session, record)

    _bulk_delete_supervisors(session, {id})
    _bulk_delete_annotators(session, {id})

    session.delete(record)
    session.flush([record])


def bulk_update_tasks(
    *,
    current_user: UserPublic,
    session: Session,
    ids: Set[int],
    data: TaskBulkUpdate,
):
    require_task_writer(current_user, session)

    assert isinstance(Task.id, QueryableAttribute)

    data_to_update = data.model_dump(exclude_unset=True)

    if "supervisor_ids" in data_to_update:
        supervisor_ids = data_to_update.pop("supervisor_ids")

        _bulk_delete_supervisors(session, ids)
        _bulk_insert_supervisors(session, ids, supervisor_ids)

    if "annotator_ids" in data_to_update:
        annotator_ids = data_to_update.pop("annotator_ids")

        _bulk_delete_annotators(session, ids)
        _bulk_insert_annotators(session, ids, annotator_ids)

    if data_to_update:
        q = update(Task).where(Task.id.in_(ids)).values(**data_to_update)
        session.execute(q)

    q = select(Task).filter(Task.id.in_(ids))
    records = session.exec(q)

    for record in records:
        _validate_parent_deadline(session, record)
        _validate_supervisors(session, record)
        _validate_annotators(session, record)
