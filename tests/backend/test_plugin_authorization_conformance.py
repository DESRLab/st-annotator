"""Cross-plugin HTTP authorization conformance.

Resource visibility and mutation authority remain pinned by each plugin's focused
API tests; this suite prevents a shipped plugin family from accidentally mounting
an unauthenticated route in the composed backend.
"""

from collections.abc import Iterator
from http import HTTPStatus

from fastapi.testclient import TestClient
from sqlmodel import Session

import pytest

from sta.api.root import build_api
from sta.config import AppConfig
from sta.plugin import load_plugins
from sta.testing.authorization import PrincipalProfiles


@pytest.fixture
def plugin_client(plugin_import_app_config: AppConfig) -> Iterator[TestClient]:
    """Yield one client with every shipped plugin registered."""
    del plugin_import_app_config
    load_plugins()
    with TestClient(build_api(frontend_url="http://localhost:5174")) as client:
        yield client


@pytest.fixture
def profile_headers(
    plugin_client: TestClient,
    session: Session,
    principal_profiles: PrincipalProfiles,
) -> dict[str, dict[str, str]]:
    """Authenticate representative forbidden and permitted plugin principals."""
    session.commit()
    profiles = {
        "no-roles": principal_profiles.no_roles,
        "project-manager": principal_profiles.project_manager,
        "data-manager": principal_profiles.data_manager,
    }
    result = {}
    for name, principal in profiles.items():
        response = plugin_client.post(
            "/auth/login",
            data={"username": principal.username, "password": "password"},
        )
        assert response.status_code == HTTPStatus.OK, response.text
        result[name] = {"Authorization": f"Bearer {response.json()['access_token']}"}
    return result


@pytest.mark.parametrize(
    ("path", "allowed_status"),
    [
        pytest.param("/source/data/pcd/metadata/", HTTPStatus.BAD_REQUEST, id="pcd"),
        pytest.param("/source/data/gmesh/metadata/", HTTPStatus.BAD_REQUEST, id="gmesh"),
    ],
)
def test_source_plugin_mutations_require_data_manager_and_refusals_change_no_rows(
    plugin_client: TestClient,
    profile_headers: dict[str, dict[str, str]],
    path: str,
    allowed_status: HTTPStatus,
):
    """PCD and GMesh reject project managers before validating or persisting."""
    before = plugin_client.get(path, headers=profile_headers["data-manager"])
    assert before.status_code == HTTPStatus.OK, before.text
    payload = {
        "uri": "authorization-matrix.npy",
        "group_id": 999999,
        "translate_x": 0,
        "translate_y": 0,
        "translate_z": 0,
        "rotate_x": 0,
        "rotate_y": 0,
        "rotate_z": 0,
        "scale_x": 1,
        "scale_y": 1,
        "scale_z": 1,
        "weather": None,
    }

    refused = plugin_client.post(
        path,
        headers=profile_headers["project-manager"],
        json=payload,
    )
    allowed_boundary = plugin_client.post(
        path,
        headers=profile_headers["data-manager"],
        json=payload,
    )

    assert refused.status_code == HTTPStatus.FORBIDDEN
    assert allowed_boundary.status_code == allowed_status, allowed_boundary.text
    after = plugin_client.get(path, headers=profile_headers["data-manager"])
    assert after.status_code == HTTPStatus.OK, after.text
    assert after.json() == before.json()


@pytest.mark.parametrize(
    "path",
    [
        pytest.param("/label/data/bbox/element/", id="bbox"),
        pytest.param("/label/data/segmentation/element/", id="segmentation"),
        pytest.param("/label/data/vector/element/", id="vector"),
    ],
)
def test_read_only_label_plugins_accept_authenticated_callers(
    plugin_client: TestClient,
    profile_headers: dict[str, dict[str, str]],
    path: str,
):
    """Read-only label families cross auth before request validation."""
    response = plugin_client.get(path, headers=profile_headers["no-roles"])

    assert response.status_code == HTTPStatus.UNPROCESSABLE_ENTITY, response.text


def test_segmentation_editor_health_accepts_a_signed_in_principal(
    plugin_client: TestClient,
    profile_headers: dict[str, dict[str, str]],
):
    """The segmentation assistant health route has no application-role gate."""
    response = plugin_client.get(
        "/editor/segmentation/assistant/health",
        headers=profile_headers["no-roles"],
    )

    assert response.status_code == HTTPStatus.OK, response.text
