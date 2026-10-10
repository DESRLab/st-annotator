"""Direct tests for the commit-versioned label data engine.

Exercises ``sta.domain/label/data/base.py`` (``LabelDataDomain``,
``LabelEntityDomain`` and ``LabelElementDomain``) through a pair of mock
entity/element domains, without going through any plugin.
"""

import uuid
from datetime import datetime, timezone
from decimal import Decimal
from enum import Enum
from http import HTTPStatus

from fastapi import HTTPException
from pydantic import BaseModel
from sqlalchemy.sql.sqltypes import String
from sqlmodel import Field, Session

import pytest

from sta.common.spatial import OptionalDecimalCoord3, PartialSTBounds
from sta.common.utils.json import JSONType
from sta.config import AppConfig
from sta.domain.frames import create_frame
from sta.domain.label.data import (
    LabelDataDomain,
    LabelElementDomain,
    LabelEntityDomain,
)
from sta.domain.label.groups import create_group as create_label_group
from sta.domain.label.repo.branches import read_branch
from sta.domain.label.repo.graph import (
    LabelsetBranchInit,
    init_branch,
    push_commits,
)
from sta.domain.label.repo.ops import Operation, OperationRegistry
from sta.domain.projects import create_project
from sta.domain.tasks import create_task
from sta.domain.users import create_user
from sta.models.frame import FrameCreate, WorkType
from sta.models.label.data import LabelElementSQLModel, LabelEntitySQLModel
from sta.models.label.group import LabelGroupCreate
from sta.models.label.repo import (
    BranchPermission,
    BranchPermissionLevel,
    LabelsetBranchPublic,
    LabelsetCommit,
    LabelsetCommitInstruction,
)
from sta.models.project import ProjectCreate
from sta.models.task import TaskCreate
from sta.models.user import Role, UserCreate, UserPublic
from sta.session import session_ctx

pytestmark = pytest.mark.in_memory_db


class MockEntitySQLModel(LabelEntitySQLModel):
    """A minimal entity model with a single custom column."""

    name: str = Field(sa_type=String(63), nullable=False, default="")

    @classmethod
    def get_update_cls(cls):
        class MockEntityUpdate(super().get_update_cls()):
            name: str | None = None

        return MockEntityUpdate


class MockElementSQLModel(LabelElementSQLModel):
    """A minimal element model relying on the inherited bounds columns."""


class MockOrphanElementSQLModel(LabelElementSQLModel):
    """An element model whose domain skips parent-entity validation."""


MockEntity = MockEntitySQLModel.get_table_cls("test_label_data_entity")
MockEntityCreate = MockEntitySQLModel.get_create_cls()
MockEntityPublic = MockEntitySQLModel.get_public_cls()
MockEntityUpdate = MockEntitySQLModel.get_update_cls()
MockEntityBulkUpdate = MockEntitySQLModel.get_update_cls()

MockElement = MockElementSQLModel.get_table_cls("test_label_data_element")
MockElementCreate = MockElementSQLModel.get_create_cls()
MockElementPublic = MockElementSQLModel.get_public_cls()
MockElementUpdate = MockElementSQLModel.get_update_cls()
MockElementBulkUpdate = MockElementSQLModel.get_update_cls()

entity_domain = LabelEntityDomain(
    table_cls=MockEntity,
    create_cls=MockEntityCreate,
    public_cls=MockEntityPublic,
    update_cls=MockEntityUpdate,
    bulk_update_cls=MockEntityBulkUpdate,
)
element_domain = LabelElementDomain(
    table_cls=MockElement,
    create_cls=MockElementCreate,
    public_cls=MockElementPublic,
    update_cls=MockElementUpdate,
    bulk_update_cls=MockElementBulkUpdate,
    entity_domain=entity_domain,
)

MockOrphanElement = MockOrphanElementSQLModel.get_table_cls("test_label_data_orphan_element")
MockOrphanElementCreate = MockOrphanElementSQLModel.get_create_cls()
MockOrphanElementPublic = MockOrphanElementSQLModel.get_public_cls()
MockOrphanElementUpdate = MockOrphanElementSQLModel.get_update_cls()
MockOrphanElementBulkUpdate = MockOrphanElementSQLModel.get_update_cls()

orphan_element_domain = LabelElementDomain(
    table_cls=MockOrphanElement,
    create_cls=MockOrphanElementCreate,
    public_cls=MockOrphanElementPublic,
    update_cls=MockOrphanElementUpdate,
    bulk_update_cls=MockOrphanElementBulkUpdate,
)


class MockOperationType(str, Enum):
    NO_OP = "test-label-data-no-op"


class MockNoOpParams(BaseModel):
    pass


class MockNoOpOperation(Operation[MockNoOpParams]):
    def apply(
        self,
        current_user: UserPublic,
        session: Session,
        commit: LabelsetCommit,
    ) -> JSONType:
        pass


def _register_no_op(op_registry: OperationRegistry):
    op_registry.register(MockOperationType.NO_OP, MockNoOpOperation, MockNoOpParams)


def _push_no_op(
    *,
    current_user: UserPublic,
    session: Session,
    op_registry: OperationRegistry,
    branch: LabelsetBranchPublic,
) -> LabelsetBranchPublic:
    """Pushes a no-op commit and returns the refreshed branch state."""
    push_commits(
        current_user=current_user,
        session=session,
        op_registry=op_registry,
        branch_id=branch.id,
        commit_instrs=[
            LabelsetCommitInstruction(
                op_name=MockOperationType.NO_OP,
                op_params=MockNoOpParams(),
            ),
        ],
    )
    session.commit()

    return LabelsetBranchPublic.model_validate(
        read_branch(
            current_user=current_user,
            session=session,
            id=branch.id,
        ),
    )


def _create_test_user(
    session: Session,
    root_user: UserPublic,
    *,
    username: str,
    roles: set[Role],
) -> UserPublic:
    record = create_user(
        current_user=root_user,
        session=session,
        data=UserCreate(
            username=username,
            password="password",
            roles=roles,
        ),
    )

    return UserPublic.model_validate(record)


def test_iter_cruds_includes_registered_domains():
    cruds = dict(LabelDataDomain.iter_cruds())

    assert cruds[MockEntity] is entity_domain
    assert cruds[MockElement] is element_domain
    assert cruds[MockOrphanElement] is orphan_element_domain


