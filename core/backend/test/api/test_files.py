import io
import zipfile
from pathlib import Path

from fastapi.testclient import TestClient
from sqlmodel import Session

import pytest

from sta.api.files import CHUNK_SIZE
from sta.api.root import build_api
from sta.config import AppConfig
from sta.domain.users import create_user
from sta.filesystem import filesystem_ctx
from sta.models.user import Role, UserCreate, UserPublic
from sta.testing.plugin_import import app_config_with_fs_root

pytestmark = pytest.mark.in_memory_db

NOTES_CONTENT = b"hello files"
BIG_CONTENT = b"01234567" * (CHUNK_SIZE // 8) + b"end"  # Slightly over one chunk
INNER_CONTENT = b"binary-bytes"
DEEP_CONTENT = b"deep-content"

ACCESS_DENIED_DETAIL = "Access denied: Cannot access path"


@pytest.fixture
def files_root(test_app_config: AppConfig, tmp_path: Path) -> Path:
    """Point the app's default filesystem at a temporary directory."""
    config = app_config_with_fs_root(test_app_config, tmp_path)
    with filesystem_ctx(config):
        yield tmp_path


@pytest.fixture
def seeded_root(files_root: Path) -> Path:
    (files_root / "data" / "nested").mkdir(parents=True)
    (files_root / "empty").mkdir()
    (files_root / "notes.txt").write_bytes(NOTES_CONTENT)
    (files_root / "big.bin").write_bytes(BIG_CONTENT)
    (files_root / "data" / "inner.bin").write_bytes(INNER_CONTENT)
    (files_root / "data" / "nested" / "deep.txt").write_bytes(DEEP_CONTENT)

    return files_root


@pytest.fixture
def client() -> TestClient:
    return TestClient(build_api(frontend_url="http://localhost:5174"))


@pytest.fixture
def manager_headers(client: TestClient) -> dict[str, str]:
    response = client.post(
        "/auth/login",
        data={"username": "admin", "password": "admin"},
    )
    assert response.status_code == 200

    return {"Authorization": f"Bearer {response.json()['access_token']}"}


@pytest.fixture
def annotator_headers(
    client: TestClient,
    session: Session,
    root_user: UserPublic,
) -> dict[str, str]:
    create_user(
        current_user=root_user,
        session=session,
        data=UserCreate(
            username="files-api-annotator",
            password="password",
            roles={Role.ANNOTATOR},
        ),
    )
    session.commit()

    response = client.post(
        "/auth/login",
        data={"username": "files-api-annotator", "password": "password"},
    )
    assert response.status_code == 200

    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def test_list_files_returns_seeded_directory(
    seeded_root: Path,
    client: TestClient,
    manager_headers: dict[str, str],
):
    response = client.get("/files/", headers=manager_headers)
    assert response.status_code == 200

    entries = response.json()["entries"]
    # Directories are listed first, then files, both case-insensitively by name.
    assert [(entry["name"], entry["is_dir"]) for entry in entries] == [
        ("data", True),
        ("empty", True),
        ("big.bin", False),
        ("notes.txt", False),
    ]
    # Each entry reports the URI of its parent directory.
    assert all(entry["parent"] == "." for entry in entries)

    by_name = {entry["name"]: entry for entry in entries}
    assert by_name["notes.txt"]["size"] == len(NOTES_CONTENT)
    assert by_name["big.bin"]["size"] == len(BIG_CONTENT)
    # A directory's own size is the size of its filesystem entry, not of its
    # contents, so the API reports null instead.
    assert by_name["data"]["size"] is None
    assert by_name["empty"]["size"] is None
    assert isinstance(by_name["notes.txt"]["modified"], float)

    nested = client.get("/files/", headers=manager_headers, params={"path": "data"})
    assert nested.status_code == 200
    assert [
        (entry["name"], entry["is_dir"], entry["parent"]) for entry in nested.json()["entries"]
    ] == [
        ("nested", True, "data"),
        ("inner.bin", False, "data"),
    ]


def test_list_files_with_empty_path_lists_filesystem_root(
    seeded_root: Path,
    client: TestClient,
    manager_headers: dict[str, str],
):
    response = client.get("/files/?path=", headers=manager_headers)

    assert response.status_code == 200
    assert [(entry["name"], entry["parent"]) for entry in response.json()["entries"]] == [
        ("data", "."),
        ("empty", "."),
        ("big.bin", "."),
        ("notes.txt", "."),
    ]


def test_list_files_errors_for_missing_path_and_file_target(
    seeded_root: Path,
    client: TestClient,
    manager_headers: dict[str, str],
):
    missing = client.get("/files/", headers=manager_headers, params={"path": "does-not-exist"})
    assert missing.status_code == 404
    assert missing.json()["detail"] == "Path not found"

    not_a_directory = client.get("/files/", headers=manager_headers, params={"path": "notes.txt"})
    assert not_a_directory.status_code == 400
    assert not_a_directory.json()["detail"] == "Path is not a directory"


def test_list_files_skips_broken_sanctioned_symlinks(
    seeded_root: Path,
    client: TestClient,
    manager_headers: dict[str, str],
):
    (seeded_root / "unavailable-mount").symlink_to(seeded_root / "missing-target")

    response = client.get("/files/", headers=manager_headers)

    assert response.status_code == 200
    assert {entry["name"] for entry in response.json()["entries"]} == {
        "data",
        "empty",
        "big.bin",
        "notes.txt",
    }
    download = client.get(
        "/files/download",
        headers=manager_headers,
        params={"path": "unavailable-mount"},
    )
    assert download.status_code == 404


def test_download_file_streams_content_with_headers(
    seeded_root: Path,
    client: TestClient,
    manager_headers: dict[str, str],
):
    response = client.get("/files/download", headers=manager_headers, params={"path": "notes.txt"})
    assert response.status_code == 200
    assert response.content == NOTES_CONTENT
    assert response.headers["Content-Disposition"] == 'attachment; filename="notes.txt"'
    assert response.headers["Content-Length"] == str(len(NOTES_CONTENT))
    assert response.headers["Content-Type"].startswith("text/plain")

    big = client.get("/files/download", headers=manager_headers, params={"path": "big.bin"})
    assert big.status_code == 200
    # Spans more than one CHUNK_SIZE read of the streaming generator.
    assert big.content == BIG_CONTENT
    assert big.headers["Content-Disposition"] == 'attachment; filename="big.bin"'
    assert big.headers["Content-Length"] == str(len(BIG_CONTENT))
    assert big.headers["Content-Type"].startswith("application/octet-stream")


def test_download_file_errors_for_missing_path_and_directory_target(
    seeded_root: Path,
    client: TestClient,
    manager_headers: dict[str, str],
):
    missing = client.get(
        "/files/download", headers=manager_headers, params={"path": "does-not-exist"}
    )
    assert missing.status_code == 404
    assert missing.json()["detail"] == "File not found"

    not_a_file = client.get("/files/download", headers=manager_headers, params={"path": "data"})
    assert not_a_file.status_code == 400
    assert not_a_file.json()["detail"] == "Path is not a file"


def test_download_zip_packs_files_and_directories(
    seeded_root: Path,
    client: TestClient,
    manager_headers: dict[str, str],
):
    response = client.post(
        "/files/download-zip",
        headers=manager_headers,
        json={"paths": ["notes.txt", "data", "empty", "big.bin"]},
    )
    assert response.status_code == 200
    assert response.headers["Content-Type"].startswith("application/zip")
    assert response.headers["Content-Disposition"] == 'attachment; filename="files.zip"'

    with zipfile.ZipFile(io.BytesIO(response.content)) as zf:
        assert zf.testzip() is None
        assert set(zf.namelist()) == {
            "notes.txt",
            "data/inner.bin",
            "data/nested/deep.txt",
            "empty/",
            "big.bin",
        }
        assert zf.read("notes.txt") == NOTES_CONTENT
        assert zf.read("data/inner.bin") == INNER_CONTENT
        assert zf.read("data/nested/deep.txt") == DEEP_CONTENT
        assert zf.read("empty/") == b""
        # Spans more than one CHUNK_SIZE read through the streaming bridge.
        assert zf.read("big.bin") == BIG_CONTENT


def test_download_zip_archive_name(
    seeded_root: Path,
    client: TestClient,
    manager_headers: dict[str, str],
):
    # A single path names the archive after the entry...
    single = client.post(
        "/files/download-zip",
        headers=manager_headers,
        json={"paths": ["data"]},
    )
    assert single.status_code == 200
    assert single.headers["Content-Disposition"] == 'attachment; filename="data.zip"'

    # ...while multiple paths fall back to files.zip.
    empty = client.post(
        "/files/download-zip",
        headers=manager_headers,
        json={"paths": []},
    )
    assert empty.status_code == 422


def test_download_zip_keeps_same_basename_paths_distinct(
    seeded_root: Path,
    client: TestClient,
    manager_headers: dict[str, str],
):
    (seeded_root / "other").mkdir()
    (seeded_root / "other" / "inner.bin").write_bytes(b"other-content")

    response = client.post(
        "/files/download-zip",
        headers=manager_headers,
        json={"paths": ["data/inner.bin", "other/inner.bin"]},
    )

    assert response.status_code == 200
    with zipfile.ZipFile(io.BytesIO(response.content)) as zf:
        assert set(zf.namelist()) == {"data/inner.bin", "other/inner.bin"}
        assert zf.read("data/inner.bin") == INNER_CONTENT
        assert zf.read("other/inner.bin") == b"other-content"


@pytest.mark.parametrize(
    "paths",
    [
        ["notes.txt", "notes.txt"],
        ["data", "data/inner.bin"],
    ],
)
def test_download_zip_rejects_duplicate_or_overlapping_paths(
    seeded_root: Path,
    client: TestClient,
    manager_headers: dict[str, str],
    paths: list[str],
):
    response = client.post(
        "/files/download-zip",
        headers=manager_headers,
        json={"paths": paths},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "ZIP paths must be unique and non-overlapping"


def test_download_file_allows_provisioned_symlink(
    seeded_root: Path,
    client: TestClient,
    manager_headers: dict[str, str],
):
    outside_file = seeded_root.parent / "provisioned-data.txt"
    outside_file.write_bytes(b"provisioned-content")
    (seeded_root / "provisioned-link").symlink_to(outside_file)

    response = client.get(
        "/files/download",
        headers=manager_headers,
        params={"path": "provisioned-link"},
    )

    assert response.status_code == 200
    assert response.content == b"provisioned-content"


def test_download_zip_missing_path_returns_404(
    seeded_root: Path,
    client: TestClient,
    manager_headers: dict[str, str],
):
    response = client.post(
        "/files/download-zip",
        headers=manager_headers,
        json={"paths": ["notes.txt", "data/does-not-exist"]},
    )
    assert response.status_code == 404
    assert response.json()["detail"] == "data/does-not-exist not found"


def test_files_endpoints_require_data_manager_role(
    client: TestClient,
    annotator_headers: dict[str, str],
):
    list_response = client.get("/files/", headers=annotator_headers)
    assert list_response.status_code == 403

    download_response = client.get(
        "/files/download",
        headers=annotator_headers,
        params={"path": "notes.txt"},
    )
    assert download_response.status_code == 403

    zip_response = client.post(
        "/files/download-zip",
        headers=annotator_headers,
        json={"paths": ["notes.txt"]},
    )
    assert zip_response.status_code == 403


def test_resolve_safe_path_rejects_foreign_scheme_uris(
    seeded_root: Path,
    client: TestClient,
    manager_headers: dict[str, str],
):
    for path in ("file:///etc/passwd", "s3://bucket/key"):
        response = client.get("/files/", headers=manager_headers, params={"path": path})
        assert response.status_code == 403
        assert response.json()["detail"] == ACCESS_DENIED_DETAIL

    download_response = client.get(
        "/files/download",
        headers=manager_headers,
        params={"path": "file:///etc/passwd"},
    )
    assert download_response.status_code == 403
    assert download_response.json()["detail"] == ACCESS_DENIED_DETAIL

    zip_response = client.post(
        "/files/download-zip",
        headers=manager_headers,
        json={"paths": ["s3://bucket/key"]},
    )
    assert zip_response.status_code == 403
    assert zip_response.json()["detail"] == ACCESS_DENIED_DETAIL

    # Absolute paths are rejected rather than being interpreted relative to
    # the filesystem root.
    absolute_response = client.get(
        "/files/download",
        headers=manager_headers,
        params={"path": "/etc/passwd"},
    )
    assert absolute_response.status_code == 403


def test_download_file_rejects_parent_directory_traversal(
    files_root: Path,
    client: TestClient,
    manager_headers: dict[str, str],
):
    outside_file = files_root.parent / "outside-secret.txt"
    outside_file.write_text("secret-outside")

    response = client.get(
        "/files/download",
        headers=manager_headers,
        params={"path": f"../{outside_file.name}"},
    )

    assert response.status_code == 403
