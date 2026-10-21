"""Validated scalar column filters for paginated SQL queries."""

import re
import uuid
from collections.abc import Set
from datetime import datetime
from typing import Any, TypeVar

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field, TypeAdapter, ValidationError
from sqlalchemy import Select, String, cast, func
from sqlalchemy.types import TypeDecorator, Uuid

from sta.common.database.execution import sql_column
from sta.common.database.types import GUID

_SelectT = TypeVar("_SelectT", bound=Select[Any])


class ColumnFilter(BaseModel):
    model_config = ConfigDict(extra="forbid")

    column_id: str = Field(alias="columnId")
    operator: str = ""
    search_terms: list[str | int | float | bool | None] = Field(
        default_factory=list, alias="searchTerms"
    )


def apply_column_filters(
    q: _SelectT, table: Any, filters: str | None, *, allowed_columns: Set[str]
) -> _SelectT:
    """Apply validated Slickgrid filters before pagination.

    The caller owns the searchable column names.

    Filtering historical rows before snapshot resolution could resurrect an older
    revision that matches a filter. Keep predicates on the resolved table instead.
    """
    if filters is None:
        return q
    try:
        parsed = TypeAdapter(list[ColumnFilter]).validate_json(filters)
        for item in parsed:
            if item.column_id not in allowed_columns:
                message = f"Cannot filter by: {item.column_id!r}"
                raise ValueError(message)
            terms = [
                str(term) for term in item.search_terms if term is not None and str(term) != ""
            ]
            if not terms:
                continue
            column = sql_column(getattr(table, item.column_id))
            is_uuid = isinstance(column.type, (GUID, Uuid))
            sql_type = column.type
            while isinstance(sql_type, TypeDecorator):
                sql_type = sql_type.impl
            value_type = uuid.UUID if is_uuid else sql_type.python_type
            operator = item.operator.lower()
            # Input filters retain operators in their search text when using a
            # backend service (for example ">=3" or "car*").
            if operator in {"", "contains", "eq"} and len(terms) == 1:
                match = re.match(r"^(<=|>=|!=|<>|==|=|<|>)(.*)$", terms[0])
                if match:
                    operator, term = match.groups()
                    terms = [term]
                elif ".." in terms[0]:
                    operator, terms = "rangeinclusive", terms[0].split("..", 1)
                elif terms[0].startswith("*"):
                    operator, terms = "endswith", [terms[0][1:]]
                elif terms[0].endswith("*"):
                    operator, terms = "startswith", [terms[0][:-1]]
                elif "*" in terms[0]:
                    operator = "startswithendswith"
            if (
                operator in {"rangeinclusive", "rangeexclusive"}
                and len(terms) == 1
                and ".." in terms[0]
            ):
                terms = terms[0].split("..", 1)
            text = (
                value_type is str
                or operator
                in {
                    "*",
                    "contains",
                    "not_contains",
                    "startswith",
                    "endswith",
                    "startswithendswith",
                    "a*z",
                    "a*",
                    "*z",
                }
                or (operator == "" and value_type in {uuid.UUID, datetime})
            )
            if text:
                target = cast(column, String)
                term = terms[0]
                if is_uuid:
                    target = func.replace(target, "-", "")
                    term = term.replace("-", "")
                    terms = [value.replace("-", "") for value in terms]
                if operator in {"", "*", "contains", "not_contains"}:
                    predicate = target.icontains(term, autoescape=True)
                    if operator == "not_contains":
                        predicate = ~predicate
                elif operator in {"startswith", "a*"}:
                    predicate = target.istartswith(term, autoescape=True)
                elif operator in {"endswith", "*z"}:
                    predicate = target.iendswith(term, autoescape=True)
                elif operator in {"startswithendswith", "a*z"}:
                    start, end = term.split("*", 1)
                    predicate = target.istartswith(start, autoescape=True) & target.iendswith(
                        end, autoescape=True
                    )
                else:
                    predicate = _comparison(target, terms, operator)
            else:
                values = [TypeAdapter(value_type).validate_python(term) for term in terms]
                predicate = _comparison(column, values, operator)
            q = q.where(predicate)
    except (ValidationError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=f"Invalid column filters: {exc}") from exc
    return q


def _comparison(column: Any, values: list[Any], operator: str):
    if operator in {"", "=", "==", "eq", "equals", "in"}:
        return column.in_(values)
    if operator in {"!=", "<>", "ne", "nin", "not_in"}:
        return column.not_in(values)
    value = values[0]
    if operator in {">", "gt"}:
        return column > value
    if operator in {">=", "ge"}:
        return column >= value
    if operator in {"<", "lt"}:
        return column < value
    if operator in {"<=", "le"}:
        return column <= value
    if operator in {"rangeinclusive", "rangeexclusive"} and len(values) == 2:
        if operator == "rangeexclusive":
            return (column > value) & (column < values[1])
        return column.between(value, values[1])
    message = f"Unsupported filter operator: {operator!r}"
    raise ValueError(message)
