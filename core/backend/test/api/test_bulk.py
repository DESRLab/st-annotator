"""
HTTP coverage for the four core bulk-update endpoints.

The domain rules those routes delegate to are pinned by the unit tests in
``test/domain``. What is exercised here is the wiring around them: the auth
dependency, the ``{ids, data}`` request body, the role gate, the transaction
commit or rollback, and the response shape.
"""

from collections.abc import Sequence
from typing import Any

from fastapi.testclient import TestClient
from sqlmodel import Session

import pytest

from sta.api.root import build_api
from sta.domain.projects import create_project
from sta.domain.tasks import create_task
from sta.domain.users import create_user
from sta.models.project import ProjectCreate, ProjectPublic
from sta.models.task import TaskCreate, TaskPublic
from sta.models.user import Role, UserCreate, UserPublic
from sta.testing.config import TestApp as AppUnderTest

pytestmark = pytest.mark.in_memory_db

PASSWORD = "password"


@pytest.fixture
def client(test_app: AppUnderTest) -> TestClient:
    return TestClient(build_api(frontend_url="http://localhost:5174"))


@pytest.fixture
def auth_headers(client: TestClient) -> dict[str, str]:
    return _login(client, "admin", "admin")


def _login(
    client: TestClient,
    username: str,
    password: str = PASSWORD,
) -> dict[str, str]:
    response = client.post("/auth/login", data={"username": username, "password": password})
    assert response.status_code == 200

    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def _read(
    client: TestClient,
    headers: dict[str, str],
    path: str,
) -> Any:
    response = client.get(path, headers=headers)
    assert response.status_code == 200

    return response.json()


def _member_ids(record: dict) -> list[int]:
    return [member["id"] for member in record["members"]]


def _create_user(
    session: Session,
    root_user: UserPublic,
    *,
    username: str,
    roles: set[Role],
) -> UserPublic:
    record = create_user(
        current_user=root_user,
        session=session,
        data=UserCreate(username=username, password=PASSWORD, roles=roles),
    )
    session.commit()

    return UserPublic.model_validate(record)


def _create_project(
    session: Session,
    root_user: UserPublic,
    *,
    name: str,
    member_ids: Sequence[int] = (),
) -> ProjectPublic:
    record = create_project(
        current_user=root_user,
        session=session,
        data=ProjectCreate(name=name, member_ids=list(member_ids)),
    )
    session.commit()

    return ProjectPublic.model_validate(record)


def _create_task(
    session: Session,
    root_user: UserPublic,
    *,
    name: str,
    project_id: int,
    supervisor_ids: Sequence[int] = (),
    annotator_ids: Sequence[int] = (),
) -> TaskPublic:
    record = create_task(
        current_user=root_user,
        session=session,
        data=TaskCreate(
            name=name,
            project_id=project_id,
            supervisor_ids=list(supervisor_ids),
            annotator_ids=list(annotator_ids),
        ),
    )
    session.commit()

    return TaskPublic.model_validate(record)


# --- projects ---------------------------------------------------------------


def test_bulk_update_projects_writes_the_batch_and_replaces_membership(
    client: TestClient,
    auth_headers: dict[str, str],
    session: Session,
    root_user: UserPublic,
):
    incoming = _create_user(session, root_user, username="projects-bulk-incoming", roles=set())
    retired = _create_user(session, root_user, username="projects-bulk-retired", roles=set())
    alpha = _create_project(
        session,
        root_user,
        name="projects-bulk-alpha",
        member_ids=[root_user.id, retired.id],
    )
    beta = _create_project(session, root_user, name="projects-bulk-beta")

    response = client.patch(
        "/projects/bulk",
        headers=auth_headers,
        json={
            "ids": [alpha.id, beta.id],
            "data": {"description": "bulk description", "member_ids": [incoming.id]},
        },
    )

    assert response.status_code == 200
    assert response.json() == {"success": True}

    for project_id, name in ((alpha.id, alpha.name), (beta.id, beta.name)):
        record = _read(client, auth_headers, f"/projects/{project_id}")
        # The batch statement committed for every id, including the project
        # that had no membership rows before.
        assert record["description"] == "bulk description"
        # Membership is replaced, not merged: the rows that pre-existed the
        # batch, the calling administrator's own included, are gone.
        assert _member_ids(record) == [incoming.id]
        # ``name`` is not a field of the bulk model, so a batch cannot rename.
        assert record["name"] == name


