"""Tests for the pcd source-spec API handlers (CRUD + error path) via an authenticated client."""

from __future__ import annotations

import json
from collections.abc import Callable

import httpx

import numpy as np

from fastapi.testclient import TestClient

import pytest

from sta.common.filesystem import FileSystemPath
from sta.common.spatial import OptionalVector3
from sta.domain.jobs import run_pending_jobs
from sta.models.source.group import SourceGroupPublic
from sta.session import session_ctx
from sta.testing.config import TestApp
from sta_pcd.models.configs import PointCloudConfig
from sta_pcd.models.configs.pcd import CropBoxConfig
from sta_pcd.ops.preprocessing import CropBoxParams, PreprocessingOperationType

POINTS = np.array(
    [
        [0.0, 0.0, 0.0, 0.0],
        [1.0, 2.0, 3.0, 1.0],
    ],
    dtype=np.float32,
)

BOUNDS_FIELDS = ("min_x", "min_y", "min_z", "max_x", "max_y", "max_z")

# Transform columns are NOT NULL, so a create payload must carry an explicit (identity) transform.
IDENTITY_TRANSFORM = {
    "translate_x": 0,
    "translate_y": 0,
    "translate_z": 0,
    "rotate_x": 0,
    "rotate_y": 0,
    "rotate_z": 0,
    "scale_x": 1,
    "scale_y": 1,
    "scale_z": 1,
}


def spec_payload(source_group_id: int, *, name: str = "pcd spec") -> dict:
    return {
        "name": name,
        "description": "a test point cloud spec",
        "group_ids": [source_group_id],
        "config": PointCloudConfig.default().model_dump(),
    }


def crop_box_payload(
    *,
    box_min: tuple[float, float, float],
    box_max: tuple[float, float, float],
) -> dict:
    """A config whose single crop area keeps only the points inside ``[box_min, box_max)``."""
    config = PointCloudConfig(
        channel_headers=["x", "y", "z", "intensity"],
        dtype="float32",
        preprocessors=[
            CropBoxConfig(
                op_name=PreprocessingOperationType.CROP_BOX,
                op_params=CropBoxParams(
                    keep=True,
                    box_min=OptionalVector3(x=box_min[0], y=box_min[1], z=box_min[2]),
                    box_max=OptionalVector3(x=box_max[0], y=box_max[1], z=box_max[2]),
                ),
            ),
        ],
    )
    return json.loads(config.model_dump_json())


def written_spec(response: httpx.Response) -> dict:
    """
    The specification a spec write endpoint returned.

    Those endpoints answer with the record beside the ids of the sweeps the save queued, so
    a reader of the record goes through here rather than assuming a bare body.
    """
    return response.json()["spec"]


def bounds(metadata: dict) -> dict[str, float]:
    return {field: float(metadata[field]) for field in BOUNDS_FIELDS}


@pytest.fixture
def drain_queue(test_app: TestApp) -> Callable[[], int]:
    """
    Run the deferred bounds sweeps these tests' writes queued.

    The worker is deliberately absent from a built test app, so the API never reads a data
    file during a request here either -- which is the point: these tests assert what a save
    queues and what the queued work then produces, not that a save did it inline.
    """

    def _drain() -> int:
        with session_ctx(test_app.config) as session:
            return run_pending_jobs(session=session)

    return _drain


def test_create_list_read_spec(
    client: TestClient,
    auth_headers: dict[str, str],
    test_app: TestApp,
    source_group: SourceGroupPublic,
):
    del test_app  # Only needed to ensure the app/DB context is active.

    create_response = client.post(
        "/source/spec/pcd/specs/",
        headers=auth_headers,
        json=spec_payload(source_group.id),
    )
    assert create_response.status_code == 200, create_response.text
    created = written_spec(create_response)
    spec_id = created["id"]
    assert created["name"] == "pcd spec"

    list_response = client.get("/source/spec/pcd/specs/", headers=auth_headers)
    assert list_response.status_code == 200, list_response.text
    assert [item["id"] for item in list_response.json()] == [spec_id]

    filtered_response = client.get(
        "/source/spec/pcd/specs/",
        headers=auth_headers,
        params={"name": "does-not-exist"},
    )
    assert filtered_response.json() == []

    read_response = client.get(f"/source/spec/pcd/specs/{spec_id}", headers=auth_headers)
    assert read_response.status_code == 200, read_response.text
    assert read_response.json()["id"] == spec_id


