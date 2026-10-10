import asyncio
import threading
from collections.abc import Mapping
from contextlib import asynccontextmanager
from types import SimpleNamespace

from fastapi import HTTPException
from sqlmodel import Session, select

import pytest

from sta.common.database.execution import sql_column
from sta.common.utils.registry import Registry
from sta.domain.jobs import (
    JobContext,
    JobExecutor,
    base as jobs_domain,
    cancel_job,
    claim_next_job,
    count_jobs,
    enqueue_job,
    list_jobs,
    register_job_executor,
    run_job,
    run_pending_jobs,
)
from sta.domain.jobs.worker import (
    DEFAULT_POLL_INTERVAL_SECONDS,
    job_worker_lifespan,
    poll_interval_seconds_from_env,
)
from sta.models.job import Job, JobPublic, JobState
from sta.models.user import Role, UserPublic

pytestmark = pytest.mark.in_memory_db

ANNOTATOR = UserPublic(id=999, username="annotator", roles={Role.ANNOTATOR})


def _jobs(session: Session) -> list[Job]:
    return list(session.exec(select(Job).order_by(sql_column(Job.id))).all())


def _registry(
    executors: Mapping[str, JobExecutor] | None = None,
) -> Registry[str, JobExecutor]:
    registry: Registry[str, JobExecutor] = Registry()
    for kind, executor in (executors or {}).items():
        registry.register(kind, executor)

    return registry


def _enqueue(session: Session, root_user: UserPublic, *, kind: str) -> Job:
    job = enqueue_job(session=session, current_user=root_user, kind=kind)
    assert job is not None
    session.commit()

    return job


def test_pending_equivalent_work_coalesces_but_running_work_does_not(
    session: Session,
    root_user: UserPublic,
):
    """A burst of writes queues one sweep, and a stuck running job cannot block the next.

    Coalescing against a running row would leave the marked records with no way back into
    the queue: the sweep that is running already read the list it would work through.
    """

    def queue():
        return enqueue_job(
            session=session,
            current_user=root_user,
            kind="test.kind",
            dedupe_key="test.kind:7",
        )

    assert queue() is not None
    session.commit()
    assert queue() is None

    assert claim_next_job(session=session) is not None
    session.commit()
    assert queue() is not None


def test_enqueue_job_reports_the_row_it_created_and_silence_when_it_did_not(
    session: Session,
    root_user: UserPublic,
):
    """
    The return value is how a caller learns what a write started.

    A coalesced enqueue creates no row and answers ``None``, so the ids a write reports are
    what the queue took on rather than what was asked for -- a report naming a job that does
    not exist would send a reader to a row nobody can find.
    """
    first = enqueue_job(
        session=session,
        current_user=root_user,
        kind="test.kind",
        dedupe_key="test.kind:1",
    )
    session.commit()
    assert first is not None
    assert first.state == JobState.PENDING

    assert (
        enqueue_job(
            session=session,
            current_user=root_user,
            kind="test.kind",
            dedupe_key="test.kind:1",
        )
        is None
    )
    second = enqueue_job(
        session=session,
        current_user=root_user,
        kind="test.kind",
        dedupe_key="test.kind:2",
    )
    session.commit()

    assert [first.id, second.id] == [job.id for job in _jobs(session)], (
        "the fixture queues two rows, and the coalesced call queued neither"
    )


class _Holder:
    """Gives out a fresh bound-method object on every attribute access, like a domain does."""

    def run(self, _ctx: JobContext) -> None:
        return None


def test_the_same_executor_may_be_registered_twice(monkeypatch: pytest.MonkeyPatch):
    """Re-registering a plugin is not a conflict; a second executor for a kind is.

    The pcd and gmesh domains register bound methods, and a bound method is a new object
    each time it is looked up, so comparing executors by identity would fail the second
    plugin load of a process.
    """
    holder = _Holder()
    monkeypatch.setattr(jobs_domain, "JOB_EXECUTORS", _registry())

    register_job_executor("test.bound", holder.run)
    register_job_executor("test.bound", holder.run)

    with pytest.raises(ValueError):
        register_job_executor("test.bound", _noop_executor)


def _noop_executor(_ctx: JobContext) -> None:
    return None


def test_claim_is_first_in_first_out_and_drains_in_order(
    session: Session,
    root_user: UserPublic,
):
    older = _enqueue(session, root_user, kind="test.earlier")
    newer = _enqueue(session, root_user, kind="test.later")

    first = claim_next_job(session=session)
    assert first is not None
    assert first.id == older.id
    assert first.state == JobState.RUNNING

    second = claim_next_job(session=session)
    assert second is not None
    assert second.id == newer.id

    assert claim_next_job(session=session) is None


