import uuid
from enum import Enum
from http import HTTPStatus

from fastapi import HTTPException
from pydantic import BaseModel
from sqlalchemy.exc import IntegrityError
from sqlalchemy.sql.sqltypes import String
from sqlmodel import Field, Session

import pytest

from sta.common.utils.json import JSONType
from sta.config import AppConfig
from sta.domain.label.data import LabelEntityDomain
from sta.domain.label.repo.branches import read_branch
from sta.domain.label.repo.graph import _compute_hash, push_commits, read_graph
from sta.domain.label.repo.ops import CreateBase, Operation, OperationRegistry
from sta.domain.users import create_user
from sta.models.label.data import LabelEntitySQLModel
from sta.models.label.group import LabelGroup
from sta.models.label.repo import (
    BranchPermission,
    BranchPermissionLevel,
    LabelsetBranchPublic,
    LabelsetCommit,
    LabelsetCommitInstruction,
    LabelsetEdge,
    LabelsetOperationMetadata,
)
from sta.models.user import Role, UserCreate, UserPublic
from sta.session import session_ctx

pytestmark = pytest.mark.in_memory_db


class RepoTestOperation(str, Enum):
    NO_OP = "repo-test-no-op"
    PRODUCE = "repo-test-produce"
    CONSUME = "repo-test-consume"
    CREATE = "repo-test-create"


class NoOpParams(BaseModel):
    pass


class ConsumeParams(BaseModel):
    value: uuid.UUID


class NoOp(Operation[NoOpParams]):
    def apply(self, current_user: UserPublic, session: Session, commit: LabelsetCommit):
        return None


class Produce(NoOp):
    value = uuid.UUID("12345678-1234-5678-1234-567812345678")

    def apply(self, current_user: UserPublic, session: Session, commit: LabelsetCommit):
        return self.value


class Consume(Operation[ConsumeParams]):
    def apply(self, current_user: UserPublic, session: Session, commit: LabelsetCommit):
        return None


class RepoTestEntitySQLModel(LabelEntitySQLModel):
    """A minimal entity model standing in for a plugin's label entity."""

    name: str = Field(sa_type=String(63), nullable=False, default="")


RepoTestEntity = RepoTestEntitySQLModel.get_table_cls("test_label_repo_invariants_entity")
RepoTestEntityCreate = RepoTestEntitySQLModel.get_create_cls()
RepoTestEntityPublic = RepoTestEntitySQLModel.get_public_cls()
RepoTestEntityUpdate = RepoTestEntitySQLModel.get_update_cls()

repo_test_entity_domain = LabelEntityDomain(
    table_cls=RepoTestEntity,
    create_cls=RepoTestEntityCreate,
    public_cls=RepoTestEntityPublic,
    update_cls=RepoTestEntityUpdate,
    bulk_update_cls=RepoTestEntityUpdate,
)


class CreateEntityParams(BaseModel):
    name: str = "created"


class CreateEntity(CreateBase[CreateEntityParams, RepoTestEntityCreate]):
    """
    A create operation that writes a label record, mirroring a plugin's
    ``TrackOperationType.CREATE``.

    :class:`NoOp` cannot expose the create-path authorization defect: it never
    reaches :meth:`LabelDataDomain.create_data`, which is where the global
    ``DATA_MANAGER`` requirement used to override branch write permission.
    """

    @classmethod
    def get_domain(cls):
        return repo_test_entity_domain

    @classmethod
    def get_data(cls, commit, params: CreateEntityParams):
        return RepoTestEntityCreate(
            group_id=commit.group_id,
            commit_hash=commit.hash,
            name=params.name,
        )


def _register_ops(registry: OperationRegistry) -> None:
    registry.register(RepoTestOperation.NO_OP, NoOp, NoOpParams)
    registry.register(RepoTestOperation.PRODUCE, Produce, NoOpParams)
    registry.register(RepoTestOperation.CONSUME, Consume, ConsumeParams)
    registry.register(RepoTestOperation.CREATE, CreateEntity, CreateEntityParams)


def _create_user(
    session: Session,
    root_user: UserPublic,
    username: str,
    roles: set[Role],
) -> UserPublic:
    return UserPublic.model_validate(
        create_user(
            current_user=root_user,
            session=session,
            data=UserCreate(username=username, password="password", roles=roles),
        )
    )


def _push_no_op(
    session: Session,
    user: UserPublic,
    registry: OperationRegistry,
    branch_id: int,
) -> None:
    push_commits(
        current_user=user,
        session=session,
        op_registry=registry,
        branch_id=branch_id,
        commit_instrs=[
            LabelsetCommitInstruction(
                op_name=RepoTestOperation.NO_OP,
                op_params=NoOpParams(),
            )
        ],
    )


