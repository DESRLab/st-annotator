import uuid
from datetime import datetime, timezone
from decimal import Decimal
from enum import Enum
from http import HTTPStatus

from fastapi import HTTPException
from fastapi.encoders import jsonable_encoder
from fastapi.testclient import TestClient
from pydantic import BaseModel
from sqlmodel import Session

import pytest

from sta.api import editor as editor_api
from sta.api.auth import get_current_user
from sta.api.editor import (
    _count_unbounded_time_frames,
    _get_data_loader,
    _require_frames,
    _warn_slow_label_load,
    list_project_tasks,
    list_task_frames,
    list_task_label_branches,
    list_task_source_groups,
    push_labelset_commits,
)
from sta.api.root import build_api
from sta.domain.editor.loader import LABEL_DATA_LOADERS
from sta.domain.frames import create_frame
from sta.domain.label.groups import create_group as create_label_group
from sta.domain.label.repo import branches as branch_repo
from sta.domain.label.repo.branches import read_branch
from sta.domain.label.repo.graph import LabelsetBranchInit, init_branch
from sta.domain.label.repo.ops import OP_REGISTRY, Operation, OperationRegistry
from sta.domain.projects import create_project
from sta.domain.source.groups import create_group as create_source_group
from sta.domain.tasks import create_task, update_task
from sta.domain.users import create_user
from sta.models.frame import FrameCreate, WorkType
from sta.models.label.group import LabelGroupCreate, LabelGroupPublic
from sta.models.label.repo import (
    LabelsetCommit,
    LabelsetCommitInstruction,
    LabelsetOperationMetadata,
)
from sta.models.project import ProjectCreate
from sta.models.source.group import SourceGroupCreate
from sta.models.task import TaskCreate, TaskUpdate
from sta.models.user import Role, UserCreate, UserPublic
from sta.session import session_ctx
from sta.testing.config import TestApp

pytestmark = pytest.mark.in_memory_db


def test_label_load_warning_only_for_slow_responses(monkeypatch: pytest.MonkeyPatch) -> None:
    logged: list[tuple[str, dict[str, object]]] = []
    monkeypatch.setattr(
        "sta.api.editor.logger.warning",
        lambda message, *, extra: logged.append((message, extra)),
    )
    _warn_slow_label_load(key="bbox", frame_count=2, elapsed=30, response_bytes=123)
    _warn_slow_label_load(key="bbox", frame_count=2, elapsed=30.6, response_bytes=123)
    assert logged == [
        (
            "Took too long to load label data",
            {
                "event": "label_data_bulk_loaded",
                "key": "bbox",
                "frame_count": 2,
                "total_seconds": 30.6,
                "response_bytes": 123,
            },
        )
    ]


def test_bulk_label_response_serializes_pydantic_envelope(
    monkeypatch: pytest.MonkeyPatch, test_app: TestApp
) -> None:
    class Kind(str, Enum):
        VALUE = "value"

    class Payload(BaseModel):
        id: uuid.UUID
        timestamp: datetime
        amount: Decimal
        kind: Kind
        missing: str | None

    class Loader:
        data_model = Payload

        def get_data_bulk(self, **_kwargs):
            return [
                Payload(
                    id=uuid.UUID(int=1),
                    timestamp=datetime(2024, 1, 1, tzinfo=timezone.utc),
                    amount=Decimal("1.25"),
                    kind=Kind.VALUE,
                    missing=None,
                )
            ]

    monkeypatch.setitem(LABEL_DATA_LOADERS, "serialization-test", Loader())
    monkeypatch.setattr(editor_api, "_require_frames", lambda **_kwargs: [])
    app = build_api(frontend_url="http://localhost:5174")
    app.dependency_overrides[get_current_user] = lambda: test_app.root_user
    response = TestClient(app).post(
        "/editor/label/data/bulk",
        params={"project_id": 1, "key": "serialization-test", "frame_ids": 1},
        json={},
    )
    assert response.status_code == 200
    assert response.content == (
        b'[{"id":"00000000-0000-0000-0000-000000000001",'
        b'"timestamp":"2024-01-01T00:00:00Z","amount":"1.25",'
        b'"kind":"value","missing":null}]'
    )


