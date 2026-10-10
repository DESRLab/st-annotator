from pathlib import Path

from fastapi.testclient import TestClient

from sta.api.root import build_api
from sta.config import AppConfig
from sta.domain.jobs import run_pending_jobs
from sta.filesystem import filesystem_ctx
from sta.models.source.group import SourceGroupPublic
from sta.models.user import UserPublic
from sta.plugin import load_plugins
from sta.session import session_ctx

IDENTITY_TRANSFORM = {
    "translate_x": "0",
    "translate_y": "0",
    "translate_z": "0",
    "rotate_x": "0",
    "rotate_y": "0",
    "rotate_z": "0",
    "scale_x": "1",
    "scale_y": "1",
    "scale_z": "1",
}


def _write_triangle_obj(fs_root: Path, name: str, *, offset: float = 0.0) -> None:
    (fs_root / name).write_text(
        "\n".join(
            [
                f"v {offset} 0 0",
                f"v {offset + 1} 0 0",
                f"v {offset} 1 0",
                "f 1 2 3",
            ],
        ),
        encoding="utf-8",
    )


def _login(client: TestClient) -> dict[str, str]:
    login_response = client.post(
        "/auth/login",
        data={"username": "admin", "password": "admin"},
    )
    assert login_response.status_code == 200, login_response.text
    return {"Authorization": f"Bearer {login_response.json()['access_token']}"}


def _drain_bounds(config: AppConfig) -> int:
    """
    Run the deferred bounds sweeps a write queued.

    The worker is deliberately absent from a built test app, so a request here never reads a
    mesh; asserting the derived box therefore means running the queue the way a deployment
    would.
    """
    load_plugins()

    with session_ctx(config) as session:
        return run_pending_jobs(session=session)