def test_update_and_delete_spec(
    client: TestClient,
    auth_headers: dict[str, str],
    test_app: TestApp,
    source_group: SourceGroupPublic,
):
    del test_app

    create_response = client.post(
        "/source/spec/pcd/specs/",
        headers=auth_headers,
        json=spec_payload(source_group.id, name="to update"),
    )
    assert create_response.status_code == 200, create_response.text
    spec_id = written_spec(create_response)["id"]

    update_response = client.patch(
        f"/source/spec/pcd/specs/{spec_id}",
        headers=auth_headers,
        json={"description": "updated description"},
    )
    assert update_response.status_code == 200, update_response.text
    assert written_spec(update_response)["description"] == "updated description"

    rename_response = client.patch(
        f"/source/spec/pcd/specs/{spec_id}",
        headers=auth_headers,
        json={"name": "renamed without description"},
    )
    assert rename_response.status_code == 200, rename_response.text
    assert written_spec(rename_response)["description"] == "updated description"

    delete_response = client.delete(f"/source/spec/pcd/specs/{spec_id}", headers=auth_headers)
    assert delete_response.status_code == 200, delete_response.text

    missing_response = client.get(f"/source/spec/pcd/specs/{spec_id}", headers=auth_headers)
    assert missing_response.status_code == 404


def test_bulk_update_spec(
    client: TestClient,
    auth_headers: dict[str, str],
    test_app: TestApp,
    source_group: SourceGroupPublic,
):
    del test_app

    create_response = client.post(
        "/source/spec/pcd/specs/",
        headers=auth_headers,
        json=spec_payload(source_group.id, name="to bulk update"),
    )
    assert create_response.status_code == 200, create_response.text
    spec_id = written_spec(create_response)["id"]

    bulk_update_response = client.patch(
        "/source/spec/pcd/specs/bulk",
        headers=auth_headers,
        json={"ids": [spec_id], "data": {"description": "bulk description"}},
    )
    assert bulk_update_response.status_code == 200, bulk_update_response.text

    read_response = client.get(f"/source/spec/pcd/specs/{spec_id}", headers=auth_headers)
    assert read_response.json()["description"] == "bulk description"


def test_bulk_delete_spec(
    client: TestClient,
    auth_headers: dict[str, str],
    test_app: TestApp,
    source_group: SourceGroupPublic,
):
    del test_app

    # The link table declares `group_id` unique, so a group holds at most one
    # spec of this type and the second id has to come from a groupless spec.
    linked_response = client.post(
        "/source/spec/pcd/specs/",
        headers=auth_headers,
        json=spec_payload(source_group.id, name="to bulk delete"),
    )
    assert linked_response.status_code == 200, linked_response.text
    linked_id = written_spec(linked_response)["id"]

    groupless_response = client.post(
        "/source/spec/pcd/specs/",
        headers=auth_headers,
        json={**spec_payload(source_group.id, name="groupless"), "group_ids": []},
    )
    assert groupless_response.status_code == 200, groupless_response.text
    groupless_id = written_spec(groupless_response)["id"]

    # The delete endpoint declares a single Body parameter, so the ids list is the whole body.
    bulk_delete_response = client.request(
        "DELETE",
        "/source/spec/pcd/specs/bulk",
        headers=auth_headers,
        json=[linked_id, groupless_id],
    )
    assert bulk_delete_response.status_code == 200, bulk_delete_response.text

    list_response = client.get("/source/spec/pcd/specs/", headers=auth_headers)
    assert list_response.json() == []

    # The group link rows went with their specs: the group's uniqueness slot is
    # free again, which only holds if the links were dropped before the specs.
    reclaim_response = client.post(
        "/source/spec/pcd/specs/",
        headers=auth_headers,
        json=spec_payload(source_group.id, name="reclaims the group"),
    )
    assert reclaim_response.status_code == 200, reclaim_response.text