@pytest.mark.parametrize("use_delta_encoding", [True, False])
def test_entity_crud_copy_on_write_and_delete(
    monkeypatch: pytest.MonkeyPatch,
    test_app_config: AppConfig,
    root_user: UserPublic,
    op_registry: OperationRegistry,
    labelset_branch: LabelsetBranchPublic,
    *,
    use_delta_encoding: bool,
):
    monkeypatch.setenv("STA_USE_DELTA_ENCODING", str(use_delta_encoding))
    _register_no_op(op_registry)

    with session_ctx(test_app_config) as session:
        group_id = labelset_branch.group_id
        h0 = labelset_branch.head.hash

        # Scenario 1: create at the branch head.
        entity = entity_domain.create_data(
            current_user=root_user,
            session=session,
            data=MockEntityCreate(
                group_id=group_id,
                commit_hash=h0,
                name="entity-1",
            ),
        )
        session.commit()

        assert entity.id is not None
        assert entity.group_id == group_id
        assert entity.commit_hash == h0
        assert entity.name == "entity-1"
        assert entity.is_deleted is False

        # Scenario 2: reads.
        record = entity_domain.read_data(
            current_user=root_user,
            session=session,
            id=entity.id,
            group_id=group_id,
            commit_hash=h0,
        )
        assert record.id == entity.id
        assert record.name == "entity-1"

        with pytest.raises(HTTPException) as exc_info:
            entity_domain.read_data(
                current_user=root_user,
                session=session,
                id=uuid.uuid4(),
                group_id=group_id,
                commit_hash=h0,
            )
        assert exc_info.value.status_code == HTTPStatus.NOT_FOUND

        # Scenario 3: listing and counting.
        records = entity_domain.list_datas(
            current_user=root_user,
            session=session,
            group_id=group_id,
            commit_hash=h0,
        )
        assert {record.id for record in records} == {entity.id}
        assert (
            entity_domain.count_datas(
                current_user=root_user,
                session=session,
                group_id=group_id,
                commit_hash=h0,
            )
            == 1
        )

        records = entity_domain.list_datas(
            current_user=root_user,
            session=session,
            ids={entity.id},
            group_id=group_id,
            commit_hash=h0,
        )
        assert {record.id for record in records} == {entity.id}

        with pytest.raises(HTTPException) as exc_info:
            entity_domain.list_datas(
                current_user=root_user,
                session=session,
                ids={entity.id, uuid.uuid4()},
                group_id=group_id,
                commit_hash=h0,
            )
        assert exc_info.value.status_code == HTTPStatus.NOT_FOUND
        assert "Cannot find" in str(exc_info.value.detail)

        # Scenario 5: an update at a new commit is copy-on-write.
        branch = _push_no_op(
            current_user=root_user,
            session=session,
            op_registry=op_registry,
            branch=labelset_branch,
        )
        h1 = branch.head.hash
        assert h1 != h0

        updated = entity_domain.update_data(
            current_user=root_user,
            session=session,
            id=entity.id,
            group_id=group_id,
            commit_hash=h1,
            data=MockEntityUpdate(name="entity-1-updated"),
        )
        session.commit()

        assert updated.commit_hash == h1
        assert updated.name == "entity-1-updated"
        assert updated.last_edit_at is not None

        # The new state is visible at the new commit...
        record = entity_domain.read_data(
            current_user=root_user,
            session=session,
            id=entity.id,
            group_id=group_id,
            commit_hash=h1,
        )
        assert record.name == "entity-1-updated"
        assert record.commit_hash == h1

        # ...while the old commit still resolves the old state.
        record = entity_domain.read_data(
            current_user=root_user,
            session=session,
            id=entity.id,
            group_id=group_id,
            commit_hash=h0,
        )
        assert record.name == "entity-1"
        assert record.commit_hash == h0
        assert (
            entity_domain.count_datas(
                current_user=root_user,
                session=session,
                group_id=group_id,
                commit_hash=h0,
            )
            == 1
        )

        # Scenario 6: a delete at a new commit is a soft delete.
        branch = _push_no_op(
            current_user=root_user,
            session=session,
            op_registry=op_registry,
            branch=branch,
        )
        h2 = branch.head.hash

        entity_domain.delete_data(
            current_user=root_user,
            session=session,
            id=entity.id,
            group_id=group_id,
            commit_hash=h2,
        )
        session.commit()

        with pytest.raises(HTTPException) as exc_info:
            entity_domain.read_data(
                current_user=root_user,
                session=session,
                id=entity.id,
                group_id=group_id,
                commit_hash=h2,
            )
        assert exc_info.value.status_code == HTTPStatus.NOT_FOUND
        assert "deleted" in str(exc_info.value.detail).lower()

        assert (
            entity_domain.count_datas(
                current_user=root_user,
                session=session,
                group_id=group_id,
                commit_hash=h2,
            )
            == 0
        )

        # The record is still readable at the pre-delete commit.
        record = entity_domain.read_data(
            current_user=root_user,
            session=session,
            id=entity.id,
            group_id=group_id,
            commit_hash=h1,
        )
        assert record.name == "entity-1-updated"
        assert (
            entity_domain.count_datas(
                current_user=root_user,
                session=session,
                group_id=group_id,
                commit_hash=h1,
            )
            == 1
        )

        # Listing a deleted id at the deleting commit raises 404.
        with pytest.raises(HTTPException) as exc_info:
            entity_domain.list_datas(
                current_user=root_user,
                session=session,
                ids={entity.id},
                group_id=group_id,
                commit_hash=h2,
            )
        assert exc_info.value.status_code == HTTPStatus.NOT_FOUND
        assert "deleted" in str(exc_info.value.detail).lower()