def test_require_frames_queries_by_id_and_preserves_requested_order(
    root_user: UserPublic,
    session: Session,
):
    project = create_project(
        current_user=root_user,
        session=session,
        data=ProjectCreate(name="editor-frame-access-project", member_ids=[root_user.id]),
    )
    other_project = create_project(
        current_user=root_user,
        session=session,
        data=ProjectCreate(name="editor-frame-access-other-project", member_ids=[root_user.id]),
    )
    task = create_task(
        current_user=root_user,
        session=session,
        data=TaskCreate(
            name="editor-frame-access-task",
            project_id=project.id,
            annotator_ids=[root_user.id],
        ),
    )
    other_task = create_task(
        current_user=root_user,
        session=session,
        data=TaskCreate(
            name="editor-frame-access-other-task",
            project_id=other_project.id,
            annotator_ids=[root_user.id],
        ),
    )
    first_frame = create_frame(
        current_user=root_user,
        session=session,
        data=FrameCreate(
            task_id=task.id,
            account_id=root_user.id,
            source_group_id=None,
            label_branch_id=None,
            work_type=WorkType.ANNOTATE,
        ),
    )
    second_frame = create_frame(
        current_user=root_user,
        session=session,
        data=FrameCreate(
            task_id=task.id,
            account_id=root_user.id,
            source_group_id=None,
            label_branch_id=None,
            work_type=WorkType.ANNOTATE,
        ),
    )
    other_frame = create_frame(
        current_user=root_user,
        session=session,
        data=FrameCreate(
            task_id=other_task.id,
            account_id=root_user.id,
            source_group_id=None,
            label_branch_id=None,
            work_type=WorkType.ANNOTATE,
        ),
    )

    frames = _require_frames(
        current_user=root_user,
        session=session,
        frame_ids=[second_frame.id, first_frame.id],
        project_id=project.id,
    )

    assert [frame.id for frame in frames] == [second_frame.id, first_frame.id]

    repeated_frames = _require_frames(
        current_user=root_user,
        session=session,
        frame_ids=[second_frame.id, first_frame.id, second_frame.id],
        project_id=project.id,
    )
    assert [frame.id for frame in repeated_frames] == [
        second_frame.id,
        first_frame.id,
        second_frame.id,
    ]
    assert _count_unbounded_time_frames(repeated_frames) == 3

    with pytest.raises(HTTPException, match="cannot be accessed") as exc_info:
        _require_frames(
            current_user=root_user,
            session=session,
            frame_ids=[other_frame.id],
            project_id=project.id,
        )
    assert exc_info.value.status_code == 404


def test_get_data_loader_rejects_unknown_key():
    with pytest.raises(HTTPException) as exc_info:
        _get_data_loader({}, "missing-loader")

    assert exc_info.value.status_code == 404
    assert exc_info.value.detail == "Unknown data loader: missing-loader"


def test_list_task_frames_rejects_revoked_assignment_with_stale_frame(
    root_user: UserPublic,
    session: Session,
):
    annotator = _create_test_user(
        session,
        root_user,
        username="editor-revoked-frame-annotator",
        roles={Role.ANNOTATOR},
    )
    project = create_project(
        current_user=root_user,
        session=session,
        data=ProjectCreate(
            name="editor-revoked-frame-project",
            member_ids=[root_user.id, annotator.id],
        ),
    )
    task = create_task(
        current_user=root_user,
        session=session,
        data=TaskCreate(
            name="editor-revoked-frame-task",
            project_id=project.id,
            annotator_ids=[annotator.id],
        ),
    )
    frame = create_frame(
        current_user=root_user,
        session=session,
        data=FrameCreate(
            task_id=task.id,
            account_id=annotator.id,
            source_group_id=None,
            label_branch_id=None,
            work_type=WorkType.ANNOTATE,
        ),
    )
    update_task(
        current_user=root_user,
        session=session,
        id=task.id,
        data=TaskUpdate(annotator_ids=[]),
    )
    session.refresh(frame)
    assert frame.account_id == annotator.id

    with pytest.raises(HTTPException) as exc_info:
        list_task_frames(
            current_user=annotator,
            session=session,
            task_id=task.id,
            work_type=WorkType.ANNOTATE,
        )

    assert exc_info.value.status_code == 404


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


