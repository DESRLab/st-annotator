"""The deferred-work queue: registration, claiming, execution and reading.

Core owns the :class:`~sta.models.job.Job` table and every rule about claiming and
recording it, while the work itself belongs to whoever registered an executor for the
job's kind -- the same split the editor uses for
:func:`~sta.domain.editor.loader.register_data_loader`. A job therefore never runs in a
process that has not loaded the plugin that knows how to run it.
"""

from collections.abc import Callable, Mapping, Sequence
from datetime import datetime
from typing import Any, cast

from fastapi import HTTPException
from sqlalchemy.engine import CursorResult
from sqlmodel import Session, select, update

from sta.common.database.execution import execute_statement, sql_column
from sta.common.logging import get_logger
from sta.common.utils.registry import Registry
from sta.domain.auth import get_user, require_role
from sta.domain.querying import SortDirection, apply_sort, count_query, filter_in
from sta.models.job import Job, JobState
from sta.models.user import Role, UserPublic

logger = get_logger()

__all__ = [
    "JOB_EXECUTORS",
    "JobContext",
    "JobExecutor",
    "cancel_job",
    "claim_next_job",
    "count_jobs",
    "enqueue_job",
    "list_jobs",
    "register_job_executor",
    "request_job_cancellation",
    "run_job",
    "run_pending_jobs",
]


#: How many progress reports pass before a sweep commits. A sweep over a large group
#: would otherwise either lose all of its work to one bad file or pay one transaction per
#: scan.
CHECKPOINT_EVERY = 20


class JobContext:
    """The bundle an executor is handed: a session, an identity, and a progress channel."""

    def __init__(
        self,
        *,
        session: Session,
        job: Job,
        current_user: UserPublic,
        checkpoint_every: int = CHECKPOINT_EVERY,
    ) -> None:
        super().__init__()

        self._session = session
        self._job = job
        self._current_user = current_user
        self._checkpoint_every = checkpoint_every
        self._reports_since_checkpoint = 0

    @property
    def session(self) -> Session:
        return self._session

    @property
    def job(self) -> Job:
        return self._job

    @property
    def current_user(self) -> UserPublic:
        """The identity that enqueued the job; domain calls must be scoped by it."""
        return self._current_user

    @property
    def payload(self) -> Any:
        """The job's parameters as read from its JSON column.

        A mapping arrives here, never a model instance, so an executor validates it
        against its own schema the way a stored spec validates its ``config``.
        """
        return self._job.payload

    def report(self, *, done: int, total: int | None = None) -> None:
        """
        Record how far the work has come.

        Progress is only written to the database at a checkpoint, so a reader polling the
        job inventory sees it advance in bounded steps rather than one statement per item.
        """
        self._job.progress_done = done
        if total is not None:
            self._job.progress_total = total

        self._reports_since_checkpoint += 1
        if self._reports_since_checkpoint >= self._checkpoint_every:
            self.checkpoint()

    def checkpoint(self) -> None:
        """Commit the work done so far, so a later failure does not discard it."""
        self._session.commit()
        self._reports_since_checkpoint = 0


JobExecutor = Callable[[JobContext], None]

JOB_EXECUTORS: Registry[str, JobExecutor] = Registry()
"""Plugin-supplied work for each registered job kind."""


def register_job_executor(kind: str, executor: JobExecutor) -> None:
    """
    Bind a job kind to the function that runs it.

    Idempotent for the same callable because ``register()`` runs once per plugin load and
    a process may load plugins more than once; a second, different callable for the same
    kind is a real conflict and raises.
    """
    if kind in JOB_EXECUTORS:
        # Equality, not identity: a domain method produces a fresh bound-method object on
        # every attribute access, so `is` would report a conflict on the second plugin load
        # of a process and refuse a re-registration of the very same executor.
        if JOB_EXECUTORS.get(kind) == executor:
            return

        msg = f"Job kind {kind!r} is registered by two different executors"
        raise ValueError(msg)

    JOB_EXECUTORS.register(kind, executor)


def enqueue_job(
    *,
    session: Session,
    current_user: UserPublic,
    kind: str,
    payload: Mapping[str, Any] | None = None,
    dedupe_key: str | None = None,
    label: str | None = None,
) -> Job | None:
    """
    Queue one job, unless the same work is already waiting.

    Returns the new row, or ``None`` when an equivalent job is already pending. Coalescing
    deliberately ignores *running* jobs: a sweep whose candidate set was read before this
    write landed cannot see it, and blocking re-enqueue on a stuck running row would leave
    the marked records with no way back into the queue.
    """
    if dedupe_key is not None:
        waiting = session.exec(
            select(Job.id)
            .where(
                sql_column(Job.dedupe_key) == dedupe_key, sql_column(Job.state) == JobState.PENDING
            )
            .limit(1)
        ).first()
        if waiting is not None:
            return None

    job = Job(
        kind=kind,
        dedupe_key=dedupe_key,
        payload=dict(payload or {}),
        label=label,
        state=JobState.PENDING,
        created_by_id=current_user.id,
    )

    session.add(job)
    session.flush([job])

    return job