def test_read_spec_not_found(
    client: TestClient,
    auth_headers: dict[str, str],
    test_app: TestApp,
):
    del test_app

    response = client.get("/source/spec/pcd/specs/999999", headers=auth_headers)
    assert response.status_code == 404


def test_a_spec_write_reports_the_sweeps_it_queued(
    client: TestClient,
    auth_headers: dict[str, str],
    test_app: TestApp,
    source_group: SourceGroupPublic,
    tmp_fs: None,
    drain_queue: Callable[[], int],
):
    """
    A save reports the queue rows it started, as ids a reader can link to.

    Whether anything was queued is not derivable from the write's own payload: a group with
    no scan awaiting a box, or a save that changed nothing the box depends on, starts no
    work at all. The queue is the only witness, so the response says what it took on rather
    than leaving the caller to describe a sweep it cannot see.
    """
    del test_app  # Only needed to ensure the app/DB context is active.

    uri = "reported-sweep.npy"
    path = FileSystemPath.from_uri(uri)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("wb") as f:
        np.save(f, POINTS)

    created_spec = client.post(
        "/source/spec/pcd/specs/",
        headers=auth_headers,
        json=spec_payload(source_group.id, name="reporting"),
    )
    assert created_spec.status_code == 200, created_spec.text
    spec_id = written_spec(created_spec)["id"]
    # The group held no scan when the specification joined it, so there was nothing to
    # derive: an empty list is the honest answer, not a failure to report.
    assert created_spec.json()["job_ids"] == []

    metadata_response = client.post(
        "/source/data/pcd/metadata/",
        headers=auth_headers,
        json={"uri": uri, "group_id": source_group.id, "weather": None, **IDENTITY_TRANSFORM},
    )
    assert metadata_response.status_code == 200, metadata_response.text

    # A configuration change does leave the group's scan awaiting a new box.
    changed = client.patch(
        f"/source/spec/pcd/specs/{spec_id}",
        headers=auth_headers,
        json={"config": crop_box_payload(box_min=(-1.0, -1.0, -1.0), box_max=(0.5, 0.5, 0.5))},
    )
    assert changed.status_code == 200, changed.text
    job_ids = changed.json()["job_ids"]
    assert len(job_ids) == 1, job_ids

    # The ids name real queue rows, and they read back by exactly those ids.
    listed = client.get("/jobs/", headers=auth_headers, params={"id": job_ids})
    assert listed.status_code == 200, listed.text
    assert [(job["id"], job["kind"], job["state"]) for job in listed.json()] == [
        (job_ids[0], "pcd.reconcile_bounds", "pending")
    ]
    assert listed.headers["Content-Range"] == f"jobs 0-{len(job_ids)}/{len(job_ids)}"

    # While that sweep still waits, a second change to the same group starts nothing, and
    # reports nothing: `job_ids` is what began, never what was asked for.
    again = client.patch(
        f"/source/spec/pcd/specs/{spec_id}",
        headers=auth_headers,
        json={"config": crop_box_payload(box_min=(-2.0, -2.0, -2.0), box_max=(1.0, 1.0, 1.0))},
    )
    assert again.status_code == 200, again.text
    assert again.json()["job_ids"] == []

    assert drain_queue() == 1


