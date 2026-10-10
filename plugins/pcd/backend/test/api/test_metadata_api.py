"""Tests for the pcd source-metadata API handlers (CRUD + error path) via an authenticated client.

Metadata is seeded through the domain layer with a real point file; the single-item create
and update endpoints re-read that file to (re)compute bounds, so the file must live under
the test filesystem root. Omitting the six spatial coordinates asks for that derivation,
while supplying any of them overrides it and is preserved as given. A *bulk* write queues a
sweep instead -- see `drain_bounds` -- because reading a group's whole inventory inside one
request is what deferral exists to avoid.

The ``tmp_fs`` fixture (see conftest) activates a filesystem context rooted at the test's tmp
directory for the duration of the test, sharing the test database.
"""

from __future__ import annotations

import numpy as np

from fastapi.testclient import TestClient
from sqlmodel import Session

import pytest

from sta.common.filesystem import FileSystemPath
from sta.domain.jobs import run_pending_jobs
from sta.models.source.group import SourceGroupPublic
from sta.plugin import load_plugins
from sta.testing.config import TestApp
from sta_pcd.domain.source.spec import specs as specs_domain
from sta_pcd.models.configs import PointCloudConfig
from sta_pcd.models.source.data import PointCloudMetadata
from sta_pcd.models.source.spec import PointCloudSpecCreate

POINTS = np.array(
    [
        [0.0, 0.0, 0.0, 0.0],
        [1.0, 2.0, 3.0, 1.0],
    ],
    dtype=np.float32,
)

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


def write_point_file(uri: str) -> None:
    path = FileSystemPath.from_uri(uri)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("wb") as f:
        np.save(f, POINTS)


def seed_spec_and_file(
    *,
    test_app: TestApp,
    session: Session,
    source_group: SourceGroupPublic,
    uri_stem: str,
) -> str:
    uri = f"{uri_stem}.npy"
    write_point_file(uri)

    specs_domain.create_spec(
        current_user=test_app.root_user,
        session=session,
        data=PointCloudSpecCreate(
            name="metadata api point cloud",
            group_ids=[source_group.id],
            config=PointCloudConfig.default(),
        ),
    )
    session.commit()

    return uri


def test_create_list_read_metadata(
    client: TestClient,
    auth_headers: dict[str, str],
    test_app: TestApp,
    session: Session,
    source_group: SourceGroupPublic,
    tmp_fs: None,
):
    uri = seed_spec_and_file(
        test_app=test_app,
        session=session,
        source_group=source_group,
        uri_stem="metadata",
    )

    create_response = client.post(
        "/source/data/pcd/metadata/",
        headers=auth_headers,
        json={"uri": uri, "group_id": source_group.id, "weather": "sunny", **IDENTITY_TRANSFORM},
    )
    assert create_response.status_code == 200, create_response.text
    created = create_response.json()
    metadata_id = created["id"]
    assert created["uri"] == uri
    # Bounds are derived from the point file during create.
    assert float(created["min_x"]) == 0.0
    assert float(created["max_z"]) == 3.0

    list_response = client.get(
        "/source/data/pcd/metadata/",
        headers=auth_headers,
        params={"group_id": source_group.id},
    )
    assert list_response.status_code == 200, list_response.text
    assert [item["id"] for item in list_response.json()] == [metadata_id]

    ids_response = client.get(
        "/source/data/pcd/metadata/ids",
        headers=auth_headers,
        params={"group_id": source_group.id},
    )
    assert ids_response.status_code == 200, ids_response.text
    assert ids_response.json() == [metadata_id]

    read_response = client.get(f"/source/data/pcd/metadata/{metadata_id}", headers=auth_headers)
    assert read_response.status_code == 200, read_response.text
    assert read_response.json()["id"] == metadata_id