def test_bulk_update_projects_requires_the_project_manager_role(
    client: TestClient,
    auth_headers: dict[str, str],
    session: Session,
    root_user: UserPublic,
):
    project = _create_project(session, root_user, name="projects-bulk-gate")
    annotator = _create_user(
        session,
        root_user,
        username="projects-bulk-annotator",
        roles={Role.ANNOTATOR},
    )
    manager = _create_user(
        session,
        root_user,
        username="projects-bulk-manager",
        roles={Role.PROJECT_MANAGER},
    )

    refused = client.patch(
        "/projects/bulk",
        headers=_login(client, annotator.username),
        json={"ids": [project.id], "data": {"description": "not allowed"}},
    )
    assert refused.status_code == 403

    anonymous = client.patch(
        "/projects/bulk",
        json={"ids": [project.id], "data": {"description": "not allowed"}},
    )
    assert anonymous.status_code == 401

    # Neither call reached the database.
    assert _read(client, auth_headers, f"/projects/{project.id}")["description"] == ""

    # The gate asks for PROJECT_MANAGER specifically rather than for ADMIN.
    assert (
        client.patch(
            "/projects/bulk",
            headers=_login(client, manager.username),
            json={"ids": [project.id], "data": {"description": "by manager"}},
        ).status_code
        == 200
    )
    assert _read(client, auth_headers, f"/projects/{project.id}")["description"] == "by manager"


def test_bulk_update_projects_empty_and_null_forms(
    client: TestClient,
    auth_headers: dict[str, str],
    session: Session,
    root_user: UserPublic,
):
    member = _create_user(session, root_user, username="projects-bulk-member", roles=set())
    project = _create_project(
        session,
        root_user,
        name="projects-bulk-forms",
        member_ids=[member.id],
    )

    # An empty id list selects no row, so the statement is a no-op.
    assert (
        client.patch(
            "/projects/bulk",
            headers=auth_headers,
            json={"ids": [], "data": {"description": "bulk no-op"}},
        ).status_code
        == 200
    )
    # An id outside the table matches no row and is not reported either.
    assert (
        client.patch(
            "/projects/bulk",
            headers=auth_headers,
            json={"ids": [project.id + 10000], "data": {"description": "bulk no-op"}},
        ).status_code
        == 200
    )
    # An empty data object names no column, so no field is cleared.
    assert (
        client.patch(
            "/projects/bulk",
            headers=auth_headers,
            json={"ids": [project.id], "data": {}},
        ).status_code
        == 200
    )

    record = _read(client, auth_headers, f"/projects/{project.id}")
    assert record["description"] == ""
    assert _member_ids(record) == [member.id]

    # A JSON null asks to clear membership, which the model rejects: membership
    # is optional by absence, not by null.
    null_members = client.patch(
        "/projects/bulk",
        headers=auth_headers,
        json={"ids": [project.id], "data": {"member_ids": None}},
    )
    assert null_members.status_code == 422
    assert _member_ids(_read(client, auth_headers, f"/projects/{project.id}")) == [member.id]


# --- tasks ------------------------------------------------------------------


