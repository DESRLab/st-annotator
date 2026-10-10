"""
HTTP coverage for the project collection's id-only read.

A multi-select grid's "Select All" has to name every project the current filter
matches, not just the page on screen, so ``GET /projects/ids`` mirrors the filters
and the reader scoping of ``GET /projects/``. Pinned here is that mirror: the same
inventory at any page size, the same visibility rule per role, and filters that
narrow the id list exactly as they narrow the page. The id route carries no order
guarantee (the grid sorts the page it fetches), so every comparison below is
order-insensitive.
"""

from collections.abc import Mapping, Sequence
from typing import Any

from fastapi.testclient import TestClient
from sqlmodel import Session

import pytest

from sta.api.root import build_api
from sta.domain.projects import create_project
from sta.domain.users import create_user
from sta.models.project import ProjectCreate, ProjectPublic
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


def _ids(
    client: TestClient,
    headers: dict[str, str],
    params: Mapping[str, Any] | None = None,
) -> list[int]:
    response = client.get("/projects/ids", headers=headers, params=dict(params or {}))
    assert response.status_code == 200, response.text

    return sorted(response.json())


def _listed_ids(
    client: TestClient,
    headers: dict[str, str],
    params: Mapping[str, Any] | None = None,
) -> list[int]:
    response = client.get("/projects/", headers=headers, params=dict(params or {}))
    assert response.status_code == 200, response.text

    return sorted(project["id"] for project in response.json())


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


def test_project_ids_are_the_whole_inventory_beyond_the_page(
    client: TestClient,
    auth_headers: dict[str, str],
    session: Session,
    root_user: UserPublic,
):
    """The id list is the filter's full answer, where the page is only part of it."""
    matched = [
        _create_project(session, root_user, name=f"projects-ids-page-{index}").id
        for index in range(4)
    ]
    unlisted = _create_project(session, root_user, name="projects-ids-unlisted")

    page = client.get(
        "/projects/",
        headers=auth_headers,
        params={"name_contains": "projects-ids-page-", "limit": 2},
    )
    assert page.status_code == 200, page.text
    assert len(page.json()) == 2
    assert page.headers["Content-Range"] == "projects 0-2/4"

    ids = _ids(client, auth_headers, {"name_contains": "projects-ids-page-"})
    assert ids == sorted(matched)
    assert len(ids) > len(page.json())
    assert unlisted.id not in ids


def test_project_ids_honour_the_same_filters_as_the_list(
    client: TestClient,
    auth_headers: dict[str, str],
    session: Session,
    root_user: UserPublic,
):
    """Every filter the grid can set narrows the ids exactly as it narrows the rows."""
    first = _create_project(session, root_user, name="projects-ids-filter-first")
    second = _create_project(session, root_user, name="projects-ids-filter-second")
    member = _create_user(
        session,
        root_user,
        username="projects-ids-filter-member",
        roles={Role.ANNOTATOR},
    )
    joined = _create_project(
        session,
        root_user,
        name="projects-ids-joined",
        member_ids=[member.id],
    )

    for query in (
        {},
        {"name_contains": "projects-ids-filter-"},
        {"name": first.name},
        {"id": second.id},
        {"id_ge": second.id, "id_le": second.id},
        {"member_id": member.id},
        {"member_id": root_user.id},
        {"name_contains": "nothing-matches"},
    ):
        assert _ids(client, auth_headers, query) == _listed_ids(
            client,
            auth_headers,
            query,
        ), query

    # The two ends agree on the inventory, and each single-valued filter leaves
    # exactly the one row it names.
    assert _ids(client, auth_headers) == sorted([first.id, second.id, joined.id])
    assert _ids(client, auth_headers, {"member_id": member.id}) == [joined.id]
    assert _ids(client, auth_headers, {"name": second.name}) == [second.id]


def test_project_ids_are_scoped_to_what_the_reader_may_read(
    client: TestClient,
    session: Session,
    root_user: UserPublic,
):
    """A reader outside the project-manager role gets their projects only, ids included."""
    member = _create_user(
        session,
        root_user,
        username="projects-ids-member",
        roles={Role.ANNOTATOR},
    )
    outsider = _create_user(
        session,
        root_user,
        username="projects-ids-outsider",
        roles={Role.ANNOTATOR},
    )
    mine = _create_project(
        session,
        root_user,
        name="projects-ids-mine",
        member_ids=[member.id],
    )
    theirs = _create_project(
        session,
        root_user,
        name="projects-ids-theirs",
        member_ids=[outsider.id],
    )
    shared = _create_project(
        session,
        root_user,
        name="projects-ids-shared",
        member_ids=[member.id, outsider.id],
    )

    headers = _login(client, member.username)
    ids = _ids(client, headers)
    assert ids == sorted([mine.id, shared.id])
    assert theirs.id not in ids
    assert ids == _listed_ids(client, headers)

    # Scoping and filtering compose: a filter can only narrow the visible set.
    assert _ids(client, headers, {"name_contains": "projects-ids-theirs"}) == []
    assert _ids(client, headers, {"name": theirs.name}) == []
    assert _ids(client, headers, {"member_id": outsider.id}) == _listed_ids(
        client,
        headers,
        {"member_id": outsider.id},
    )

    manager_headers = _login(client, "admin", "admin")
    assert _ids(client, manager_headers) == sorted([mine.id, theirs.id, shared.id])