def test_update_and_delete_metadata(
    client: TestClient,
    auth_headers: dict[str, str],
    test_app: TestApp,
    session: Session,
    source_group: SourceGroupPublic,
    tmp_fs: None,
):
    uri = seed_spec_and_file(
        test_app=test_app,
        session=session,
        source_group=source_group,
        uri_stem="metadata_update",
    )
    create_response = client.post(
        "/source/data/pcd/metadata/",
        headers=auth_headers,
        json={"uri": uri, "group_id": source_group.id, "weather": None, **IDENTITY_TRANSFORM},
    )
    assert create_response.status_code == 200, create_response.text
    metadata_id = create_response.json()["id"]

    update_response = client.patch(
        f"/source/data/pcd/metadata/{metadata_id}",
        headers=auth_headers,
        json={"weather": "rainy"},
    )
    assert update_response.status_code == 200, update_response.text
    assert update_response.json()["weather"] == "rainy"

    delete_response = client.delete(
        f"/source/data/pcd/metadata/{metadata_id}", headers=auth_headers
    )
    assert delete_response.status_code == 200, delete_response.text

    missing_response = client.get(f"/source/data/pcd/metadata/{metadata_id}", headers=auth_headers)
    assert missing_response.status_code == 404


def test_bulk_create_update_delete_metadata(
    client: TestClient,
    auth_headers: dict[str, str],
    test_app: TestApp,
    session: Session,
    source_group: SourceGroupPublic,
    tmp_fs: None,
):
    uri_a = seed_spec_and_file(
        test_app=test_app,
        session=session,
        source_group=source_group,
        uri_stem="bulk_a",
    )
    uri_b = "bulk_b.npy"
    write_point_file(uri_b)

    bulk_create_response = client.post(
        "/source/data/pcd/metadata/bulk",
        headers=auth_headers,
        json=[
            {"uri": uri_a, "group_id": source_group.id, "weather": None, **IDENTITY_TRANSFORM},
            {"uri": uri_b, "group_id": source_group.id, "weather": None, **IDENTITY_TRANSFORM},
        ],
    )
    assert bulk_create_response.status_code == 200, bulk_create_response.text
    ids = bulk_create_response.json()["ids"]
    assert len(ids) == 2

    bulk_update_response = client.patch(
        "/source/data/pcd/metadata/bulk",
        headers=auth_headers,
        json={"ids": ids, "data": {"weather": "cloudy"}},
    )
    assert bulk_update_response.status_code == 200, bulk_update_response.text

    list_response = client.get(
        "/source/data/pcd/metadata/",
        headers=auth_headers,
        params={"group_id": source_group.id},
    )
    assert {item["weather"] for item in list_response.json()} == {"cloudy"}

    # The delete endpoint declares a single Body parameter, so the ids list is the whole body.
    bulk_delete_response = client.request(
        "DELETE",
        "/source/data/pcd/metadata/bulk",
        headers=auth_headers,
        json=ids,
    )
    assert bulk_delete_response.status_code == 200, bulk_delete_response.text

    empty_response = client.get(
        "/source/data/pcd/metadata/",
        headers=auth_headers,
        params={"group_id": source_group.id},
    )
    assert empty_response.json() == []


def test_read_metadata_not_found(
    client: TestClient,
    auth_headers: dict[str, str],
    test_app: TestApp,
):
    del test_app  # Only needed to ensure the app/DB context is active.

    response = client.get("/source/data/pcd/metadata/999999", headers=auth_headers)
    assert response.status_code == 404


# Deliberately disagrees with POINTS' real bbox of (0,0,0)-(1,2,3), so a value that
# survives a write proves derivation was skipped rather than merely missed.
OVERRIDE_BOUNDS = {
    "min_x": -100,
    "min_y": -100,
    "min_z": -100,
    "max_x": 100,
    "max_y": 100,
    "max_z": 100,
}