@pytest.mark.parametrize("use_delta_encoding", [True, False])
def test_create_data_accepts_table_model_instances(
    monkeypatch: pytest.MonkeyPatch,
    test_app_config: AppConfig,
    root_user: UserPublic,
    labelset_branch: LabelsetBranchPublic,
    *,
    use_delta_encoding: bool,
):
    """``create_data`` must accept table-model instances, not just Create models.

    Regression test: ``table_cls.model_validate(data)`` used to resolve the
    instance's unloaded relationships (``commit``) to ``None``, and the flush
    then blanked the FK columns overlapping the composite primary key
    (``AssertionError: Dependency rule ... tried to blank-out primary key``).
    """
    monkeypatch.setenv("STA_USE_DELTA_ENCODING", str(use_delta_encoding))

    with session_ctx(test_app_config) as session:
        group_id = labelset_branch.group_id
        h0 = labelset_branch.head.hash

        # Baseline: the Create-model path.
        parent_entity = entity_domain.create_data(
            current_user=root_user,
            session=session,
            data=MockEntityCreate(group_id=group_id, commit_hash=h0, name="parent"),
        )
        session.commit()

        # A transient table-model instance: its ``commit`` relationship is
        # unloaded, and the instance is inserted as-is.
        entity_row = MockEntity(group_id=group_id, commit_hash=h0, name="from-table")
        record = entity_domain.create_data(
            current_user=root_user,
            session=session,
            data=entity_row,
        )
        session.commit()

        assert record.id == entity_row.id
        assert record.group_id == group_id
        assert record.commit_hash == h0
        assert record.name == "from-table"
        assert record.is_deleted is False

        # The returned record is usable: readable through the domain API.
        read_back = entity_domain.read_data(
            current_user=root_user,
            session=session,
            id=entity_row.id,
            group_id=group_id,
            commit_hash=h0,
        )
        assert read_back.name == "from-table"

        # Same for the element domain, whose create_data also
        # validates entity_id against the parent entity domain.
        element_row = MockElement(
            group_id=group_id,
            commit_hash=h0,
            entity_id=parent_entity.id,
            min_x=Decimal("1"),
        )
        record = element_domain.create_data(
            current_user=root_user,
            session=session,
            data=element_row,
        )
        session.commit()

        assert record.id == element_row.id
        assert record.commit_hash == h0
        assert record.entity_id == parent_entity.id
        assert record.min_x == Decimal("1")
        assert record.is_deleted is False

        read_back = element_domain.read_data(
            current_user=root_user,
            session=session,
            id=element_row.id,
            group_id=group_id,
            commit_hash=h0,
        )
        assert read_back.entity_id == parent_entity.id


@pytest.mark.parametrize("use_delta_encoding", [True, False])
def test_bulk_create_datas(
    monkeypatch: pytest.MonkeyPatch,
    test_app_config: AppConfig,
    root_user: UserPublic,
    labelset_branch: LabelsetBranchPublic,
    *,
    use_delta_encoding: bool,
):
    monkeypatch.setenv("STA_USE_DELTA_ENCODING", str(use_delta_encoding))

    with session_ctx(test_app_config) as session:
        group_id = labelset_branch.group_id
        h0 = labelset_branch.head.hash

        # Scenario 7: bulk create.
        names = ["bulk-a", "bulk-b", "bulk-c"]
        entity_domain.bulk_create_datas(
            current_user=root_user,
            session=session,
            data=[MockEntityCreate(group_id=group_id, commit_hash=h0, name=name) for name in names],
        )
        session.commit()

        records = entity_domain.list_datas(
            current_user=root_user,
            session=session,
            group_id=group_id,
            commit_hash=h0,
        )
        assert {record.name for record in records} == set(names)
        assert entity_domain.count_datas(
            current_user=root_user,
            session=session,
            group_id=group_id,
            commit_hash=h0,
        ) == len(names)

        # Scenario 3 (offset/limit).
        assert (
            len(
                entity_domain.list_datas(
                    current_user=root_user,
                    session=session,
                    offset=0,
                    limit=2,
                    group_id=group_id,
                    commit_hash=h0,
                )
            )
            == 2
        )
        assert (
            len(
                entity_domain.list_datas(
                    current_user=root_user,
                    session=session,
                    offset=2,
                    group_id=group_id,
                    commit_hash=h0,
                )
            )
            == 1
        )
        assert (
            len(
                entity_domain.list_datas(
                    current_user=root_user,
                    session=session,
                    offset=1,
                    limit=1,
                    group_id=group_id,
                    commit_hash=h0,
                )
            )
            == 1
        )


@pytest.mark.parametrize("use_delta_encoding", [True, False])
def test_bulk_create_datas_empty_is_noop(
    monkeypatch: pytest.MonkeyPatch,
    test_app_config: AppConfig,
    root_user: UserPublic,
    labelset_branch: LabelsetBranchPublic,
    *,
    use_delta_encoding: bool,
):
    """A batch with no items must change nothing.

    Without an early return the empty list is handed to ``execute_statement`` as
    ``params=[]``, and SQLAlchemy does not skip the statement for an empty parameter
    list: it emits a default-row INSERT that omits the NOT NULL versioned key columns
    (``group_id``/``commit_hash``) and aborts with an IntegrityError. Every other
    bulk-create test below passes a non-empty list, which is why this went unnoticed.
    """
    monkeypatch.setenv("STA_USE_DELTA_ENCODING", str(use_delta_encoding))

    with session_ctx(test_app_config) as session:
        group_id = labelset_branch.group_id
        h0 = labelset_branch.head.hash

        entity_domain.bulk_create_datas(
            current_user=root_user,
            session=session,
            data=[MockEntityCreate(group_id=group_id, commit_hash=h0, name="seed")],
        )
        session.commit()

        # An empty batch is a no-op for both domains, and must not raise.
        entity_domain.bulk_create_datas(
            current_user=root_user,
            session=session,
            data=[],
        )
        element_domain.bulk_create_datas(
            current_user=root_user,
            session=session,
            data=[],
        )
        session.commit()

        records = entity_domain.list_datas(
            current_user=root_user,
            session=session,
            group_id=group_id,
            commit_hash=h0,
        )
        assert {record.name for record in records} == {"seed"}
        assert (
            entity_domain.count_datas(
                current_user=root_user,
                session=session,
                group_id=group_id,
                commit_hash=h0,
            )
            == 1
        )