def test_bulk_update_tasks_writes_the_batch_and_replaces_assignment(
    client: TestClient,
    auth_headers: dict[str, str],
    session: Session,
    root_user: UserPublic,
):
    retired = _create_user(
        session,
        root_user,
        username="tasks-bulk-retired",
        roles={Role.ANNOTATOR, Role.SUPERVISOR},
    )
    incoming = _create_user(
        session,
        root_user,
        username="tasks-bulk-incoming",
        roles={Role.ANNOTATOR, Role.SUPERVISOR},
    )
    project = _create_project(
        session,
        root_user,
        name="tasks-bulk-project",
        member_ids=[root_user.id, retired.id, incoming.id],
    )
    alpha = _create_task(
        session,
        root_user,
        name="tasks-bulk-alpha",
        project_id=project.id,
        annotator_ids=[retired.id],
        supervisor_ids=[retired.id],
    )
    beta = _create_task(
        session,
        root_user,
        name="tasks-bulk-beta",
        project_id=project.id,
    )

    response = client.patch(
        "/tasks/bulk",
        headers=auth_headers,
        json={
            "ids": [alpha.id, beta.id],
            "data": {
                "description": "bulk description",
                "annotator_ids": [incoming.id],
                "supervisor_ids": [incoming.id],
            },
        },
    )

    assert response.status_code == 200
    assert response.json() == {"success": True}

    for task_id in (alpha.id, beta.id):
        record = _read(client, auth_headers, f"/tasks/{task_id}")
        assert record["description"] == "bulk description"
        # Assignment is replaced per task, so alpha's previous link does not
        # survive alongside the new one.
        assert [account["id"] for account in record["annotators"]] == [incoming.id]
        assert [account["id"] for account in record["supervisors"]] == [incoming.id]


@pytest.mark.parametrize(
    ("field", "account_field", "username", "roles"),
    [
        ("annotator_ids", "annotators", "tasks-bulk-outsider", {Role.ANNOTATOR}),
        ("annotator_ids", "annotators", "tasks-bulk-non-annotator", {Role.SUPERVISOR}),
        ("supervisor_ids", "supervisors", "tasks-bulk-non-supervisor", {Role.ANNOTATOR}),
    ],
)
def test_bulk_update_tasks_rejects_an_assignment_that_breaks_the_per_task_rules(
    client: TestClient,
    auth_headers: dict[str, str],
    session: Session,
    root_user: UserPublic,
    field: str,
    account_field: str,
    username: str,
    roles: set[Role],
):
    """The endpoint surfaces the domain revalidation as a client error."""
    project = _create_project(
        session,
        root_user,
        name=f"tasks-bulk-invalid-{field}",
        member_ids=[root_user.id],
    )
    assignee = _create_user(session, root_user, username=username, roles=roles)
    task = _create_task(
        session,
        root_user,
        name=f"tasks-bulk-invalid-task-{field}",
        project_id=project.id,
    )

    response = client.patch(
        "/tasks/bulk",
        headers=auth_headers,
        json={"ids": [task.id], "data": {field: [assignee.id], "description": "not allowed"}},
    )

    assert response.status_code == 400

    # The request is rolled back as a unit: neither the rejected link nor the
    # scalar field it travelled with reached the database.
    record = _read(client, auth_headers, f"/tasks/{task.id}")
    assert record["description"] == ""
    assert record[account_field] == []


def test_bulk_update_tasks_role_gate_and_empty_forms(
    client: TestClient,
    auth_headers: dict[str, str],
    session: Session,
    root_user: UserPublic,
):
    project = _create_project(
        session,
        root_user,
        name="tasks-bulk-gate-project",
        member_ids=[root_user.id],
    )
    task = _create_task(
        session,
        root_user,
        name="tasks-bulk-gate-task",
        project_id=project.id,
    )
    annotator = _create_user(
        session,
        root_user,
        username="tasks-bulk-annotator",
        roles={Role.ANNOTATOR},
    )

    assert (
        client.patch(
            "/tasks/bulk",
            headers=_login(client, annotator.username),
            json={"ids": [task.id], "data": {"description": "not allowed"}},
        ).status_code
        == 403
    )
    assert (
        client.patch(
            "/tasks/bulk",
            json={"ids": [task.id], "data": {"description": "not allowed"}},
        ).status_code
        == 401
    )

    assert (
        client.patch(
            "/tasks/bulk",
            headers=auth_headers,
            json={"ids": [], "data": {"description": "bulk no-op"}},
        ).status_code
        == 200
    )
    assert (
        client.patch(
            "/tasks/bulk",
            headers=auth_headers,
            json={"ids": [task.id], "data": {}},
        ).status_code
        == 200
    )
    assert (
        client.patch(
            "/tasks/bulk",
            headers=auth_headers,
            json={"ids": [task.id], "data": {"annotator_ids": None}},
        ).status_code
        == 422
    )

    record = _read(client, auth_headers, f"/tasks/{task.id}")
    assert record["description"] == ""
    assert record["annotators"] == []