def test_create_metadata_with_explicit_bounds_skips_derivation(
    client: TestClient,
    auth_headers: dict[str, str],
    test_app: TestApp,
    session: Session,
    source_group: SourceGroupPublic,
    tmp_fs: None,
):
    uri = seed_spec_and_file(
        test_app=test_app,
        session=session,
        source_group=source_group,
        uri_stem="bounds_override",
    )

    response = client.post(
        "/source/data/pcd/metadata/",
        headers=auth_headers,
        json={
            "uri": uri,
            "group_id": source_group.id,
            "weather": None,
            **IDENTITY_TRANSFORM,
            **OVERRIDE_BOUNDS,
        },
    )
    assert response.status_code == 200, response.text
    created = response.json()
    assert float(created["min_x"]) == -100.0
    assert float(created["max_z"]) == 100.0


def test_update_metadata_transform_recomputes_derived_bounds(
    client: TestClient,
    auth_headers: dict[str, str],
    test_app: TestApp,
    session: Session,
    source_group: SourceGroupPublic,
    tmp_fs: None,
):
    """A transform change must move the bounds, which needs the write to stay in auto mode.

    The edit form used to resubmit the bounds it had loaded, which froze them at the
    pre-edit box and left them silently stale after any transform change.
    """
    uri = seed_spec_and_file(
        test_app=test_app,
        session=session,
        source_group=source_group,
        uri_stem="bounds_recompute",
    )
    create_response = client.post(
        "/source/data/pcd/metadata/",
        headers=auth_headers,
        json={"uri": uri, "group_id": source_group.id, "weather": None, **IDENTITY_TRANSFORM},
    )
    assert create_response.status_code == 200, create_response.text
    metadata_id = create_response.json()["id"]
    assert float(create_response.json()["max_x"]) == 1.0

    update_response = client.patch(
        f"/source/data/pcd/metadata/{metadata_id}",
        headers=auth_headers,
        json={"translate_x": 10},
    )
    assert update_response.status_code == 200, update_response.text
    updated = update_response.json()
    assert float(updated["min_x"]) == 10.0
    assert float(updated["max_x"]) == 11.0
    # Untouched axes keep their derived values.
    assert float(updated["min_y"]) == 0.0
    assert float(updated["max_y"]) == 2.0


def test_pinned_bounds_survive_later_writes_until_derivation_is_switched_back_on(
    client: TestClient,
    auth_headers: dict[str, str],
    test_app: TestApp,
    session: Session,
    source_group: SourceGroupPublic,
    tmp_fs: None,
):
    """A hand-set box is stored state, not a one-write exception.

    Supplying coordinates implies ``auto_bounds: false``, and that flag must keep its
    effect across every later write — otherwise the override would be recomputed away
    the next time an unrelated field was saved.
    """
    uri = seed_spec_and_file(
        test_app=test_app,
        session=session,
        source_group=source_group,
        uri_stem="bounds_pinned",
    )
    create_response = client.post(
        "/source/data/pcd/metadata/",
        headers=auth_headers,
        json={"uri": uri, "group_id": source_group.id, "weather": None, **IDENTITY_TRANSFORM},
    )
    assert create_response.status_code == 200, create_response.text
    metadata_id = create_response.json()["id"]
    assert create_response.json()["auto_bounds"] is True

    override_response = client.patch(
        f"/source/data/pcd/metadata/{metadata_id}",
        headers=auth_headers,
        json=OVERRIDE_BOUNDS,
    )
    assert override_response.status_code == 200, override_response.text
    overridden = override_response.json()
    assert float(overridden["min_x"]) == -100.0
    assert overridden["auto_bounds"] is False

    # An unrelated auto write must leave the pinned box alone.
    weather_response = client.patch(
        f"/source/data/pcd/metadata/{metadata_id}",
        headers=auth_headers,
        json={"weather": "foggy"},
    )
    assert weather_response.status_code == 200, weather_response.text
    pinned = weather_response.json()
    assert float(pinned["min_x"]) == -100.0
    assert float(pinned["max_z"]) == 100.0

    # Re-enabling derivation re-derives from the stored scan without restating a box.
    restore_response = client.patch(
        f"/source/data/pcd/metadata/{metadata_id}",
        headers=auth_headers,
        json={"auto_bounds": True},
    )
    assert restore_response.status_code == 200, restore_response.text
    restored = restore_response.json()
    assert restored["auto_bounds"] is True
    assert float(restored["min_x"]) == 0.0
    assert float(restored["max_z"]) == 3.0


