"""The read-only deferred-work inventory, as the data manager reads it."""

from collections.abc import Iterator

from fastapi.testclient import TestClient

import pytest

from sta.api.root import build_api
from sta.config import AppConfig
from sta.domain.jobs import cancel_job, claim_next_job, enqueue_job
from sta.domain.users import create_user
from sta.models.user import Role, UserCreate, UserPublic
from sta.session import session_ctx
from sta.testing.config import TestApp as AppUnderTest

pytestmark = pytest.mark.in_memory_db


@pytest.fixture
def client(test_app: AppUnderTest) -> TestClient:
    return TestClient(build_api(frontend_url="http://localhost:5174"))


@pytest.fixture
def headers(client: TestClient) -> Iterator[dict[str, str]]:
    response = client.post("/auth/login", data={"username": "admin", "password": "admin"})
    assert response.status_code == 200

    yield {"Authorization": f"Bearer {response.json()['access_token']}"}


def _enqueue(config: AppConfig, root_user: UserPublic, *, kind: str, group_id: int) -> None:
    with session_ctx(config) as session:
        enqueue_job(
            session=session,
            current_user=root_user,
            kind=kind,
            payload={"group_id": group_id},
            dedupe_key=f"{kind}:{group_id}",
            label=f"Derive spatial bounds for source group #{group_id}",
        )
        session.commit()


def test_the_inventory_starts_empty_and_reports_its_range(
    client: TestClient,
    headers: dict[str, str],
):
    response = client.get("/jobs/", headers=headers)

    assert response.status_code == 200, response.text
    assert response.json() == []
    assert response.headers["Content-Range"] == "jobs 0-0/0"


def test_a_queued_job_is_listed_with_its_label_and_progress(
    client: TestClient,
    headers: dict[str, str],
    test_app: AppUnderTest,
):
    _enqueue(test_app.config, test_app.root_user, kind="pcd.reconcile_bounds", group_id=7)

    listed = client.get("/jobs/", headers=headers)

    assert listed.status_code == 200, listed.text
    (job,) = listed.json()
    assert job["kind"] == "pcd.reconcile_bounds"
    assert job["state"] == "pending"
    assert job["payload"] == {"group_id": 7}
    assert job["label"] == "Derive spatial bounds for source group #7"
    assert job["progress_done"] == 0
    assert job["error"] is None
    assert listed.headers["Content-Range"] == "jobs 0-1/1"


def test_the_inventory_filters_by_state_and_kind(
    client: TestClient,
    headers: dict[str, str],
    test_app: AppUnderTest,
):
    _enqueue(test_app.config, test_app.root_user, kind="pcd.reconcile_bounds", group_id=1)
    _enqueue(test_app.config, test_app.root_user, kind="gmesh.reconcile_bounds", group_id=2)

    pending = client.get("/jobs/", headers=headers, params={"state": "pending"})
    assert [job["kind"] for job in pending.json()] == [
        "pcd.reconcile_bounds",
        "gmesh.reconcile_bounds",
    ]

    assert client.get("/jobs/", headers=headers, params={"state": "failed"}).json() == []
    gmesh = client.get("/jobs/", headers=headers, params={"kind": "gmesh.reconcile_bounds"})
    assert [job["payload"]["group_id"] for job in gmesh.json()] == [2]

    rejected = client.get("/jobs/", headers=headers, params={"sort_by": "payload"})
    assert rejected.status_code == 422


def test_an_absent_state_lists_every_state_and_a_repeated_one_the_union(
    client: TestClient,
    headers: dict[str, str],
    test_app: AppUnderTest,
):
    """The endpoint reports the queue, not one view of it.

    A repeated `state` is the union its caller asks for, while no `state` at all still
    reaches every row -- hiding what has finished is a page default, not a queue rule.
    """
    _enqueue(test_app.config, test_app.root_user, kind="pcd.reconcile_bounds", group_id=1)
    _enqueue(test_app.config, test_app.root_user, kind="pcd.reconcile_bounds", group_id=2)
    with session_ctx(test_app.config) as session:
        claimed = claim_next_job(session=session)
        assert claimed is not None
        session.commit()
        assert claimed.id is not None
        cancel_job(session=session, job_id=claimed.id)

    both = client.get("/jobs/", headers=headers, params={"state": ["pending", "cancelled"]})
    assert both.status_code == 200, both.text
    assert sorted(job["state"] for job in both.json()) == ["cancelled", "pending"]
    assert both.headers["Content-Range"] == "jobs 0-2/2"

    pending_only = client.get("/jobs/", headers=headers, params={"state": "pending"})
    assert [job["state"] for job in pending_only.json()] == ["pending"]
    assert pending_only.headers["Content-Range"] == "jobs 0-1/1"

    # The state the page hides by default still reaches an unfiltered reader.
    assert client.get("/jobs/", headers=headers, params={"state": "succeeded"}).json() == []
    everything = client.get("/jobs/", headers=headers)
    assert sorted(job["state"] for job in everything.json()) == ["cancelled", "pending"]

    cancelled = client.get("/jobs/", headers=headers, params={"state": "cancelled"})
    assert cancelled.status_code == 200
    assert [job["state"] for job in cancelled.json()] == ["cancelled"]