def _push_create(
    session: Session,
    user: UserPublic,
    registry: OperationRegistry,
    branch_id: int,
) -> list[JSONType | uuid.UUID]:
    """Pushes a single commit that creates a label record on ``branch_id``."""
    return push_commits(
        current_user=user,
        session=session,
        op_registry=registry,
        branch_id=branch_id,
        commit_instrs=[
            LabelsetCommitInstruction(
                op_name=RepoTestOperation.CREATE,
                op_params=CreateEntityParams(),
            )
        ],
    )


def test_push_requires_write_but_allows_annotator_and_reviewer(
    test_app_config: AppConfig,
    root_user: UserPublic,
    op_registry: OperationRegistry,
    labelset_branch: LabelsetBranchPublic,
):
    _register_ops(op_registry)
    with session_ctx(test_app_config) as session:
        reader = _create_user(session, root_user, "repo-reader", {Role.PROJECT_MANAGER})
        annotator = _create_user(
            session,
            root_user,
            "repo-annotator",
            {Role.PROJECT_MANAGER, Role.ANNOTATOR},
        )
        reviewer = _create_user(
            session,
            root_user,
            "repo-reviewer",
            {Role.PROJECT_MANAGER, Role.SUPERVISOR},
        )
        for user, permission in (
            (reader, BranchPermissionLevel.READ),
            (annotator, BranchPermissionLevel.WRITE),
            (reviewer, BranchPermissionLevel.WRITE),
        ):
            session.add(
                BranchPermission(
                    branch_id=labelset_branch.id,
                    user_id=user.id,
                    permission_lv=permission,
                )
            )
        session.commit()

        with pytest.raises(HTTPException) as exc_info:
            _push_no_op(session, reader, op_registry, labelset_branch.id)
        assert exc_info.value.status_code == HTTPStatus.FORBIDDEN
        session.rollback()

        _push_no_op(session, annotator, op_registry, labelset_branch.id)
        session.commit()
        _push_no_op(session, reviewer, op_registry, labelset_branch.id)
        session.commit()


def test_branch_writer_creates_labels_without_global_role(
    test_app_config: AppConfig,
    root_user: UserPublic,
    op_registry: OperationRegistry,
    labelset_branch: LabelsetBranchPublic,
):
    """
    A push authorizes the branch, so it must not also require the
    creator's global ``DATA_MANAGER`` role for the records it creates.

    ``root_user`` cannot be the pushing user here: it is granted every role, so
    it would pass the global role check even without the branch authorization
    threading this test guards.
    """
    _register_ops(op_registry)
    with session_ctx(test_app_config) as session:
        writer = _create_user(session, root_user, "repo-branch-writer", {Role.ANNOTATOR})
        reader = _create_user(session, root_user, "repo-branch-reader", {Role.ANNOTATOR})
        assert not writer.has_role(Role.DATA_MANAGER)

        for user, permission in (
            (writer, BranchPermissionLevel.WRITE),
            (reader, BranchPermissionLevel.READ),
        ):
            session.add(
                BranchPermission(
                    branch_id=labelset_branch.id,
                    user_id=user.id,
                    permission_lv=permission,
                )
            )
        session.commit()

        head_hash = labelset_branch.head.hash

        # READ on the branch is not enough: the push is rejected by the branch
        # guard before any create runs.
        with pytest.raises(HTTPException) as exc_info:
            _push_create(session, reader, op_registry, labelset_branch.id)
        assert exc_info.value.status_code == HTTPStatus.FORBIDDEN
        session.rollback()

        created_ids = _push_create(session, writer, op_registry, labelset_branch.id)
        session.commit()
        assert len(created_ids) == 1

        branch = read_branch(
            current_user=root_user,
            session=session,
            id=labelset_branch.id,
        )
        assert branch.head.hash != head_hash
        records = repo_test_entity_domain.list_datas(
            current_user=root_user,
            session=session,
            group_id=labelset_branch.group_id,
            commit_hash=branch.head.hash,
        )
        assert [record.id for record in records] == created_ids


