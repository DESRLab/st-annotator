"""Tests for the commit-protocol edge paths of the labelset repo graph.

Covers the special-operation authorization guard of ``push_commits``, the
``checkpoint`` and ``import_data`` wrappers, attaching a branch to an
existing commit via ``init_branch``, and the placeholder round trip.
"""

import uuid
from enum import Enum
from http import HTTPStatus

from fastapi import HTTPException
from pydantic import BaseModel
from sqlalchemy.sql.sqltypes import String
from sqlmodel import Field, Session

import pytest

from sta.common.utils.json import JSONType
from sta.config import AppConfig
from sta.domain.label.data import LabelEntityDomain
from sta.domain.label.repo.branches import read_branch
from sta.domain.label.repo.commits import count_commits, read_commit
from sta.domain.label.repo.graph import (
    LabelsetBranchInit,
    checkpoint,
    import_data,
    init_branch,
    push_commits,
    read_graph,
)
from sta.domain.label.repo.ops import Operation, OperationRegistry
from sta.domain.label.repo.ops.special import SpecialOperationType
from sta.models.label.data import LabelEntitySQLModel
from sta.models.label.repo import (
    LabelsetBranchPublic,
    LabelsetCommit,
    LabelsetCommitInstruction,
    LabelsetOperationMetadata,
)
from sta.models.user import UserPublic
from sta.session import session_ctx

pytestmark = pytest.mark.in_memory_db


class CommitProtocolEntitySQLModel(LabelEntitySQLModel):
    """A minimal entity model with a single custom column."""

    name: str = Field(sa_type=String(63), nullable=False, default="")


CommitProtocolEntity = CommitProtocolEntitySQLModel.get_table_cls("test_commit_protocol_entity")
CommitProtocolEntityCreate = CommitProtocolEntitySQLModel.get_create_cls()
CommitProtocolEntityPublic = CommitProtocolEntitySQLModel.get_public_cls()
CommitProtocolEntityUpdate = CommitProtocolEntitySQLModel.get_update_cls()

commit_protocol_entity_domain = LabelEntityDomain(
    table_cls=CommitProtocolEntity,
    create_cls=CommitProtocolEntityCreate,
    public_cls=CommitProtocolEntityPublic,
    update_cls=CommitProtocolEntityUpdate,
    bulk_update_cls=CommitProtocolEntityUpdate,
)


class CommitProtocolOpType(str, Enum):
    NO_OP = "commit-protocol-no-op"
    GEN_ID = "commit-protocol-gen-id"
    CONSUME_ID = "commit-protocol-consume-id"


class NoOpParams(BaseModel):
    pass


class NoOpOperation(Operation[NoOpParams]):
    def apply(
        self,
        current_user: UserPublic,
        session: Session,
        commit: LabelsetCommit,
    ) -> JSONType:
        pass


class GenIdParams(BaseModel):
    pass


class GenIdOperation(Operation[GenIdParams]):
    def apply(
        self,
        current_user: UserPublic,
        session: Session,
        commit: LabelsetCommit,
    ) -> uuid.UUID:
        return uuid.uuid4()


class ConsumeIdParams(BaseModel):
    id: uuid.UUID | str


class ConsumeIdOperation(Operation[ConsumeIdParams]):
    def apply(
        self,
        current_user: UserPublic,
        session: Session,
        commit: LabelsetCommit,
    ) -> JSONType:
        return str(self.params.id)


def _register_commit_protocol_ops(op_registry: OperationRegistry):
    op_registry.register(CommitProtocolOpType.NO_OP, NoOpOperation, NoOpParams)
    op_registry.register(CommitProtocolOpType.GEN_ID, GenIdOperation, GenIdParams)
    op_registry.register(CommitProtocolOpType.CONSUME_ID, ConsumeIdOperation, ConsumeIdParams)


def _import_entities(
    current_user: UserPublic,
    session: Session,
    commit: LabelsetCommit,
) -> uuid.UUID:
    record = commit_protocol_entity_domain.create_data(
        current_user=current_user,
        session=session,
        data=CommitProtocolEntityCreate(
            group_id=commit.group_id,
            commit_hash=commit.hash,
            name="imported-entity",
        ),
    )

    return record.id