def test_update_spec_config_that_crops_away_every_point(
    client: TestClient,
    auth_headers: dict[str, str],
    test_app: TestApp,
    source_group: SourceGroupPublic,
    tmp_fs: None,
    drain_queue: Callable[[], int],
):
    """A config that leaves no points must save, and its sweep must not invent a box.

    A scan cropped to nothing has no derivable bounds, so the sweep keeps the box the record
    already held and says why -- instead of zeroing it, which would silently take the scan
    out of every frame it used to intersect.
    """
    del test_app  # Only needed to ensure the app/DB context is active.

    uri = "cropped-to-empty.npy"
    path = FileSystemPath.from_uri(uri)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("wb") as f:
        np.save(f, POINTS)

    create_response = client.post(
        "/source/spec/pcd/specs/",
        headers=auth_headers,
        json=spec_payload(source_group.id, name="spec cropped to empty"),
    )
    assert create_response.status_code == 200, create_response.text
    spec_id = written_spec(create_response)["id"]

    metadata_response = client.post(
        "/source/data/pcd/metadata/",
        headers=auth_headers,
        json={"uri": uri, "group_id": source_group.id, "weather": None, **IDENTITY_TRANSFORM},
    )
    assert metadata_response.status_code == 200, metadata_response.text
    created = metadata_response.json()
    metadata_id = created["id"]
    assert bounds(created) == {
        "min_x": 0.0,
        "min_y": 0.0,
        "min_z": 0.0,
        "max_x": 1.0,
        "max_y": 2.0,
        "max_z": 3.0,
    }

    update_response = client.patch(
        f"/source/spec/pcd/specs/{spec_id}",
        headers=auth_headers,
        json={"config": crop_box_payload(box_min=(10.0, 10.0, 10.0), box_max=(20.0, 20.0, 20.0))},
    )
    assert update_response.status_code == 200, update_response.text

    unchanged = client.get(f"/source/data/pcd/metadata/{metadata_id}", headers=auth_headers).json()
    assert unchanged["bounds_config_hash"] is None, "the save queued the group's re-derivation"
    assert bounds(unchanged) == {
        "min_x": 0.0,
        "min_y": 0.0,
        "min_z": 0.0,
        "max_x": 1.0,
        "max_y": 2.0,
        "max_z": 3.0,
    }, "a request that reads no files cannot move a box either"

    assert drain_queue() == 1

    read_response = client.get(f"/source/data/pcd/metadata/{metadata_id}", headers=auth_headers)
    assert read_response.status_code == 200, read_response.text
    swept = read_response.json()
    assert bounds(swept) == {
        "min_x": 0.0,
        "min_y": 0.0,
        "min_z": 0.0,
        "max_x": 1.0,
        "max_y": 2.0,
        "max_z": 3.0,
    }
    assert swept["bounds_config_hash"] is None
    assert "no points" in swept["bounds_error"]


def test_a_config_that_cannot_read_its_scans_is_reported_on_the_records(
    client: TestClient,
    auth_headers: dict[str, str],
    test_app: TestApp,
    source_group: SourceGroupPublic,
    tmp_fs: None,
    drain_queue: Callable[[], int],
):
    """Malformed linked data is reported where the data is, not as a rejected save.

    The configuration itself is valid, and one unreadable scan is no reason to refuse the
    edit for the whole group: the sweep records what it could not derive on the record that
    cannot be derived, and the record stays pending so the data manager can list it.
    """
    del test_app

    uri = "incompatible-channels.bin"
    path = FileSystemPath.from_uri(uri)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("wb") as f:
        POINTS.tofile(f)

    create_response = client.post(
        "/source/spec/pcd/specs/",
        headers=auth_headers,
        json=spec_payload(source_group.id),
    )
    assert create_response.status_code == 200, create_response.text
    spec_id = written_spec(create_response)["id"]

    metadata_response = client.post(
        "/source/data/pcd/metadata/",
        headers=auth_headers,
        json={"uri": uri, "group_id": source_group.id, "weather": None, **IDENTITY_TRANSFORM},
    )
    assert metadata_response.status_code == 200, metadata_response.text
    metadata_id = metadata_response.json()["id"]

    response = client.patch(
        f"/source/spec/pcd/specs/{spec_id}",
        headers=auth_headers,
        json={
            "config": {
                **PointCloudConfig.default().model_dump(),
                "channel_headers": [f"channel-{index}" for index in range(9)],
            }
        },
    )

    assert response.status_code == 200, response.text

    assert drain_queue() == 1

    reported = client.get(f"/source/data/pcd/metadata/{metadata_id}", headers=auth_headers).json()
    assert (
        "Expected point cloud to have 9 channels, but cannot divide 8 elements evenly"
        in (reported["bounds_error"])
    )
    assert reported["bounds_config_hash"] is None, "the record still awaits a readable box"
    assert bounds(reported) == {
        "min_x": 0.0,
        "min_y": 0.0,
        "min_z": 0.0,
        "max_x": 1.0,
        "max_y": 2.0,
        "max_z": 3.0,
    }, "a failed derivation leaves the previous box alone"


