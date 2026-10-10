from typing import cast

from sqlmodel import Session

from sta.api.crud import (
    commit_created_ids,
    commit_record,
    commit_success,
    unique_ids,
)


class RecordingSession:
    def __init__(self) -> None:
        self.calls: list[tuple[str, object | None]] = []

    def commit(self) -> None:
        self.calls.append(("commit", None))

    def refresh(self, record: object) -> None:
        self.calls.append(("refresh", record))


def test_unique_ids_deduplicates_bulk_ids() -> None:
    assert unique_ids([3, 1, 3]) == {1, 3}


def test_commit_record_commits_then_refreshes_and_returns_record() -> None:
    session = RecordingSession()
    record = object()

    result = commit_record(cast(Session, session), record)

    assert result is record
    assert session.calls == [("commit", None), ("refresh", record)]


def test_commit_success_preserves_response_shape() -> None:
    session = RecordingSession()

    result = commit_success(cast(Session, session))

    assert result.model_dump() == {"success": True}
    assert session.calls == [("commit", None)]


def test_commit_created_ids_preserves_order_and_response_shape() -> None:
    session = RecordingSession()

    result = commit_created_ids(cast(Session, session), [4, 2])

    assert result.model_dump() == {"success": True, "ids": [4, 2]}
    assert session.calls == [("commit", None)]