def test_cleared_override_bound_is_stored_as_an_unbounded_axis(
    client: TestClient,
    auth_headers: dict[str, str],
    test_app: TestApp,
    session: Session,
    source_group: SourceGroupPublic,
    tmp_fs: None,
):
    """A hand-set box may leave an axis open, and an open axis never excludes a row.

    The edit form sends an explicit null for a cleared bounds field, so the write has to
    store NULL there rather than keep the old value, and the window query has to pass that
    axis for the cleared row while still filtering the untouched one by its stored bound.
    """
    cleared_uri = seed_spec_and_file(
        test_app=test_app,
        session=session,
        source_group=source_group,
        uri_stem="bounds_unbounded",
    )
    bounded_uri = "bounds_bounded.npy"
    write_point_file(bounded_uri)

    cleared_response = client.post(
        "/source/data/pcd/metadata/",
        headers=auth_headers,
        json={
            "uri": cleared_uri,
            "group_id": source_group.id,
            "weather": None,
            **IDENTITY_TRANSFORM,
        },
    )
    assert cleared_response.status_code == 200, cleared_response.text
    cleared_id = cleared_response.json()["id"]

    bounded_response = client.post(
        "/source/data/pcd/metadata/",
        headers=auth_headers,
        json={
            "uri": bounded_uri,
            "group_id": source_group.id,
            "weather": None,
            **IDENTITY_TRANSFORM,
        },
    )
    assert bounded_response.status_code == 200, bounded_response.text
    # Control: the derived box of a row nobody hand-sets.
    assert float(bounded_response.json()["max_x"]) == 1.0

    update_response = client.patch(
        f"/source/data/pcd/metadata/{cleared_id}",
        headers=auth_headers,
        json={
            "auto_bounds": False,
            "min_x": 0,
            "min_y": 0,
            "min_z": 0,
            "max_x": None,
            "max_y": 2,
            "max_z": 3,
        },
    )
    assert update_response.status_code == 200, update_response.text
    updated = update_response.json()
    assert updated["max_x"] is None
    assert float(updated["min_x"]) == 0.0
    assert float(updated["max_z"]) == 3.0
    assert updated["auto_bounds"] is False

    window_response = client.get(
        "/source/data/pcd/metadata/",
        headers=auth_headers,
        params={"group_id": source_group.id, "min_x": 50},
    )
    assert window_response.status_code == 200, window_response.text
    assert {item["id"] for item in window_response.json()} == {cleared_id}


def test_create_metadata_rejects_an_inverted_override_box(
    client: TestClient,
    auth_headers: dict[str, str],
    test_app: TestApp,
    session: Session,
    source_group: SourceGroupPublic,
    tmp_fs: None,
):
    """An inverted box is only caught at write time; nothing checks it on read.

    ``st_bounds`` is a property validated by :class:`PartialSTBounds`, so a row stored with
    a minimum past its maximum fails later wherever that property is evaluated.
    """
    uri = seed_spec_and_file(
        test_app=test_app,
        session=session,
        source_group=source_group,
        uri_stem="bounds_inverted_create",
    )

    response = client.post(
        "/source/data/pcd/metadata/",
        headers=auth_headers,
        json={
            "uri": uri,
            "group_id": source_group.id,
            "weather": None,
            **IDENTITY_TRANSFORM,
            "min_x": 100,
            "max_x": -100,
        },
    )
    assert response.status_code == 422, response.text
    assert "Invalid source bounds" in response.json()["detail"]

    list_response = client.get(
        "/source/data/pcd/metadata/",
        headers=auth_headers,
        params={"group_id": source_group.id},
    )
    assert list_response.status_code == 200, list_response.text
    assert list_response.json() == []


