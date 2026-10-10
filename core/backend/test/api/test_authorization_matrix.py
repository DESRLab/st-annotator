"""HTTP-boundary conformance tests for the core authorization policy.

Domain tests pin the detailed filtering rules.  This module deliberately stays at
the ASGI boundary: it proves that registered routes authenticate a real caller,
that representative operation families require their documented application
role, and that refused writes never reach persistence.

The more expensive relationship contracts remain focused in the following HTTP
tests and form part of this matrix: ``test_projects.py::
test_project_ids_are_scoped_to_what_the_reader_may_read``; ``test_editor.py``'s
``test_frame_access_*`` and resource-scope tests; ``test_files.py``'s role-gate
tests; ``test_jobs_api.py::test_a_data_manager_can_cancel_pending_work_but_an_annotator_cannot``;
and each plugin's ``test/api`` authorization cases.  Keeping those data-heavy
fixtures beside their domain-specific setup avoids recreating a second, weaker
fixture graph here.
"""

from __future__ import annotations

from collections.abc import Iterator

from fastapi.testclient import TestClient
from sqlmodel import Session, select

import pytest

from sta.api.root import build_api
from sta.domain.frames import create_frame
from sta.domain.label.groups import create_group as create_label_group
from sta.domain.label.repo.graph import LabelsetBranchInit, init_branch
from sta.domain.label.repo.ops import OperationRegistry
from sta.domain.label.repo.ops.special import register_special_ops
from sta.domain.projects import create_project
from sta.domain.tasks import create_task
from sta.models.frame import FrameCreate, WorkType
from sta.models.label.group import LabelGroupCreate
from sta.models.label.repo import BranchPermissionLevel
from sta.models.project import Project, ProjectCreate
from sta.models.source.group import SourceGroup
from sta.models.task import TaskCreate
from sta.models.user import User, UserPublic
from sta.testing.authorization import PrincipalProfiles, ResourceRelationships
from sta.testing.config import TestApp as AppUnderTest

pytestmark = pytest.mark.in_memory_db


@pytest.fixture
def client(test_app: AppUnderTest) -> Iterator[TestClient]:
    """Yield a client for the plugin-free core application."""
    with TestClient(build_api(frontend_url="http://localhost:5174")) as value:
        yield value


@pytest.fixture
def profile_headers(
    client: TestClient,
    session: Session,
    principal_profiles: PrincipalProfiles,
) -> dict[str, dict[str, str]]:
    """Log in every Phase 1 principal through the real authentication route."""
    session.commit()
    profiles = {
        "no-roles": principal_profiles.no_roles,
        "annotator": principal_profiles.annotator,
        "supervisor": principal_profiles.supervisor,
        "project-manager": principal_profiles.project_manager,
        "data-manager": principal_profiles.data_manager,
        "admin": principal_profiles.administrator,
        "dual-role": principal_profiles.dual_role,
    }
    result = {}
    for name, principal in profiles.items():
        response = client.post(
            "/auth/login",
            data={"username": principal.username, "password": "password"},
        )
        assert response.status_code == 200, response.text
        result[name] = {"Authorization": f"Bearer {response.json()['access_token']}"}
    return result


@pytest.mark.parametrize(
    ("method", "path", "minimum_profile", "forbidden_profile", "json"),
    [
        pytest.param("GET", "/accounts/", "admin", "no-roles", None, id="accounts-read"),
        pytest.param("GET", "/users/", "project-manager", "no-roles", None, id="users-read"),
        pytest.param(
            "POST",
            "/projects/",
            "project-manager",
            "data-manager",
            {"name": "matrix-project"},
            id="projects-create",
        ),
        pytest.param(
            "POST",
            "/source/groups/",
            "data-manager",
            "project-manager",
            {"name": "matrix-source-group"},
            id="source-write",
        ),
        pytest.param("GET", "/jobs/", "data-manager", "project-manager", None, id="jobs-read"),
    ],
)
def test_operation_families_use_the_minimum_documented_application_role(
    client: TestClient,
    profile_headers: dict[str, dict[str, str]],
    method: str,
    path: str,
    minimum_profile: str,
    forbidden_profile: str,
    json: dict[str, str] | None,
):
    """Role checks distinguish read and write authority at the HTTP boundary."""
    anonymous = client.request(method, path, json=json)
    forbidden = client.request(
        method,
        path,
        headers=profile_headers[forbidden_profile],
        json=json,
    )
    allowed = client.request(
        method,
        path,
        headers=profile_headers[minimum_profile],
        json=json,
    )

    assert anonymous.status_code == 401
    assert forbidden.status_code == 403
    assert allowed.status_code == 200, allowed.text