def test_a_repeated_id_names_the_exact_rows_a_write_reported(
    client: TestClient,
    headers: dict[str, str],
    test_app: AppUnderTest,
):
    """
    The ids a write hands back are the ids the inventory reads.

    A notice claiming "two jobs started" is only worth clicking if one request can find
    exactly those two, whatever else the queue holds meanwhile.
    """
    for group_id in (1, 2, 3):
        _enqueue(
            test_app.config,
            test_app.root_user,
            kind="pcd.reconcile_bounds",
            group_id=group_id,
        )

    listed = client.get("/jobs/", headers=headers)
    assert listed.status_code == 200, listed.text
    all_ids = sorted(job["id"] for job in listed.json())
    assert len(all_ids) == 3

    picked = [all_ids[0], all_ids[2]]
    response = client.get("/jobs/", headers=headers, params={"id": picked})
    assert response.status_code == 200, response.text
    assert sorted(job["id"] for job in response.json()) == picked
    assert response.headers["Content-Range"] == "jobs 0-2/2"

    # A lone value keeps working: the parameter widened, it did not move.
    single = client.get("/jobs/", headers=headers, params={"id": all_ids[1]})
    assert [job["id"] for job in single.json()] == [all_ids[1]]


def test_the_inventory_requires_a_data_manager(
    client: TestClient,
    headers: dict[str, str],
    test_app: AppUnderTest,
):
    with session_ctx(test_app.config) as session:
        create_user(
            current_user=test_app.root_user,
            session=session,
            data=UserCreate(username="annotator", password="password", roles={Role.ANNOTATOR}),
        )
        session.commit()

    login = client.post("/auth/login", data={"username": "annotator", "password": "password"})
    assert login.status_code == 200
    annotator_headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    forbidden = client.get("/jobs/", headers=annotator_headers)
    assert forbidden.status_code == 403

    assert client.get("/jobs/").status_code in (401, 403)


def test_a_data_manager_can_cancel_pending_work_but_an_annotator_cannot(
    client: TestClient,
    headers: dict[str, str],
    test_app: AppUnderTest,
):
    """Cancellation is an active-job transition on the protected operations surface."""
    _enqueue(test_app.config, test_app.root_user, kind="pcd.reconcile_bounds", group_id=1)
    job_id = client.get("/jobs/", headers=headers).json()[0]["id"]

    with session_ctx(test_app.config) as session:
        create_user(
            current_user=test_app.root_user,
            session=session,
            data=UserCreate(username="annotator", password="password", roles={Role.ANNOTATOR}),
        )
        session.commit()
    login = client.post("/auth/login", data={"username": "annotator", "password": "password"})
    annotator_headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    assert client.post(f"/jobs/{job_id}/cancel", headers=annotator_headers).status_code == 403

    cancelled = client.post(f"/jobs/{job_id}/cancel", headers=headers)
    assert cancelled.status_code == 200, cancelled.text
    assert cancelled.json()["state"] == "cancelled"
    assert cancelled.json()["finished_at"] is not None

    assert client.post(f"/jobs/{job_id}/cancel", headers=headers).status_code == 409
    assert client.post("/jobs/999999/cancel", headers=headers).status_code == 404


def test_an_app_that_enabled_the_worker_starts_and_stops_cleanly(
    test_app: AppUnderTest,
    headers: dict[str, str],
):
    """The worker's lifespan handler is registered with the app and survives shutdown.

    Entering the client runs every registered handler; an app that opted into the worker
    therefore starts polling a real queue here, and leaving it must join the task rather
    than leave it running against a database that is about to be dropped.
    """
    served = TestClient(build_api(frontend_url="http://localhost:5174", start_job_worker=True))

    with served:
        response = served.get("/jobs/", headers=headers)

    assert response.status_code == 200, response.text
    assert response.json() == []