def test_commit_hash_uses_resolved_placeholder_params(
    test_app_config: AppConfig,
    root_user: UserPublic,
    op_registry: OperationRegistry,
    labelset_branch: LabelsetBranchPublic,
):
    _register_ops(op_registry)
    with session_ctx(test_app_config) as session:
        parent = session.get(
            LabelsetCommit,
            {
                "group_id": labelset_branch.group_id,
                "hash": labelset_branch.head_hash,
            },
        )
        assert parent is not None

        push_commits(
            current_user=root_user,
            session=session,
            op_registry=op_registry,
            branch_id=labelset_branch.id,
            placeholder_keys=["produced"],
            commit_instrs=[
                LabelsetCommitInstruction(
                    op_name=RepoTestOperation.PRODUCE,
                    op_params=NoOpParams(),
                    result_placeholder_key="produced",
                ),
                LabelsetCommitInstruction(
                    op_name=RepoTestOperation.CONSUME,
                    op_params={"value": "produced"},
                ),
            ],
        )
        branch = read_branch(
            current_user=root_user,
            session=session,
            id=labelset_branch.id,
        )
        metadata = [LabelsetOperationMetadata.model_validate(op) for op in branch.head.operations]

        assert metadata[1].model_dump()["op_params"]["value"] == str(Produce.value)
        assert branch.head.hash == _compute_hash(metadata, [parent])


def test_premature_uuid_placeholder_reference_is_rejected(
    test_app_config: AppConfig,
    root_user: UserPublic,
    op_registry: OperationRegistry,
    labelset_branch: LabelsetBranchPublic,
):
    """
    Batch prevalidation must reject a reference to a placeholder that only a
    later instruction produces.

    The reference is passed as a ``uuid.UUID``-typed params model, i.e. exactly
    what the push routers hand to the domain after request-body validation has
    coerced the client's braced placeholder key. A string-only reference scan
    misses it and the batch is applied silently, so the consumer would read the
    placeholder's own id instead of the produced one.
    """
    _register_ops(op_registry)
    key = f"{{{uuid.uuid4()}}}"

    with session_ctx(test_app_config) as session:
        with pytest.raises(HTTPException) as exc_info:
            push_commits(
                current_user=root_user,
                session=session,
                op_registry=op_registry,
                branch_id=labelset_branch.id,
                placeholder_keys=[key],
                commit_instrs=[
                    LabelsetCommitInstruction(
                        op_name=RepoTestOperation.CONSUME,
                        op_params=ConsumeParams(value=uuid.UUID(key)),
                    ),
                    LabelsetCommitInstruction(
                        op_name=RepoTestOperation.PRODUCE,
                        op_params=NoOpParams(),
                        result_placeholder_key=key,
                    ),
                ],
            )

        assert exc_info.value.status_code == HTTPStatus.BAD_REQUEST
        assert "referenced before resolution" in str(exc_info.value.detail)
        session.rollback()


def test_database_rejects_deleting_branch_head(
    test_app_config: AppConfig,
    labelset_branch: LabelsetBranchPublic,
):
    with session_ctx(test_app_config) as session:
        head = session.get(
            LabelsetCommit,
            {
                "group_id": labelset_branch.group_id,
                "hash": labelset_branch.head_hash,
            },
        )
        assert head is not None

        session.delete(head)
        with pytest.raises(IntegrityError):
            session.flush()
        session.rollback()


def test_graph_excludes_same_hash_edges_from_other_groups(
    test_app_config: AppConfig,
    root_user: UserPublic,
    op_registry: OperationRegistry,
    labelset_branch: LabelsetBranchPublic,
):
    _register_ops(op_registry)
    with session_ctx(test_app_config) as session:
        _push_no_op(session, root_user, op_registry, labelset_branch.id)
        session.flush()
        graph = read_graph(
            current_user=root_user,
            session=session,
            branch_id=labelset_branch.id,
        )
        assert len(graph.edges) == 1
        edge = graph.edges[0]

        other_group = LabelGroup(name="repo-other-group")
        session.add(other_group)
        session.flush([other_group])
        assert other_group.id is not None
        source_commits = [
            session.get(
                LabelsetCommit,
                {
                    "group_id": labelset_branch.group_id,
                    "hash": commit_hash,
                },
            )
            for commit_hash in (edge.parent_hash, edge.child_hash)
        ]
        assert all(commit is not None for commit in source_commits)
        for commit in source_commits:
            assert commit is not None
            session.add(
                LabelsetCommit(
                    group_id=other_group.id,
                    hash=commit.hash,
                    operations=commit.operations,
                )
            )
        session.flush()
        session.add(
            LabelsetEdge(
                group_id=other_group.id,
                parent_hash=edge.parent_hash,
                child_hash=edge.child_hash,
            )
        )
        session.flush()

        scoped_graph = read_graph(
            current_user=root_user,
            session=session,
            branch_id=labelset_branch.id,
        )
        assert scoped_graph.edges == [edge]