def test_cancelling_a_running_job_is_terminal(
    session: Session,
    root_user: UserPublic,
):
    """Shutdown records cancellation and late executor completion cannot overwrite it."""
    job = _enqueue(session, root_user, kind="test.kind")
    claimed = claim_next_job(session=session)
    assert claimed is not None
    session.commit()

    assert (
        cancel_job(
            session=session,
            job_id=job.id,
            states=(JobState.RUNNING,),
            reason="The backend stopped before this job completed.",
        )
        is True
    )
    run_job(session=session, job=claimed, registry=_registry({"test.kind": _noop_executor}))
    session.commit()

    session.expire_all()
    recorded = session.get(Job, job.id)
    assert recorded is not None
    assert recorded.state == JobState.CANCELLED
    assert recorded.finished_at is not None
    assert "backend stopped" in (recorded.error or "")
    assert cancel_job(session=session, job_id=job.id) is False


def test_losing_the_claim_race_runs_nothing(
    session: Session,
    root_user: UserPublic,
    monkeypatch: pytest.MonkeyPatch,
):
    """Two processes may both pick the same row; only the one that updates it may run it."""
    _enqueue(session, root_user, kind="test.kind")

    monkeypatch.setattr(
        jobs_domain,
        "execute_statement",
        lambda *_args, **_kwargs: SimpleNamespace(rowcount=0),
    )

    assert claim_next_job(session=session) is None


def test_a_failing_executor_is_recorded_and_does_not_stop_the_queue(
    session: Session,
    root_user: UserPublic,
):
    def boom(_ctx: JobContext) -> None:
        failure = "boom"
        raise RuntimeError(failure)

    def fine(_ctx: JobContext) -> None:
        return None

    registry = _registry({"test.boom": boom, "test.fine": fine})
    _enqueue(session, root_user, kind="test.boom")
    _enqueue(session, root_user, kind="test.fine")

    assert run_pending_jobs(session=session, registry=registry) == 2

    failed, succeeded = _jobs(session)
    assert failed.state == JobState.FAILED
    assert "RuntimeError: boom" in (failed.error or "")
    assert succeeded.state == JobState.SUCCEEDED
    assert succeeded.error is None


def test_an_unregistered_kind_fails_without_stopping_the_worker(
    session: Session,
    root_user: UserPublic,
):
    _enqueue(session, root_user, kind="test.missing")

    assert run_pending_jobs(session=session, registry=_registry()) == 1

    job = _jobs(session)[0]
    assert job.state == JobState.FAILED
    assert "test.missing" in (job.error or "")


def test_a_job_whose_actor_is_gone_fails_rather_than_borrowing_an_identity(
    session: Session,
    root_user: UserPublic,
):
    def would_run(_ctx: JobContext) -> None:
        msg = "the executor must not be reached"
        raise AssertionError(msg)

    job = _enqueue(session, root_user, kind="test.kind")
    job.created_by_id = None
    session.commit()

    run_job(session=session, job=job, registry=_registry({"test.kind": would_run}))
    session.commit()

    recorded = _jobs(session)[0]
    assert recorded.state == JobState.FAILED
    assert "no longer exists" in (recorded.error or "")


def test_checkpointed_work_survives_a_later_failure(
    session: Session,
    root_user: UserPublic,
):
    """Progress committed before the failure stays committed.

    A sweep of a thousand scans that dies on the last one must not throw away the nine
    hundred and ninety-nine it finished, so the recovery boundary is the checkpoint and not
    the job.
    """

    def partial(ctx: JobContext) -> None:
        ctx.report(done=1, total=3)
        ctx.checkpoint()
        failure = "died at the end"
        raise RuntimeError(failure)

    registry = _registry({"test.partial": partial})
    _enqueue(session, root_user, kind="test.partial")

    assert run_pending_jobs(session=session, registry=registry) == 1

    job = _jobs(session)[0]
    assert job.state == JobState.FAILED
    assert job.progress_done == 1, "checkpointed progress must outlive the failure"


def test_listing_is_a_data_manager_surface(session: Session, root_user: UserPublic):
    _enqueue(session, root_user, kind="test.kind")

    with pytest.raises(HTTPException) as forbidden:
        list_jobs(current_user=ANNOTATOR, session=session)
    assert forbidden.value.status_code == 403

    with pytest.raises(HTTPException) as also_forbidden:
        count_jobs(current_user=ANNOTATOR, session=session)
    assert also_forbidden.value.status_code == 403

    assert len(list_jobs(current_user=root_user, session=session)) == 1


