from concurrent.futures import ThreadPoolExecutor
from threading import Event

from sqlalchemy import Column, Integer, MetaData, Table, create_engine, insert, select
from sqlmodel import Session

from sta.domain.ops import reserve_bulk_insert_ids


def test_sqlite_id_reservations_are_serialized_until_commit(tmp_path):
    engine = create_engine(
        f"sqlite:///{tmp_path / 'id-reservations.db'}",
        connect_args={"timeout": 2},
    )
    metadata = MetaData()
    table = Table("bulk_item", metadata, Column("id", Integer, primary_key=True))
    metadata.create_all(engine)
    table_cls = type("BulkItem", (), {"__table__": table})
    second_started = Event()

    def reserve_second() -> list[int]:
        with Session(engine) as second_session:
            second_started.set()
            ids = reserve_bulk_insert_ids(
                session=second_session,
                table_cls=table_cls,
                count=1,
            )
            second_session.execute(insert(table), [{"id": ids[0]}])
            second_session.commit()
            return ids

    with Session(engine) as first_session:
        first_ids = reserve_bulk_insert_ids(
            session=first_session,
            table_cls=table_cls,
            count=1,
        )

        with ThreadPoolExecutor(max_workers=1) as executor:
            second_result = executor.submit(reserve_second)
            assert second_started.wait(timeout=1)
            first_session.execute(insert(table), [{"id": first_ids[0]}])
            first_session.commit()
            second_ids = second_result.result(timeout=2)

    assert first_ids == [1]
    assert second_ids == [2]
    with engine.connect() as connection:
        assert connection.execute(select(table.c.id).order_by(table.c.id)).scalars().all() == [1, 2]

    engine.dispose()
