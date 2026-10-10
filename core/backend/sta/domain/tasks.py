from collections.abc import Collection, Generator, Sequence, Set
from http import HTTPStatus
from typing import Any, Literal, TypeVar

from fastapi import HTTPException
from sqlalchemy.orm import aliased, with_loader_criteria
from sqlalchemy.orm.attributes import set_committed_value
from sqlalchemy.sql import Select
from sqlmodel import Session, delete, func, insert, select, update

from sta.common.database.execution import execute_statement, sql_column, stamp_bulk_edit

from ..models.frame import Frame
from ..models.label.repo import BranchPermissionLevel
from ..models.project import Project
from ..models.task import Task, TaskBulkUpdate, TaskCreate, TaskUpdate, WorkType
from ..models.user import Role, User, UserPublic
from .auth import require_role
from .label.repo.branches import can_access_branch

_SelectT = TypeVar("_SelectT", bound=Select[Any])


def can_read_task(
    user: UserPublic,
    session: Session,
    task: Task,
    *,
    work_types: Collection[WorkType] = WorkType,
) -> bool:
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
    # Keep the task/session/work-type parameters aligned with the other
    # domain guards; task mutation itself remains project-manager-only.
    #
    # A write replaces every supervisor and annotator link from the submitted user
    # ids, and the forms build those ids from the user collection, so this gate must
    # stay inside `require_user_reader`: a writer that cannot list a user cannot
    # round-trip that user's link, and saving an unrelated field would drop it.
    # test/domain/test_tasks.py pins that coupling, as the specification gates do.
    return require_role(user, Role.PROJECT_MANAGER)


def _get_accessible_task_ids_query(
    user: UserPublic,
    *,
    project_manager_bypass: bool = True,
    work_type: WorkType | None = None,
):
    if project_manager_bypass and user.has_role(Role.PROJECT_MANAGER):
        return select(Task.id)

    seed_queries = []

    if user.has_role(Role.SUPERVISOR) and work_type in (None, WorkType.REVIEW):
        supervisors_cls = Task.get_supervisor_links_cls()
        seed_queries.append(
            select(sql_column(supervisors_cls.task_id).label("id")).where(
                supervisors_cls.account_id == user.id,
            ),
        )

    if user.has_role(Role.ANNOTATOR) and work_type in (None, WorkType.ANNOTATE):
        annotators_cls = Task.get_annotator_links_cls()
        seed_queries.append(
            select(sql_column(annotators_cls.task_id).label("id")).where(
                annotators_cls.account_id == user.id,
            ),
        )

    if not seed_queries:
        return select(Task.id).where(False)  # noqa: FBT003

    seed_task_ids = seed_queries[0]
    for seed_query in seed_queries[1:]:
        seed_task_ids = seed_task_ids.union(seed_query)

    # A recursive CTE requires a plain Select as its anchor (CTE.union_all
    # rejects a CompoundSelect), so wrap the union of the per-role seed
    # queries in a subquery before attaching the recursive descendant step.
    accessible_task_ids = select(seed_task_ids.subquery().c.id).cte(
        name="accessible_task_ids",
        recursive=True,
    )
    descendant_task_ids = select(sql_column(Task.id).label("id")).where(
        Task.parent_id == accessible_task_ids.c.id,
    )
    accessible_task_ids = accessible_task_ids.union_all(descendant_task_ids)

    return select(accessible_task_ids.c.id).distinct()


def can_read_task_filters(user: UserPublic):
    if user.has_role(Role.PROJECT_MANAGER):
        return []

    return [sql_column(Task.id).in_(_get_accessible_task_ids_query(user))]


def get_assigned_task_ids_query(user: UserPublic, work_type: WorkType | None = None):
    """Return directly or ancestrally assigned task IDs without role bypasses."""
    return _get_accessible_task_ids_query(
        user,
        project_manager_bypass=False,
        work_type=work_type,
    )