# --- users ------------------------------------------------------------------


def _roles_of(client: TestClient, headers: dict[str, str], user_id: int) -> set[str]:
    return set(_read(client, headers, f"/users/{user_id}")["roles"])


def test_bulk_update_users_replaces_the_role_set_of_every_id(
    client: TestClient,
    auth_headers: dict[str, str],
    session: Session,
    root_user: UserPublic,
):
    first = _create_user(session, root_user, username="users-bulk-first", roles={Role.ANNOTATOR})
    second = _create_user(session, root_user, username="users-bulk-second", roles={Role.SUPERVISOR})

    response = client.patch(
        "/users/bulk",
        headers=auth_headers,
        json={"ids": [first.id, second.id], "data": {"roles": [Role.SUPERVISOR]}},
    )

    assert response.status_code == 200
    assert response.json() == {"success": True}

    for user_id in (first.id, second.id):
        # Roles are replaced, so the first user loses ANNOTATOR rather than
        # accumulating a second role.
        assert _roles_of(client, auth_headers, user_id) == {Role.SUPERVISOR.value}


def test_bulk_update_users_rejects_a_batch_that_demotes_the_calling_admin(
    client: TestClient,
    auth_headers: dict[str, str],
    session: Session,
    root_user: UserPublic,
):
    other = _create_user(session, root_user, username="users-bulk-other", roles={Role.ANNOTATOR})

    demoted = client.patch(
        "/users/bulk",
        headers=auth_headers,
        json={"ids": [root_user.id, other.id], "data": {"roles": [Role.ANNOTATOR]}},
    )

    assert demoted.status_code == 400
    assert "own account" in demoted.json()["detail"]

    # The whole batch is refused, not only the caller's row, and the caller's
    # session survives the rejected request.
    assert _roles_of(client, auth_headers, root_user.id) == {role.value for role in Role}
    assert _roles_of(client, auth_headers, other.id) == {Role.ANNOTATOR.value}

    # Demoting other users stays available, through either verb.
    assert (
        client.patch(
            "/users/bulk",
            headers=auth_headers,
            json={"ids": [other.id], "data": {"roles": []}},
        ).status_code
        == 200
    )
    assert _roles_of(client, auth_headers, other.id) == set()

    assert (
        client.put(
            "/users/bulk",
            headers=auth_headers,
            json={"ids": [other.id], "data": {"roles": [Role.ANNOTATOR]}},
        ).status_code
        == 200
    )
    assert _roles_of(client, auth_headers, other.id) == {Role.ANNOTATOR.value}


def test_bulk_update_users_including_the_caller_rotates_the_callers_auth_epoch(
    client: TestClient,
    auth_headers: dict[str, str],
    session: Session,
    root_user: UserPublic,
):
    """A self-including batch rewrites the row the caller's token is checked against.

    ``last_edit_at`` is both the optimistic-locking stamp the bulk statement
    writes and the authentication epoch, so an administrator who is part of the
    batch logs themselves out with it.
    """
    other = _create_user(session, root_user, username="users-epoch-other", roles=set())

    accepted = client.patch(
        "/users/bulk",
        headers=auth_headers,
        json={"ids": [root_user.id, other.id], "data": {"roles": [Role.ADMIN]}},
    )
    assert accepted.status_code == 200

    assert client.get(f"/users/{root_user.id}", headers=auth_headers).status_code == 401

    # The roles did land; only the token of the run that wrote them is spent.
    relogged = _login(client, "admin", "admin")
    assert _roles_of(client, relogged, root_user.id) == {Role.ADMIN.value}
    assert _roles_of(client, relogged, other.id) == {Role.ADMIN.value}


