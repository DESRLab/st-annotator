from collections.abc import Iterable
from typing import TypeVar

from sqlmodel import Session

from .responses import CreatedIDsResponse, QueuedJobsResponse, SuccessResponse

RecordT = TypeVar("RecordT")
IDT = TypeVar("IDT")


def unique_ids(ids: Iterable[IDT]) -> set[IDT]:
    """Normalizes bulk IDs before passing them to the domain layer."""
    return set(ids)


def commit_record(session: Session, record: RecordT) -> RecordT:
    """Commits and refreshes a newly created or updated record."""
    session.commit()
    session.refresh(record)
    return record


def commit_success(session: Session) -> SuccessResponse:
    """Commits a mutation and returns the API's standard success body."""
    session.commit()
    return SuccessResponse()


def commit_created_ids(
    session: Session,
    ids: Iterable[int],
) -> CreatedIDsResponse:
    """Commits a bulk create and returns its standard response body."""
    session.commit()
    return CreatedIDsResponse(ids=list(ids))


def commit_queued_jobs(
    session: Session,
    job_ids: Iterable[int],
) -> QueuedJobsResponse:
    """
    Commits a mutation and reports the background work it started.

    The ids come from the write path rather than from anything the helper can inspect:
    only the queue knows whether a row was created or the work was already waiting, so a
    caller reports what began, never what it asked for.
    """
    session.commit()
    return QueuedJobsResponse(job_ids=list(job_ids))