@pytest.mark.parametrize("use_delta_encoding", [True, False])
def test_bulk_update_datas_at_new_commit(
    monkeypatch: pytest.MonkeyPatch,
    test_app_config: AppConfig,
    root_user: UserPublic,
    op_registry: OperationRegistry,
    labelset_branch: LabelsetBranchPublic,
    *,
    use_delta_encoding: bool,
):
    monkeypatch.setenv("STA_USE_DELTA_ENCODING", str(use_delta_encoding))
    _register_no_op(op_registry)

    with session_ctx(test_app_config) as session:
        group_id = labelset_branch.group_id
        h0 = labelset_branch.head.hash

        names = ["bulk-a", "bulk-b", "bulk-c"]
        entity_domain.bulk_create_datas(
            current_user=root_user,
            session=session,
            data=[MockEntityCreate(group_id=group_id, commit_hash=h0, name=name) for name in names],
        )
        session.commit()

        records = entity_domain.list_datas(
            current_user=root_user,
            session=session,
            group_id=group_id,
            commit_hash=h0,
        )
        record_by_name = {record.name: record for record in records}

        # Scenario 8: bulk update at a new commit.
        branch = _push_no_op(
            current_user=root_user,
            session=session,
            op_registry=op_registry,
            branch=labelset_branch,
        )
        h1 = branch.head.hash

        updated_ids = {record_by_name["bulk-a"].id, record_by_name["bulk-b"].id}
        entity_domain.bulk_update_datas(
            current_user=root_user,
            session=session,
            ids=updated_ids,
            group_id=group_id,
            commit_hash=h1,
            data=MockEntityBulkUpdate(name="bulk-updated"),
        )
        session.commit()

        records = entity_domain.list_datas(
            current_user=root_user,
            session=session,
            group_id=group_id,
            commit_hash=h1,
        )
        assert {record.id for record in records} == {
            record.id for record in record_by_name.values()
        }
        assert {record.name for record in records if record.id in updated_ids} == {"bulk-updated"}
        assert [record.name for record in records if record.id == record_by_name["bulk-c"].id] == [
            "bulk-c"
        ]

        # The old commit is unchanged.
        records = entity_domain.list_datas(
            current_user=root_user,
            session=session,
            group_id=group_id,
            commit_hash=h0,
        )
        assert {record.name for record in records} == set(names)


@pytest.mark.parametrize("use_delta_encoding", [True, False])
def test_bulk_delete_datas_at_new_commit(
    monkeypatch: pytest.MonkeyPatch,
    test_app_config: AppConfig,
    root_user: UserPublic,
    op_registry: OperationRegistry,
    labelset_branch: LabelsetBranchPublic,
    *,
    use_delta_encoding: bool,
):
    monkeypatch.setenv("STA_USE_DELTA_ENCODING", str(use_delta_encoding))
    _register_no_op(op_registry)

    with session_ctx(test_app_config) as session:
        group_id = labelset_branch.group_id
        h0 = labelset_branch.head.hash

        names = ["bulk-a", "bulk-b", "bulk-c"]
        entity_domain.bulk_create_datas(
            current_user=root_user,
            session=session,
            data=[MockEntityCreate(group_id=group_id, commit_hash=h0, name=name) for name in names],
        )
        session.commit()

        records = entity_domain.list_datas(
            current_user=root_user,
            session=session,
            group_id=group_id,
            commit_hash=h0,
        )
        record_by_name = {record.name: record for record in records}

        # Scenario 9: bulk delete at a new commit.
        branch = _push_no_op(
            current_user=root_user,
            session=session,
            op_registry=op_registry,
            branch=labelset_branch,
        )
        h1 = branch.head.hash

        deleted_ids = {record_by_name["bulk-a"].id, record_by_name["bulk-c"].id}
        entity_domain.bulk_delete_datas(
            current_user=root_user,
            session=session,
            ids=deleted_ids,
            group_id=group_id,
            commit_hash=h1,
        )
        session.commit()

        assert (
            entity_domain.count_datas(
                current_user=root_user,
                session=session,
                group_id=group_id,
                commit_hash=h1,
            )
            == 1
        )

        records = entity_domain.list_datas(
            current_user=root_user,
            session=session,
            ids={record_by_name["bulk-b"].id},
            group_id=group_id,
            commit_hash=h1,
        )
        assert {record.id for record in records} == {record_by_name["bulk-b"].id}

        with pytest.raises(HTTPException) as exc_info:
            entity_domain.list_datas(
                current_user=root_user,
                session=session,
                ids=deleted_ids,
                group_id=group_id,
                commit_hash=h1,
            )
        assert exc_info.value.status_code == HTTPStatus.NOT_FOUND

        # All records are still alive at the pre-delete commit.
        assert entity_domain.count_datas(
            current_user=root_user,
            session=session,
            group_id=group_id,
            commit_hash=h0,
        ) == len(names)


def test_list_pagination_is_stable_and_excludes_tombstones(
    test_app_config: AppConfig,
    root_user: UserPublic,
    labelset_branch: LabelsetBranchPublic,
):
    with session_ctx(test_app_config) as session:
        group_id = labelset_branch.group_id
        commit_hash = labelset_branch.head.hash
        records = [
            entity_domain.create_data(
                current_user=root_user,
                session=session,
                data=MockEntityCreate(
                    group_id=group_id,
                    commit_hash=commit_hash,
                    name=f"page-{index}",
                ),
            )
            for index in range(6)
        ]
        for record in records[1::2]:
            entity_domain.delete_data(
                current_user=root_user,
                session=session,
                id=record.id,
                group_id=group_id,
                commit_hash=commit_hash,
            )
        session.commit()

        first = entity_domain.list_datas(
            current_user=root_user,
            session=session,
            offset=0,
            limit=2,
            group_id=group_id,
            commit_hash=commit_hash,
        )
        second = entity_domain.list_datas(
            current_user=root_user,
            session=session,
            offset=2,
            limit=2,
            group_id=group_id,
            commit_hash=commit_hash,
        )

        ids = [record.id for record in [*first, *second]]
        expected = sorted(record.id for record in records[::2])
        assert ids == expected
        assert len(ids) == len(set(ids)) == 3


