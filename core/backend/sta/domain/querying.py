"""Shared filtering and sorting helpers for list queries.

The paginated grids apply their column filters and sorts server-side; the
list endpoints translate the grid state into these typed building blocks.
"""

from collections.abc import Mapping, Sequence
from http import HTTPStatus
from typing import Annotated, Any, Literal, TypeVar

from fastapi import HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import Select, func
from sqlmodel import select
from sqlmodel.sql.expression import SelectOfScalar

SortDirection = Literal["asc", "desc"]
_SelectT = TypeVar("_SelectT", bound=Select[Any])


class Pagination(BaseModel):
    """Validated offset/limit parameters shared by paginated endpoints."""

    model_config = ConfigDict(frozen=True)

    offset: int = Field(default=0, ge=0)
    limit: int | None = Field(default=None, ge=0)


class Sorting(BaseModel):
    """Validated sorting parameters shared by sortable endpoints."""

    model_config = ConfigDict(frozen=True)

    sort_by: str | None = None
    sort_dir: SortDirection = "asc"


def pagination_params(
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int | None, Query(ge=0)] = None,
) -> Pagination:
    """Binds the public ``offset``/``limit`` query parameters."""
    return Pagination(offset=offset, limit=limit)


def sorting_params(
    sort_by: Annotated[str | None, Query()] = None,
    sort_dir: Annotated[SortDirection, Query()] = "asc",
) -> Sorting:
    """Binds the public ``sort_by``/``sort_dir`` query parameters."""
    return Sorting(sort_by=sort_by, sort_dir=sort_dir)


def paginate(q: _SelectT, pagination: Pagination) -> _SelectT:
    """Derives a page query from an unpaginated, filtered query."""
    q = q.offset(pagination.offset)
    if pagination.limit is not None:
        q = q.limit(pagination.limit)

    return q


def count_query(q: Select[Any]) -> SelectOfScalar[int]:
    """Derives a row-count query from an unpaginated, filtered query."""
    return select(func.count()).select_from(q.order_by(None).subquery())


def id_query(q: Select[Any], id_column: Any) -> Select[Any]:
    """Derives an ID-only query while retaining the base query's filters."""
    return q.order_by(None).with_only_columns(id_column, maintain_column_froms=True)


def filter_contains(q: _SelectT, column: Any, value: str | None) -> _SelectT:
    """Filters `column` to rows containing `value` (case-insensitive)."""
    if value is None or value == "":
        return q

    return q.where(column.ilike(f"%{value}%"))


def filter_in(q: _SelectT, column: Any, values: Sequence[Any] | None) -> _SelectT:
    """Filters `column` to rows matching any of `values`."""
    if not values:
        return q

    return q.where(column.in_(values))


def filter_range(
    q: _SelectT,
    column: Any,
    *,
    ge: Any = None,
    le: Any = None,
    lt: Any = None,
) -> _SelectT:
    """Filters `column` to `ge` <= column, column <= `le`, and/or column < `lt`."""
    if ge is not None:
        q = q.where(column >= ge)
    if le is not None:
        q = q.where(column <= le)
    if lt is not None:
        q = q.where(column < lt)

    return q


def apply_sort(
    q: _SelectT,
    allowed: Mapping[str, Any],
    sort_by: str | None,
    sort_dir: SortDirection = "asc",
) -> _SelectT:
    """Orders by `sort_by` if it is among the `allowed` columns.

    Raises
    ------
        HTTPException: If `sort_by` is not an allowed column name.
    """
    if sort_by is None:
        return q

    column = allowed.get(sort_by)
    if column is None:
        raise HTTPException(
            status_code=HTTPStatus.UNPROCESSABLE_ENTITY,
            detail=f"Cannot sort by: {sort_by!r}",
        )

    return q.order_by(column.desc() if sort_dir == "desc" else column.asc())