def test_listing_filters_and_sorts(session: Session, root_user: UserPublic):
    _enqueue(session, root_user, kind="test.alpha")
    _enqueue(session, root_user, kind="test.beta")
    claim_next_job(session=session)
    session.commit()

    assert count_jobs(current_user=root_user, session=session) == 2
    running = list_jobs(current_user=root_user, session=session, state=[JobState.RUNNING])
    assert [job.kind for job in running] == ["test.alpha"]
    assert count_jobs(current_user=root_user, session=session, state=[JobState.PENDING]) == 1
    assert [
        job.kind
        for job in list_jobs(
            current_user=root_user,
            session=session,
            state=[JobState.PENDING, JobState.RUNNING],
            sort_by="id",
        )
    ] == ["test.alpha", "test.beta"]
    assert [
        job.kind for job in list_jobs(current_user=root_user, session=session, kind="test.beta")
    ] == ["test.beta"]

    newest_first = list_jobs(
        current_user=root_user,
        session=session,
        sort_by="id",
        sort_dir="desc",
    )
    assert [job.kind for job in newest_first] == ["test.beta", "test.alpha"]

    with pytest.raises(HTTPException) as bad_sort:
        list_jobs(current_user=root_user, session=session, sort_by="payload")
    assert bad_sort.value.status_code == 422


def test_the_read_model_exposes_state_as_its_stored_value(
    session: Session,
    root_user: UserPublic,
):
    job = _enqueue(session, root_user, kind="test.kind")

    public = JobPublic.model_validate(job)

    assert public.state is JobState.PENDING
    assert public.model_dump()["state"] == "pending"


def test_poll_interval_defaults_validates_and_rejects(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.delenv("STA_JOB_POLL_INTERVAL_SECONDS", raising=False)
    assert poll_interval_seconds_from_env() == DEFAULT_POLL_INTERVAL_SECONDS

    monkeypatch.setenv("STA_JOB_POLL_INTERVAL_SECONDS", "0.25")
    assert poll_interval_seconds_from_env() == 0.25

    for rejected in ("0", "-1", "soon"):
        monkeypatch.setenv("STA_JOB_POLL_INTERVAL_SECONDS", rejected)
        with pytest.raises(RuntimeError):
            poll_interval_seconds_from_env()


def test_the_worker_polls_only_for_an_app_that_asked_for_it(monkeypatch: pytest.MonkeyPatch):
    """Disabled apps start nothing; an enabled one drains off the loop and is joined."""
    passes: list[int] = []

    monkeypatch.setattr("sta.domain.jobs.worker.get_config", lambda: SimpleNamespace())
    monkeypatch.setattr(
        "sta.domain.jobs.worker.drain_jobs",
        lambda _config, _active=None, _stop=None: passes.append(1),
    )

    async def disabled() -> int:
        app = SimpleNamespace(state=SimpleNamespace(job_worker_enabled=False))
        async with asynccontextmanager(job_worker_lifespan)(app):
            return len(asyncio.all_tasks())

    assert asyncio.run(disabled()) == 1, "a disabled worker must not create a task"

    async def enabled() -> tuple[int, int]:
        app = SimpleNamespace(state=SimpleNamespace(job_worker_enabled=True))
        # Entered the same way the shared lifespan enters every handler.
        async with asynccontextmanager(job_worker_lifespan)(app):
            for _ in range(200):
                if passes:
                    break
                await asyncio.sleep(0.005)
        return len(asyncio.all_tasks()), len(passes)

    lingering, runs = asyncio.run(enabled())

    assert runs, "an enabled worker should drain at least once"
    assert lingering == 1, "the worker task must not outlive the lifespan"


def test_worker_shutdown_cancels_the_active_job_and_stops_draining(
    monkeypatch: pytest.MonkeyPatch,
):
    """Shutdown lets the active executor finish but does not start another job."""
    started = threading.Event()
    release = threading.Event()
    drained: list[int] = []
    cancelled: list[int] = []

    def drain(_config: object, active: object, stop: threading.Event) -> int:
        active.set(1)
        started.set()
        release.wait(timeout=1)
        active.set(None)
        if not stop.is_set():
            drained.append(2)
        return 1

    def cancel(_config: object, active: object) -> bool:
        cancelled.append(active.get())
        release.set()
        return True

    monkeypatch.setattr("sta.domain.jobs.worker.get_config", lambda: SimpleNamespace())
    monkeypatch.setattr("sta.domain.jobs.worker.drain_jobs", drain)
    monkeypatch.setattr("sta.domain.jobs.worker.cancel_active_job", cancel)

    async def run() -> None:
        app = SimpleNamespace(state=SimpleNamespace(job_worker_enabled=True))
        async with asynccontextmanager(job_worker_lifespan)(app):
            await asyncio.to_thread(started.wait, 1)

    asyncio.run(run())

    assert cancelled == [1]
    assert drained == []