def test_bulk_update_users_requires_the_admin_role_and_ignores_identity_fields(
    client: TestClient,
    auth_headers: dict[str, str],
    session: Session,
    root_user: UserPublic,
):
    target = _create_user(
        session,
        root_user,
        username="users-bulk-target",
        roles={Role.ANNOTATOR},
    )
    manager = _create_user(
        session,
        root_user,
        username="users-bulk-manager",
        roles={Role.PROJECT_MANAGER},
    )

    # A project manager may read the user collection but not write roles.
    assert (
        client.patch(
            "/users/bulk",
            headers=_login(client, manager.username),
            json={"ids": [target.id], "data": {"roles": []}},
        ).status_code
        == 403
    )
    assert (
        client.patch(
            "/users/bulk",
            json={"ids": [target.id], "data": {"roles": []}},
        ).status_code
        == 401
    )
    assert _roles_of(client, auth_headers, target.id) == {Role.ANNOTATOR.value}

    # Username is identity data and is not part of the bulk model, so a batch
    # cannot rename a user.
    assert (
        client.patch(
            "/users/bulk",
            headers=auth_headers,
            json={"ids": [target.id], "data": {"username": "users-bulk-renamed"}},
        ).status_code
        == 200
    )
    assert _read(client, auth_headers, f"/users/{target.id}")["username"] == "users-bulk-target"

    assert (
        client.patch(
            "/users/bulk",
            headers=auth_headers,
            json={"ids": [target.id], "data": {"roles": None}},
        ).status_code
        == 422
    )
    assert (
        client.patch(
            "/users/bulk",
            headers=auth_headers,
            json={"ids": [], "data": {"roles": [Role.ADMIN]}},
        ).status_code
        == 200
    )
    assert (
        client.patch(
            "/users/bulk",
            headers=auth_headers,
            json={"ids": [target.id], "data": {}},
        ).status_code
        == 200
    )
    assert _roles_of(client, auth_headers, target.id) == {Role.ANNOTATOR.value}


# --- accounts ---------------------------------------------------------------


def _preferences_of(
    client: TestClient,
    headers: dict[str, str],
    username: str,
) -> Any:
    """Read an account blob back through the administrator-only collection.

    The individual ``/accounts/{id}`` read is a summary projection that never
    carries ``preferences``, so it cannot observe this write.
    """
    response = client.get("/accounts/", params={"username": username}, headers=headers)
    assert response.status_code == 200

    return response.json()[0]["preferences"]


def test_bulk_update_accounts_overwrites_the_preferences_of_every_id(
    client: TestClient,
    auth_headers: dict[str, str],
    session: Session,
    root_user: UserPublic,
):
    first = _create_user(session, root_user, username="accounts-bulk-first", roles=set())
    second = _create_user(session, root_user, username="accounts-bulk-second", roles=set())
    assert (
        client.patch(
            f"/accounts/{first.id}",
            headers=auth_headers,
            json={"preferences": {"only-first": True}},
        )
    ).status_code == 200

    response = client.patch(
        "/accounts/bulk",
        headers=auth_headers,
        json={"ids": [first.id, second.id], "data": {"preferences": {"bulk": True}}},
    )

    assert response.status_code == 200
    assert response.json() == {"success": True}

    for username in (first.username, second.username):
        # The blob is one column, so the batch replaces it wholesale rather
        # than merging the stored keys.
        assert _preferences_of(client, auth_headers, username) == {"bulk": True}

    # An explicit null clears the blob, unlike the link lists of the other
    # bulk models: preferences are documented as nullable state.
    assert (
        client.patch(
            "/accounts/bulk",
            headers=auth_headers,
            json={"ids": [first.id], "data": {"preferences": None}},
        ).status_code
        == 200
    )
    assert _preferences_of(client, auth_headers, first.username) is None
    assert _preferences_of(client, auth_headers, second.username) == {"bulk": True}