def claim_next_job(*, session: Session) -> Job | None:
    """
    Move the oldest pending job to :attr:`~sta.models.job.JobState.RUNNING` and return it.

    The claim is a conditional ``UPDATE`` rather than a locked ``SELECT``: it is the only
    form that behaves the same on the Postgres and the SQLite paths this project runs, and
    ``rowcount`` says unambiguously whether this process or another one got the row.
    Returns ``None`` when there is nothing to do or the row was claimed first elsewhere.
    """
    candidate_id = session.exec(
        select(sql_column(Job.id))
        .where(sql_column(Job.state) == JobState.PENDING)
        .order_by(sql_column(Job.id))
        .limit(1)
    ).first()

    if candidate_id is None:
        return None

    claimed = cast(
        "CursorResult[Any]",
        execute_statement(
            session,
            update(Job)
            .where(
                sql_column(Job.id) == candidate_id,
                sql_column(Job.state) == JobState.PENDING,
            )
            .values(state=JobState.RUNNING, started_at=datetime.now().astimezone())
            # Only the id column was selected above, so no Job is in the identity map to
            # keep in step; the reload below reads the claimed row fresh.
            .execution_options(synchronize_session=False),
        ),
    )

    if claimed.rowcount != 1:
        return None

    return session.get(Job, candidate_id)


def cancel_job(
    *,
    session: Session,
    job_id: int,
    states: Sequence[JobState] = (JobState.PENDING, JobState.RUNNING),
    reason: str = "Cancelled by a user.",
) -> bool:
    """Cancel one job in an allowed state, returning whether it changed.

    The conditional update makes shutdown safe when completion races it: a job that
    already reached a terminal state is never rewritten as cancelled.
    """
    cancelled = cast(
        "CursorResult[Any]",
        execute_statement(
            session,
            update(Job)
            .where(
                sql_column(Job.id) == job_id,
                sql_column(Job.state).in_(states),
            )
            .values(
                state=JobState.CANCELLED,
                error=reason,
                finished_at=datetime.now().astimezone(),
            )
            .execution_options(synchronize_session=False),
        ),
    )
    session.commit()
    return cancelled.rowcount == 1