@pytest.mark.parametrize("use_delta_encoding", [True, False])
def test_refresh_states_materializes_commit_state(
    monkeypatch: pytest.MonkeyPatch,
    test_app_config: AppConfig,
    root_user: UserPublic,
    op_registry: OperationRegistry,
    labelset_branch: LabelsetBranchPublic,
    *,
    use_delta_encoding: bool,
):
    monkeypatch.setenv("STA_USE_DELTA_ENCODING", str(use_delta_encoding))
    _register_no_op(op_registry)

    with session_ctx(test_app_config) as session:
        group_id = labelset_branch.group_id
        h0 = labelset_branch.head.hash

        entity = entity_domain.create_data(
            current_user=root_user,
            session=session,
            data=MockEntityCreate(group_id=group_id, commit_hash=h0, name="v1"),
        )
        session.commit()

        branch = _push_no_op(
            current_user=root_user,
            session=session,
            op_registry=op_registry,
            branch=labelset_branch,
        )
        h1 = branch.head.hash

        records = entity_domain.list_datas(
            current_user=root_user,
            session=session,
            group_id=group_id,
            commit_hash=h1,
        )
        if use_delta_encoding:
            # Delta mode resolves the state through the graph distance matrix.
            assert {record.id for record in records} == {entity.id}
        else:
            # Materialized mode only sees states stored at exactly that commit,
            # and a bare no-op commit stores none.
            assert records == []

        # Scenario 10: refresh_states stores the state at the commit.
        entity_domain.refresh_states(
            current_user=root_user,
            session=session,
            group_id=group_id,
            commit_hash=h1,
        )
        session.commit()

        # Refresh is idempotent even after destination-owned rows exist.
        entity_domain.refresh_states(
            current_user=root_user,
            session=session,
            group_id=group_id,
            commit_hash=h1,
        )
        session.commit()

        records = entity_domain.list_datas(
            current_user=root_user,
            session=session,
            group_id=group_id,
            commit_hash=h1,
        )
        assert {record.id for record in records} == {entity.id}
        assert (
            entity_domain.count_datas(
                current_user=root_user,
                session=session,
                group_id=group_id,
                commit_hash=h1,
            )
            == 1
        )

        # A later update must not clobber the refreshed state of the old commit.
        branch = _push_no_op(
            current_user=root_user,
            session=session,
            op_registry=op_registry,
            branch=branch,
        )
        h2 = branch.head.hash

        entity_domain.update_data(
            current_user=root_user,
            session=session,
            id=entity.id,
            group_id=group_id,
            commit_hash=h2,
            data=MockEntityUpdate(name="v2"),
        )
        session.commit()

        record = entity_domain.read_data(
            current_user=root_user,
            session=session,
            id=entity.id,
            group_id=group_id,
            commit_hash=h2,
        )
        assert record.name == "v2"

        record = entity_domain.read_data(
            current_user=root_user,
            session=session,
            id=entity.id,
            group_id=group_id,
            commit_hash=h1,
        )
        assert record.name == "v1"


_EL_IN_MIN_TIMESTAMP = datetime(2026, 1, 2, tzinfo=timezone.utc)
_EL_IN_MAX_TIMESTAMP = datetime(2026, 1, 3, tzinfo=timezone.utc)
_EL_OUT_MIN_TIMESTAMP = datetime(2026, 2, 1, tzinfo=timezone.utc)
_EL_OUT_MAX_TIMESTAMP = datetime(2026, 2, 2, tzinfo=timezone.utc)
_QUERY_MIN_TIMESTAMP = datetime(2026, 1, 1, tzinfo=timezone.utc)
_QUERY_MAX_TIMESTAMP = datetime(2026, 1, 4, tzinfo=timezone.utc)


@pytest.mark.parametrize("use_delta_encoding", [True, False])
def test_entity_window_excludes_visible_parent_with_children(
    monkeypatch: pytest.MonkeyPatch,
    test_app_config: AppConfig,
    root_user: UserPublic,
    op_registry: OperationRegistry,
    labelset_branch: LabelsetBranchPublic,
    *,
    use_delta_encoding: bool,
):
    monkeypatch.setenv("STA_USE_DELTA_ENCODING", str(use_delta_encoding))
    _register_no_op(op_registry)
    with session_ctx(test_app_config) as session:
        group_id = labelset_branch.group_id
        entity = entity_domain.create_data(
            current_user=root_user,
            session=session,
            data=MockEntityCreate(group_id=group_id, commit_hash=labelset_branch.head_hash),
        )
        session.commit()
        before = entity_domain.list_datas_for_element_window(
            current_user=root_user,
            session=session,
            group_id=group_id,
            commit_hash=labelset_branch.head_hash,
            referenced_ids=set(),
        )
        assert {item.id for item in before} == {entity.id}

        branch = _push_no_op(
            current_user=root_user,
            session=session,
            op_registry=op_registry,
            branch=labelset_branch,
        )
        entity_domain.set_has_children(
            current_user=root_user,
            session=session,
            id=entity.id,
            group_id=group_id,
            commit_hash=branch.head_hash,
            value=True,
        )
        session.commit()
        after = entity_domain.list_datas_for_element_window(
            current_user=root_user,
            session=session,
            group_id=group_id,
            commit_hash=branch.head_hash,
            referenced_ids=set(),
        )
        assert after == []