def test_update_metadata_rejects_a_minimum_past_the_retained_maximum(
    client: TestClient,
    auth_headers: dict[str, str],
    test_app: TestApp,
    session: Session,
    source_group: SourceGroupPublic,
    tmp_fs: None,
):
    """A partial override is checked against the maximum it keeps, not just its own fields.

    The edit form can change one side of an axis alone, so the cross-check has to see the
    resulting row rather than the payload.
    """
    uri = seed_spec_and_file(
        test_app=test_app,
        session=session,
        source_group=source_group,
        uri_stem="bounds_inverted_update",
    )
    create_response = client.post(
        "/source/data/pcd/metadata/",
        headers=auth_headers,
        json={
            "uri": uri,
            "group_id": source_group.id,
            "weather": None,
            **IDENTITY_TRANSFORM,
        },
    )
    assert create_response.status_code == 200, create_response.text
    metadata_id = create_response.json()["id"]
    assert float(create_response.json()["max_x"]) == 1.0

    update_response = client.patch(
        f"/source/data/pcd/metadata/{metadata_id}",
        headers=auth_headers,
        json={"auto_bounds": False, "min_x": 50},
    )
    assert update_response.status_code == 422, update_response.text
    assert "Invalid source bounds" in update_response.json()["detail"]

    # Aborting the request discards the session, so the rejected write left nothing behind.
    read_response = client.get(
        f"/source/data/pcd/metadata/{metadata_id}",
        headers=auth_headers,
    )
    assert read_response.status_code == 200, read_response.text
    stored = read_response.json()
    assert float(stored["min_x"]) == 0.0
    assert stored["auto_bounds"] is True


def test_bulk_update_rejects_a_minimum_past_a_retained_maximum(
    client: TestClient,
    auth_headers: dict[str, str],
    test_app: TestApp,
    session: Session,
    source_group: SourceGroupPublic,
    tmp_fs: None,
):
    """The set-oriented bulk statement is validated per row from its re-read state."""
    uri = seed_spec_and_file(
        test_app=test_app,
        session=session,
        source_group=source_group,
        uri_stem="bounds_inverted_bulk",
    )
    create_response = client.post(
        "/source/data/pcd/metadata/",
        headers=auth_headers,
        json={
            "uri": uri,
            "group_id": source_group.id,
            "weather": None,
            **IDENTITY_TRANSFORM,
        },
    )
    assert create_response.status_code == 200, create_response.text
    metadata_id = create_response.json()["id"]

    bulk_response = client.patch(
        "/source/data/pcd/metadata/bulk",
        headers=auth_headers,
        json={"ids": [metadata_id], "data": {"min_x": 50}},
    )
    assert bulk_response.status_code == 422, bulk_response.text
    assert "Invalid source bounds" in bulk_response.json()["detail"]

    read_response = client.get(
        f"/source/data/pcd/metadata/{metadata_id}",
        headers=auth_headers,
    )
    assert read_response.status_code == 200, read_response.text
    assert float(read_response.json()["min_x"]) == 0.0


