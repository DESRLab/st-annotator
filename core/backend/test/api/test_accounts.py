from fastapi import Response
from fastapi.testclient import TestClient
from sqlmodel import Session

import pytest

from sta.api.responses import set_content_range
from sta.api.root import build_api
from sta.domain.querying import Pagination
from sta.domain.users import create_user
from sta.models.user import Role, UserCreate, UserPublic
from sta.testing.config import TestApp as AppUnderTest

pytestmark = pytest.mark.in_memory_db


@pytest.fixture
def client(test_app: AppUnderTest) -> TestClient:
    return TestClient(build_api(frontend_url="http://localhost:5174"))


@pytest.fixture
def auth_headers(client: TestClient) -> dict[str, str]:
    response = client.post(
        "/auth/login",
        data={"username": "admin", "password": "admin"},
    )
    assert response.status_code == 200

    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def _create_user(
    session: Session,
    root_user: UserPublic,
    *,
    username: str,
) -> UserPublic:
    record = create_user(
        current_user=root_user,
        session=session,
        data=UserCreate(username=username, password="password", roles={Role.ANNOTATOR}),
    )

    return UserPublic.model_validate(record)


def _login(client: TestClient, username: str) -> dict[str, str]:
    response = client.post("/auth/login", data={"username": username, "password": "password"})
    assert response.status_code == 200

    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def test_list_query_parameters_remain_flat_in_openapi():
    schema = build_api(frontend_url="http://localhost:5174").openapi()

    account_parameters = schema["paths"]["/accounts/"]["get"]["parameters"]
    account_parameter_names = {parameter["name"] for parameter in account_parameters}
    assert {"offset", "limit", "username"} <= account_parameter_names
    assert "pagination" not in account_parameter_names

    project_parameters = schema["paths"]["/projects/"]["get"]["parameters"]
    project_parameter_names = {parameter["name"] for parameter in project_parameters}
    assert {"offset", "limit", "sort_by", "sort_dir"} <= project_parameter_names
    assert "sorting" not in project_parameter_names


@pytest.mark.parametrize(
    ("pagination", "page_length", "expected"),
    [
        (Pagination(), 2, "accounts 0-2/2"),
        (Pagination(offset=10, limit=5), 0, "accounts 10-10/2"),
        (Pagination(offset=2, limit=0), 0, "accounts 2-2/3"),
    ],
)
def test_content_range_covers_page_boundaries(
    pagination: Pagination,
    page_length: int,
    expected: str,
):
    response = Response()

    set_content_range(
        response,
        "accounts",
        pagination=pagination,
        page_length=page_length,
        total=int(expected.rsplit("/", 1)[1]),
    )

    assert response.headers["Content-Range"] == expected


def test_list_accounts_uses_consistent_content_ranges(
    client: TestClient,
    auth_headers: dict[str, str],
    session: Session,
    root_user: UserPublic,
):
    _create_user(session, root_user, username="pagination-first")
    _create_user(session, root_user, username="pagination-second")
    session.commit()

    first_page = client.get(
        "/accounts/",
        params={"offset": 1, "limit": 1},
        headers=auth_headers,
    )
    assert first_page.status_code == 200
    assert len(first_page.json()) == 1
    assert first_page.headers["Content-Range"] == "accounts 1-2/3"

    empty_page = client.get(
        "/accounts/",
        params={"offset": 10, "limit": 1},
        headers=auth_headers,
    )
    assert empty_page.status_code == 200
    assert empty_page.json() == []
    assert empty_page.headers["Content-Range"] == "accounts 10-10/3"

    zero_length_page = client.get(
        "/accounts/",
        params={"offset": 2, "limit": 0},
        headers=auth_headers,
    )
    assert zero_length_page.status_code == 200
    assert zero_length_page.json() == []
    assert zero_length_page.headers["Content-Range"] == "accounts 2-2/3"


def test_list_accounts_count_uses_the_same_filters_as_the_page(
    client: TestClient,
    auth_headers: dict[str, str],
    session: Session,
    root_user: UserPublic,
):
    _create_user(session, root_user, username="pagination-filtered")
    _create_user(session, root_user, username="pagination-other")
    session.commit()

    response = client.get(
        "/accounts/",
        params={"username": "pagination-filtered"},
        headers=auth_headers,
    )

    assert response.status_code == 200
    assert [account["username"] for account in response.json()] == ["pagination-filtered"]
    assert response.headers["Content-Range"] == "accounts 0-1/1"


