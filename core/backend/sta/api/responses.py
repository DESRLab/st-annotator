from typing import Literal

from fastapi import Response
from pydantic import BaseModel, Field

from ..domain.querying import Pagination


def format_content_range(
    unit: str,
    *,
    pagination: Pagination,
    page_length: int,
    total: int,
) -> str:
    """Formats the API's existing half-open pagination range."""
    start = pagination.offset
    return f"{unit} {start}-{start + page_length}/{total}"


def set_content_range(
    response: Response,
    unit: str,
    *,
    pagination: Pagination,
    page_length: int,
    total: int,
) -> None:
    """Adds a paginated collection's range without replacing an override."""
    response.headers.setdefault(
        "Content-Range",
        format_content_range(
            unit,
            pagination=pagination,
            page_length=page_length,
            total=total,
        ),
    )


class SuccessResponse(BaseModel):
    success: Literal[True] = True


class CreatedIDsResponse(SuccessResponse):
    ids: list[int]


class QueuedJobsResponse(SuccessResponse):
    """
    A write that may have queued background work, reporting what it queued.

    ``job_ids`` is empty when the operation derived what it needed in the request itself,
    or coalesced onto work already waiting, so a caller never has to guess whether a
    success meant a queue row. A write that returns a record carries the ids the same way
    rather than answering twice.
    """

    job_ids: list[int] = Field(default_factory=list)
