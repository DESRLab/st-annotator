from typing import Any

from sqlalchemy import false, func, select, text, update
from sqlmodel import Session


def reserve_bulk_insert_ids(
    *,
    session: Session,
    table_cls: type[Any],
    count: int,
) -> list[int]:
    if count <= 0:
        return []

    bind = session.get_bind()
    table = table_cls.__table__
    id_column = table.c.id

    if bind.dialect.name == "postgresql":
        result = session.connection().execute(
            text(
                "SELECT nextval(pg_get_serial_sequence(:table_name, :column_name)) AS id "
                "FROM generate_series(1, :count)",
            ),
            {
                "table_name": table.fullname,
                "column_name": id_column.name,
                "count": count,
            },
        )
        return [int(value) for value in result.scalars().all()]

    if bind.dialect.name == "sqlite":
        # Execute a write statement before reading MAX(id). SQLite retains the
        # resulting database write lock until this transaction commits, so a
        # concurrent allocator cannot observe the same maximum and reserve an
        # overlapping range. The false predicate intentionally changes no row.
        session.connection().execute(
            update(table).where(false()).values({id_column: id_column}),
        )
        current_max_id = (
            session.connection().execute(select(func.max(id_column))).scalar_one_or_none()
        )
        next_id = 1 if current_max_id is None else int(current_max_id) + 1
        return list(range(next_id, next_id + count))

    msg = f"Bulk insert ID reservation is not implemented for {bind.dialect.name!r}."
    raise NotImplementedError(msg)