def request_job_cancellation(*, session: Session, current_user: UserPublic, job_id: int) -> Job:
    """Cancel a pending or running job on a data manager's request."""
    require_role(current_user, Role.DATA_MANAGER)

    job = session.get(Job, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.state not in {JobState.PENDING, JobState.RUNNING}:
        raise HTTPException(status_code=409, detail=f"Job is already {JobState(job.state).value}")

    if not cancel_job(session=session, job_id=job_id):
        raise HTTPException(status_code=409, detail="Job finished before it could be cancelled")

    session.expire_all()
    cancelled = session.get(Job, job_id)
    assert cancelled is not None
    return cancelled


def run_job(
    *,
    session: Session,
    job: Job,
    registry: Registry[str, JobExecutor] = JOB_EXECUTORS,
) -> None:
    """
    Execute one claimed job and record its outcome.

    The executor may raise for any reason at all -- a missing file, a bad config, a bug in
    a plugin -- and the queue must survive that, so the failure is caught and reported here
    rather than propagated to whoever is polling the inventory. Work the executor committed
    before failing stays committed; whatever it had not checkpointed is rolled back with the
    transaction, which is why a pending record and a finished one differ by their own state
    and not by this row.
    """
    # Captured before anything can roll back: the failure path still has to write the
    # outcome against the row, and a rollback expires the instance it was handed.
    job_id = job.id

    if job.state in {JobState.SUCCEEDED, JobState.FAILED, JobState.CANCELLED}:
        logger.warning("Job #%s was no longer running when execution began", job_id)
        return
    if job.state != JobState.RUNNING:
        job.state = JobState.RUNNING

    current_user = (
        get_user(session, user_id=job.created_by_id) if job.created_by_id is not None else None
    )
    if current_user is None:
        _finish(
            session,
            job_id,
            state=JobState.FAILED,
            error="The account that queued this job no longer exists, so it cannot run.",
        )
        return

    try:
        executor = registry.get(job.kind)
    except ValueError as exc:
        _finish(session, job_id, state=JobState.FAILED, error=str(exc))
        return

    context = JobContext(session=session, job=job, current_user=current_user)

    try:
        executor(context)
    except Exception as exc:
        logger.warning("Job #%s (%s) failed: %s", job_id, job.kind, exc, exc_info=True)

        session.rollback()
        _finish(
            session,
            job_id,
            state=JobState.FAILED,
            error=f"{type(exc).__name__}: {exc}",
        )
    else:
        _finish(session, job_id, state=JobState.SUCCEEDED)


def run_pending_jobs(
    *,
    session: Session,
    registry: Registry[str, JobExecutor] = JOB_EXECUTORS,
    max_jobs: int | None = None,
) -> int:
    """
    Claim and run jobs until the queue is empty; returns how many ran.

    This is the synchronous form of what the worker loop does, and callers that must not
    return until the data is consistent -- a bulk importer, a fixture server feeding the
    editor -- use it instead of waiting for a poll interval.

    Commit what you enqueued before calling this. A job that fails rolls back the
    transaction it ran in, so an uncommitted enqueue is discarded with the work that was
    meant to consume it.
    """
    processed = 0

    while max_jobs is None or processed < max_jobs:
        job = claim_next_job(session=session)
        if job is None:
            break

        # The claim must survive an executor rollback. It also makes RUNNING visible to
        # inventory readers while the executor is working.
        session.commit()
        run_job(session=session, job=job, registry=registry)
        session.commit()
        processed += 1

    return processed


_SORTABLE_COLUMNS: Mapping[str, Any] = {
    "id": sql_column(Job.id),
    "kind": sql_column(Job.kind),
    "state": sql_column(Job.state),
    "progress_done": sql_column(Job.progress_done),
    "progress_total": sql_column(Job.progress_total),
    "created_at": sql_column(Job.created_at),
    "started_at": sql_column(Job.started_at),
    "finished_at": sql_column(Job.finished_at),
}


def _build_list_query(
    *,
    offset: int,
    limit: int | None,
    id: Sequence[int] | None = None,
    kind: str | None = None,
    state: Sequence[JobState] | None = None,
    sort_by: str | None = None,
    sort_dir: SortDirection = "asc",
):
    q = select(Job).offset(offset)

    if limit is not None:
        q = q.limit(limit)
    q = filter_in(q, sql_column(Job.id), id)
    if kind is not None:
        q = q.where(sql_column(Job.kind) == kind)
    q = filter_in(q, sql_column(Job.state), state)

    return apply_sort(q, _SORTABLE_COLUMNS, sort_by, sort_dir)


def list_jobs(
    *,
    current_user: UserPublic,
    session: Session,
    offset: int = 0,
    limit: int | None = None,
    id: Sequence[int] | None = None,
    kind: str | None = None,
    state: Sequence[JobState] | None = None,
    sort_by: str | None = None,
    sort_dir: SortDirection = "asc",
) -> Sequence[Job]:
    """Read the job inventory. Deferred work is an operations surface, not a per-user one."""
    require_role(current_user, Role.DATA_MANAGER)

    q = _build_list_query(
        offset=offset,
        limit=limit,
        id=id,
        kind=kind,
        state=state,
        sort_by=sort_by,
        sort_dir=sort_dir,
    )

    return session.exec(q).all()


def count_jobs(
    *,
    current_user: UserPublic,
    session: Session,
    id: Sequence[int] | None = None,
    kind: str | None = None,
    state: Sequence[JobState] | None = None,
) -> int:
    require_role(current_user, Role.DATA_MANAGER)

    q = _build_list_query(
        offset=0,
        limit=None,
        id=id,
        kind=kind,
        state=state,
    )

    return session.exec(count_query(q)).one()


def _finish(
    session: Session,
    job_id: int | None,
    *,
    state: JobState,
    error: str | None = None,
) -> None:
    """
    Record a job's outcome against its row.

    The row may be gone: a caller that drains in the session it enqueued in has not
    committed the insert, so the rollback that followed the failure took it with it. That
    work never became durable, so there is nothing left to report on.
    """
    if job_id is None:
        return

    finished = cast(
        "CursorResult[Any]",
        execute_statement(
            session,
            update(Job)
            .where(
                sql_column(Job.id) == job_id,
                sql_column(Job.state) == JobState.RUNNING,
            )
            .values(
                state=state,
                error=error,
                finished_at=datetime.now().astimezone(),
            )
            .execution_options(synchronize_session=False),
        ),
    )
    if finished.rowcount != 1:
        logger.warning(
            "Job #%s disappeared or was no longer running before its outcome could be recorded: %s",
            job_id,
            error,
        )