def _read_branch_public(
    *,
    current_user: UserPublic,
    session: Session,
    branch_id: int,
) -> LabelsetBranchPublic:
    return LabelsetBranchPublic.model_validate(
        read_branch(
            current_user=current_user,
            session=session,
            id=branch_id,
        ),
    )


def test_push_commits_rejects_special_ops(
    test_app_config: AppConfig,
    root_user: UserPublic,
    op_registry: OperationRegistry,
    labelset_branch: LabelsetBranchPublic,
):
    with session_ctx(test_app_config) as session:
        h0 = labelset_branch.head.hash

        with pytest.raises(HTTPException) as exc_info:
            push_commits(
                current_user=root_user,
                session=session,
                op_registry=op_registry,
                branch_id=labelset_branch.id,
                commit_instrs=[
                    LabelsetCommitInstruction(
                        op_name=SpecialOperationType.CHECKPOINT,
                        op_params={},
                    ),
                ],
            )
        assert exc_info.value.status_code == HTTPStatus.UNAUTHORIZED
        assert "not allowed to apply special labelset operations" in str(exc_info.value.detail)
        session.rollback()

        branch = _read_branch_public(
            current_user=root_user,
            session=session,
            branch_id=labelset_branch.id,
        )
        assert branch.head_hash == h0


def test_push_rejects_stale_head_before_creating_commit(
    test_app_config: AppConfig,
    root_user: UserPublic,
    op_registry: OperationRegistry,
    labelset_branch: LabelsetBranchPublic,
):
    _register_commit_protocol_ops(op_registry)

    with session_ctx(test_app_config) as session:
        with pytest.raises(HTTPException) as exc_info:
            push_commits(
                current_user=root_user,
                session=session,
                op_registry=op_registry,
                branch_id=labelset_branch.id,
                last_fetched_head_hash="0" * 40,
                commit_instrs=[
                    LabelsetCommitInstruction(
                        op_name=CommitProtocolOpType.NO_OP,
                        op_params=NoOpParams(),
                    ),
                ],
            )
        assert exc_info.value.status_code == HTTPStatus.CONFLICT
        assert (
            count_commits(
                current_user=root_user,
                session=session,
                group_id=labelset_branch.group_id,
            )
            == 1
        )


def test_checkpoint_materializes_states(
    monkeypatch: pytest.MonkeyPatch,
    test_app_config: AppConfig,
    root_user: UserPublic,
    op_registry: OperationRegistry,
    labelset_branch: LabelsetBranchPublic,
):
    # With delta encoding off, records are only listable at commits where a
    # materialized state exists. This makes the copy performed by the
    # checkpoint operation observable.
    monkeypatch.setenv("STA_USE_DELTA_ENCODING", "0")

    with session_ctx(test_app_config) as session:
        group_id = labelset_branch.group_id
        h0 = labelset_branch.head.hash

        entity = commit_protocol_entity_domain.create_data(
            current_user=root_user,
            session=session,
            data=CommitProtocolEntityCreate(
                group_id=group_id,
                commit_hash=h0,
                name="checkpointed",
            ),
        )
        session.commit()

        op_results = checkpoint(
            current_user=root_user,
            session=session,
            op_registry=op_registry,
            branch_id=labelset_branch.id,
        )
        session.commit()
        assert op_results == [None]

        branch = _read_branch_public(
            current_user=root_user,
            session=session,
            branch_id=labelset_branch.id,
        )
        h1 = branch.head.hash
        assert h1 != h0
        assert branch.checkpoint_hash == h1

        graph = read_graph(
            current_user=root_user,
            session=session,
            branch_id=labelset_branch.id,
        )
        node_hashes = {node.hash for node in graph.nodes}
        assert {h0, h1} <= node_hashes

        # Nothing was written at the checkpoint commit itself; the record is
        # only listable there because the checkpoint operation refreshed the
        # materialized states of every registered label data domain.
        records = commit_protocol_entity_domain.list_datas(
            current_user=root_user,
            session=session,
            group_id=group_id,
            commit_hash=h1,
        )
        assert {record.id for record in records} == {entity.id}