@pytest.mark.parametrize("use_delta_encoding", [True, False])
def test_element_spatial_temporal_entity_filters(
    monkeypatch: pytest.MonkeyPatch,
    test_app_config: AppConfig,
    root_user: UserPublic,
    op_registry: OperationRegistry,
    labelset_branch: LabelsetBranchPublic,
    *,
    use_delta_encoding: bool,
):
    monkeypatch.setenv("STA_USE_DELTA_ENCODING", str(use_delta_encoding))
    _register_no_op(op_registry)

    with session_ctx(test_app_config) as session:
        group_id = labelset_branch.group_id
        h0 = labelset_branch.head.hash

        parent_entity = entity_domain.create_data(
            current_user=root_user,
            session=session,
            data=MockEntityCreate(group_id=group_id, commit_hash=h0, name="parent"),
        )
        session.commit()

        def create_element(**kwargs):
            record = element_domain.create_data(
                current_user=root_user,
                session=session,
                data=MockElementCreate(group_id=group_id, commit_hash=h0, **kwargs),
            )
            session.commit()

            return record

        # Scenario 11: elements inside/outside the query windows, plus one
        # element with no bounds at all (matches every filter).
        el_in = create_element(
            min_x=Decimal("1"),
            max_x=Decimal("2"),
            min_y=Decimal("1"),
            max_y=Decimal("2"),
            min_z=Decimal("0"),
            max_z=Decimal("1"),
            min_timestamp=_EL_IN_MIN_TIMESTAMP,
            max_timestamp=_EL_IN_MAX_TIMESTAMP,
            entity_id=parent_entity.id,
        )
        el_out_space = create_element(
            min_x=Decimal("10"),
            max_x=Decimal("11"),
            min_timestamp=_EL_IN_MIN_TIMESTAMP,
            max_timestamp=_EL_IN_MAX_TIMESTAMP,
        )
        el_out_time = create_element(
            min_x=Decimal("1"),
            max_x=Decimal("2"),
            min_timestamp=_EL_OUT_MIN_TIMESTAMP,
            max_timestamp=_EL_OUT_MAX_TIMESTAMP,
        )
        el_null = create_element()

        all_ids = {el_in.id, el_out_space.id, el_out_time.id, el_null.id}

        records = element_domain.list_datas(
            current_user=root_user,
            session=session,
            group_id=group_id,
            commit_hash=h0,
        )
        assert {record.id for record in records} == all_ids

        def list_ids(**kwargs):
            records = element_domain.list_datas(
                current_user=root_user,
                session=session,
                group_id=group_id,
                commit_hash=h0,
                **kwargs,
            )

            return {record.id for record in records}

        # Spatial window on x: excludes only el_out_space (min_x 10 > 5).
        assert list_ids(min_x=0.0, max_x=5.0) == {el_in.id, el_out_time.id, el_null.id}

        # Same window on the remaining axes.
        assert list_ids(
            min_y=0.0,
            max_y=5.0,
            min_z=-1.0,
            max_z=5.0,
        ) == {el_in.id, el_out_space.id, el_out_time.id, el_null.id}

        # Temporal window: excludes only el_out_time.
        assert list_ids(
            min_timestamp=_QUERY_MIN_TIMESTAMP,
            max_timestamp=_QUERY_MAX_TIMESTAMP,
        ) == {el_in.id, el_out_space.id, el_null.id}

        # Spatial + temporal window: excludes both non-overlapping elements.
        in_window_ids = {el_in.id, el_null.id}
        assert (
            list_ids(
                min_x=0.0,
                max_x=5.0,
                min_timestamp=_QUERY_MIN_TIMESTAMP,
                max_timestamp=_QUERY_MAX_TIMESTAMP,
            )
            == in_window_ids
        )

        # Entity filter.
        assert list_ids(entity_id=parent_entity.id) == {el_in.id}

        # Counting honors the same filters and excludes deleted records.
        assert element_domain.count_datas(
            current_user=root_user,
            session=session,
            group_id=group_id,
            commit_hash=h0,
        ) == len(all_ids)
        assert element_domain.count_datas(
            current_user=root_user,
            session=session,
            group_id=group_id,
            commit_hash=h0,
            min_x=0.0,
            max_x=5.0,
            min_timestamp=_QUERY_MIN_TIMESTAMP,
            max_timestamp=_QUERY_MAX_TIMESTAMP,
        ) == len(in_window_ids)

        # list_datas_in_bounds is the PartialSTBounds-facing equivalent.
        records = element_domain.list_datas_in_bounds(
            current_user=root_user,
            session=session,
            group_id=group_id,
            commit_hash=h0,
            st_bounds=PartialSTBounds(
                min_coords=OptionalDecimalCoord3(x=0, y=0, z=0),
                max_coords=OptionalDecimalCoord3(x=5, y=5, z=5),
                min_timestamp=_QUERY_MIN_TIMESTAMP,
                max_timestamp=_QUERY_MAX_TIMESTAMP,
            ),
        )
        assert {record.id for record in records} == in_window_ids

        records = element_domain.list_datas_in_bounds(
            current_user=root_user,
            session=session,
            group_id=group_id,
            commit_hash=h0,
            st_bounds=None,
        )
        assert {record.id for record in records} == all_ids

        records = element_domain.list_datas_in_bounds(
            current_user=root_user,
            session=session,
            group_id=group_id,
            commit_hash=h0,
            st_bounds=PartialSTBounds(
                min_coords=OptionalDecimalCoord3(x=0, y=None, z=None),
                max_coords=OptionalDecimalCoord3(x=5, y=None, z=None),
                min_timestamp=None,
                max_timestamp=None,
            ),
            entity_id=parent_entity.id,
        )
        assert {record.id for record in records} == {el_in.id}

        # The bounds columns round-trip through the database.
        record = element_domain.read_data(
            current_user=root_user,
            session=session,
            id=el_in.id,
            group_id=group_id,
            commit_hash=h0,
        )
        assert record.min_x == Decimal("1")
        assert record.max_x == Decimal("2")
        assert record.min_timestamp == _EL_IN_MIN_TIMESTAMP
        assert record.max_timestamp == _EL_IN_MAX_TIMESTAMP
        assert record.entity_id == parent_entity.id

        # Candidate narrowing must use ancestor rows only as a superset. An
        # element whose old state matched but whose visible state moved out is
        # excluded, while one whose visible state moved in is retained.
        branch = _push_no_op(
            current_user=root_user,
            session=session,
            op_registry=op_registry,
            branch=labelset_branch,
        )
        element_domain.update_data(
            current_user=root_user,
            session=session,
            id=el_in.id,
            group_id=group_id,
            commit_hash=branch.head_hash,
            data=MockElementUpdate(min_x=Decimal("10"), max_x=Decimal("11")),
        )
        element_domain.update_data(
            current_user=root_user,
            session=session,
            id=el_out_space.id,
            group_id=group_id,
            commit_hash=branch.head_hash,
            data=MockElementUpdate(min_x=Decimal("1"), max_x=Decimal("2")),
        )
        session.commit()

        records = element_domain.list_datas_in_any_bounds(
            current_user=root_user,
            session=session,
            group_id=group_id,
            commit_hash=branch.head_hash,
            st_bounds=[
                PartialSTBounds(
                    min_coords=OptionalDecimalCoord3(x=0, y=0, z=0),
                    max_coords=OptionalDecimalCoord3(x=5, y=5, z=5),
                    min_timestamp=_QUERY_MIN_TIMESTAMP,
                    max_timestamp=_QUERY_MAX_TIMESTAMP,
                )
            ],
        )
        assert {record.id for record in records} == {el_out_space.id, el_null.id}


