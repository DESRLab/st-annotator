"""Persisted records of work that runs outside the request cycle."""

from datetime import datetime
from enum import Enum
from typing import Any, ClassVar

from pydantic import field_serializer, field_validator
from sqlalchemy.sql.sqltypes import BigInteger, Integer, String, Text
from sqlmodel import Field, SQLModel

from sta.common.database.types import JSONB, UTCDateTime
from sta.common.utils.json import JSONType

from .base import sqlmodel_sa_type

__all__ = ["Job", "JobPublic", "JobState"]


class JobState(str, Enum):
    """Lifecycle of a queued unit of work, as persisted in :attr:`Job.state`."""

    PENDING = "pending"
    """Enqueued and waiting for a worker to claim it."""

    RUNNING = "running"
    """Claimed by a worker; the executor is in progress."""

    SUCCEEDED = "succeeded"
    """The executor returned without raising."""

    FAILED = "failed"
    """The executor raised; :attr:`Job.error` records why."""

    CANCELLED = "cancelled"
    """The worker process stopped before the executor completed."""


class Job(SQLModel, table=True):
    """One deferred unit of work, claimed and executed by a worker.

    The row is bookkeeping, never the source of truth for the work's *purpose*: a job
    that is lost (a crash between claim and completion, a manual delete) must leave the
    data describing itself as unfinished. Producers therefore mark their own records
    first and enqueue afterwards, so the queue only carries progress and history.
    """

    __tablename__: ClassVar[Any] = "job"

    id: int | None = Field(
        default=None,
        sa_type=sqlmodel_sa_type(BigInteger().with_variant(Integer, "sqlite")),
        primary_key=True,
    )

    kind: str = Field(sa_type=sqlmodel_sa_type(String(63)), nullable=False)
    """Registry key of the executor that runs this job.

    Plugins own their kinds: the key names the package that registered the executor, so
    an unknown kind is a job whose plugin is not installed in this process.
    """

    dedupe_key: str | None = Field(
        default=None,
        sa_type=sqlmodel_sa_type(String(255)),
        index=True,
    )
    """Caller-supplied identity of the work, used to coalesce equivalent queueing.

    Not a constraint: concurrent producers may both enqueue, and an executor must be
    idempotent because a duplicate job re-runs work whose records may already be
    finished. What it prevents is the ordinary case -- one bulk edit marking one group
    fifty times queueing fifty sweeps.
    """

    payload: JSONType = Field(sa_type=JSONB, nullable=False, default_factory=dict)
    """Executor-specific parameters, validated by the executor and not by the queue."""

    label: str | None = Field(default=None, sa_type=sqlmodel_sa_type(String(255)))
    """One-line description of the work, written by whoever queued it.

    ``kind`` plus an opaque payload is not something a reader of the job inventory can
    act on, and the queue must not know what any particular executor's parameters mean in
    order to display them.
    """

    state: JobState = Field(
        default=JobState.PENDING,
        sa_type=sqlmodel_sa_type(String(16)),
        nullable=False,
        index=True,
    )

    @field_validator("state", mode="before")
    @classmethod
    def _validate_state(cls, value: JobState | str) -> JobState:
        return value if isinstance(value, JobState) else JobState(value)

    @field_serializer("state")
    def _serialize_state(self, value: JobState | str) -> str:
        return value.value if isinstance(value, JobState) else JobState(value).value

    progress_done: int = Field(default=0, nullable=False)
    """Items the executor has finished handling so far."""

    progress_total: int | None = Field(default=None)
    """Items the executor intends to handle, once it knows the count."""

    error: str | None = Field(default=None, sa_type=Text)
    """Failure detail, kept for :attr:`JobState.FAILED` and cleared otherwise."""

    created_by_id: int | None = Field(
        default=None,
        foreign_key="user.id",
        ondelete="SET NULL",
    )
    """The actor whose write enqueued this job.

    The executor runs the domain under this identity, so deferred work obeys exactly the
    visibility rules its trigger did; a job whose actor has since been deleted cannot
    run and fails rather than borrowing someone else's reach.
    """

    created_at: datetime = Field(
        sa_type=UTCDateTime,
        default_factory=lambda: datetime.now().astimezone(),
    )
    started_at: datetime | None = Field(sa_type=UTCDateTime, default=None)
    finished_at: datetime | None = Field(sa_type=UTCDateTime, default=None)


class JobPublic(SQLModel):
    """The job inventory as read by the API."""

    id: int
    kind: str
    dedupe_key: str | None
    payload: JSONType
    label: str | None
    state: JobState
    progress_done: int
    progress_total: int | None
    error: str | None
    created_by_id: int | None
    created_at: datetime
    started_at: datetime | None
    finished_at: datetime | None

    def __hash__(self) -> int:
        return hash(self.id)
