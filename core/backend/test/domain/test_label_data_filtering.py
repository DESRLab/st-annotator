"""Column predicates filter the full result set before pagination."""

import json
import uuid
from datetime import datetime, timezone
from typing import Any, ClassVar

from fastapi import HTTPException
from sqlmodel import Field, Session, SQLModel, create_engine, select

import pytest

from sta.common.database.types import GUID
from sta.domain.filtering import apply_column_filters
from sta.domain.querying import Pagination, count_query, paginate

pytestmark = [pytest.mark.in_memory_db, pytest.mark.no_plugins]


class FilterRow(SQLModel, table=True):
    __tablename__: ClassVar[Any] = "test_label_column_filters"
    key: uuid.UUID = Field(sa_type=GUID, primary_key=True)
    reference: uuid.UUID
    title: str
    score: int
    enabled: bool
    updated_at: datetime


@pytest.mark.parametrize(
    "column,operator,terms,expected",
    [
        ("title", "", ["MATCH"], [2, 4, 6]),
        ("score", ">=", [4], [4, 5, 6]),
        ("score", ">=", [99], []),
        ("score", "", [">=4"], [4, 5, 6]),
        ("score", "", ["3..5"], [3, 4, 5]),
        ("title", "", ["MAT*"], [2, 4, 6]),
        ("score", "RangeInclusive", [3, 5], [3, 4, 5]),
        ("score", "!=", [2], [1, 3, 4, 5, 6]),
        ("enabled", "", [False], [2, 4, 6]),
        ("key", "", ["00000000-0000-0000-0000-000000000004"], [4]),
        ("reference", "", ["00000000-0000-0000-0000-000000000004"], [4]),
        ("updated_at", ">=", ["2020-01-04T00:00:00"], [4, 5, 6]),
        ("title", "", ["%"], [1]),
    ],
)
def test_filters_precede_page_and_count(column, operator, terms, expected):
    engine = create_engine("sqlite://")
    FilterRow.__table__.create(engine)
    try:
        with Session(engine) as session:
            session.add_all(
                FilterRow(
                    key=uuid.UUID(int=i),
                    reference=uuid.UUID(int=i),
                    title="MATCH" if i % 2 == 0 else "other%" if i == 1 else "other",
                    score=i,
                    enabled=bool(i % 2),
                    updated_at=datetime(2020, 1, i, tzinfo=timezone.utc),
                )
                for i in range(1, 7)
            )
            session.commit()
            filters = json.dumps([{"columnId": column, "operator": operator, "searchTerms": terms}])
            q = apply_column_filters(
                select(FilterRow).order_by(FilterRow.key),
                FilterRow,
                filters,
                allowed_columns={"key", "reference", "title", "score", "enabled", "updated_at"},
            )
            assert session.exec(count_query(q)).one() == len(expected)
            rows = session.exec(paginate(q, Pagination(offset=1, limit=2))).all()
            assert [row.key.int for row in rows] == expected[1:3]
    finally:
        engine.dispose()


@pytest.mark.parametrize(
    "filters",
    [
        "{",
        "{}",
        '[{"columnId":"password"}]',
        '[{"columnId":"score","searchTerms":["bad"]}]',
        '[{"columnId":"key","operator":"Custom","searchTerms":["bad"]}]',
    ],
)
def test_invalid_filters_return_422(filters):
    with pytest.raises(HTTPException) as exc:
        apply_column_filters(
            select(FilterRow),
            FilterRow,
            filters,
            allowed_columns={"key", "reference", "title", "score", "enabled", "updated_at"},
        )
    assert exc.value.status_code == 422


def test_existing_columns_must_be_explicitly_enabled():
    with pytest.raises(HTTPException) as exc:
        apply_column_filters(
            select(FilterRow),
            FilterRow,
            '[{"columnId":"title","searchTerms":["MATCH"]}]',
            allowed_columns={"score"},
        )
    assert exc.value.status_code == 422
    assert "title" in exc.value.detail
