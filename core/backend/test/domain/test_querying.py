from sqlalchemy.dialects import postgresql, sqlite
from sqlmodel import select

import pytest

from sta.domain.querying import Pagination, count_query, id_query, paginate
from sta.models.account import Account


@pytest.mark.parametrize("dialect", [sqlite.dialect(), postgresql.dialect()])
def test_list_queries_compile_for_supported_database_dialects(dialect):
    filtered = select(Account).where(Account.username == "filtered")

    page_sql = str(
        paginate(filtered, Pagination(offset=5, limit=10)).compile(dialect=dialect),
    )
    count_sql = str(count_query(filtered).compile(dialect=dialect))
    ids_sql = str(id_query(filtered, Account.id).compile(dialect=dialect))

    assert "WHERE account.username =" in page_sql
    assert "LIMIT" in page_sql
    assert "OFFSET" in page_sql
    assert "count(" in count_sql
    assert "WHERE account.username =" in count_sql
    assert "account.id" in ids_sql
    assert "WHERE account.username =" in ids_sql
