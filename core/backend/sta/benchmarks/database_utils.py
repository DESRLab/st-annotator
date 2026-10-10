from typing import Any, cast as type_cast

from sqlalchemy import BigInteger, bindparam, column, func, select, table as sql_table
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.sql import quoted_name
from sqlalchemy.sql.compiler import SQLCompiler
from sqlalchemy.sql.expression import ClauseElement, Executable, cast as sql_cast


# https://github.com/sqlalchemy/sqlalchemy/wiki/Query-Plan-SQL-construct
class explain(Executable, ClauseElement):
    inherit_cache = False

    def __init__(self, stmt: Executable, *, analyze: bool = False) -> None:
        super().__init__()

        self.statement = type_cast(ClauseElement, stmt)
        self.analyze = analyze


@compiles(explain, "postgresql")
def pg_explain(element: explain, compiler: SQLCompiler, **kw: Any) -> str:
    text = "EXPLAIN "
    if element.analyze:
        text += "ANALYZE "
    text += compiler.process(element.statement, **kw)

    return text


class labels_nbytes(Executable, ClauseElement):
    inherit_cache = False

    def __init__(self, table: str, *, group_id: int) -> None:
        super().__init__()

        label_rows = sql_table(
            quoted_name(table, quote=True),
            column("group_id"),
        ).alias("label_row")

        self.statement = select(
            sql_cast(
                func.coalesce(
                    select(func.sum(func.pg_column_size(column(label_rows.name))))
                    .select_from(label_rows)
                    .where(label_rows.c.group_id == bindparam("group_id", group_id))
                    .scalar_subquery(),
                    0,
                ),
                BigInteger,
            ),
        )


@compiles(labels_nbytes, "postgresql")
def pg_labels_nbytes(element: labels_nbytes, compiler: SQLCompiler, **kw: Any) -> str:
    return compiler.process(element.statement, **kw)