def test_list_project_tasks_includes_assigned_frameless_tasks(
    root_user: UserPublic,
    session: Session,
):
    annotator = _create_test_user(
        session,
        root_user,
        username="editor-task-assigned-annotator",
        roles={Role.ANNOTATOR},
    )
    project = create_project(
        current_user=root_user,
        session=session,
        data=ProjectCreate(
            name="editor-assigned-frameless-project",
            member_ids=[root_user.id, annotator.id],
        ),
    )
    task = create_task(
        current_user=root_user,
        session=session,
        data=TaskCreate(
            name="editor-assigned-frameless-task",
            project_id=project.id,
            annotator_ids=[annotator.id],
        ),
    )

    tasks = list_project_tasks(
        current_user=annotator,
        session=session,
        project_id=project.id,
        work_type=WorkType.ANNOTATE,
    )

    assert [item.id for item in tasks] == [task.id]


def test_list_project_tasks_separates_dual_role_assignments(
    root_user: UserPublic,
    session: Session,
):
    worker = _create_test_user(
        session,
        root_user,
        username="editor-dual-role-worker",
        roles={Role.ANNOTATOR, Role.SUPERVISOR},
    )
    project = create_project(
        current_user=root_user,
        session=session,
        data=ProjectCreate(
            name="editor-dual-role-project",
            member_ids=[root_user.id, worker.id],
        ),
    )
    annotate_task = create_task(
        current_user=root_user,
        session=session,
        data=TaskCreate(
            name="annotate-only-task",
            project_id=project.id,
            annotator_ids=[worker.id],
        ),
    )
    review_task = create_task(
        current_user=root_user,
        session=session,
        data=TaskCreate(
            name="review-only-task",
            project_id=project.id,
            supervisor_ids=[worker.id],
        ),
    )

    annotate_results = list_project_tasks(
        current_user=worker,
        session=session,
        project_id=project.id,
        work_type=WorkType.ANNOTATE,
    )
    review_results = list_project_tasks(
        current_user=worker,
        session=session,
        project_id=project.id,
        work_type=WorkType.REVIEW,
    )

    assert [task.id for task in annotate_results] == [annotate_task.id]
    assert [task.id for task in review_results] == [review_task.id]


def test_list_project_tasks_excludes_unassigned_tasks_with_frames(
    root_user: UserPublic,
    session: Session,
):
    project_manager = _create_test_user(
        session,
        root_user,
        username="editor-task-project-manager",
        roles={Role.PROJECT_MANAGER},
    )
    annotator = _create_test_user(
        session,
        root_user,
        username="editor-task-other-annotator",
        roles={Role.ANNOTATOR},
    )
    project = create_project(
        current_user=root_user,
        session=session,
        data=ProjectCreate(
            name="editor-unassigned-frameless-project",
            member_ids=[root_user.id, project_manager.id, annotator.id],
        ),
    )
    task = create_task(
        current_user=root_user,
        session=session,
        data=TaskCreate(
            name="editor-unassigned-task-with-frame",
            project_id=project.id,
            annotator_ids=[annotator.id],
        ),
    )
    create_frame(
        current_user=root_user,
        session=session,
        data=FrameCreate(
            task_id=task.id,
            account_id=annotator.id,
            source_group_id=None,
            label_branch_id=None,
            work_type=WorkType.ANNOTATE,
        ),
    )

    tasks = list_project_tasks(
        current_user=project_manager,
        session=session,
        project_id=project.id,
        work_type=WorkType.ANNOTATE,
    )

    assert tasks == []


@pytest.mark.parametrize(
    ("path", "scope_param"),
    [
        ("/editor/tasks", "project_id"),
        ("/editor/task/source/groups", "task_id"),
        ("/editor/task/label/branches", "task_id"),
        ("/editor/task/frames", "task_id"),
    ],
)
def test_editor_mode_is_required_by_task_endpoints(
    test_app: TestApp,
    path: str,
    scope_param: str,
):
    app = build_api(frontend_url="http://localhost:5174")
    app.dependency_overrides[get_current_user] = lambda: test_app.root_user

    response = TestClient(app).get(path, params={scope_param: 1})

    assert response.status_code == HTTPStatus.UNPROCESSABLE_ENTITY
    assert any(error["loc"][-1] == "work_type" for error in response.json()["detail"])