def test_import_data_applies_import_func(
    test_app_config: AppConfig,
    root_user: UserPublic,
    op_registry: OperationRegistry,
    labelset_branch: LabelsetBranchPublic,
):
    metadata = {"source": "commit-protocol-test"}

    with session_ctx(test_app_config) as session:
        group_id = labelset_branch.group_id
        h0 = labelset_branch.head.hash

        op_results = import_data(
            current_user=root_user,
            session=session,
            op_registry=op_registry,
            branch_id=labelset_branch.id,
            import_func=_import_entities,
            metadata=metadata,
        )
        session.commit()

        branch = _read_branch_public(
            current_user=root_user,
            session=session,
            branch_id=labelset_branch.id,
        )
        h1 = branch.head.hash
        assert h1 != h0

        # The import function ran and wrote into the new head commit.
        assert len(op_results) == 1
        records = commit_protocol_entity_domain.list_datas(
            current_user=root_user,
            session=session,
            group_id=group_id,
            commit_hash=h1,
        )
        assert {record.id for record in records} == {op_results[0]}

        # The commit records the import operation, serializing the wrapped
        # function via its field serializer.
        session.expire_all()
        commit = read_commit(
            current_user=root_user,
            session=session,
            group_id=group_id,
            commit_hash=h1,
        )
        assert len(commit.operations) == 1
        raw_op = commit.operations[0]
        op_metadata = (
            raw_op
            if isinstance(raw_op, LabelsetOperationMetadata)
            else LabelsetOperationMetadata.model_validate(raw_op)
        )
        assert op_metadata.op_name == SpecialOperationType.IMPORT
        assert op_metadata.op_params["metadata"] == metadata
        assert "def _import_entities" in op_metadata.op_params["func"]


def test_init_branch_on_existing_commit(
    test_app_config: AppConfig,
    root_user: UserPublic,
    op_registry: OperationRegistry,
    labelset_branch: LabelsetBranchPublic,
):
    with session_ctx(test_app_config) as session:
        group_id = labelset_branch.group_id
        h0 = labelset_branch.head.hash

        commit_count = count_commits(
            current_user=root_user,
            session=session,
            group_id=group_id,
        )

        attached = init_branch(
            current_user=root_user,
            session=session,
            op_registry=op_registry,
            data=LabelsetBranchInit(
                group_id=group_id,
                commit_hash=h0,
                name="attached",
            ),
        )
        session.commit()

        assert attached.id != labelset_branch.id
        assert attached.group_id == group_id
        assert attached.head_hash == h0
        assert attached.checkpoint_hash == h0

        # Attaching to an existing commit does not create a new commit...
        assert (
            count_commits(
                current_user=root_user,
                session=session,
                group_id=group_id,
            )
            == commit_count
        )

        # ...and the new branch sees exactly the shared history.
        graph = read_graph(
            current_user=root_user,
            session=session,
            branch_id=attached.id,
        )
        assert {node.hash for node in graph.nodes} == {h0}


@pytest.mark.parametrize(
    "consume_params",
    [
        {"id": "new_id"},
        ConsumeIdParams(id="new_id"),
    ],
    ids=["mapping", "pydantic-model"],
)
def test_placeholder_round_trip(
    test_app_config: AppConfig,
    root_user: UserPublic,
    op_registry: OperationRegistry,
    labelset_branch: LabelsetBranchPublic,
    consume_params: JSONType | BaseModel,
):
    _register_commit_protocol_ops(op_registry)

    with session_ctx(test_app_config) as session:
        op_results = push_commits(
            current_user=root_user,
            session=session,
            op_registry=op_registry,
            branch_id=labelset_branch.id,
            commit_instrs=[
                LabelsetCommitInstruction(
                    op_name=CommitProtocolOpType.GEN_ID,
                    op_params=GenIdParams(),
                    result_placeholder_key="new_id",
                ),
                LabelsetCommitInstruction(
                    op_name=CommitProtocolOpType.CONSUME_ID,
                    op_params=consume_params,
                ),
            ],
            placeholder_keys=["new_id"],
        )
        session.commit()

        assert len(op_results) == 2
        assert isinstance(op_results[0], uuid.UUID)
        assert op_results[1] == str(op_results[0])