@pytest.mark.parametrize("parameter", ["offset", "limit"])
def test_list_accounts_rejects_negative_pagination_parameters(
    client: TestClient,
    auth_headers: dict[str, str],
    parameter: str,
):
    response = client.get(
        "/accounts/",
        params={parameter: -1},
        headers=auth_headers,
    )

    assert response.status_code == 422


SUMMARY_REF = "#/components/schemas/AccountPublicSummary"
FULL_REF = "#/components/schemas/AccountPublic"


def _response_ref(schema: dict) -> str:
    return schema["schema"]["$ref"]


def test_accounts_exposing_a_non_owner_reader_use_the_summary_projection():
    """
    Who may see an account is decided by the response shape.

    Every position where the reader may be a coworker is typed
    :class:`sta.models.account.AccountPublicSummary`, which declares `id` and
    `username` only. The administrator-only collection keeps the full model,
    since the admin preferences editor loads what it edits through it.
    """
    schema = build_api(frontend_url="http://localhost:5174").openapi()
    schemas = schema["components"]["schemas"]

    assert set(schemas["AccountPublicSummary"]["properties"]) == {"id", "username"}
    assert "preferences" in schemas["AccountPublic"]["properties"]

    # A frame row is read by everybody who may see its task.
    assert schemas["FramePublicWithParents"]["properties"]["account"]["$ref"] == SUMMARY_REF

    # Project membership is readable by everybody assigned to the project's
    # tasks, and the project also travels inside TaskPublicWithParents.
    assert schemas["ProjectPublic"]["properties"]["members"]["items"]["$ref"] == SUMMARY_REF

    # Task assignment lists appear on every public task shape, recursive and
    # flat alike, so all of them use the summary.
    for task_schema in ("TaskPublic", "TaskPublicFlat", "TaskPublicWithParents"):
        properties = schemas[task_schema]["properties"]
        for field in ("supervisors", "annotators"):
            assert properties[field]["items"]["$ref"] == SUMMARY_REF, f"{task_schema}.{field}"

    # The individual read serves the summary to every caller, the owner
    # included.
    individual_read = schema["paths"]["/accounts/{id}"]["get"]["responses"]["200"]["content"][
        "application/json"
    ]
    assert individual_read["schema"]["$ref"] == SUMMARY_REF

    # Administrator-only reads keep the full shape: the collection feeds the
    # admin grid and its preferences editor, and the write responses echo the
    # record back to the owner or the administrator who just changed it.
    collection = schema["paths"]["/accounts/"]["get"]["responses"]["200"]["content"][
        "application/json"
    ]
    assert collection["schema"]["items"]["$ref"] == FULL_REF
    for method in ("put", "patch"):
        write = schema["paths"]["/accounts/{id}"][method]["responses"]["200"]["content"][
            "application/json"
        ]
        assert _response_ref(write) == FULL_REF


def test_individual_account_read_withholds_preferences_from_every_caller(
    client: TestClient,
    auth_headers: dict[str, str],
    session: Session,
    root_user: UserPublic,
):
    """A stored blob must not come back on the wire, whoever asks."""
    owner = _create_user(session, root_user, username="preferences-owner")
    reader = _create_user(session, root_user, username="preferences-reader")
    session.commit()

    stored = {"theme": "dark", "home": "Some Street 12"}
    updated = client.patch(
        f"/accounts/{owner.id}",
        headers=auth_headers,
        json={"preferences": stored},
    )
    assert updated.status_code == 200
    # Only the administrator-only shapes still carry it.
    assert updated.json()["preferences"] == stored

    reader_headers = _login(client, reader.username)
    for headers in (reader_headers, auth_headers):
        response = client.get(f"/accounts/{owner.id}", headers=headers)
        assert response.status_code == 200
        assert set(response.json()) == {"id", "username"}

    # The owner is refused too: making the answer depend on recognizing the
    # caller is what this change removes.
    assert (
        "preferences"
        not in client.get(
            f"/accounts/{owner.id}",
            headers=_login(client, owner.username),
        ).json()
    )

    # ...while the administrator-only collection still serves it, which is how
    # the admin preferences editor loads what it is about to edit.
    listing = client.get(
        "/accounts/",
        params={"username": owner.username},
        headers=auth_headers,
    )
    assert listing.status_code == 200
    assert listing.json()[0]["preferences"] == stored