def test_task_resource_lists_are_scoped_to_the_task(
    root_user: UserPublic,
    session: Session,
    op_registry: OperationRegistry,
):
    project = create_project(
        current_user=root_user,
        session=session,
        data=ProjectCreate(name="editor-resource-scope-project", member_ids=[root_user.id]),
    )
    task = create_task(
        current_user=root_user,
        session=session,
        data=TaskCreate(
            name="editor-resource-scope-task",
            project_id=project.id,
            annotator_ids=[root_user.id],
        ),
    )
    source_groups = [
        create_source_group(
            current_user=root_user,
            session=session,
            data=SourceGroupCreate(name=f"editor-resource-source-{index}"),
        )
        for index in range(2)
    ]
    label_groups = [
        create_label_group(
            current_user=root_user,
            session=session,
            data=LabelGroupCreate(name=f"editor-resource-label-{index}"),
        )
        for index in range(2)
    ]
    branches = [
        init_branch(
            current_user=root_user,
            session=session,
            op_registry=op_registry,
            data=LabelsetBranchInit(group_id=group.id, name=f"resource-branch-{index}"),
        )
        for index, group in enumerate(label_groups)
    ]
    create_frame(
        current_user=root_user,
        session=session,
        data=FrameCreate(
            task_id=task.id,
            account_id=root_user.id,
            source_group_id=source_groups[0].id,
            label_branch_id=branches[0].id,
            work_type=WorkType.ANNOTATE,
        ),
    )

    assert [
        group.id
        for group in list_task_source_groups(
            current_user=root_user,
            session=session,
            task_id=task.id,
            work_type=WorkType.ANNOTATE,
        )
    ] == [source_groups[0].id]
    assert [
        branch.id
        for branch in list_task_label_branches(
            current_user=root_user,
            session=session,
            task_id=task.id,
            work_type=WorkType.ANNOTATE,
        )
    ] == [branches[0].id]


class NoOpParams(BaseModel):
    __test__ = False  # Not a test suite


class NoOpOperation(Operation[NoOpParams]):
    __test__ = False  # Not a test suite

    def apply(
        self,
        current_user: UserPublic,
        session: Session,
        commit: LabelsetCommit,
    ) -> None:
        return None


class UuidResultParams(BaseModel):
    __test__ = False  # Not a test suite


class UuidResultOperation(Operation[UuidResultParams]):
    """Simulates a create operation whose result is the ID of the new label."""

    __test__ = False  # Not a test suite

    def apply(
        self,
        current_user: UserPublic,
        session: Session,
        commit: LabelsetCommit,
    ) -> uuid.UUID:
        return uuid.uuid4()


def test_labelset_push_persists_and_serializes_op_results(
    test_app: TestApp,
    label_group: LabelGroupPublic,
    op_registry: OperationRegistry,
):
    config = test_app.config
    root_user = test_app.root_user

    with session_ctx(config) as session:
        record = init_branch(
            current_user=root_user,
            session=session,
            op_registry=op_registry,
            data=LabelsetBranchInit(
                group_id=label_group.id,
                name="editor-push-test",
            ),
        )
        branch_id = record.id
        initial_head_hash = record.head_hash

        session.commit()

    OP_REGISTRY.register("test-editor-no-op", NoOpOperation, NoOpParams)
    OP_REGISTRY.register("test-editor-uuid-result", UuidResultOperation, UuidResultParams)
    try:
        with session_ctx(config) as session:
            result = push_labelset_commits(
                current_user=root_user,
                session=session,
                op_registry=OP_REGISTRY,
                label_branch_id=branch_id,
                last_fetched_head_hash=initial_head_hash,
                commit_instrs=[
                    LabelsetCommitInstruction(
                        op_name="test-editor-no-op",
                        op_params={},
                    ),
                    LabelsetCommitInstruction(
                        op_name="test-editor-uuid-result",
                        op_params={},
                    ),
                ],
                placeholder_keys=[],
            )

        # FastAPI applies this encoder to the endpoint return value. Keep the
        # assertion at that boundary so UUID-valued operation results cannot
        # regress into a response-serialization failure.
        payload = jsonable_encoder(result)
        op_results = payload["op_results"]
        assert op_results[0] is None
        assert isinstance(op_results[1], str)
        uuid.UUID(op_results[1])

        # The same response must carry the branch this push committed, so the
        # editor never has to re-read the head it is about to build on.
        branch_state = payload["branch"]
        assert branch_state["id"] == branch_id
        assert branch_state["head_hash"] == branch_state["head"]["hash"]
        assert branch_state["head_hash"] != initial_head_hash
    finally:
        OP_REGISTRY.deregister("test-editor-no-op")
        OP_REGISTRY.deregister("test-editor-uuid-result")

    # The pushed commits must survive the end of the request, i.e. the
    # endpoint must have committed rather than only flushed.
    with session_ctx(config) as session:
        branch = read_branch(
            current_user=root_user,
            session=session,
            id=branch_id,
        )
        assert branch.head_hash != initial_head_hash


