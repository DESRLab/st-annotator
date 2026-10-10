from collections.abc import Sequence, Set
from http import HTTPStatus

from fastapi import HTTPException
from sqlmodel import Session, delete, insert, select, update

from sta.common.database.execution import execute_statement, sql_column, stamp_bulk_edit

from ..models.project import Project, ProjectBulkUpdate, ProjectCreate, ProjectUpdate
from ..models.task import Task
from ..models.user import Role, UserPublic
from .auth import require_role
from .querying import (
    Pagination,
    SortDirection,
    apply_sort,
    count_query,
    filter_contains,
    filter_range,
    id_query,
    paginate,
)
from .tasks import (
    apply_task_visibility,
    bulk_delete_task_annotators,
    bulk_delete_task_supervisors,
    iter_task_descendants,
)

_PROJECT_SORT_COLUMNS = {
    "id": Project.id,
    "name": Project.name,
    "description": Project.description,
}


def can_read_project_filters(user: UserPublic):
    if user.has_role(Role.PROJECT_MANAGER):
        return []

    members_cls = Project.get_member_links_cls()
    valid_project_ids = select(members_cls.project_id).where(members_cls.member_id == user.id)

    return [sql_column(Project.id).in_(valid_project_ids)]


def can_read_project(user: UserPublic, project: Project) -> bool:
    if user.has_role(Role.PROJECT_MANAGER):
        return True

    return any(user.id == member.id for member in project.members)


def require_project_writer(user: UserPublic, project: Project | None = None):
    return require_role(user, Role.PROJECT_MANAGER)


def _bulk_insert_members(
    session: Session,
    project_ids: Set[int],
    member_ids: list[int],
) -> None:
    members_cls = Project.get_member_links_cls()

    values = [
        dict(project_id=project_id, member_id=member_id)
        for project_id in project_ids
        for member_id in set(member_ids)
    ]
    if not values:
        return

    execute_statement(session, insert(members_cls), values)


def _bulk_delete_members(
    session: Session,
    project_ids: Set[int],
) -> None:
    members_cls = Project.get_member_links_cls()
    q = delete(members_cls).where(sql_column(members_cls.project_id).in_(project_ids))
    # synchronize_session=False: if a project's members collection was
    # loaded earlier in this session, the default synchronization would mark
    # those member associations deleted and break the later ORM add/flush.
    # No caller relies on synchronized state after this delete:
    # update_project refreshes the record (expiring its relationships),
    # delete_project expires the collection before deleting the record, and
    # bulk_update_projects never reads the collection.
    execute_statement(session, q.execution_options(synchronize_session=False))


def create_project(
    *,
    current_user: UserPublic,
    session: Session,
    data: ProjectCreate,
):
    require_project_writer(current_user)

    record = Project.model_validate(data)

    session.add(record)
    session.flush([record])

    session.refresh(record)  # Get the new ID
    assert record.id is not None

    _bulk_insert_members(session, {record.id}, data.member_ids)

    session.refresh(record)

    return record


def list_projects(
    *,
    current_user: UserPublic,
    session: Session,
    offset: int | None = 0,
    limit: int | None = None,
    id: int | None = None,
    id_ge: int | None = None,
    id_le: int | None = None,
    name: str | None = None,
    name_contains: str | None = None,
    description_contains: str | None = None,
    member_ids: Sequence[int] | None = None,
    sort_by: str | None = None,
    sort_dir: SortDirection = "asc",
):
    q = _build_filtered_projects_query(
        current_user=current_user,
        session=session,
        id=id,
        id_ge=id_ge,
        id_le=id_le,
        name=name,
        name_contains=name_contains,
        description_contains=description_contains,
        member_ids=member_ids,
        sort_by=sort_by,
        sort_dir=sort_dir,
    )
    q = paginate(
        q,
        Pagination(offset=offset if offset is not None else 0, limit=limit),
    )

    return session.exec(q).all()


def _build_filtered_projects_query(
    *,
    current_user: UserPublic,
    session: Session,
    id: int | None = None,
    id_ge: int | None = None,
    id_le: int | None = None,
    name: str | None = None,
    name_contains: str | None = None,
    description_contains: str | None = None,
    member_ids: Sequence[int] | None = None,
    sort_by: str | None = None,
    sort_dir: SortDirection = "asc",
):
    q = select(Project)
    # ProjectPublic embeds Project.tasks, so relationship loading must use the
    # same visibility rule as the explicit /tasks endpoints.
    q, _ = apply_task_visibility(q, current_user, session, filter_root=False)
    for cond in can_read_project_filters(current_user):
        q = q.where(cond)
    if id is not None:
        q = q.where(Project.id == id)
    q = filter_range(q, Project.id, ge=id_ge, le=id_le)
    if name is not None:
        q = q.where(Project.name == name)
    q = filter_contains(q, Project.name, name_contains)
    q = filter_contains(q, Project.description, description_contains)
    if member_ids:
        members_cls = Project.get_member_links_cls()
        q = (
            q.join(members_cls, sql_column(members_cls.project_id) == Project.id)
            .where(sql_column(members_cls.member_id).in_(member_ids))
            .distinct()
        )
    q = apply_sort(q, _PROJECT_SORT_COLUMNS, sort_by, sort_dir)

    return q