def test_metadata_endpoints_crud_list_bulk_and_errors(
    plugin_import_app_config: AppConfig,
    root_user: UserPublic,
    source_group: SourceGroupPublic,
    tmp_path: Path,
):
    _ = root_user

    with filesystem_ctx(plugin_import_app_config):
        _write_triangle_obj(tmp_path, "mesh_a.obj")
        _write_triangle_obj(tmp_path, "mesh_b.obj", offset=10.0)

        client = TestClient(build_api(frontend_url="http://localhost:5174"))
        headers = _login(client)

        # --- Create ---
        create_response = client.post(
            "/source/data/gmesh/metadata/",
            headers=headers,
            json={
                "uri": "mesh_a.obj",
                "group_id": source_group.id,
                **IDENTITY_TRANSFORM,
            },
        )
        assert create_response.status_code == 200, create_response.text
        created = create_response.json()
        metadata_id = created["id"]
        assert created["uri"] == "mesh_a.obj"
        assert created["group_id"] == source_group.id
        # The bounds must have been recomputed from the mesh file itself
        assert float(created["min_x"]) == 0.0
        assert float(created["max_x"]) == 1.0
        assert float(created["max_y"]) == 1.0
        assert float(created["max_z"]) == 0.0

        # --- Error: duplicate (uri, group_id) is rejected ---
        duplicate_response = client.post(
            "/source/data/gmesh/metadata/",
            headers=headers,
            json={
                "uri": "mesh_a.obj",
                "group_id": source_group.id,
                **IDENTITY_TRANSFORM,
            },
        )
        assert duplicate_response.status_code == 400, duplicate_response.text
        assert "duplicate" in duplicate_response.json()["detail"].lower()

        # --- Error: malformed payload is rejected ---
        invalid_response = client.post(
            "/source/data/gmesh/metadata/",
            headers=headers,
            json={"uri": "mesh_a.obj"},
        )
        assert invalid_response.status_code == 422, invalid_response.text

        # --- Read ---
        read_response = client.get(f"/source/data/gmesh/metadata/{metadata_id}", headers=headers)
        assert read_response.status_code == 200, read_response.text
        assert read_response.json()["uri"] == "mesh_a.obj"

        # --- Error: reading a missing record ---
        missing_response = client.get("/source/data/gmesh/metadata/999999", headers=headers)
        assert missing_response.status_code == 404, missing_response.text

        # --- Update: the bounds must be recomputed after transforming ---
        update_response = client.patch(
            f"/source/data/gmesh/metadata/{metadata_id}",
            headers=headers,
            json={"translate_x": "5"},
        )
        assert update_response.status_code == 200, update_response.text
        updated = update_response.json()
        assert float(updated["min_x"]) == 5.0
        assert float(updated["max_x"]) == 6.0

        # --- Bulk create ---
        bulk_create_response = client.post(
            "/source/data/gmesh/metadata/bulk",
            headers=headers,
            json=[
                {
                    "uri": "mesh_b.obj",
                    "group_id": source_group.id,
                    **IDENTITY_TRANSFORM,
                },
            ],
        )
        assert bulk_create_response.status_code == 200, bulk_create_response.text
        bulk_create_payload = bulk_create_response.json()
        assert bulk_create_payload["success"] is True
        (bulk_metadata_id,) = bulk_create_payload["ids"]

        # A bulk create queues one sweep per group instead of reading every mesh inside the
        # request, so the record arrives without a box until the queue runs.
        queued = client.get(
            f"/source/data/gmesh/metadata/{bulk_metadata_id}", headers=headers
        ).json()
        assert queued["min_x"] is None
        assert queued["bounds_config_hash"] is None

        assert _drain_bounds(plugin_import_app_config) == 1

        swept = client.get(
            f"/source/data/gmesh/metadata/{bulk_metadata_id}", headers=headers
        ).json()
        assert swept["bounds_config_hash"] is not None
        assert swept["bounds_error"] is None

        # --- List with filters and Content-Range ---
        list_response = client.get(
            "/source/data/gmesh/metadata/",
            headers=headers,
            params={"group_id": source_group.id, "min_x": -1.0, "max_x": 20.0},
        )
        assert list_response.status_code == 200, list_response.text
        listed = list_response.json()
        assert sorted(item["id"] for item in listed) == sorted([metadata_id, bulk_metadata_id])
        assert list_response.headers["Content-Range"] == "metadatas 0-2/2"

        ids_response = client.get(
            "/source/data/gmesh/metadata/ids",
            headers=headers,
            params={"group_id": source_group.id, "min_x": -1.0, "max_x": 20.0},
        )
        assert ids_response.status_code == 200, ids_response.text
        assert sorted(ids_response.json()) == sorted([metadata_id, bulk_metadata_id])

        # --- Bulk update ---
        bulk_update_response = client.put(
            "/source/data/gmesh/metadata/bulk",
            headers=headers,
            json={
                "ids": [bulk_metadata_id],
                "data": {"translate_y": "7"},
            },
        )
        assert bulk_update_response.status_code == 200, bulk_update_response.text
        assert bulk_update_response.json()["success"] is True

        # The batch reports the sweep it started rather than leaving its caller to assume
        # one ran: the transform moved, so the stored box is owed a re-derivation.
        reported = bulk_update_response.json()["job_ids"]
        assert len(reported) == 1, reported

        # Asking again while that sweep still waits queues nothing, and reports nothing.
        twice = client.put(
            "/source/data/gmesh/metadata/bulk",
            headers=headers,
            json={
                "ids": [bulk_metadata_id],
                "data": {"translate_y": "7"},
            },
        )
        assert twice.status_code == 200, twice.text
        assert twice.json()["job_ids"] == []

        assert _drain_bounds(plugin_import_app_config) == 1

        bulk_read_response = client.get(
            f"/source/data/gmesh/metadata/{bulk_metadata_id}", headers=headers
        )
        assert bulk_read_response.status_code == 200, bulk_read_response.text
        assert float(bulk_read_response.json()["min_y"]) == 7.0

        # --- Bulk delete ---
        bulk_delete_response = client.request(
            "DELETE",
            "/source/data/gmesh/metadata/bulk",
            headers=headers,
            json=[bulk_metadata_id],
        )
        assert bulk_delete_response.status_code == 200, bulk_delete_response.text
        assert bulk_delete_response.json()["success"] is True

        deleted_bulk_response = client.get(
            f"/source/data/gmesh/metadata/{bulk_metadata_id}", headers=headers
        )
        assert deleted_bulk_response.status_code == 404, deleted_bulk_response.text

        # --- Delete ---
        delete_response = client.delete(
            f"/source/data/gmesh/metadata/{metadata_id}", headers=headers
        )
        assert delete_response.status_code == 200, delete_response.text
        assert delete_response.json()["success"] is True

        deleted_response = client.get(f"/source/data/gmesh/metadata/{metadata_id}", headers=headers)
        assert deleted_response.status_code == 404, deleted_response.text