@pytest.mark.parametrize(
    ("path", "payload", "table"),
    [
        pytest.param(
            "/projects/",
            {"name": "refused-project"},
            Project,
            id="project-manager-write",
        ),
        pytest.param(
            "/source/groups/",
            {"name": "refused-source-group"},
            SourceGroup,
            id="data-manager-write",
        ),
    ],
)
def test_refused_collection_mutations_change_no_rows(
    client: TestClient,
    profile_headers: dict[str, dict[str, str]],
    session: Session,
    path: str,
    payload: dict[str, str],
    table: type[Project] | type[SourceGroup],
):
    """Authentication and role refusals occur before a mutation is persisted."""
    before = len(session.exec(select(table)).all())

    assert client.post(path, json=payload).status_code == 401
    assert client.post(path, headers=profile_headers["no-roles"], json=payload).status_code == 403

    session.expire_all()
    assert len(session.exec(select(table)).all()) == before


def test_admin_user_creation_refusal_changes_no_accounts(
    client: TestClient,
    profile_headers: dict[str, dict[str, str]],
    session: Session,
):
    """An authenticated non-admin cannot bypass the user-management route gate."""
    before = len(session.exec(select(User)).all())
    payload = {"username": "refused-user", "password": "password", "roles": []}

    response = client.post("/users/", headers=profile_headers["project-manager"], json=payload)

    assert response.status_code == 403
    session.expire_all()
    assert len(session.exec(select(User)).all()) == before


def test_project_reads_vary_relationship_independently_of_role(
    client: TestClient,
    profile_headers: dict[str, dict[str, str]],
    principal_profiles: PrincipalProfiles,
):
    """Project membership changes visibility without changing application roles."""
    manager = profile_headers["project-manager"]
    annotator = profile_headers["annotator"]
    other_annotator = profile_headers["no-roles"]

    mine_response = client.post(
        "/projects/",
        headers=manager,
        json={
            "name": "relationship-mine",
            "member_ids": [
                principal_profiles.annotator.id,
                principal_profiles.no_roles.id,
            ],
        },
    )
    theirs_response = client.post(
        "/projects/",
        headers=manager,
        json={
            "name": "relationship-theirs",
            "member_ids": [principal_profiles.no_roles.id],
        },
    )
    assert mine_response.status_code == 200, mine_response.text
    assert theirs_response.status_code == 200, theirs_response.text
    mine = mine_response.json()
    theirs = theirs_response.json()

    assert client.get(f"/projects/{mine['id']}", headers=annotator).status_code == 200
    assert client.get(f"/projects/{theirs['id']}", headers=annotator).status_code == 404
    assert client.get(f"/projects/{theirs['id']}", headers=other_annotator).status_code == 200


def test_branch_http_permissions_distinguish_every_grant_level(
    client: TestClient,
    profile_headers: dict[str, dict[str, str]],
    principal_profiles: PrincipalProfiles,
    resource_relationships: ResourceRelationships,
    root_user: UserPublic,
    session: Session,
):
    """Branch reads, appends, checkpoints, and administration use distinct grants."""
    group = create_label_group(
        current_user=root_user,
        session=session,
        data=LabelGroupCreate(name="branch-http-matrix"),
    )
    registry = OperationRegistry()
    register_special_ops(registry)
    grants = [
        ("no-roles", principal_profiles.no_roles, BranchPermissionLevel.READ),
        ("annotator", principal_profiles.annotator, BranchPermissionLevel.WRITE),
        (
            "supervisor",
            principal_profiles.supervisor,
            BranchPermissionLevel.WRITE_ELEVATED,
        ),
        ("admin", principal_profiles.administrator, BranchPermissionLevel.ADMIN),
    ]
    branches = {}
    for profile, principal, permission in grants:
        branch = init_branch(
            current_user=root_user,
            session=session,
            op_registry=registry,
            data=LabelsetBranchInit(group_id=group.id, name=f"branch-{profile}"),
        )
        resource_relationships.branch_grant(branch.id, principal, permission)
        branches[profile] = (branch.id, branch.head_hash)
    session.commit()

    for profile, _, _ in grants:
        branch_id, _ = branches[profile]
        assert (
            client.get(
                f"/label/repo/branches/{branch_id}", headers=profile_headers[profile]
            ).status_code
            == 200
        )

    read_id, read_head = branches["no-roles"]
    read_push = client.post(
        "/label/repo/push",
        headers=profile_headers["no-roles"],
        params={"branch_id": read_id, "last_fetched_head_hash": read_head},
        json={"commit_instrs": [], "placeholder_keys": []},
    )
    assert read_push.status_code == 403

    write_id, write_head = branches["annotator"]
    write_push = client.post(
        "/label/repo/push",
        headers=profile_headers["annotator"],
        params={"branch_id": write_id, "last_fetched_head_hash": write_head},
        json={"commit_instrs": [], "placeholder_keys": []},
    )
    assert write_push.status_code == 200, write_push.text
    elevated_id, elevated_head = branches["supervisor"]
    elevated_push = client.post(
        "/label/repo/push",
        headers=profile_headers["supervisor"],
        params={
            "branch_id": elevated_id,
            "last_fetched_head_hash": elevated_head,
        },
        json={"commit_instrs": [], "placeholder_keys": []},
    )
    assert elevated_push.status_code == 200, elevated_push.text
    assert (
        client.patch(
            f"/label/repo/branches/{elevated_id}",
            headers=profile_headers["supervisor"],
            json={"name": "refused-elevated-rename"},
        ).status_code
        == 403
    )

    admin_id, _ = branches["admin"]
    admin_update = client.patch(
        f"/label/repo/branches/{admin_id}",
        headers=profile_headers["admin"],
        json={"name": "admin-renamed"},
    )
    assert admin_update.status_code == 200, admin_update.text
    assert admin_update.json()["name"] == "admin-renamed"

    assert (
        client.get(f"/label/repo/branches/{read_id}", headers=profile_headers["no-roles"]).json()[
            "head_hash"
        ]
        == read_head
    )