PRODUCE_ID_OP_NAME = "test-editor-produce-id"
CONSUME_ID_OP_NAME = "test-editor-consume-id"


class ProduceIdParams(BaseModel):
    __test__ = False  # Not a test suite


class ProduceIdOperation(Operation[ProduceIdParams]):
    """Simulates a create operation returning the id of the new label."""

    __test__ = False  # Not a test suite

    produced_id = uuid.UUID("22222222-2222-2222-2222-222222222222")

    def apply(
        self,
        current_user: UserPublic,
        session: Session,
        commit: LabelsetCommit,
    ) -> uuid.UUID:
        return self.produced_id


class ConsumeIdParams(BaseModel):
    __test__ = False  # Not a test suite

    id: uuid.UUID


CONSUMED_IDS: list[uuid.UUID] = []


class ConsumeIdOperation(Operation[ConsumeIdParams]):
    """Simulates a move/classify/delete operation addressing an unsaved label."""

    __test__ = False  # Not a test suite

    def apply(
        self,
        current_user: UserPublic,
        session: Session,
        commit: LabelsetCommit,
    ) -> None:
        CONSUMED_IDS.append(self.params.id)
        return None


def test_labelset_push_resolves_placeholder_referenced_by_uuid_param(
    test_app: TestApp,
    label_group: LabelGroupPublic,
    op_registry: OperationRegistry,
):
    """
    The push endpoint must resolve a placeholder that an operation addresses by
    id, the way the editor does when an unsaved label is moved or classified
    before the batch is committed.

    This goes through ``TestClient`` on purpose: ``setup_router`` retypes the
    request body to the concrete per-operation params models, and that
    validation is what converts the client's braced placeholder key into a
    ``uuid.UUID`` (the braces are stripped, not rejected). Calling the endpoint
    as a plain Python function skips it and therefore cannot catch a regression
    where placeholder matching stops recognizing coerced ids.
    """
    config = test_app.config
    root_user = test_app.root_user

    with session_ctx(config) as session:
        record = init_branch(
            current_user=root_user,
            session=session,
            op_registry=op_registry,
            data=LabelsetBranchInit(
                group_id=label_group.id,
                name="editor-placeholder-push-test",
            ),
        )
        branch_id = record.id
        head_hash = record.head_hash

        session.commit()

    placeholder_key = f"{{{uuid.uuid4()}}}"
    assert uuid.UUID(placeholder_key) != ProduceIdOperation.produced_id

    OP_REGISTRY.register(PRODUCE_ID_OP_NAME, ProduceIdOperation, ProduceIdParams)
    OP_REGISTRY.register(CONSUME_ID_OP_NAME, ConsumeIdOperation, ConsumeIdParams)
    CONSUMED_IDS.clear()
    try:
        app = build_api(frontend_url="http://localhost:5174")
        # Bypass the auth round trip; this test is about body validation and
        # placeholder resolution, not about token handling.
        app.dependency_overrides[get_current_user] = lambda: root_user
        client = TestClient(app)

        response = client.post(
            "/editor/labelset/push",
            params={
                "label_branch_id": branch_id,
                "last_fetched_head_hash": head_hash,
            },
            json={
                "commit_instrs": [
                    {
                        "op_name": PRODUCE_ID_OP_NAME,
                        "op_params": {},
                        "result_placeholder_key": placeholder_key,
                    },
                    {
                        "op_name": CONSUME_ID_OP_NAME,
                        "op_params": {"id": placeholder_key},
                    },
                ],
                "placeholder_keys": [placeholder_key],
            },
        )

        assert response.status_code == HTTPStatus.OK, response.text
        payload = response.json()
        # The consumer must see the producer's real id, never the placeholder.
        assert [ProduceIdOperation.produced_id] == CONSUMED_IDS
        assert payload["op_results"] == [str(ProduceIdOperation.produced_id), None]

        # The branch this push committed travels with the results, so the
        # editor adopts the head it just moved rather than re-reading it.
        assert payload["branch"]["id"] == branch_id
        assert payload["branch"]["head_hash"] == payload["branch"]["head"]["hash"]
        assert payload["branch"]["head_hash"] != head_hash
    finally:
        CONSUMED_IDS.clear()
        OP_REGISTRY.deregister(PRODUCE_ID_OP_NAME)
        OP_REGISTRY.deregister(CONSUME_ID_OP_NAME)

    with session_ctx(config) as session:
        branch = read_branch(
            current_user=root_user,
            session=session,
            id=branch_id,
        )
        metadata = [LabelsetOperationMetadata.model_validate(op) for op in branch.head.operations]
        assert metadata[1].model_dump()["op_params"]["id"] == str(ProduceIdOperation.produced_id)


