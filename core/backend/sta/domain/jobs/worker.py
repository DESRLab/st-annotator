"""The in-process worker that drains the job queue.

One loop runs per API process. It is started deliberately rather than implicitly:
:func:`sta.api.root.build_api` defaults to leaving it off, so importing or building the
application never performs background work, and `sta serve` opts in. Callers that must not
return before the data is consistent -- a bulk importer, the fixture server behind the
editor tests -- drain the queue synchronously instead of waiting for a poll pass.

Several processes may share one database, so correctness does not depend on there being
only one worker: jobs are claimed by a conditional update, and every executor re-reads
the records it was told to finish.
"""

import asyncio
import os
import threading
from collections.abc import AsyncGenerator
from contextlib import suppress
from typing import Final

from fastapi import FastAPI

from sta.common.logging import get_logger
from sta.config import AppConfig, get_config
from sta.envs import STA_JOB_POLL_INTERVAL_SECONDS
from sta.models.job import JobState
from sta.session import session_ctx

from .base import cancel_job, claim_next_job, run_job

logger = get_logger()

DEFAULT_POLL_INTERVAL_SECONDS: Final = 5.0
"""How long the worker waits after a pass that found the queue empty."""

SHUTDOWN_GRACE_SECONDS: Final = 5.0
"""How long shutdown waits for an in-flight pass before abandoning it.

Abandoning is safe by construction: an executor checkpoints the records it finished, and
a job left :attr:`~sta.models.job.JobState.RUNNING` does not stop its work from being
re-queued, because coalescing only looks at pending rows.
"""

_TIMEOUT_ERRORS: Final = (TimeoutError, asyncio.TimeoutError)
"""Both spellings of a wait_for timeout: the aliases differ before Python 3.11."""


def poll_interval_seconds_from_env() -> float:
    """Read :data:`STA_JOB_POLL_INTERVAL_SECONDS`, falling back to the default."""
    raw = os.environ.get(STA_JOB_POLL_INTERVAL_SECONDS, "").strip()
    if not raw:
        return DEFAULT_POLL_INTERVAL_SECONDS

    try:
        seconds = float(raw)
    except ValueError as exc:
        msg = f"{STA_JOB_POLL_INTERVAL_SECONDS} must be a number of seconds, got {raw!r}"
        raise RuntimeError(msg) from exc

    if seconds <= 0:
        msg = f"{STA_JOB_POLL_INTERVAL_SECONDS} must be positive, got {seconds}"
        raise RuntimeError(msg)

    return seconds


class _ActiveJob:
    """Thread-safe identity of the job owned by this process."""

    def __init__(self) -> None:
        super().__init__()

        self._lock = threading.Lock()
        self._job_id: int | None = None

    def set(self, job_id: int | None) -> None:
        with self._lock:
            self._job_id = job_id

    def get(self) -> int | None:
        with self._lock:
            return self._job_id


def drain_jobs(
    config: AppConfig,
    active: _ActiveJob | None = None,
    stop: threading.Event | None = None,
) -> int:
    """
    Claim and run queued jobs until none is pending; returns how many ran.

    One session per pass: a queue that has been drained for hours must not hold a
    transaction open, and an executor's checkpoints are the only commits it makes.
    """
    processed = 0
    with session_ctx(config) as session:
        while stop is None or not stop.is_set():
            job = claim_next_job(session=session)
            if job is None:
                break

            # Publish the claim before running the executor. This lets inventory readers
            # see it and lets shutdown cancel it from a separate session.
            if active is not None:
                active.set(job.id)
            session.commit()
            try:
                run_job(session=session, job=job)
                session.commit()
            finally:
                if active is not None:
                    active.set(None)
            processed += 1
    return processed


def cancel_active_job(config: AppConfig, active: _ActiveJob) -> bool:
    """Persist cancellation for the running job owned by this worker, if any."""
    job_id = active.get()
    if job_id is None:
        return False
    with session_ctx(config) as session:
        return cancel_job(
            session=session,
            job_id=job_id,
            states=(JobState.RUNNING,),
            reason="The backend stopped before this job completed.",
        )


async def _worker_loop(
    config: AppConfig,
    stop: asyncio.Event,
    thread_stop: threading.Event,
    interval: float,
    active: _ActiveJob,
) -> None:
    while not stop.is_set():
        try:
            # Executors read data files, which is exactly the blocking work that must
            # stay off the event loop: a sweep over a large group would otherwise stall
            # every live request for its duration.
            await asyncio.to_thread(drain_jobs, config, active, thread_stop)
        except Exception:
            logger.exception("Job worker pass failed")

        with suppress(*_TIMEOUT_ERRORS):
            await asyncio.wait_for(stop.wait(), timeout=interval)


async def job_worker_lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """
    Run the worker for as long as the API is up, when the app asked for it.

    A plain async-generator function, which is the shape
    :func:`sta.api.lifespan.register_lifespan_handler` expects: the shared lifespan enters
    each handler, so decorating this one would wrap it twice.
    """
    if not getattr(app.state, "job_worker_enabled", False):
        yield
        return

    stop = asyncio.Event()
    thread_stop = threading.Event()
    active = _ActiveJob()
    config = get_config()
    task = asyncio.create_task(
        _worker_loop(config, stop, thread_stop, poll_interval_seconds_from_env(), active),
        name="sta-job-worker",
    )
    logger.info("Job worker started")

    try:
        yield
    finally:
        stop.set()
        thread_stop.set()

        if active.get() is not None:
            try:
                await asyncio.to_thread(cancel_active_job, config, active)
            except Exception:
                logger.exception("Could not cancel the active job during shutdown")

        try:
            await asyncio.wait_for(task, timeout=SHUTDOWN_GRACE_SECONDS)
        except _TIMEOUT_ERRORS:
            logger.warning(
                "Job worker was still draining after %s s; it will finish in the background",
                SHUTDOWN_GRACE_SECONDS,
            )
        except asyncio.CancelledError:
            pass

        logger.info("Job worker stopped")