@pytest.mark.parametrize("field", ["uri", "group_id", "translate_x", "scale_x"])
def test_bulk_update_cannot_blank_a_required_column(
    client: TestClient,
    auth_headers: dict[str, str],
    test_app: TestApp,
    session: Session,
    source_group: SourceGroupPublic,
    tmp_fs: None,
    field: str,
):
    """A batch may clear an optional attribute, never the columns a row cannot exist without.

    The batch dialog sends an explicit null for a ticked section left empty, which is a
    real clear for `weather` (checked below as the positive control) and a rejected write
    for the identity and transform columns, which are NOT NULL. ``RequiredFieldNullGuard``
    refuses those at the request boundary, so the violation never reaches the database and
    the actor gets a 422 naming the field rather than a 500 from an unmapped IntegrityError.
    """
    uri = seed_spec_and_file(
        test_app=test_app,
        session=session,
        source_group=source_group,
        uri_stem=f"required_blank_bulk_{field}",
    )
    create_response = client.post(
        "/source/data/pcd/metadata/",
        headers=auth_headers,
        json={
            "uri": uri,
            "group_id": source_group.id,
            "weather": "cloudy",
            **IDENTITY_TRANSFORM,
        },
    )
    assert create_response.status_code == 200, create_response.text
    metadata_id = create_response.json()["id"]

    optional_response = client.patch(
        "/source/data/pcd/metadata/bulk",
        headers=auth_headers,
        json={"ids": [metadata_id], "data": {"weather": None}},
    )
    assert optional_response.status_code == 200, optional_response.text

    rejected_response = client.patch(
        "/source/data/pcd/metadata/bulk",
        headers=auth_headers,
        json={"ids": [metadata_id], "data": {field: None}},
    )
    assert rejected_response.status_code == 422, rejected_response.text
    # The refusal names the offending field, so a client can tell which section to fill in.
    assert [error["loc"][-1] for error in rejected_response.json()["detail"]] == [field]

    read_response = client.get(
        f"/source/data/pcd/metadata/{metadata_id}",
        headers=auth_headers,
    )
    assert read_response.status_code == 200, read_response.text
    stored = read_response.json()
    assert stored["weather"] is None
    assert stored["uri"] == uri
    assert stored["group_id"] == source_group.id
    assert float(stored["translate_x"]) == 0.0
    assert float(stored["scale_x"]) == 1.0


def test_inverted_box_still_switches_back_to_derivation(
    client: TestClient,
    auth_headers: dict[str, str],
    test_app: TestApp,
    session: Session,
    source_group: SourceGroupPublic,
    tmp_fs: None,
):
    """Re-enabling derivation is exempt from the check, so such a row is never trapped.

    The inverted state is written straight through the ORM here because no API write can
    produce it any more: it stands in for a row stored before the guard existed.
    """
    uri = seed_spec_and_file(
        test_app=test_app,
        session=session,
        source_group=source_group,
        uri_stem="bounds_inverted_escape",
    )
    create_response = client.post(
        "/source/data/pcd/metadata/",
        headers=auth_headers,
        json={
            "uri": uri,
            "group_id": source_group.id,
            "weather": None,
            **IDENTITY_TRANSFORM,
        },
    )
    assert create_response.status_code == 200, create_response.text
    metadata_id = create_response.json()["id"]

    record = session.get(PointCloudMetadata, metadata_id)
    assert record is not None
    record.min_x = 50
    record.max_x = -50
    session.add(record)
    session.commit()

    restore_response = client.patch(
        f"/source/data/pcd/metadata/{metadata_id}",
        headers=auth_headers,
        json={"auto_bounds": True},
    )
    assert restore_response.status_code == 200, restore_response.text
    restored = restore_response.json()
    assert restored["auto_bounds"] is True
    assert float(restored["min_x"]) == 0.0
    assert float(restored["max_x"]) == 1.0


def drain_bounds(session: Session) -> int:
    """
    Run the deferred bounds sweeps a bulk write queued.

    The worker is deliberately absent from a built test app, so a batch request here never
    reads a scan; asserting a derived box therefore means running the queue the way a
    deployment does.
    """
    load_plugins()

    return run_pending_jobs(session=session)