def test_labelset_push_returns_branch_from_the_push_transaction(
    test_app: TestApp,
    label_group: LabelGroupPublic,
    op_registry: OperationRegistry,
    monkeypatch: pytest.MonkeyPatch,
):
    """
    The push response must carry the post-commit branch state itself, read from
    the transaction that applied the commits.

    A separate read would be a second transaction: an interleaving writer could
    move the head in between, and the editor would adopt that head while keeping
    its own stale edits - after which the backend's staleness check passes and
    those edits land. The push must therefore serve the whole request from a
    single branch read, and the head it returns must be the one it committed.
    """
    config = test_app.config
    root_user = test_app.root_user

    with session_ctx(config) as session:
        record = init_branch(
            current_user=root_user,
            session=session,
            op_registry=op_registry,
            data=LabelsetBranchInit(
                group_id=label_group.id,
                name="editor-push-atomicity-test",
            ),
        )
        branch_id = record.id
        initial_head_hash = record.head_hash

        session.commit()

    # Count the branch reads that serve the request. The push locks the branch
    # row itself, so exactly one read may happen; more would mean the committed
    # state is re-read outside the transaction that produced it.
    read_ids: list[int] = []
    real_read_branch = branch_repo.read_branch

    def counting_read_branch(**kwargs):
        read_ids.append(kwargs["id"])
        return real_read_branch(**kwargs)

    monkeypatch.setattr(branch_repo, "read_branch", counting_read_branch)

    OP_REGISTRY.register("test-editor-no-op", NoOpOperation, NoOpParams)
    try:
        app = build_api(frontend_url="http://localhost:5174")
        app.dependency_overrides[get_current_user] = lambda: root_user
        client = TestClient(app)

        response = client.post(
            "/editor/labelset/push",
            params={
                "label_branch_id": branch_id,
                "last_fetched_head_hash": initial_head_hash,
            },
            json={
                "commit_instrs": [{"op_name": "test-editor-no-op", "op_params": {}}],
                "placeholder_keys": [],
            },
        )
    finally:
        OP_REGISTRY.deregister("test-editor-no-op")

    assert response.status_code == HTTPStatus.OK, response.text
    assert read_ids == [branch_id]

    payload = response.json()
    assert payload["op_results"] == [None]

    branch_state = payload["branch"]
    assert branch_state["id"] == branch_id
    assert branch_state["name"] == "editor-push-atomicity-test"

    committed_head_hash = branch_state["head_hash"]
    assert committed_head_hash != initial_head_hash

    # The returned state is the committed state: both the branch row and its
    # head commit agree with the response after the transaction closed.
    with session_ctx(config) as session:
        branch = read_branch(
            current_user=root_user,
            session=session,
            id=branch_id,
        )
        assert branch.head_hash == committed_head_hash
        assert branch.head.hash == committed_head_hash
        assert branch_state["head"]["hash"] == branch.head.hash