def test_bulk_update_accounts_is_admin_only_even_for_the_callers_own_account(
    client: TestClient,
    auth_headers: dict[str, str],
    session: Session,
    root_user: UserPublic,
):
    plain = _create_user(session, root_user, username="accounts-bulk-plain", roles=set())

    # ``bulk_update_accounts`` is guarded without an id, so the self-service
    # exception the individual update route grants does not reach the bulk one.
    refused = client.patch(
        "/accounts/bulk",
        headers=_login(client, plain.username),
        json={"ids": [plain.id], "data": {"preferences": {"self": True}}},
    )
    assert refused.status_code == 403

    self_service = client.patch(
        f"/accounts/{plain.id}",
        headers=_login(client, plain.username),
        json={"preferences": {"self-service": True}},
    )
    assert self_service.status_code == 200

    assert (
        client.patch(
            "/accounts/bulk",
            json={"ids": [plain.id], "data": {"preferences": {"anonymous": True}}},
        ).status_code
        == 401
    )

    assert (
        client.patch(
            "/accounts/bulk",
            headers=auth_headers,
            json={"ids": [plain.id], "data": {"preferences": {"by-admin": True}}},
        ).status_code
        == 200
    )
    assert _preferences_of(client, auth_headers, plain.username) == {"by-admin": True}


def test_bulk_update_accounts_empty_forms_change_nothing(
    client: TestClient,
    auth_headers: dict[str, str],
    session: Session,
    root_user: UserPublic,
):
    account = _create_user(session, root_user, username="accounts-bulk-forms", roles=set())
    assert (
        client.patch(
            f"/accounts/{account.id}",
            headers=auth_headers,
            json={"preferences": {"stored": True}},
        )
    ).status_code == 200

    assert (
        client.patch(
            "/accounts/bulk",
            headers=auth_headers,
            json={"ids": [], "data": {"preferences": {"no-op": True}}},
        ).status_code
        == 200
    )
    assert (
        client.patch(
            "/accounts/bulk",
            headers=auth_headers,
            json={"ids": [account.id + 10000], "data": {"preferences": {"no-op": True}}},
        ).status_code
        == 200
    )
    assert _preferences_of(client, auth_headers, account.username) == {"stored": True}

    # An empty data object names no column, so the stored blob survives.
    assert (
        client.patch(
            "/accounts/bulk",
            headers=auth_headers,
            json={"ids": [account.id], "data": {}},
        ).status_code
        == 200
    )
    assert _preferences_of(client, auth_headers, account.username) == {"stored": True}


# --- request contract -------------------------------------------------------


@pytest.mark.parametrize(
    "path",
    ["/projects/bulk", "/tasks/bulk", "/users/bulk", "/accounts/bulk"],
)
def test_bulk_routes_accept_both_verbs_with_an_ids_and_data_body(path: str):
    schema = build_api(frontend_url="http://localhost:5174").openapi()
    operations = schema["paths"][path]

    assert {"put", "patch"} <= set(operations)

    for verb in ("put", "patch"):
        body = operations[verb]["requestBody"]["content"]["application/json"]["schema"]
        body_schema = schema["components"]["schemas"][body["$ref"].rsplit("/", 1)[1]]
        assert set(body_schema["required"]) == {"ids", "data"}
        assert set(body_schema["properties"]) == {"ids", "data"}
        assert body_schema["properties"]["ids"]["items"]["type"] == "integer"

        success = operations[verb]["responses"]["200"]["content"]["application/json"]["schema"]
        assert success["$ref"].endswith("/SuccessResponse")


@pytest.mark.parametrize(
    ("path", "body", "missing"),
    [
        ("/projects/bulk", {"ids": [1]}, "data"),
        ("/projects/bulk", {"data": {"description": "x"}}, "ids"),
        ("/tasks/bulk", {"ids": [1]}, "data"),
        ("/tasks/bulk", {"data": {"description": "x"}}, "ids"),
        ("/users/bulk", {"ids": [1]}, "data"),
        ("/users/bulk", {"data": {"roles": []}}, "ids"),
        ("/accounts/bulk", {"ids": [1]}, "data"),
        ("/accounts/bulk", {"data": {"preferences": {}}}, "ids"),
    ],
)
def test_bulk_routes_reject_a_body_missing_ids_or_data(
    client: TestClient,
    auth_headers: dict[str, str],
    path: str,
    body: dict,
    missing: str,
):
    # Both halves of the payload are separate body parameters, so validation
    # fails before any role gate or domain call is reached.
    response = client.patch(path, headers=auth_headers, json=body)

    assert response.status_code == 422
    assert [error["loc"] for error in response.json()["detail"]] == [["body", missing]]
