from fastapi.testclient import TestClient
from sqlmodel import Session

import pytest

from sta.api.root import build_api
from sta.domain.users import create_user
from sta.models.user import Role, UserCreate, UserPublic
from sta.testing.config import TestApp as AppUnderTest

pytestmark = pytest.mark.in_memory_db


@pytest.fixture
def client(test_app: AppUnderTest) -> TestClient:
    return TestClient(build_api(frontend_url="http://localhost:5174"))


def _create_plain_user(session: Session, root_user: UserPublic) -> UserPublic:
    record = create_user(
        current_user=root_user,
        session=session,
        data=UserCreate(username="plain-user", password="password", roles=set()),
    )
    session.commit()
    return UserPublic.model_validate(record)


def _login(client: TestClient, username: str, password: str) -> dict[str, str]:
    response = client.post("/auth/login", data={"username": username, "password": password})
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def test_public_user_responses_never_include_password_hash(client: TestClient):
    response = client.post("/auth/login", data={"username": "admin", "password": "admin"})
    assert response.status_code == 200
    headers = {"Authorization": f"Bearer {response.json()['access_token']}"}

    whoami = client.get("/auth/whoami", headers=headers)
    assert whoami.status_code == 200
    assert "password_hash" not in whoami.json()


def test_self_password_change_requires_current_password(
    client: TestClient,
    session: Session,
    root_user: UserPublic,
):
    plain_user = _create_plain_user(session, root_user)
    headers = _login(client, plain_user.username, "password")

    missing = client.patch(
        f"/users/{plain_user.id}",
        headers=headers,
        json={"password": "newpassword"},
    )
    wrong = client.patch(
        f"/users/{plain_user.id}",
        headers=headers,
        json={"password": "newpassword", "current_password": "wrong"},
    )

    assert missing.status_code == 403
    assert wrong.status_code == 403
    assert _login(client, plain_user.username, "password")

    # The password form's exact body also carries issued_at, the optimistic
    # locking token the browser loaded with the profile. It is concurrency
    # metadata rather than a request to change an administrative field, so a
    # non-admin must not be denied the change for submitting it...
    whoami = client.get("/auth/whoami", headers=headers)
    assert whoami.status_code == 200
    issued_at = whoami.json()["last_edit_at"]
    assert issued_at is not None

    accepted = client.patch(
        f"/users/{plain_user.id}",
        headers=headers,
        json={
            "issued_at": issued_at,
            "password": "newpassword",
            "current_password": "password",
        },
    )
    assert accepted.status_code == 200
    # ...and every token issued before the change is revoked with it.
    assert accepted.json()["current_login_at"] is None
    assert _login(client, plain_user.username, "newpassword")
    assert (
        client.post(
            "/auth/login",
            data={"username": plain_user.username, "password": "password"},
        ).status_code
        != 200
    )


def test_self_password_change_still_enforces_the_optimistic_locking_token(
    client: TestClient,
    session: Session,
    root_user: UserPublic,
):
    # Allowing issued_at in the permission decision must not silence conflict
    # detection: a request built against a stale profile is rejected and the
    # password stays untouched.
    plain_user = _create_plain_user(session, root_user)
    headers = _login(client, plain_user.username, "password")

    stale = client.patch(
        f"/users/{plain_user.id}",
        headers=headers,
        json={
            "issued_at": "2000-01-01T00:00:00+00:00",
            "password": "newpassword",
            "current_password": "password",
        },
    )

    assert stale.status_code == 409
    assert _login(client, plain_user.username, "password")


@pytest.mark.parametrize(
    "payload",
    [
        {"username": "forbidden-rename"},
        {"roles": [Role.ADMIN]},
    ],
)
def test_non_admin_cannot_change_own_administrative_fields(
    client: TestClient,
    session: Session,
    root_user: UserPublic,
    payload: dict[str, object],
):
    plain_user = _create_plain_user(session, root_user)
    headers = _login(client, plain_user.username, "password")

    response = client.patch(f"/users/{plain_user.id}", headers=headers, json=payload)

    assert response.status_code == 403


def test_non_admin_cannot_update_another_user(
    client: TestClient,
    session: Session,
    root_user: UserPublic,
):
    plain_user = _create_plain_user(session, root_user)
    headers = _login(client, plain_user.username, "password")

    response = client.patch(
        f"/users/{root_user.id}",
        headers=headers,
        json={"password": "hijacked-password"},
    )

    assert response.status_code == 403
    assert (
        client.post(
            "/auth/login",
            data={"username": root_user.username, "password": "admin"},
        ).status_code
        == 200
    )