@pytest.mark.parametrize(
    ("profile", "work_type", "expected_task_name"),
    [
        pytest.param("annotator", WorkType.ANNOTATE, "matrix-annotate", id="annotate"),
        pytest.param("supervisor", WorkType.REVIEW, "matrix-review", id="review"),
    ],
)
def test_editor_http_entry_requires_matching_role_assignment_ownership_and_grant(
    client: TestClient,
    profile_headers: dict[str, dict[str, str]],
    principal_profiles: PrincipalProfiles,
    resource_relationships: ResourceRelationships,
    root_user: UserPublic,
    session: Session,
    profile: str,
    work_type: WorkType,
    expected_task_name: str,
):
    """Annotate and review entry expose only assigned work owned by the caller."""
    worker = getattr(principal_profiles, profile)
    other = (
        principal_profiles.supervisor if profile == "annotator" else principal_profiles.annotator
    )
    project = create_project(
        current_user=root_user,
        session=session,
        data=ProjectCreate(name=f"editor-{profile}", member_ids=[worker.id, other.id]),
    )
    task = create_task(
        current_user=root_user,
        session=session,
        data=TaskCreate(
            name=expected_task_name,
            project_id=project.id,
            annotator_ids=[worker.id] if work_type == WorkType.ANNOTATE else [],
            supervisor_ids=[worker.id] if work_type == WorkType.REVIEW else [],
        ),
    )
    group = create_label_group(
        current_user=root_user,
        session=session,
        data=LabelGroupCreate(name=f"editor-{profile}-labels"),
    )
    registry = OperationRegistry()
    register_special_ops(registry)
    branch = init_branch(
        current_user=root_user,
        session=session,
        op_registry=registry,
        data=LabelsetBranchInit(group_id=group.id, name=f"editor-{profile}-branch"),
    )
    resource_relationships.branch_grant(
        branch.id,
        worker,
        BranchPermissionLevel.WRITE
        if work_type == WorkType.ANNOTATE
        else BranchPermissionLevel.WRITE_ELEVATED,
    )
    frame = create_frame(
        current_user=root_user,
        session=session,
        data=FrameCreate(
            task_id=task.id,
            account_id=worker.id,
            source_group_id=None,
            label_branch_id=branch.id,
            work_type=work_type,
        ),
    )
    session.commit()

    tasks = client.get(
        "/editor/tasks",
        headers=profile_headers[profile],
        params={"project_id": project.id, "work_type": work_type.value},
    )
    assert tasks.status_code == 200, tasks.text
    assert [item["name"] for item in tasks.json()] == [expected_task_name]

    frames = client.get(
        "/editor/task/frames",
        headers=profile_headers[profile],
        params={"task_id": task.id, "work_type": work_type.value},
    )
    assert frames.status_code == 200, frames.text
    assert [item["id"] for item in frames.json()] == [frame.id]

    wrong_relationship = client.get(
        "/editor/task/frames",
        headers=profile_headers["supervisor" if profile == "annotator" else "annotator"],
        params={"task_id": task.id, "work_type": work_type.value},
    )
    assert wrong_relationship.status_code == 404