def test_unresolved_placeholder_keys_rejected(
    test_app_config: AppConfig,
    root_user: UserPublic,
    op_registry: OperationRegistry,
    labelset_branch: LabelsetBranchPublic,
):
    _register_commit_protocol_ops(op_registry)

    with session_ctx(test_app_config) as session:
        h0 = labelset_branch.head.hash

        with pytest.raises(HTTPException) as exc_info:
            push_commits(
                current_user=root_user,
                session=session,
                op_registry=op_registry,
                branch_id=labelset_branch.id,
                commit_instrs=[
                    LabelsetCommitInstruction(
                        op_name=CommitProtocolOpType.NO_OP,
                        op_params=NoOpParams(),
                    ),
                ],
                placeholder_keys=["unresolved-key"],
            )
        assert exc_info.value.status_code == HTTPStatus.BAD_REQUEST
        assert "never resolved" in str(exc_info.value.detail)
        session.rollback()

        branch = _read_branch_public(
            current_user=root_user,
            session=session,
            branch_id=labelset_branch.id,
        )
        assert branch.head_hash == h0


def test_premature_placeholder_reference_raises(
    test_app_config: AppConfig,
    root_user: UserPublic,
    op_registry: OperationRegistry,
    labelset_branch: LabelsetBranchPublic,
):
    _register_commit_protocol_ops(op_registry)

    with session_ctx(test_app_config) as session:
        h0 = labelset_branch.head.hash

        # The first instruction references "new_id" before the second
        # instruction has resolved it.
        with pytest.raises(HTTPException) as exc_info:
            push_commits(
                current_user=root_user,
                session=session,
                op_registry=op_registry,
                branch_id=labelset_branch.id,
                commit_instrs=[
                    LabelsetCommitInstruction(
                        op_name=CommitProtocolOpType.CONSUME_ID,
                        op_params={"id": "new_id"},
                    ),
                    LabelsetCommitInstruction(
                        op_name=CommitProtocolOpType.GEN_ID,
                        op_params=GenIdParams(),
                        result_placeholder_key="new_id",
                    ),
                ],
                placeholder_keys=["new_id"],
            )
        assert exc_info.value.status_code == HTTPStatus.BAD_REQUEST
        assert "before resolution" in str(exc_info.value.detail)
        session.rollback()

        branch = _read_branch_public(
            current_user=root_user,
            session=session,
            branch_id=labelset_branch.id,
        )
        assert branch.head_hash == h0


def test_double_placeholder_resolution_raises(
    test_app_config: AppConfig,
    root_user: UserPublic,
    op_registry: OperationRegistry,
    labelset_branch: LabelsetBranchPublic,
):
    _register_commit_protocol_ops(op_registry)

    with session_ctx(test_app_config) as session:
        h0 = labelset_branch.head.hash

        with pytest.raises(HTTPException) as exc_info:
            push_commits(
                current_user=root_user,
                session=session,
                op_registry=op_registry,
                branch_id=labelset_branch.id,
                commit_instrs=[
                    LabelsetCommitInstruction(
                        op_name=CommitProtocolOpType.NO_OP,
                        op_params=NoOpParams(),
                        result_placeholder_key="dup-key",
                    ),
                    LabelsetCommitInstruction(
                        op_name=CommitProtocolOpType.NO_OP,
                        op_params=NoOpParams(),
                        result_placeholder_key="dup-key",
                    ),
                ],
                placeholder_keys=["dup-key"],
            )
        assert exc_info.value.status_code == HTTPStatus.BAD_REQUEST
        assert "more than once" in str(exc_info.value.detail)
        session.rollback()

        branch = _read_branch_public(
            current_user=root_user,
            session=session,
            branch_id=labelset_branch.id,
        )
        assert branch.head_hash == h0
