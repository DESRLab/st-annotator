from datetime import datetime
from typing import Any, TypeVar, cast

from sqlalchemy.engine import Result
from sqlalchemy.orm import Session as SQLAlchemySession
from sqlalchemy.orm.attributes import QueryableAttribute
from sqlmodel import Session

_T = TypeVar("_T")


def sql_column(attribute: _T | None) -> QueryableAttribute[_T]:
    """View a SQLModel class field as its SQLAlchemy query expression."""
    return cast(QueryableAttribute[_T], attribute)


def execute_statement(
    session: Session,
    statement: Any,
    params: Any = None,
) -> Result[Any]:
    """Execute a SQLAlchemy statement not supported by SQLModel's typed ``exec`` overloads."""
    return SQLAlchemySession.execute(session, statement, params)


def stamp_bulk_edit(data_to_update: dict[str, Any]) -> bool:
    """
    Prepare the values of a bulk Core ``UPDATE`` on an optimistic-locking table.

    A Core UPDATE bypasses the model's automatic timestamping, so bulk edits were
    previously invisible to :meth:`OptimisticLockingSQLModel.check_edit_conflict`
    and a stale single-record edit could silently revert a newer bulk one. Writing
    ``last_edit_at`` into the same mapping the statement draws its values from
    means an association-only payload still emits a statement.

    ``issued_at`` is concurrency metadata for single-record edits rather than a
    column on the bulk table, so it is dropped here to keep every bulk model
    accepted (and deliberately not recorded).

    Returns whether the payload named anything to update. Call this before the
    link/association keys are popped, and gate the statement on the result.
    """
    data_to_update.pop("issued_at", None)

    has_updates = bool(data_to_update)
    if has_updates:
        data_to_update["last_edit_at"] = datetime.now().astimezone()

    return has_updates