def test_bulk_update_stating_neither_mode_nor_box_keeps_the_stored_mode(
    client: TestClient,
    auth_headers: dict[str, str],
    test_app: TestApp,
    session: Session,
    source_group: SourceGroupPublic,
    tmp_fs: None,
):
    """A batch edit states neither the mode nor a box, so each row's stored mode governs.

    Reading an absent flag as "derive" would recompute away a hand-set box on any
    unrelated batch change — a shared translation, for instance — which is exactly the
    regression this pins.
    """
    uri_pinned = seed_spec_and_file(
        test_app=test_app,
        session=session,
        source_group=source_group,
        uri_stem="bulk_pinned",
    )
    uri_derived = "bulk_derived.npy"
    write_point_file(uri_derived)

    pinned_response = client.post(
        "/source/data/pcd/metadata/",
        headers=auth_headers,
        json={
            "uri": uri_pinned,
            "group_id": source_group.id,
            "weather": None,
            **IDENTITY_TRANSFORM,
            **OVERRIDE_BOUNDS,
        },
    )
    assert pinned_response.status_code == 200, pinned_response.text
    derived_response = client.post(
        "/source/data/pcd/metadata/",
        headers=auth_headers,
        json={
            "uri": uri_derived,
            "group_id": source_group.id,
            "weather": None,
            **IDENTITY_TRANSFORM,
        },
    )
    assert derived_response.status_code == 200, derived_response.text

    ids = [pinned_response.json()["id"], derived_response.json()["id"]]
    bulk_response = client.patch(
        "/source/data/pcd/metadata/bulk",
        headers=auth_headers,
        json={"ids": ids, "data": {"translate_x": 10}},
    )
    assert bulk_response.status_code == 200, bulk_response.text
    # Two rows, one group, one sweep. What a write queued is not countable from its own
    # payload, so the response reports the queue's answer rather than the request's.
    assert len(bulk_response.json()["job_ids"]) == 1, bulk_response.json()

    moved_but_stale = client.get(f"/source/data/pcd/metadata/{ids[1]}", headers=auth_headers).json()
    assert moved_but_stale["bounds_config_hash"] is None
    assert float(moved_but_stale["min_x"]) == 0.0, (
        "a batch save queues the re-read, it does not do it"
    )

    assert drain_bounds(session) == 1

    pinned = client.get(f"/source/data/pcd/metadata/{ids[0]}", headers=auth_headers).json()
    assert pinned["auto_bounds"] is False
    assert float(pinned["min_x"]) == -100.0, "the pinned box must survive a batch transform"
    assert pinned["bounds_config_hash"] is None, "and never joins the records awaiting derivation"

    derived = client.get(f"/source/data/pcd/metadata/{ids[1]}", headers=auth_headers).json()
    assert derived["auto_bounds"] is True
    assert float(derived["min_x"]) == 10.0, "the derived row must still follow the transform"
    assert derived["bounds_config_hash"] is not None


def test_bulk_create_metadata_mixes_derived_and_overridden_bounds(
    client: TestClient,
    auth_headers: dict[str, str],
    test_app: TestApp,
    session: Session,
    source_group: SourceGroupPublic,
    tmp_fs: None,
):
    uri_derived = seed_spec_and_file(
        test_app=test_app,
        session=session,
        source_group=source_group,
        uri_stem="bulk_bounds_derived",
    )
    uri_overridden = "bulk_bounds_override.npy"
    write_point_file(uri_overridden)

    create_response = client.post(
        "/source/data/pcd/metadata/bulk",
        headers=auth_headers,
        json=[
            {
                "uri": uri_derived,
                "group_id": source_group.id,
                "weather": None,
                **IDENTITY_TRANSFORM,
            },
            {
                "uri": uri_overridden,
                "group_id": source_group.id,
                "weather": None,
                **IDENTITY_TRANSFORM,
                **OVERRIDE_BOUNDS,
            },
        ],
    )
    assert create_response.status_code == 200, create_response.text
    ids = create_response.json()["ids"]
    assert len(ids) == 2

    awaiting = client.get(
        "/source/data/pcd/metadata/", headers=auth_headers, params={"group_id": source_group.id}
    ).json()
    by_uri = {item["uri"]: item for item in awaiting}
    assert by_uri[uri_derived]["max_z"] is None, "the derived row awaits its first sweep"
    assert float(by_uri[uri_overridden]["max_z"]) == 100.0

    assert drain_bounds(session) == 1

    list_response = client.get(
        "/source/data/pcd/metadata/",
        headers=auth_headers,
        params={"group_id": source_group.id},
    )
    assert list_response.status_code == 200, list_response.text
    by_uri = {item["uri"]: item for item in list_response.json()}
    assert float(by_uri[uri_derived]["max_z"]) == 3.0
    assert by_uri[uri_derived]["bounds_config_hash"] is not None
    assert float(by_uri[uri_overridden]["max_z"]) == 100.0
    assert by_uri[uri_overridden]["bounds_config_hash"] is None