def count_projects(
    *,
    current_user: UserPublic,
    session: Session,
    id: int | None = None,
    id_ge: int | None = None,
    id_le: int | None = None,
    name: str | None = None,
    name_contains: str | None = None,
    description_contains: str | None = None,
    member_ids: Sequence[int] | None = None,
) -> int:
    q = _build_filtered_projects_query(
        current_user=current_user,
        session=session,
        id=id,
        id_ge=id_ge,
        id_le=id_le,
        name=name,
        name_contains=name_contains,
        description_contains=description_contains,
        member_ids=member_ids,
    )

    return session.exec(count_query(q)).one()


def list_project_ids(
    *,
    current_user: UserPublic,
    session: Session,
    id: int | None = None,
    id_ge: int | None = None,
    id_le: int | None = None,
    name: str | None = None,
    name_contains: str | None = None,
    description_contains: str | None = None,
    member_ids: Sequence[int] | None = None,
) -> list[int]:
    q = _build_filtered_projects_query(
        current_user=current_user,
        session=session,
        id=id,
        id_ge=id_ge,
        id_le=id_le,
        name=name,
        name_contains=name_contains,
        description_contains=description_contains,
        member_ids=member_ids,
    )

    ids = id_query(q, sql_column(Project.id))
    return list(execute_statement(session, ids).scalars().all())


def read_project(
    *,
    current_user: UserPublic,
    session: Session,
    id: int,
):
    q = select(Project).where(Project.id == id)
    q, _ = apply_task_visibility(q, current_user, session, filter_root=False)
    for cond in can_read_project_filters(current_user):
        q = q.where(cond)

    record = session.exec(q).one_or_none()
    if not record:
        raise HTTPException(status_code=HTTPStatus.NOT_FOUND)

    return record


def update_project(
    *,
    current_user: UserPublic,
    session: Session,
    id: int,
    data: ProjectUpdate,
):
    record = session.get(Project, id)
    if not record:
        raise HTTPException(status_code=HTTPStatus.NOT_FOUND)

    require_project_writer(current_user, record)

    data_to_update = data.model_dump(exclude_unset=True)
    record.check_edit_conflict(data_to_update)

    if "member_ids" in data_to_update:
        member_ids = data_to_update.pop("member_ids")
        if member_ids is None:
            raise HTTPException(HTTPStatus.UNPROCESSABLE_ENTITY, "member_ids cannot be null")

        _bulk_delete_members(session, {id})
        _bulk_insert_members(session, {id}, member_ids)

    record.sqlmodel_update(data_to_update)
    session.add(record)
    session.flush([record])

    session.refresh(record)

    return record


def delete_project(
    *,
    current_user: UserPublic,
    session: Session,
    id: int,
):
    record = session.get(Project, id)
    if not record:
        raise HTTPException(status_code=HTTPStatus.NOT_FOUND)

    require_project_writer(current_user, record)

    _bulk_delete_members(session, {id})
    # Expire the member collection (if it was loaded) so the delete below
    # does not try to remove association rows that the bulk delete already
    # removed.
    session.expire(record, ["members"])

    # The ORM delete cascades through `tasks` and each task's `children` to
    # the whole task tree. Bulk-delete the tasks' link rows and expire any
    # loaded link collections for the same reasons as in delete_task.
    tasks = [
        descendant
        for task in session.exec(select(Task).where(Task.project_id == id)).all()
        for descendant in iter_task_descendants(session, task)
    ]
    task_ids = {task.id for task in tasks if task.id is not None}

    bulk_delete_task_supervisors(session, task_ids)
    bulk_delete_task_annotators(session, task_ids)
    for task in tasks:
        session.expire(task, ["supervisor_links", "annotator_links"])

    session.delete(record)
    session.flush([record])


def bulk_update_projects(
    *,
    current_user: UserPublic,
    session: Session,
    ids: Set[int],
    data: ProjectBulkUpdate,
):
    require_project_writer(current_user)

    data_to_update = data.model_dump(exclude_unset=True)
    has_updates = stamp_bulk_edit(data_to_update)

    if "member_ids" in data_to_update:
        member_ids = data_to_update.pop("member_ids")
        if member_ids is None:
            raise HTTPException(HTTPStatus.UNPROCESSABLE_ENTITY, "member_ids cannot be null")

        _bulk_delete_members(session, ids)
        _bulk_insert_members(session, ids, member_ids)

    if has_updates:
        q = update(Project).where(sql_column(Project.id).in_(ids)).values(**data_to_update)
        execute_statement(session, q)