def apply_task_visibility(
    q: _SelectT,
    user: UserPublic,
    session: Session,
    *,
    filter_root: bool = True,
) -> tuple[_SelectT, set[int] | None]:
    """Constrain both selected tasks and nested Task relationships."""
    visibility_filters = can_read_task_filters(user)
    for cond in visibility_filters:
        if filter_root:
            q = q.where(cond)
    if visibility_filters:
        # Do not reuse the recursive CTE as a global loader criterion: it is
        # injected into the CTE's own Task select and creates a second
        # recursive reference on SQLite. Materializing IDs also keeps every
        # nested relationship on one consistent authorization snapshot.
        readable_ids = {
            task_id
            for task_id in session.exec(_get_accessible_task_ids_query(user)).all()
            if task_id is not None
        }
        q = q.options(
            with_loader_criteria(
                Task,
                sql_column(Task.id).in_(readable_ids),
                include_aliases=True,
            ),
        )
        q = q.execution_options(populate_existing=True)
    else:
        readable_ids = None
    return q, readable_ids


def _sanitize_task_relationships(records: Sequence[Task], readable_ids: set[int] | None):
    """Remove identity-map relationships excluded by loader criteria."""
    if readable_ids is None:
        return

    for record in records:
        # SQLAlchemy may satisfy many-to-one relationships directly from its
        # identity map without issuing the criterion-bearing lazy-load query.
        # set_committed_value changes only the in-memory response projection;
        # it creates no ORM history and therefore cannot update foreign keys.
        parent = record.parent
        if parent is not None and parent.id not in readable_ids:
            set_committed_value(record, "parent", None)
        set_committed_value(
            record,
            "children",
            [child for child in record.children if child.id in readable_ids],
        )
        project = record.project
        set_committed_value(
            project,
            "tasks",
            [task for task in project.tasks if task.id in readable_ids],
        )


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
    # Apply the same rule to Task relationships reached while serializing
    # children or parents; otherwise nested ORM traversal bypasses this query.
    q, readable_ids = apply_task_visibility(q, current_user, session)
    if offset is not None:
        q = q.offset(offset)
    if limit is not None:
        q = q.limit(limit)
    if project_id is not None:
        q = q.where(Task.project_id == project_id)
    if name is not None:
        q = q.where(Task.name == name)

    return q, readable_ids


def _traverse_ancestors(
    session: Session,
    task: Task,
) -> Generator[Task]:
    yield task

    if task.parent is not None:
        yield from _traverse_ancestors(session, task.parent)