def test_update_spec_config_preserves_pinned_bounds(
    client: TestClient,
    auth_headers: dict[str, str],
    source_group: SourceGroupPublic,
    tmp_fs: None,
    drain_queue: Callable[[], int],
):
    """A queued sweep re-derives the group's scans but never a hand-pinned one.

    The crop keeps only the origin point, so a derived scan collapses to a zero-volume
    box while a scan whose box was set by hand keeps exactly what its editor supplied --
    and is not even counted among the records awaiting derivation.
    """
    create_response = client.post(
        "/source/spec/pcd/specs/",
        headers=auth_headers,
        json=spec_payload(source_group.id, name="spec preserve pinned"),
    )
    assert create_response.status_code == 200, create_response.text
    spec_id = written_spec(create_response)["id"]

    derived_uri = "preserve-derived.npy"
    pinned_uri = "preserve-pinned.npy"
    for uri in (derived_uri, pinned_uri):
        path = FileSystemPath.from_uri(uri)
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("wb") as f:
            np.save(f, POINTS)

    derived_response = client.post(
        "/source/data/pcd/metadata/",
        headers=auth_headers,
        json={
            "uri": derived_uri,
            "group_id": source_group.id,
            "weather": None,
            **IDENTITY_TRANSFORM,
        },
    )
    assert derived_response.status_code == 200, derived_response.text
    assert bounds(derived_response.json()) == {
        "min_x": 0.0,
        "min_y": 0.0,
        "min_z": 0.0,
        "max_x": 1.0,
        "max_y": 2.0,
        "max_z": 3.0,
    }

    pinned_response = client.post(
        "/source/data/pcd/metadata/",
        headers=auth_headers,
        json={
            "uri": pinned_uri,
            "group_id": source_group.id,
            "weather": None,
            **IDENTITY_TRANSFORM,
            "min_x": -100,
            "min_y": -100,
            "min_z": -100,
            "max_x": 100,
            "max_y": 100,
            "max_z": 100,
        },
    )
    assert pinned_response.status_code == 200, pinned_response.text
    assert pinned_response.json()["auto_bounds"] is False

    crop_response = client.patch(
        f"/source/spec/pcd/specs/{spec_id}",
        headers=auth_headers,
        json={"config": crop_box_payload(box_min=(-1.0, -1.0, -1.0), box_max=(0.5, 0.5, 0.5))},
    )
    assert crop_response.status_code == 200, crop_response.text

    assert drain_queue() == 1

    derived_id = derived_response.json()["id"]
    pinned_id = pinned_response.json()["id"]

    after_derived = client.get(f"/source/data/pcd/metadata/{derived_id}", headers=auth_headers)
    assert after_derived.status_code == 200, after_derived.text
    assert bounds(after_derived.json()) == {
        "min_x": 0.0,
        "min_y": 0.0,
        "min_z": 0.0,
        "max_x": 0.0,
        "max_y": 0.0,
        "max_z": 0.0,
    }

    after_pinned = client.get(f"/source/data/pcd/metadata/{pinned_id}", headers=auth_headers)
    assert after_pinned.status_code == 200, after_pinned.text
    preserved = after_pinned.json()
    assert preserved["auto_bounds"] is False
    assert bounds(preserved) == {
        "min_x": -100.0,
        "min_y": -100.0,
        "min_z": -100.0,
        "max_x": 100.0,
        "max_y": 100.0,
        "max_z": 100.0,
    }