def test_element_entity_validation(
    test_app_config: AppConfig,
    root_user: UserPublic,
    op_registry: OperationRegistry,
    labelset_branch: LabelsetBranchPublic,
):
    _register_no_op(op_registry)

    with session_ctx(test_app_config) as session:
        group_id = labelset_branch.group_id
        h0 = labelset_branch.head.hash

        # Scenario 12: creating an element with a nonexistent entity fails.
        with pytest.raises(HTTPException) as exc_info:
            element_domain.create_data(
                current_user=root_user,
                session=session,
                data=MockElementCreate(
                    group_id=group_id,
                    commit_hash=h0,
                    entity_id=uuid.uuid4(),
                ),
            )
        assert exc_info.value.status_code == HTTPStatus.NOT_FOUND

        # A bulk create containing a dangling entity_id fails as a whole,
        # before anything is inserted.
        with pytest.raises(HTTPException) as exc_info:
            element_domain.bulk_create_datas(
                current_user=root_user,
                session=session,
                data=[
                    MockElementCreate(group_id=group_id, commit_hash=h0),
                    MockElementCreate(
                        group_id=group_id,
                        commit_hash=h0,
                        entity_id=uuid.uuid4(),
                    ),
                ],
            )
        assert exc_info.value.status_code == HTTPStatus.NOT_FOUND

        assert (
            element_domain.list_datas(
                current_user=root_user,
                session=session,
                group_id=group_id,
                commit_hash=h0,
            )
            == []
        )

        parent_entity = entity_domain.create_data(
            current_user=root_user,
            session=session,
            data=MockEntityCreate(group_id=group_id, commit_hash=h0, name="parent"),
        )
        element = element_domain.create_data(
            current_user=root_user,
            session=session,
            data=MockElementCreate(
                group_id=group_id,
                commit_hash=h0,
                entity_id=parent_entity.id,
            ),
        )
        session.commit()
        assert element.entity_id == parent_entity.id

        # A bulk create whose entity ids all resolve succeeds.
        element_domain.bulk_create_datas(
            current_user=root_user,
            session=session,
            data=[
                MockElementCreate(
                    group_id=group_id,
                    commit_hash=h0,
                    entity_id=parent_entity.id,
                ),
                MockElementCreate(group_id=group_id, commit_hash=h0),
            ],
        )
        session.commit()

        records = element_domain.list_datas(
            current_user=root_user,
            session=session,
            group_id=group_id,
            commit_hash=h0,
        )
        assert len(records) == 3

        # Reassigning the element to a nonexistent entity fails.
        with pytest.raises(HTTPException) as exc_info:
            element_domain.update_data(
                current_user=root_user,
                session=session,
                id=element.id,
                group_id=group_id,
                commit_hash=h0,
                data=MockElementUpdate(entity_id=uuid.uuid4()),
            )
        assert exc_info.value.status_code == HTTPStatus.NOT_FOUND
        # Validation precedes mutation, so failed update leaves usable session
        # and unchanged row without caller rollback.
        unchanged = element_domain.read_data(
            current_user=root_user,
            session=session,
            id=element.id,
            group_id=group_id,
            commit_hash=h0,
        )
        assert unchanged.entity_id == parent_entity.id

        # Bulk reassignment to a nonexistent entity is rejected before any
        # selected element is changed.
        with pytest.raises(HTTPException) as exc_info:
            element_domain.bulk_update_datas(
                current_user=root_user,
                session=session,
                ids={element.id},
                group_id=group_id,
                commit_hash=h0,
                data=MockElementBulkUpdate(entity_id=uuid.uuid4()),
            )
        assert exc_info.value.status_code == HTTPStatus.NOT_FOUND
        unchanged = element_domain.read_data(
            current_user=root_user,
            session=session,
            id=element.id,
            group_id=group_id,
            commit_hash=h0,
        )
        assert unchanged.entity_id == parent_entity.id

        # A bulk update leaving records pointing at a deleted entity fails.
        branch = _push_no_op(
            current_user=root_user,
            session=session,
            op_registry=op_registry,
            branch=labelset_branch,
        )
        h1 = branch.head.hash

        entity_domain.delete_data(
            current_user=root_user,
            session=session,
            id=parent_entity.id,
            group_id=group_id,
            commit_hash=h1,
        )
        session.commit()

        with pytest.raises(HTTPException) as exc_info:
            element_domain.bulk_update_datas(
                current_user=root_user,
                session=session,
                ids={element.id},
                group_id=group_id,
                commit_hash=h1,
                data=MockElementBulkUpdate(min_x=Decimal("0.5")),
            )
        assert exc_info.value.status_code == HTTPStatus.NOT_FOUND
        # Bulk prospective validation also happens before copy-on-write/update.
        unchanged = element_domain.read_data(
            current_user=root_user,
            session=session,
            id=element.id,
            group_id=group_id,
            commit_hash=h1,
        )
        assert unchanged.min_x is None


def test_element_domain_without_entity_domain(
    test_app_config: AppConfig,
    root_user: UserPublic,
    labelset_branch: LabelsetBranchPublic,
):
    with session_ctx(test_app_config) as session:
        group_id = labelset_branch.group_id
        h0 = labelset_branch.head.hash

        # An element domain without an entity domain (as e.g. the bbox
        # plugin constructs) skips parent-entity validation entirely.
        element = orphan_element_domain.create_data(
            current_user=root_user,
            session=session,
            data=MockOrphanElementCreate(
                group_id=group_id,
                commit_hash=h0,
                entity_id=uuid.uuid4(),
            ),
        )
        session.commit()
        assert element.entity_id is not None

        updated = orphan_element_domain.update_data(
            current_user=root_user,
            session=session,
            id=element.id,
            group_id=group_id,
            commit_hash=h0,
            data=MockOrphanElementUpdate(min_x=Decimal("1")),
        )
        session.commit()
        assert updated.min_x == Decimal("1")

        orphan_element_domain.bulk_update_datas(
            current_user=root_user,
            session=session,
            ids={element.id},
            group_id=group_id,
            commit_hash=h0,
            data=MockOrphanElementBulkUpdate(),
        )
        session.commit()

        # An empty payload with unknown ids revalidates an empty record set.
        element_domain.bulk_update_datas(
            current_user=root_user,
            session=session,
            ids={uuid.uuid4()},
            group_id=group_id,
            commit_hash=h0,
            data=MockElementBulkUpdate(),
        )
        session.commit()


def test_annotator_without_frames_denied(
    test_app_config: AppConfig,
    root_user: UserPublic,
    labelset_branch: LabelsetBranchPublic,
):
    with session_ctx(test_app_config) as session:
        group_id = labelset_branch.group_id
        h0 = labelset_branch.head.hash

        annotator_user = _create_test_user(
            session,
            root_user,
            username="annotator_no_frames",
            roles={Role.ANNOTATOR},
        )

        entity = entity_domain.create_data(
            current_user=root_user,
            session=session,
            data=MockEntityCreate(group_id=group_id, commit_hash=h0, name="entity"),
        )
        session.commit()

        # Scenario 13: no frames means no readable label groups.
        records = entity_domain.list_datas(
            current_user=annotator_user,
            session=session,
            group_id=group_id,
            commit_hash=h0,
        )
        assert records == []
        assert (
            entity_domain.count_datas(
                current_user=annotator_user,
                session=session,
                group_id=group_id,
                commit_hash=h0,
            )
            == 0
        )

        with pytest.raises(HTTPException) as exc_info:
            entity_domain.read_data(
                current_user=annotator_user,
                session=session,
                id=entity.id,
                group_id=group_id,
                commit_hash=h0,
            )
        assert exc_info.value.status_code == HTTPStatus.NOT_FOUND

        with pytest.raises(HTTPException) as exc_info:
            entity_domain.create_data(
                current_user=annotator_user,
                session=session,
                data=MockEntityCreate(group_id=group_id, commit_hash=h0, name="denied"),
            )
        assert exc_info.value.status_code == HTTPStatus.FORBIDDEN

        with pytest.raises(HTTPException) as exc_info:
            entity_domain.update_data(
                current_user=annotator_user,
                session=session,
                id=entity.id,
                group_id=group_id,
                commit_hash=h0,
                data=MockEntityUpdate(name="denied"),
            )
        assert exc_info.value.status_code == HTTPStatus.FORBIDDEN