def iter_task_descendants(
    session: Session,
    task: Task,
    *,
    mode: Literal["preorder", "postorder"] = "preorder",
) -> Generator[Task]:
    if mode == "preorder":
        yield task

    for child in task.children:
        yield from iter_task_descendants(session, child, mode=mode)

    if mode == "postorder":
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

        if parent_record.project_id != task.project_id:
            raise HTTPException(
                status_code=HTTPStatus.BAD_REQUEST,
                detail="A parent task must belong to the same project",
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
            for descendant in iter_task_descendants(session, task):
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
    q = select(User).filter(sql_column(User.id).in_(task.supervisor_ids))
    supervisors = session.exec(q).all()

    bad_supervisors = [
        supervisor for supervisor in supervisors if Role.SUPERVISOR not in supervisor.roles
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
            supervisor.username
            for supervisor in supervisors
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
    q = select(User).filter(sql_column(User.id).in_(task.annotator_ids))
    annotators = session.exec(q).all()

    bad_annotators = [
        annotator for annotator in annotators if Role.ANNOTATOR not in annotator.roles
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
            annotator.username for annotator in annotators if annotator.id in missing_annotator_ids
        ]
        raise HTTPException(
            status_code=HTTPStatus.BAD_REQUEST,
            detail=f"The annotators {missing_usernames} are not in the parent project!",
        )


def get_task_branch_permission_warnings(session: Session, task: Task) -> list[str]:
    """Report assigned workers that cannot write branches used by this task tree."""
    task_ids = {
        descendant.id
        for descendant in iter_task_descendants(session, task)
        if descendant.id is not None
    }
    branch_ids = set(
        session.exec(
            select(sql_column(Frame.label_branch_id))
            .where(sql_column(Frame.task_id).in_(task_ids))
            .where(sql_column(Frame.label_branch_id).is_not(None))
        ).all()
    )
    if not branch_ids:
        return []

    warnings: list[str] = []
    # Reviewers are held to WRITE_ELEVATED, matching the frame-assignment rule in
    # sta.domain.frames; annotators need WRITE, which is what a push requires.
    assignments = (
        ("Supervisor", task.supervisors, BranchPermissionLevel.WRITE_ELEVATED),
        ("Annotator", task.annotators, BranchPermissionLevel.WRITE),
    )
    for assignment_name, accounts, perm_lv in assignments:
        for account in accounts:
            user_record = session.get(User, account.id)
            if user_record is None:
                continue
            user = UserPublic.model_validate(user_record)
            missing = sorted(
                branch_id
                for branch_id in branch_ids
                if not can_access_branch(
                    user,
                    session,
                    id=branch_id,
                    perm_lv=perm_lv,
                )
            )
            if missing:
                warnings.append(
                    f"{assignment_name} {account.username!r} lacks {perm_lv.name} access to "
                    f"label branch(es) {missing}."
                )
    return warnings


def _validate_assignee_branch_permissions(session: Session, task: Task) -> None:
    warnings = get_task_branch_permission_warnings(session, task)
    if warnings:
        raise HTTPException(status_code=HTTPStatus.BAD_REQUEST, detail=" ".join(warnings))


def get_inherited_supervisor_ids(
    session: Session,
    task: Task,
):
    if task.id is None:
        return set()
    pairs = get_inherited_assignment_pairs(session, {task.id}, WorkType.REVIEW)
    return {account_id for _task_id, account_id in pairs}


def get_inherited_annotator_ids(
    session: Session,
    task: Task,
):
    if task.id is None:
        return set()
    pairs = get_inherited_assignment_pairs(session, {task.id}, WorkType.ANNOTATE)
    return {account_id for _task_id, account_id in pairs}


def get_inherited_assignment_pairs(
    session: Session,
    task_ids: Collection[int],
    work_type: WorkType,
) -> set[tuple[int, int]]:
    """Return `(requested task, inherited account)` pairs in one query."""
    if not task_ids:
        return set()

    parent = aliased(Task)
    ancestors = (
        select(
            sql_column(Task.id).label("ancestor_id"),
            Task.parent_id,
            sql_column(Task.id).label("requested_task_id"),
        )
        .where(sql_column(Task.id).in_(task_ids))
        .cte("task_ancestors", recursive=True)
    )
    ancestors = ancestors.union_all(
        select(
            sql_column(parent.id).label("ancestor_id"),
            parent.parent_id,
            ancestors.c.requested_task_id,
        ).join(ancestors, sql_column(parent.id) == ancestors.c.parent_id),
    )

    links_cls = (
        Task.get_annotator_links_cls()
        if work_type == WorkType.ANNOTATE
        else Task.get_supervisor_links_cls()
    )
    q = select(ancestors.c.requested_task_id, links_cls.account_id).join(
        links_cls,
        sql_column(links_cls.task_id) == ancestors.c.ancestor_id,
    )
    return set(session.exec(q).all())


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

    execute_statement(session, insert(supervisors_cls), values)


def bulk_delete_task_supervisors(
    session: Session,
    task_ids: Set[int],
) -> None:
    supervisors_cls = Task.get_supervisor_links_cls()
    q = delete(supervisors_cls).where(sql_column(supervisors_cls.task_id).in_(task_ids))
    # synchronize_session=False: if a task's supervisor_links collection was
    # loaded earlier in this session, the default synchronization would mark
    # those link objects deleted and break the later ORM add/flush. No caller
    # relies on synchronized state after this delete: update_task refreshes
    # the record (expiring its relationships), delete_task expires the
    # collection before deleting the record, and bulk_update_tasks expires
    # the collections before revalidating them.
    execute_statement(session, q.execution_options(synchronize_session=False))


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

    execute_statement(session, insert(annotators_cls), values)


def bulk_delete_task_annotators(
    session: Session,
    task_ids: Set[int],
) -> None:
    annotators_cls = Task.get_annotator_links_cls()
    q = delete(annotators_cls).where(sql_column(annotators_cls.task_id).in_(task_ids))
    # synchronize_session=False: see bulk_delete_task_supervisors; the same
    # reasoning applies to the annotator_links collection.
    execute_statement(session, q.execution_options(synchronize_session=False))


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
    q, readable_ids = _build_list_tasks_query(
        current_user=current_user,
        session=session,
        offset=offset,
        limit=limit,
        project_id=project_id,
        name=name,
    )

    records = session.exec(q).all()
    _sanitize_task_relationships(records, readable_ids)
    return records


def count_tasks(
    *,
    current_user: UserPublic,
    session: Session,
    project_id: int | None = None,
    name: str | None = None,
) -> int:
    q, _ = _build_list_tasks_query(
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
    q, readable_ids = apply_task_visibility(
        select(Task).where(Task.id == id),
        current_user,
        session,
    )

    record = session.exec(q).one_or_none()
    if not record:
        raise HTTPException(status_code=HTTPStatus.NOT_FOUND)

    _sanitize_task_relationships([record], readable_ids)

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
    record.check_edit_conflict(data_to_update)

    if "supervisor_ids" in data_to_update:
        supervisor_ids = data_to_update.pop("supervisor_ids")
        if supervisor_ids is None:
            raise HTTPException(HTTPStatus.UNPROCESSABLE_ENTITY, "supervisor_ids cannot be null")

        bulk_delete_task_supervisors(session, {id})
        _bulk_insert_supervisors(session, {id}, supervisor_ids)

    if "annotator_ids" in data_to_update:
        annotator_ids = data_to_update.pop("annotator_ids")
        if annotator_ids is None:
            raise HTTPException(HTTPStatus.UNPROCESSABLE_ENTITY, "annotator_ids cannot be null")

        bulk_delete_task_annotators(session, {id})
        _bulk_insert_annotators(session, {id}, annotator_ids)

    record.sqlmodel_update(data_to_update)
    session.add(record)
    session.flush([record])

    session.refresh(record)

    _validate_parent_deadline(session, record)
    _validate_supervisors(session, record)
    _validate_annotators(session, record)
    _validate_assignee_branch_permissions(session, record)

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

    # The ORM delete cascades through `children` to the whole subtree, so
    # bulk-delete the link rows of every subtree task: otherwise the flush
    # would try to blank out the link foreign keys, which are primary key
    # columns. Expire any loaded link collections so the delete does not
    # walk stale link objects left behind by the bulk deletes.
    subtree = list(iter_task_descendants(session, record))
    subtree_ids = {task.id for task in subtree if task.id is not None}

    bulk_delete_task_supervisors(session, subtree_ids)
    bulk_delete_task_annotators(session, subtree_ids)
    for task in subtree:
        session.expire(task, ["supervisor_links", "annotator_links"])

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

    data_to_update = data.model_dump(exclude_unset=True)
    has_updates = stamp_bulk_edit(data_to_update)

    links_changed = False

    if "supervisor_ids" in data_to_update:
        supervisor_ids = data_to_update.pop("supervisor_ids")
        if supervisor_ids is None:
            raise HTTPException(HTTPStatus.UNPROCESSABLE_ENTITY, "supervisor_ids cannot be null")

        bulk_delete_task_supervisors(session, ids)
        _bulk_insert_supervisors(session, ids, supervisor_ids)
        links_changed = True

    if "annotator_ids" in data_to_update:
        annotator_ids = data_to_update.pop("annotator_ids")
        if annotator_ids is None:
            raise HTTPException(HTTPStatus.UNPROCESSABLE_ENTITY, "annotator_ids cannot be null")

        bulk_delete_task_annotators(session, ids)
        _bulk_insert_annotators(session, ids, annotator_ids)
        links_changed = True

    if has_updates:
        q = update(Task).where(sql_column(Task.id).in_(ids)).values(**data_to_update)
        execute_statement(session, q)

    q = select(Task).filter(sql_column(Task.id).in_(ids))
    records = session.exec(q)

    for record in records:
        if links_changed:
            # The validation below reads the link collections. Expire them
            # (if they were loaded) so it sees the freshly inserted links
            # instead of stale session state left by the bulk deletes.
            session.expire(record, ["supervisor_links", "annotator_links"])

        _validate_parent_deadline(session, record)
        _validate_supervisors(session, record)
        _validate_annotators(session, record)
        _validate_assignee_branch_permissions(session, record)