def test_data_manager_full_access_without_frames(
    test_app_config: AppConfig,
    root_user: UserPublic,
    labelset_branch: LabelsetBranchPublic,
):
    with session_ctx(test_app_config) as session:
        group_id = labelset_branch.group_id
        h0 = labelset_branch.head.hash

        data_manager_user = _create_test_user(
            session,
            root_user,
            username="data_manager_user",
            roles={Role.DATA_MANAGER},
        )

        entity = entity_domain.create_data(
            current_user=root_user,
            session=session,
            data=MockEntityCreate(group_id=group_id, commit_hash=h0, name="entity"),
        )
        session.commit()

        # Scenario 13: DATA_MANAGER bypasses group filters without any frames.
        records = entity_domain.list_datas(
            current_user=data_manager_user,
            session=session,
            group_id=group_id,
            commit_hash=h0,
        )
        assert {record.id for record in records} == {entity.id}

        record = entity_domain.read_data(
            current_user=data_manager_user,
            session=session,
            id=entity.id,
            group_id=group_id,
            commit_hash=h0,
        )
        assert record.id == entity.id

        # Label writes no longer require a global role.
        created = entity_domain.create_data(
            current_user=data_manager_user,
            session=session,
            data=MockEntityCreate(group_id=group_id, commit_hash=h0, name="by-manager"),
        )
        session.commit()
        assert created.name == "by-manager"


def test_annotator_with_frame_can_write_readable_group_only(
    test_app_config: AppConfig,
    root_user: UserPublic,
    op_registry: OperationRegistry,
    labelset_branch: LabelsetBranchPublic,
    source_group,
):
    _register_no_op(op_registry)

    with session_ctx(test_app_config) as session:
        group_id = labelset_branch.group_id
        h0 = labelset_branch.head.hash

        annotator_user = _create_test_user(
            session,
            root_user,
            username="frame_annotator",
            roles={Role.ANNOTATOR},
        )

        # Wire a frame for the annotator to the shared labelset branch:
        # the annotator must be assigned to the task of an ANNOTATE frame.
        project = create_project(
            current_user=root_user,
            session=session,
            data=ProjectCreate(
                name="annotator-project",
                member_ids=[root_user.id, annotator_user.id],
            ),
        )
        task = create_task(
            current_user=root_user,
            session=session,
            data=TaskCreate(
                name="annotator-task",
                project_id=project.id,
                annotator_ids=[annotator_user.id],
            ),
        )
        session.add(
            BranchPermission(
                branch_id=labelset_branch.id,
                user_id=annotator_user.id,
                permission_lv=BranchPermissionLevel.WRITE,
            )
        )
        session.flush()
        create_frame(
            current_user=root_user,
            session=session,
            data=FrameCreate(
                task_id=task.id,
                account_id=annotator_user.id,
                source_group_id=source_group.id,
                label_branch_id=labelset_branch.id,
                work_type=WorkType.ANNOTATE,
            ),
        )
        session.commit()

        entity = entity_domain.create_data(
            current_user=root_user,
            session=session,
            data=MockEntityCreate(group_id=group_id, commit_hash=h0, name="readable"),
        )
        session.commit()

        # The annotator can read records of the framed group...
        records = entity_domain.list_datas(
            current_user=annotator_user,
            session=session,
            group_id=group_id,
            commit_hash=h0,
        )
        assert {record.id for record in records} == {entity.id}

        # Direct mutations use the same branch WRITE permission as graph pushes.
        updated = entity_domain.update_data(
            current_user=annotator_user,
            session=session,
            id=entity.id,
            group_id=group_id,
            commit_hash=h0,
            data=MockEntityUpdate(name="by-annotator"),
        )
        session.commit()
        assert updated.name == "by-annotator"

        entity_domain.delete_data(
            current_user=annotator_user,
            session=session,
            id=entity.id,
            group_id=group_id,
            commit_hash=h0,
        )
        session.commit()
        assert (
            entity_domain.count_datas(
                current_user=root_user,
                session=session,
                group_id=group_id,
                commit_hash=h0,
            )
            == 0
        )

        # Creation uses the same branch permission and needs no global role.
        created_by_annotator = entity_domain.create_data(
            current_user=annotator_user,
            session=session,
            data=MockEntityCreate(group_id=group_id, commit_hash=h0, name="by-annotator"),
        )
        session.commit()
        assert created_by_annotator.name == "by-annotator"

        # But not records of a group they cannot read.
        other_group = create_label_group(
            current_user=root_user,
            session=session,
            data=LabelGroupCreate(name="other-group"),
        )
        other_branch = LabelsetBranchPublic.model_validate(
            init_branch(
                current_user=root_user,
                session=session,
                op_registry=op_registry,
                data=LabelsetBranchInit(
                    group_id=other_group.id,
                    name="other",
                ),
            ),
        )
        other_entity = entity_domain.create_data(
            current_user=root_user,
            session=session,
            data=MockEntityCreate(
                group_id=other_group.id,
                commit_hash=other_branch.head.hash,
                name="other",
            ),
        )
        session.commit()

        with pytest.raises(HTTPException) as exc_info:
            entity_domain.update_data(
                current_user=annotator_user,
                session=session,
                id=other_entity.id,
                group_id=other_group.id,
                commit_hash=other_branch.head.hash,
                data=MockEntityUpdate(name="denied"),
            )
        assert exc_info.value.status_code == HTTPStatus.FORBIDDEN

        with pytest.raises(HTTPException) as exc_info:
            entity_domain.create_data(
                current_user=annotator_user,
                session=session,
                data=MockEntityCreate(
                    group_id=other_group.id,
                    commit_hash=other_branch.head.hash,
                    name="denied",
                ),
            )
        assert exc_info.value.status_code == HTTPStatus.FORBIDDEN
